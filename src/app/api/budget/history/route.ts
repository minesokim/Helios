import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUsageHistory } from '@/services/budget'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30', 10)

    const history = await getUsageHistory(user.id, days)

    return NextResponse.json({ history })
  } catch (error) {
    console.error('Usage history fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch usage history' },
      { status: 500 }
    )
  }
}
