/**
 * Conversation Embeddings Service
 *
 * Embeds AI conversations for semantic search.
 * Allows Jorkel to remember and reference past conversations.
 */

import { createClient } from '@/lib/supabase/server'

// Minimum message length to embed (skip very short messages)
const MIN_MESSAGE_LENGTH = 20

/**
 * Generate embedding using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000), // Limit to ~8K chars
    })

    return response.data[0].embedding
  } catch (e) {
    console.error('Failed to generate embedding:', e)
    return null
  }
}

/**
 * Embed a single message
 */
export async function embedMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  content: string,
  role: 'user' | 'assistant'
): Promise<boolean> {
  // Skip short messages
  if (content.length < MIN_MESSAGE_LENGTH) {
    return false
  }

  const supabase = await createClient()

  // Check if already embedded
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('conversation_embeddings')
    .select('id')
    .eq('message_id', messageId)
    .limit(1)

  if (existing && existing.length > 0) {
    return true // Already embedded
  }

  // Generate embedding
  const embedding = await generateEmbedding(content)
  if (!embedding) {
    return false
  }

  // Store embedding
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('conversation_embeddings')
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      message_id: messageId,
      chunk_text: content.substring(0, 2000), // Store first 2K chars
      role,
      embedding,
    })

  if (error) {
    console.error('Failed to store conversation embedding:', error)
    return false
  }

  return true
}

/**
 * Embed a full conversation (all messages)
 */
export async function embedConversation(
  userId: string,
  conversationId: string
): Promise<{ embedded: number; skipped: number }> {
  const supabase = await createClient()
  let embedded = 0
  let skipped = 0

  // Get all messages in conversation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: messages } = await (supabase as any)
    .from('ai_messages')
    .select('id, content, role')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (!messages || messages.length === 0) {
    return { embedded: 0, skipped: 0 }
  }

  for (const msg of messages) {
    const success = await embedMessage(
      userId,
      conversationId,
      msg.id,
      msg.content,
      msg.role
    )

    if (success) {
      embedded++
    } else {
      skipped++
    }
  }

  return { embedded, skipped }
}

/**
 * Search past conversations semantically
 */
export async function searchConversations(
  userId: string,
  query: string,
  limit: number = 5
): Promise<{
  conversationId: string
  snippet: string
  role: string
  similarity: number
  date: string
}[]> {
  const supabase = await createClient()

  // Generate query embedding
  const embedding = await generateEmbedding(query)
  if (!embedding) {
    return []
  }

  // Search using pgvector
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: results, error } = await (supabase.rpc as any)('search_conversations', {
    query_embedding: embedding,
    match_threshold: 0.65,
    match_count: limit,
    p_user_id: userId,
  })

  if (error || !results) {
    console.error('Conversation search failed:', error)
    return []
  }

  return results.map((r: {
    conversation_id: string
    chunk_text: string
    role: string
    similarity: number
    created_at: string
  }) => ({
    conversationId: r.conversation_id,
    snippet: r.chunk_text.substring(0, 200),
    role: r.role,
    similarity: r.similarity,
    date: new Date(r.created_at).toLocaleDateString(),
  }))
}

/**
 * Get embedding stats for a user
 */
export async function getConversationEmbeddingStats(userId: string): Promise<{
  totalEmbeddings: number
  conversationsCovered: number
}> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('conversation_embeddings')
    .select('id, conversation_id')
    .eq('user_id', userId)

  if (error || !data) {
    return { totalEmbeddings: 0, conversationsCovered: 0 }
  }

  const uniqueConversations = new Set(data.map((d: { conversation_id: string }) => d.conversation_id))

  return {
    totalEmbeddings: data.length,
    conversationsCovered: uniqueConversations.size,
  }
}
