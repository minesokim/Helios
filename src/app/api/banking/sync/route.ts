import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncAllAccounts, syncBankAccount } from '@/lib/banking/sync'

// POST /api/banking/sync - Sync all accounts or specific account
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const accountId = body.accountId as string | undefined

    if (accountId) {
      // Sync specific account
      const { data: account, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single()

      if (error || !account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 })
      }

      const result = await syncBankAccount(account)
      return NextResponse.json(result)
    }

    // Sync all accounts
    const results = await syncAllAccounts(user.id)

    const totalNew = results.reduce((sum, r) => sum + r.newTransactions, 0)
    const errors = results.filter((r) => r.error)

    return NextResponse.json({
      success: true,
      results,
      summary: {
        accountsSynced: results.length,
        newTransactions: totalNew,
        errors: errors.length,
      },
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync accounts' },
      { status: 500 }
    )
  }
}
