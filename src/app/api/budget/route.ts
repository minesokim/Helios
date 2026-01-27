import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUsageSummary, getBudgetSettings, updateBudgetSettings } from '@/services/budget'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [usage, settings] = await Promise.all([
      getUsageSummary(user.id),
      getBudgetSettings(user.id),
    ])

    return NextResponse.json({
      usage,
      settings,
    })
  } catch (error) {
    console.error('Budget fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch budget data' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const settings = await updateBudgetSettings(user.id, body)

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Budget update error:', error)
    return NextResponse.json(
      { error: 'Failed to update budget settings' },
      { status: 500 }
    )
  }
}
