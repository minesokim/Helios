/**
 * Client Analysis API
 *
 * Triggers analysis of emails, documents, conversations, and calendar
 * to detect potential clients and create suggestions.
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  runFullDetection,
  saveDetectionResults,
} from '@/services/clients/suggestion-detector'

export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Client Analysis] Starting detection for user:', user.id)

    // Run full detection across all sources
    const { results, sourceCounts, debug } = await runFullDetection(user.id)

    console.log('[Client Analysis] Detection complete:', {
      detected: results.length,
      sourceCounts,
      debug,
    })

    // Save results as suggestions (deduplicates against existing)
    const { created, skipped } = await saveDetectionResults(user.id, results)

    console.log('[Client Analysis] Results saved:', { created, skipped })

    return NextResponse.json({
      success: true,
      summary: {
        detected: results.length,
        newSuggestions: created,
        duplicatesSkipped: skipped,
        sources: sourceCounts,
      },
      debug, // Include debug info in response for troubleshooting
    })
  } catch (error) {
    console.error('[Client Analysis] Error:', error)
    return NextResponse.json(
      { error: 'Analysis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
