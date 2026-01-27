import { createClient } from '@/lib/supabase/server'

export type MemoryCategory = 'personal' | 'preferences' | 'work' | 'communication' | 'briefing' | 'goals'

export interface Memory {
  id: string
  category: MemoryCategory
  content: string
  importance: number
  access_count: number
  created_at: string
}

/**
 * Save a new memory about the user
 */
export async function saveMemory(
  userId: string,
  category: MemoryCategory,
  content: string,
  importance: number = 5,
  sourceConversationId?: string
): Promise<void> {
  const supabase = await createClient()

  // Check for similar existing memory to avoid duplicates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('ai_memories')
    .select('id, content')
    .eq('user_id', userId)
    .eq('category', category)
    .ilike('content', `%${content.substring(0, 50)}%`)
    .limit(1)

  if (existing && existing.length > 0) {
    // Update access count instead of duplicating
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('ai_memories')
      .update({
        access_count: existing[0].access_count + 1,
        last_accessed: new Date().toISOString(),
      })
      .eq('id', existing[0].id)
    return
  }

  // Insert new memory
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('ai_memories').insert({
    user_id: userId,
    category,
    content,
    importance,
    source_conversation: sourceConversationId,
  })
}

/**
 * Get all memories for a user
 */
export async function getMemories(userId: string): Promise<Memory[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('ai_memories')
    .select('*')
    .eq('user_id', userId)
    .order('importance', { ascending: false })
    .order('access_count', { ascending: false }) as { data: Memory[] | null }

  return data || []
}

/**
 * Get formatted memories for injection into system prompt
 */
export async function getMemoriesForPrompt(userId: string): Promise<string> {
  const memories = await getMemories(userId)

  if (memories.length === 0) return ''

  // Group by category
  const categorized: Record<string, string[]> = {}
  for (const mem of memories) {
    if (!categorized[mem.category]) {
      categorized[mem.category] = []
    }
    categorized[mem.category].push(mem.content)
  }

  // Format for system prompt
  const lines = ['\n\n## What you know about David:']
  for (const [category, items] of Object.entries(categorized)) {
    lines.push(`\n### ${category}:`)
    for (const item of items) {
      lines.push(`- ${item}`)
    }
  }

  return lines.join('\n')
}

/**
 * Delete a specific memory
 */
export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ai_memories')
    .delete()
    .eq('user_id', userId)
    .eq('id', memoryId)
}

/**
 * Clear all memories for a user
 */
export async function clearAllMemories(userId: string): Promise<void> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ai_memories')
    .delete()
    .eq('user_id', userId)
}
