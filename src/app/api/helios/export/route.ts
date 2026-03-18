// Project HELIOS - Memory Export API
// FR-10: Users can export their complete memory data

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHelios } from '@/lib/helios'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const helios = getHelios()
    const exportData = await helios.exportAllMemories(user.id)
    const health = await helios.getHealthReport(user.id)

    return NextResponse.json({
      exported_at: new Date().toISOString(),
      user_id: user.id,
      health,
      ...exportData,
    })
  } catch (error) {
    console.error('HELIOS Export API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
