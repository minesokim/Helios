import { createClient } from '@/lib/supabase/server'

export interface BriefingPref {
  id: string
  topic: string
  enabled: boolean
  priority: number
  notes: string | null
}

/**
 * Save or update a briefing preference
 */
export async function saveBriefingPref(
  userId: string,
  topic: string,
  enabled: boolean = true,
  priority: number = 5,
  notes?: string
): Promise<void> {
  const supabase = await createClient()

  // Upsert - insert or update on conflict
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ai_briefing_prefs')
    .upsert(
      {
        user_id: userId,
        topic,
        enabled,
        priority,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,topic' }
    )
}

/**
 * Get all briefing preferences for a user
 */
export async function getBriefingPrefs(userId: string): Promise<BriefingPref[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('ai_briefing_prefs')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: false }) as { data: BriefingPref[] | null }

  return data || []
}

/**
 * Get enabled topics for briefings
 */
export async function getEnabledBriefingTopics(userId: string): Promise<string[]> {
  const prefs = await getBriefingPrefs(userId)
  return prefs.filter(p => p.enabled).map(p => p.topic)
}

/**
 * Delete a briefing preference
 */
export async function deleteBriefingPref(userId: string, topic: string): Promise<void> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ai_briefing_prefs')
    .delete()
    .eq('user_id', userId)
    .eq('topic', topic)
}
