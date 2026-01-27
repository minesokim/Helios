/**
 * Background endpoint to check for emails that might unblock projects
 *
 * This should be called periodically (e.g., every 15 minutes) by a cron job
 * or edge function to detect when blockers might be resolved.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkEmailsForUnblockers } from '@/services/briefings'
import { resolveBlocker } from '@/services/projects'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Google tokens
    const { data: googleCreds } = await supabase
      .from('google_oauth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .single() as { data: { access_token: string; refresh_token: string } | null }

    if (!googleCreds?.access_token) {
      return NextResponse.json({
        message: 'Google not connected',
        matches: []
      })
    }

    // Check for emails that match watch triggers
    const matches = await checkEmailsForUnblockers(
      user.id,
      googleCreds.access_token,
      googleCreds.refresh_token
    )

    // Process any matches based on their action type
    const results = []
    for (const match of matches) {
      const trigger = match.matchedTrigger

      // Get the trigger details to know what action to take
      const { data: triggerData } = await supabase
        .from('watch_triggers')
        .select('on_trigger, blocker:blockers(project_id)')
        .eq('blocker_id', trigger.blockerId)
        .single() as { data: { on_trigger: string; blocker: { project_id: string } | null } | null }

      if (triggerData?.on_trigger === 'mark_resolved' && triggerData.blocker?.project_id) {
        // Auto-resolve the blocker
        await resolveBlocker(
          user.id,
          triggerData.blocker.project_id,
          trigger.blockerId,
          `Auto-resolved: Email received from ${match.email.from}`
        )
        results.push({
          type: 'auto_resolved',
          project: trigger.projectName,
          email: match.email.subject,
        })
      } else {
        // Notify action - just record the match
        results.push({
          type: 'notification',
          project: trigger.projectName,
          email: match.email.subject,
          from: match.email.from,
        })
      }
    }

    return NextResponse.json({
      message: `Found ${matches.length} email matches`,
      matches: results,
    })

  } catch (error) {
    console.error('Unblocker check error:', error)
    return NextResponse.json(
      { error: 'Failed to check for unblockers' },
      { status: 500 }
    )
  }
}

// Also allow GET for easy testing
export async function GET(request: Request) {
  return POST(request)
}
