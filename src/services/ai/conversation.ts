import { createClient } from '@/lib/supabase/server'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface Conversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

/**
 * Get or create a conversation
 */
export async function getOrCreateConversation(
  userId: string,
  conversationId?: string
): Promise<string> {
  const supabase = await createClient()

  if (conversationId) {
    // Check if conversation exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (data) return conversationId

    // Conversation doesn't exist but client provided an ID - create with that ID
    // This supports client-generated session IDs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newConvWithId, error } = await (supabase as any)
      .from('ai_conversations')
      .insert({ id: conversationId, user_id: userId })
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    if (newConvWithId) return newConvWithId.id
    // If insert failed (maybe ID conflict), fall through to create new
    console.log('Failed to create conversation with provided ID:', error)
  }

  // Create new conversation with auto-generated ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newConv } = await (supabase as any)
    .from('ai_conversations')
    .insert({ user_id: userId })
    .select('id')
    .single() as { data: { id: string } | null }

  return newConv?.id || crypto.randomUUID()
}

/**
 * Get conversation history
 */
export async function getConversationHistory(
  userId: string,
  conversationId: string,
  limit: number = 20
): Promise<Message[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('ai_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit) as { data: Message[] | null }

  // Reverse to get chronological order
  return (data || []).reverse()
}

/**
 * Save a message to the conversation
 */
export async function saveMessage(
  userId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  inputSource: 'typed' | 'voice' = 'typed'
): Promise<{ id: string } | null> {
  const supabase = await createClient()

  // Save message and return the ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: messageData } = await (supabase as any)
    .from('ai_messages')
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role,
      content,
      input_source: inputSource,
    })
    .select('id')
    .single()

  const messageId = messageData?.id || null

  // Update conversation timestamp and title (if first message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conv } = await (supabase as any)
    .from('ai_conversations')
    .select('title')
    .eq('id', conversationId)
    .single() as { data: { title: string | null } | null }

  const updates: { updated_at: string; title?: string } = {
    updated_at: new Date().toISOString(),
  }

  // Set title from first user message if not set
  if (!conv?.title && role === 'user') {
    updates.title = content.length > 50 ? content.substring(0, 50) + '...' : content
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ai_conversations')
    .update(updates)
    .eq('id', conversationId)

  return messageId ? { id: messageId } : null
}

/**
 * Get recent conversations
 */
export async function getRecentConversations(
  userId: string,
  limit: number = 10
): Promise<Conversation[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit) as { data: Conversation[] | null }

  return data || []
}

/**
 * Delete a conversation and its messages
 */
export async function deleteConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  const supabase = await createClient()

  // Messages are cascade deleted
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ai_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', userId)
}

/**
 * Clear all conversations for a user
 */
export async function clearAllConversations(userId: string): Promise<void> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('ai_conversations')
    .delete()
    .eq('user_id', userId)
}

/**
 * Search past conversations for relevant context
 */
export async function searchConversations(
  userId: string,
  query: string,
  limit: number = 5
): Promise<{ title: string; snippet: string; date: string }[]> {
  const supabase = await createClient()

  // Search messages containing the query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: messages } = await (supabase as any)
    .from('ai_messages')
    .select('content, created_at, conversation_id')
    .eq('user_id', userId)
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit * 2) as { data: { content: string; created_at: string; conversation_id: string }[] | null }

  if (!messages || messages.length === 0) {
    return []
  }

  // Get unique conversation IDs
  const convIds = [...new Set(messages.map(m => m.conversation_id))].slice(0, limit)

  // Get conversation titles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: convs } = await (supabase as any)
    .from('ai_conversations')
    .select('id, title, created_at')
    .in('id', convIds) as { data: { id: string; title: string; created_at: string }[] | null }

  const convMap = new Map(convs?.map(c => [c.id, c]) || [])

  // Build results
  const results: { title: string; snippet: string; date: string }[] = []
  const seenConvs = new Set<string>()

  for (const msg of messages) {
    if (seenConvs.has(msg.conversation_id)) continue
    seenConvs.add(msg.conversation_id)

    const conv = convMap.get(msg.conversation_id)
    const snippet = msg.content.length > 200
      ? msg.content.substring(0, 200) + '...'
      : msg.content

    results.push({
      title: conv?.title || 'Untitled conversation',
      snippet,
      date: new Date(msg.created_at).toLocaleDateString(),
    })

    if (results.length >= limit) break
  }

  return results
}
