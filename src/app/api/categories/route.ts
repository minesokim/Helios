import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/categories - Get all categories
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: categories, error } = await supabase
      .from('transaction_categories')
      .select('*')
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ categories })
  } catch (error) {
    console.error('Fetch categories error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    )
  }
}
