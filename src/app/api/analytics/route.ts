import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import type { Database } from '@/types/database'

type BankAccount = Database['public']['Tables']['bank_accounts']['Row']
type TransactionWithCategory = {
  id: string
  amount: number
  date: string
  category: { id: string; name: string; slug: string; color: string | null } | null
}

// GET /api/analytics - Get spending analytics
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const months = parseInt(searchParams.get('months') || '1')

    const endDate = endOfMonth(new Date())
    const startDate = startOfMonth(subMonths(new Date(), months - 1))

    // Fetch transactions for the period
    const txResult = await supabase
      .from('transactions')
      .select(`
        id,
        amount,
        date,
        category:transaction_categories(id, name, slug, color)
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .eq('is_hidden', false)
      .gte('date', format(startDate, 'yyyy-MM-dd'))
      .lte('date', format(endDate, 'yyyy-MM-dd'))

    const transactions = txResult.data as TransactionWithCategory[] | null
    const txError = txResult.error

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    // Calculate totals
    let totalIncome = 0
    let totalExpenses = 0
    const categoryTotals: Record<string, { name: string; color: string; amount: number }> = {}

    for (const tx of transactions ?? []) {
      if (tx.amount > 0) {
        totalIncome += tx.amount
      } else {
        totalExpenses += Math.abs(tx.amount)

        // Track by category
        const categoryName = tx.category?.name || 'Uncategorized'
        const categoryColor = tx.category?.color || '#94a3b8'

        if (!categoryTotals[categoryName]) {
          categoryTotals[categoryName] = { name: categoryName, color: categoryColor, amount: 0 }
        }
        categoryTotals[categoryName].amount += Math.abs(tx.amount)
      }
    }

    // Sort categories by amount
    const spendingByCategory = Object.values(categoryTotals)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10) // Top 10

    // Fetch account balances
    const { data: accounts } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('deleted_at', null) as { data: BankAccount[] | null }

    let totalBalance = 0
    for (const account of accounts ?? []) {
      totalBalance += account.current_balance ?? 0
    }

    return NextResponse.json({
      period: {
        start: format(startDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd'),
      },
      summary: {
        totalBalance,
        totalIncome,
        totalExpenses,
        netCashFlow: totalIncome - totalExpenses,
      },
      spendingByCategory,
      transactionCount: transactions?.length || 0,
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
