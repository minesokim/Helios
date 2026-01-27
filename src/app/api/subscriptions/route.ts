import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'

type Subscription = Database['public']['Tables']['subscriptions']['Row']
type SubscriptionInsert = Database['public']['Tables']['subscriptions']['Insert']

// GET /api/subscriptions - List all subscriptions
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await supabase
      .from('subscriptions')
      .select(`
        *,
        category:transaction_categories(id, name, slug, color)
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('amount', { ascending: false })

    const subscriptions = result.data as (Subscription & {
      category: { id: string; name: string; slug: string; color: string | null } | null
    })[] | null

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    // Calculate totals
    let monthlyTotal = 0
    let yearlyTotal = 0

    for (const sub of subscriptions ?? []) {
      if (sub.status === 'active') {
        if (sub.frequency === 'monthly') {
          monthlyTotal += sub.amount
          yearlyTotal += sub.amount * 12
        } else if (sub.frequency === 'yearly') {
          monthlyTotal += sub.amount / 12
          yearlyTotal += sub.amount
        } else if (sub.frequency === 'weekly') {
          monthlyTotal += sub.amount * 4.33
          yearlyTotal += sub.amount * 52
        }
      }
    }

    return NextResponse.json({
      subscriptions,
      summary: {
        total: subscriptions?.length ?? 0,
        active: subscriptions?.filter(s => s.status === 'active').length ?? 0,
        monthlyTotal: Math.round(monthlyTotal * 100) / 100,
        yearlyTotal: Math.round(yearlyTotal * 100) / 100,
      },
    })
  } catch (error) {
    console.error('Fetch subscriptions error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    )
  }
}

// POST /api/subscriptions - Create subscription manually
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { merchant_name, amount, frequency, billing_day, category_id, is_essential, notes } = body

    if (!merchant_name || !amount || !frequency) {
      return NextResponse.json(
        { error: 'merchant_name, amount, and frequency are required' },
        { status: 400 }
      )
    }

    const subscription: SubscriptionInsert = {
      user_id: user.id,
      merchant_name,
      amount,
      frequency,
      billing_day: billing_day ?? null,
      category_id: category_id ?? null,
      is_essential: is_essential ?? false,
      notes: notes ?? null,
      status: 'active',
      first_seen_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .insert(subscription as never)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Create subscription error:', error)
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    )
  }
}

// PATCH /api/subscriptions - Update subscription
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Subscription ID required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Update subscription error:', error)
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    )
  }
}

// DELETE /api/subscriptions - Soft delete subscription
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Subscription ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('subscriptions')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete subscription error:', error)
    return NextResponse.json(
      { error: 'Failed to delete subscription' },
      { status: 500 }
    )
  }
}
