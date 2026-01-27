import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { TellerClient, mapAccountType } from '@/lib/banking/teller'
import { z } from 'zod'
import type { Database } from '@/types/database'

type BankAccountInsert = Database['public']['Tables']['bank_accounts']['Insert']

const ConnectRequestSchema = z.object({
  accessToken: z.string(),
  enrollment: z.object({
    id: z.string(),
    institution: z.object({
      name: z.string(),
    }),
  }),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()
    const { accessToken, enrollment } = ConnectRequestSchema.parse(body)

    // Create Teller client with the new access token
    const client = new TellerClient(accessToken)

    // Fetch accounts from Teller
    const tellerAccounts = await client.getAccounts()

    // Store each account in our database
    const insertedAccounts = []

    for (const tellerAccount of tellerAccounts) {
      // Check if account already exists
      const existingResult = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('teller_account_id', tellerAccount.id)
        .single()

      const existing = existingResult.data as { id: string } | null

      if (existing) {
        // Update existing account with new token
        await supabase
          .from('bank_accounts')
          .update({
            teller_access_token: accessToken,
            teller_enrollment_id: enrollment.id,
            is_active: true,
            deleted_at: null,
            sync_status: 'pending',
          } as never)
          .eq('id', existing.id)

        insertedAccounts.push(existing.id)
        continue
      }

      // Fetch initial balance
      let currentBalance = null
      let availableBalance = null
      try {
        const balance = await client.getBalance(tellerAccount.id)
        currentBalance = parseFloat(balance.ledger)
        availableBalance = balance.available ? parseFloat(balance.available) : null
      } catch {
        // Balance fetch failed, will retry on sync
      }

      // Insert new account
      const insertData: BankAccountInsert = {
        user_id: user.id,
        teller_account_id: tellerAccount.id,
        teller_enrollment_id: enrollment.id,
        teller_access_token: accessToken,
        institution_name: tellerAccount.institution.name,
        account_name: tellerAccount.name,
        account_type: mapAccountType(tellerAccount.type),
        account_subtype: tellerAccount.subtype,
        account_number_last4: tellerAccount.last_four,
        current_balance: currentBalance,
        available_balance: availableBalance,
        balance_updated_at: currentBalance ? new Date().toISOString() : null,
        sync_status: 'pending',
      }

      const insertResult = await supabase
        .from('bank_accounts')
        .insert(insertData as never)
        .select('id')
        .single()

      const newAccount = insertResult.data as { id: string } | null
      const insertError = insertResult.error

      if (insertError) {
        console.error('Failed to insert account:', insertError)
        continue
      }

      if (newAccount) {
        insertedAccounts.push(newAccount.id)
      }
    }

    // Auto-sync transactions after connecting
    const { syncAllAccounts } = await import('@/lib/banking/sync')
    try {
      await syncAllAccounts(user.id)
    } catch (syncError) {
      console.log('Auto-sync after connect failed:', syncError)
      // Non-fatal, user can manually sync later
    }

    return NextResponse.json({
      success: true,
      accountIds: insertedAccounts,
      message: `Connected ${insertedAccounts.length} account(s) from ${enrollment.institution.name}`,
    })
  } catch (error) {
    console.error('Bank connection error:', error)
    return NextResponse.json(
      { error: 'Failed to connect bank account' },
      { status: 500 }
    )
  }
}
