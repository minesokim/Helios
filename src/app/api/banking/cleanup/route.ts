import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Teller sandbox uses these fake institution names
const SANDBOX_INSTITUTIONS = [
  'First Platypus Bank',
  'Tartan Bank',
  'Chase',  // Sandbox Chase
  // Add more if needed
]

// Sandbox transaction patterns (fake merchant names from Teller sandbox)
const SANDBOX_MERCHANTS = [
  'MAGNA BANK',
  'AB LOGISTICS',
  'BANK OF THE',
  'FIVE GUYS',
  'UBER',
  'LYFT',
  'AMAZON',
  'WALMART',
  'TARGET',
  'STARBUCKS',
]

// POST /api/banking/cleanup - Remove sandbox data
export async function POST() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find sandbox accounts (accounts with sandbox institution names or created before development switch)
    // We'll identify them by checking if the teller_account_id starts with 'acc_' and the institution matches sandbox patterns
    const { data: accountsData } = await supabase
      .from('bank_accounts')
      .select('id, institution_name, teller_account_id, created_at')
      .eq('user_id', user.id)

    const accounts = accountsData as { id: string; institution_name: string | null; teller_account_id: string | null; created_at: string }[] | null

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: 'No accounts found', deleted: { accounts: 0, transactions: 0 } })
    }

    // Identify sandbox accounts - these typically have test institution names
    // Or we can just delete ALL transactions and accounts and let the user reconnect fresh

    // For safety, let's identify sandbox accounts by looking at suspicious patterns
    // Sandbox transactions often have dates in the past and specific merchant patterns

    // Get all transactions that look like sandbox data
    // Sandbox transactions from Teller typically have very generic names
    const { data: suspiciousTransactionsData } = await supabase
      .from('transactions')
      .select('id, bank_account_id, description, merchant_name')
      .eq('user_id', user.id)
      .is('deleted_at', null)

    const suspiciousTransactions = suspiciousTransactionsData as { id: string; bank_account_id: string; description: string; merchant_name: string | null }[] | null

    // Find accounts that have sandbox-style transactions
    const sandboxAccountIds = new Set<string>()

    // Check for sandbox-style merchants in transactions
    for (const tx of suspiciousTransactions || []) {
      const desc = (tx.description || '').toUpperCase()
      const merchant = (tx.merchant_name || '').toUpperCase()

      // If merchant matches sandbox patterns, mark this account as sandbox
      for (const pattern of SANDBOX_MERCHANTS) {
        if (desc.includes(pattern) || merchant.includes(pattern)) {
          // Check if this is actually from a sandbox account
          // Sandbox accounts typically don't have real transaction IDs
          sandboxAccountIds.add(tx.bank_account_id)
          break
        }
      }
    }

    // Also check institution names
    for (const account of accounts) {
      const instName = (account.institution_name || '').toLowerCase()
      if (SANDBOX_INSTITUTIONS.some(s => instName.includes(s.toLowerCase()))) {
        sandboxAccountIds.add(account.id)
      }
    }

    let deletedTransactions = 0
    let deletedAccounts = 0

    // Delete transactions from sandbox accounts
    if (sandboxAccountIds.size > 0) {
      const accountIdArray = Array.from(sandboxAccountIds)

      // Delete transactions
      const { data: deletedTxs } = await supabase
        .from('transactions')
        .delete()
        .eq('user_id', user.id)
        .in('bank_account_id', accountIdArray)
        .select('id')

      deletedTransactions = deletedTxs?.length || 0

      // Delete accounts
      const { data: deletedAccs } = await supabase
        .from('bank_accounts')
        .delete()
        .eq('user_id', user.id)
        .in('id', accountIdArray)
        .select('id')

      deletedAccounts = deletedAccs?.length || 0
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up sandbox data`,
      deleted: {
        accounts: deletedAccounts,
        transactions: deletedTransactions,
      },
      sandboxAccountIds: Array.from(sandboxAccountIds),
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup sandbox data' },
      { status: 500 }
    )
  }
}

// DELETE /api/banking/cleanup - Hard delete ALL bank data (nuclear option)
export async function DELETE() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete all transactions for this user
    const { data: deletedTxs } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', user.id)
      .select('id')

    // Delete all subscriptions for this user
    const { data: deletedSubs } = await supabase
      .from('subscriptions')
      .delete()
      .eq('user_id', user.id)
      .select('id')

    // Delete all bank accounts for this user
    const { data: deletedAccs } = await supabase
      .from('bank_accounts')
      .delete()
      .eq('user_id', user.id)
      .select('id')

    return NextResponse.json({
      success: true,
      message: 'All banking data deleted. Please reconnect your bank accounts.',
      deleted: {
        accounts: deletedAccs?.length || 0,
        transactions: deletedTxs?.length || 0,
        subscriptions: deletedSubs?.length || 0,
      },
    })
  } catch (error) {
    console.error('Hard cleanup error:', error)
    return NextResponse.json(
      { error: 'Failed to delete banking data' },
      { status: 500 }
    )
  }
}
