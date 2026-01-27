import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'

type BankAccountRow = Database['public']['Tables']['bank_accounts']['Row']

// GET /api/banking/accounts - Get all bank accounts for user
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    const accounts = result.data as BankAccountRow[] | null
    const error = result.error

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate totals
    const totals = (accounts || []).reduce(
      (acc, account) => {
        const balance = account.current_balance || 0
        if (account.account_type === 'credit') {
          acc.credit += balance
        } else {
          acc.cash += balance
        }
        return acc
      },
      { cash: 0, credit: 0 }
    )

    return NextResponse.json({
      accounts,
      totals: {
        cash: totals.cash,
        credit: totals.credit,
        net: totals.cash + totals.credit, // credit is negative
      },
    })
  } catch (error) {
    console.error('Fetch accounts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    )
  }
}

// DELETE /api/banking/accounts - Disconnect a bank account
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('id')

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 })
    }

    // Soft delete the account
    const result = await supabase
      .from('bank_accounts')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        teller_access_token: null,
      } as never)
      .eq('id', accountId)
      .eq('user_id', user.id)

    const error = result.error

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete account error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect account' },
      { status: 500 }
    )
  }
}
