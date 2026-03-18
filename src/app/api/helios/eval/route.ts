// Project HELIOS - Evaluation API
// Trigger LoCoMo and LongMemEval benchmark runs

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runFullEvaluation, runLoCoMoEval, runLongMemEval } from '@/lib/helios/eval'
import type { EvalConfig } from '@/lib/helios/eval'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const benchmark = body.benchmark || 'both'
    const verbose = body.verbose || false
    const maxQuestions = body.maxQuestions

    const evalConfig: EvalConfig = {
      benchmark,
      use_synthetic: true,
      verbose,
      max_questions: maxQuestions,
    }

    const heliosConfig = body.heliosConfig || undefined

    let result

    switch (benchmark) {
      case 'locomo':
        result = { locomo: await runLoCoMoEval(heliosConfig, evalConfig), longmemeval: null }
        break
      case 'longmemeval':
        result = { locomo: null, longmemeval: await runLongMemEval(heliosConfig, evalConfig) }
        break
      case 'both':
      default:
        result = await runFullEvaluation(heliosConfig, evalConfig)
        break
    }

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('HELIOS Eval API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
