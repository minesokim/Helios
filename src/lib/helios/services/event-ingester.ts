// Project HELIOS - Event Ingester
// FR-1: Normalize every meaningful interaction into event records
// Handles deduplication, content hashing, and event creation

import { createHash } from 'crypto'
import type {
  HeliosEvent,
  HeliosEventInsert,
  EventType,
  HeliosConfig,
} from '../types'
import { insertEvent, checkEventDuplicate } from '../stores/memory-store'

/**
 * Compute a SHA-256 hash of the content for deduplication.
 * Normalizes whitespace and case for more reliable dedup.
 */
function computeContentHash(content: string, userId: string, eventType: EventType): string {
  const normalized = content.trim().replace(/\s+/g, ' ').toLowerCase()
  return createHash('sha256')
    .update(`${userId}:${eventType}:${normalized}`)
    .digest('hex')
}

/**
 * Estimate token count for a piece of text.
 * Rough approximation: ~4 chars per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Determine if content is meaningful enough to create an event.
 * Filters out trivial interactions that should never become memories.
 */
function isContentMeaningful(content: string, eventType: EventType): boolean {
  const trimmed = content.trim()

  // Too short to be meaningful
  if (trimmed.length < 5) return false

  // System noise patterns
  const noisePatterns = [
    /^(ok|okay|yes|no|sure|thanks|thank you|cool|got it|hmm|ah|oh)\.?$/i,
    /^(hi|hello|hey|bye|goodbye)\.?$/i,
    /^\d+$/,  // Just numbers
    /^[.!?,;:]+$/,  // Just punctuation
  ]

  // Only filter noise for user messages; tool results and system events are always meaningful
  if (eventType === 'user_message') {
    for (const pattern of noisePatterns) {
      if (pattern.test(trimmed)) return false
    }
  }

  return true
}

/**
 * Extract metadata from content based on event type.
 * Enriches the event with structured data for downstream processing.
 */
function extractMetadata(
  content: string,
  eventType: EventType,
  additionalMetadata?: Record<string, unknown>
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...additionalMetadata }

  // Basic content stats
  metadata.char_count = content.length
  metadata.word_count = content.split(/\s+/).filter(Boolean).length
  metadata.estimated_tokens = estimateTokens(content)

  // Extract mentions (@name patterns)
  const mentions = content.match(/@[\w.-]+/g)
  if (mentions && mentions.length > 0) {
    metadata.mentions = mentions.map((m) => m.replace('@', ''))
  }

  // Extract URLs
  const urls = content.match(/https?:\/\/[^\s)]+/g)
  if (urls && urls.length > 0) {
    metadata.urls = urls
  }

  // Extract quoted text
  const quotes = content.match(/"[^"]+"/g)
  if (quotes && quotes.length > 0) {
    metadata.quoted_text = quotes.map((q) => q.replace(/"/g, ''))
  }

  // Detect questions
  if (content.includes('?')) {
    metadata.contains_question = true
  }

  // Detect imperative/command patterns
  if (/^(do|make|create|update|delete|fix|add|remove|change|set|get|find|show|tell|explain)/i.test(content.trim())) {
    metadata.is_imperative = true
  }

  // Detect emotional/sentiment markers
  if (/(!{2,}|\b(love|hate|great|terrible|amazing|awful|perfect|worst|best)\b)/i.test(content)) {
    metadata.has_strong_sentiment = true
  }

  // Detect temporal references
  if (/\b(today|tomorrow|yesterday|next week|last month|this year|deadline|due|until|by|before|after|schedule)\b/i.test(content)) {
    metadata.has_temporal_reference = true
  }

  // Detect financial content
  if (/\$[\d,.]+|\b\d+k\b|\b(budget|cost|price|revenue|expense|invoice|payment|salary)\b/i.test(content)) {
    metadata.has_financial_content = true
  }

  return metadata
}

/**
 * Ingest a raw interaction into the HELIOS event pipeline.
 * Returns the created event or null if the content was filtered/duplicated.
 */
export async function ingestEvent(
  input: HeliosEventInsert,
  config: HeliosConfig
): Promise<HeliosEvent | null> {
  // Step 1: Check if content is meaningful
  if (!isContentMeaningful(input.content, input.event_type)) {
    return null
  }

  // Step 2: Compute content hash for deduplication
  const contentHash = computeContentHash(input.content, input.user_id, input.event_type)

  // Step 3: Check for duplicate events (exact match)
  const isDuplicate = await checkEventDuplicate(contentHash, input.user_id)
  if (isDuplicate) {
    return null
  }

  // Step 4: Extract metadata
  const metadata = extractMetadata(input.content, input.event_type, input.metadata)

  // Step 5: Insert the event
  const event = await insertEvent({
    user_id: input.user_id,
    event_type: input.event_type,
    content: input.content,
    content_hash: contentHash,
    metadata,
    conversation_id: input.conversation_id || null,
    session_id: input.session_id || null,
    source_system: input.source_system || 'chat',
    salience_score: 0, // Will be computed by salience scorer
    novelty_score: 0,   // Will be computed by salience scorer
  })

  return event
}

/**
 * Batch ingest multiple events.
 * Processes sequentially to respect dedup checks.
 */
export async function ingestEventBatch(
  inputs: HeliosEventInsert[],
  config: HeliosConfig
): Promise<HeliosEvent[]> {
  const results: HeliosEvent[] = []

  for (const input of inputs) {
    const event = await ingestEvent(input, config)
    if (event) {
      results.push(event)
    }
  }

  return results
}

/**
 * Ingest a conversation turn (user message + assistant response).
 * Creates two events and links them via conversation_id.
 */
export async function ingestConversationTurn(
  userId: string,
  conversationId: string,
  userMessage: string,
  assistantResponse: string,
  sessionId?: string,
  config?: HeliosConfig
): Promise<{ userEvent: HeliosEvent | null; assistantEvent: HeliosEvent | null }> {
  const effectiveConfig = config || (await getDefaultConfig())

  const userEvent = await ingestEvent(
    {
      user_id: userId,
      event_type: 'user_message',
      content: userMessage,
      conversation_id: conversationId,
      session_id: sessionId,
      source_system: 'chat',
    },
    effectiveConfig
  )

  const assistantEvent = await ingestEvent(
    {
      user_id: userId,
      event_type: 'assistant_message',
      content: assistantResponse,
      conversation_id: conversationId,
      session_id: sessionId,
      source_system: 'chat',
    },
    effectiveConfig
  )

  return { userEvent, assistantEvent }
}

/**
 * Ingest an external data event (banking update, calendar event, email, etc.)
 */
export async function ingestExternalData(
  userId: string,
  sourceSystem: string,
  content: string,
  metadata?: Record<string, unknown>,
  config?: HeliosConfig
): Promise<HeliosEvent | null> {
  const effectiveConfig = config || (await getDefaultConfig())

  return ingestEvent(
    {
      user_id: userId,
      event_type: 'external_data',
      content,
      metadata,
      source_system: sourceSystem,
    },
    effectiveConfig
  )
}

// Lazy config loader
async function getDefaultConfig(): Promise<HeliosConfig> {
  const { DEFAULT_CONFIG } = await import('../types')
  return DEFAULT_CONFIG
}
