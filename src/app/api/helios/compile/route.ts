// Project HELIOS - Memory Compiler API
// Trigger background compilation: consolidation, procedure extraction, decay, contradiction resolution

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHelios } from '@/lib/helios'

export async function POST() {
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
    const result = await helios.runCompiler(user.id)

    return NextResponse.json({
      success: true,
      result: {
        memories_consolidated: result.memories_consolidated,
        procedures_extracted: result.procedures_extracted,
        memories_decayed: result.memories_decayed,
        contradictions_resolved: result.contradictions_resolved,
        new_abstractions_created: result.new_abstractions_created,
        health: result.health_metrics,
      },
    })
  } catch (error) {
    console.error('HELIOS Compile API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
