// Project HELIOS - Health and Diagnostics API

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

    const [memoryHealth, llmHealth] = await Promise.all([
      helios.getHealthReport(user.id),
      helios.checkLLMHealth(),
    ])

    return NextResponse.json({
      memory: memoryHealth,
      llm: llmHealth,
      config: {
        provider: helios.getConfig().llm_provider,
        reasoning_model: helios.getConfig().ollama_reasoning_model,
        embedding_model: helios.getConfig().ollama_embedding_model,
      },
    })
  } catch (error) {
    console.error('HELIOS Health API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
