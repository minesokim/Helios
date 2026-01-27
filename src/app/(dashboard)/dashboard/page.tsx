import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import Link from 'next/link'
import type { Database } from '@/types/database'
import { DashboardHome } from '@/components/dashboard/dashboard-home'

type BankAccount = Database['public']['Tables']['bank_accounts']['Row']
type Transaction = Database['public']['Tables']['transactions']['Row']

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch account balances
  const { data: accounts } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .is('deleted_at', null) as { data: BankAccount[] | null }

  let totalBalance = 0
  for (const account of accounts ?? []) {
    totalBalance += account.current_balance ?? 0
  }

  // Fetch this month's transactions
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data: monthTransactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user!.id)
    .is('deleted_at', null)
    .gte('date', format(startOfMonth, 'yyyy-MM-dd')) as { data: Transaction[] | null }

  let monthIncome = 0
  let monthExpenses = 0
  for (const tx of monthTransactions ?? []) {
    if (tx.amount > 0) {
      monthIncome += tx.amount
    } else {
      monthExpenses += Math.abs(tx.amount)
    }
  }
  const monthNet = monthIncome - monthExpenses

  // Fetch recent transactions with category join
  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      description,
      merchant_name,
      amount,
      category:transaction_categories(name, color)
    `)
    .eq('user_id', user!.id)
    .is('deleted_at', null)
    .eq('is_hidden', false)
    .order('date', { ascending: false })
    .limit(5) as { data: (Pick<Transaction, 'id' | 'date' | 'description' | 'merchant_name' | 'amount'> & { category: { name: string; color: string | null } | null })[] | null }

  // Fetch counts
  const { count: documentCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .is('deleted_at', null)

  const { count: clientCount } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .eq('status', 'active')
    .is('deleted_at', null)

  // Get pending client suggestions count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: suggestionCount } = await (supabase as any)
    .from('client_suggestions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .eq('status', 'pending')

  return (
    <DashboardHome
      totalBalance={totalBalance}
      monthIncome={monthIncome}
      monthExpenses={monthExpenses}
      monthNet={monthNet}
      accounts={accounts || []}
      recentTransactions={recentTransactions || []}
      documentCount={documentCount || 0}
      clientCount={clientCount || 0}
      suggestionCount={suggestionCount || 0}
    />
  )
}
