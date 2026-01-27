import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { categorizeUncategorizedTransactions } from '@/services/categorization/categorize'

// POST /api/transactions/categorize - Run AI categorization
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const batchSize = body.batchSize || 50 // Process all in batches of 50

    const result = await categorizeUncategorizedTransactions(user.id, batchSize)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('Categorization error:', error)
    return NextResponse.json(
      { error: 'Failed to categorize transactions' },
      { status: 500 }
    )
  }
}
