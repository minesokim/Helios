import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/transactions - Get transactions with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const accountId = searchParams.get('accountId')
    const categoryId = searchParams.get('categoryId')
    const search = searchParams.get('search')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const minAmount = searchParams.get('minAmount')
    const maxAmount = searchParams.get('maxAmount')

    const offset = (page - 1) * limit

    // Build query
    let query = supabase
      .from('transactions')
      .select(`
        *,
        bank_account:bank_accounts(id, account_name, institution_name),
        category:transaction_categories(id, name, slug, icon, color)
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .eq('is_hidden', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (accountId) {
      query = query.eq('bank_account_id', accountId)
    }

    if (categoryId) {
      if (categoryId === 'uncategorized') {
        query = query.is('category_id', null)
      } else {
        query = query.eq('category_id', categoryId)
      }
    }

    if (search) {
      query = query.or(`description.ilike.%${search}%,merchant_name.ilike.%${search}%`)
    }

    if (startDate) {
      query = query.gte('date', startDate)
    }

    if (endDate) {
      query = query.lte('date', endDate)
    }

    if (minAmount) {
      query = query.gte('amount', parseFloat(minAmount))
    }

    if (maxAmount) {
      query = query.lte('amount', parseFloat(maxAmount))
    }

    const { data: transactions, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      transactions,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('Fetch transactions error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}

// PATCH /api/transactions - Update transaction
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, category_id, notes, tags, is_reviewed, is_hidden } = body

    if (!id) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (category_id !== undefined) {
      updates.category_id = category_id
      updates.category_source = 'user'
      updates.category_confidence = 1.0
    }
    if (notes !== undefined) updates.notes = notes
    if (tags !== undefined) updates.tags = tags
    if (is_reviewed !== undefined) updates.is_reviewed = is_reviewed
    if (is_hidden !== undefined) updates.is_hidden = is_hidden

    const { data, error } = await supabase
      .from('transactions')
      .update(updates as never)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Update transaction error:', error)
    return NextResponse.json(
      { error: 'Failed to update transaction' },
      { status: 500 }
    )
  }
}
