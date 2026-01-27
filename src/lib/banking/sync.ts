import { createClient } from '@/lib/supabase/server'
import { TellerClient, mapTransaction, TellerTransaction } from './teller'
import type { Database } from '@/types/database'

type BankAccount = Database['public']['Tables']['bank_accounts']['Row']
type TransactionInsert = Database['public']['Tables']['transactions']['Insert']

export interface SyncResult {
  accountId: string
  newTransactions: number
  updatedBalance: number | null
  error?: string
}

// Sync transactions for a single bank account
export async function syncBankAccount(
  account: BankAccount
): Promise<SyncResult> {
  const supabase = await createClient()

  if (!account.teller_access_token) {
    return {
      accountId: account.id,
      newTransactions: 0,
      updatedBalance: null,
      error: 'No access token',
    }
  }

  const client = new TellerClient(account.teller_access_token)

  try {
    // Update sync status
    await supabase
      .from('bank_accounts')
      .update({ sync_status: 'syncing' } as never)
      .eq('id', account.id)

    // Fetch balance
    const balance = await client.getBalance(account.teller_account_id!)
    const currentBalance = parseFloat(balance.ledger)
    const availableBalance = balance.available ? parseFloat(balance.available) : null

    // Fetch transactions (last 500)
    const tellerTransactions = await client.getTransactions(
      account.teller_account_id!,
      { count: 500 }
    )

    // Get existing transaction IDs to avoid duplicates
    const existingResult = await supabase
      .from('transactions')
      .select('teller_transaction_id')
      .eq('bank_account_id', account.id)
      .not('teller_transaction_id', 'is', null)

    const existingTxs = existingResult.data as { teller_transaction_id: string | null }[] | null

    const existingIds = new Set(
      existingTxs?.map((t) => t.teller_transaction_id) || []
    )

    // Filter new transactions
    const newTellerTxs = tellerTransactions.filter(
      (t) => !existingIds.has(t.id)
    )

    // Insert new transactions
    if (newTellerTxs.length > 0) {
      const transactionsToInsert: TransactionInsert[] = newTellerTxs.map((t) => ({
        user_id: account.user_id,
        bank_account_id: account.id,
        ...mapTransaction(t),
      }))

      const { error: insertError } = await supabase
        .from('transactions')
        .insert(transactionsToInsert as never)

      if (insertError) {
        throw new Error(`Failed to insert transactions: ${insertError.message}`)
      }
    }

    // Update pending transactions that are now posted
    const pendingTxs = tellerTransactions.filter((t) => {
      return existingIds.has(t.id) && t.status === 'posted'
    })

    for (const t of pendingTxs) {
      await supabase
        .from('transactions')
        .update({
          status: 'posted',
          amount: parseFloat(t.amount),
          raw_data: t,
        } as never)
        .eq('teller_transaction_id', t.id)
        .eq('status', 'pending')
    }

    // Update account balance and sync status
    await supabase
      .from('bank_accounts')
      .update({
        current_balance: currentBalance,
        available_balance: availableBalance,
        balance_updated_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        sync_status: 'success',
        sync_error: null,
      } as never)
      .eq('id', account.id)

    return {
      accountId: account.id,
      newTransactions: newTellerTxs.length,
      updatedBalance: currentBalance,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Update sync status to error
    await supabase
      .from('bank_accounts')
      .update({
        sync_status: 'error',
        sync_error: errorMessage,
      } as never)
      .eq('id', account.id)

    return {
      accountId: account.id,
      newTransactions: 0,
      updatedBalance: null,
      error: errorMessage,
    }
  }
}

// Sync all accounts for a user
export async function syncAllAccounts(userId: string): Promise<SyncResult[]> {
  const supabase = await createClient()

  const result = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('deleted_at', null)

  const accounts = result.data as BankAccount[] | null
  const error = result.error

  if (error || !accounts) {
    throw new Error('Failed to fetch accounts')
  }

  const results: SyncResult[] = []

  for (const account of accounts) {
    const syncResult = await syncBankAccount(account)
    results.push(syncResult)
  }

  return results
}
