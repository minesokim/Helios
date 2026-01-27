import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all clients
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!clients || clients.length === 0) {
      return NextResponse.json({ clients: [], totals: { revenue: 0, expenses: 0, profit: 0 } })
    }

    // Get revenue and expenses for last 12 months
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const [revenueRes, expensesRes] = await Promise.all([
      supabase
        .from('client_revenue')
        .select('client_id, amount')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gte('revenue_date', twelveMonthsAgo.toISOString().split('T')[0]),
      supabase
        .from('client_expenses')
        .select('client_id, amount')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gte('expense_date', twelveMonthsAgo.toISOString().split('T')[0]),
    ])

    // Calculate totals by client
    const revenueByClient = new Map<string, number>()
    const expensesByClient = new Map<string, number>()

    for (const r of revenueRes.data || []) {
      revenueByClient.set(r.client_id, (revenueByClient.get(r.client_id) || 0) + Number(r.amount))
    }

    for (const e of expensesRes.data || []) {
      expensesByClient.set(e.client_id, (expensesByClient.get(e.client_id) || 0) + Number(e.amount))
    }

    // Enrich clients with P&L data
    const enrichedClients = clients.map(client => {
      const revenue = revenueByClient.get(client.id) || 0
      const expenses = expensesByClient.get(client.id) || 0
      const profit = revenue - expenses
      const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0

      return {
        ...client,
        pl: {
          revenue,
          expenses,
          profit,
          margin,
        },
      }
    })

    // Calculate totals
    const totalRevenue = enrichedClients.reduce((sum, c) => sum + c.pl.revenue, 0)
    const totalExpenses = enrichedClients.reduce((sum, c) => sum + c.pl.expenses, 0)
    const totalProfit = totalRevenue - totalExpenses

    return NextResponse.json({
      clients: enrichedClients,
      totals: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        profit: totalProfit,
        margin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0,
      },
    })
  } catch (error) {
    console.error('Clients API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()

    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        user_id: user.id,
        name: body.name,
        status: body.status || 'active',
        contact_email: body.contact_email,
        contact_name: body.contact_name,
        monthly_retainer: body.monthly_retainer,
        notes: body.notes,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ client })
  } catch (error) {
    console.error('Create client error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
