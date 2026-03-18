// Project HELIOS - Multi-Channel Retrieval Council
// FR-6: Issue parallel queries over vector, lexical, graph, temporal, identity,
//       task, procedural, failure, and analogical channels
// FR-7: Rerank candidates on weighted composite score

import type {
  HeliosMemory,
  HeliosEntity,
  HeliosEdge,
  HeliosConfig,
  RetrievalRequest,
  RetrievalCandidate,
  RetrievalChannel,
  MemoryClass,
} from '../types'
import { getEmbeddingProvider } from '../providers'
import {
  searchMemoriesVector,
  searchMemoriesText,
  searchMemoriesTemporal,
  getActiveMemories,
  getPinnedBlocks,
  touchMemories,
  searchEntities,
  getEdgesForEntity,
} from '../stores/memory-store'

/**
 * Execute the full retrieval council: parallel multi-channel search, then merge and deduplicate.
 * Returns raw candidates before reranking (reranker handles scoring).
 */
export async function retrieveFromAllChannels(
  request: RetrievalRequest,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  // Generate query embedding for vector channels
  let queryEmbedding: number[] | null = null
  try {
    const embeddingProvider = getEmbeddingProvider(config)
    queryEmbedding = await embeddingProvider.embed(request.query)
  } catch (error) {
    console.error('HELIOS: Failed to generate query embedding:', error)
  }

  // Launch all channels in parallel with timeout protection
  const channelPromises: Array<{
    channel: RetrievalChannel
    promise: Promise<RetrievalCandidate[]>
  }> = []

  // Channel 1: Vector (semantic similarity)
  if (queryEmbedding) {
    channelPromises.push({
      channel: 'vector',
      promise: vectorChannel(
        queryEmbedding,
        request.user_id,
        request.memory_classes,
        request.min_confidence || 0,
        config
      ),
    })
  }

  // Channel 2: Lexical (full-text search)
  channelPromises.push({
    channel: 'lexical',
    promise: lexicalChannel(
      request.query,
      request.user_id,
      request.memory_classes,
      request.min_confidence || 0,
      config
    ),
  })

  // Channel 3: Temporal (time-based retrieval)
  channelPromises.push({
    channel: 'temporal',
    promise: temporalChannel(
      request.user_id,
      request.temporal_anchor,
      request.memory_classes,
      config
    ),
  })

  // Channel 4: Identity (pinned user profile and identity memories)
  channelPromises.push({
    channel: 'identity',
    promise: identityChannel(request.user_id, config),
  })

  // Channel 5: Procedural (learned routines and patterns)
  channelPromises.push({
    channel: 'procedural',
    promise: proceduralChannel(request.user_id, request.query, queryEmbedding, config),
  })

  // Channel 6: Failure (past errors and bad outcomes)
  channelPromises.push({
    channel: 'failure',
    promise: failureChannel(request.user_id, request.query, queryEmbedding, config),
  })

  // Channel 7: Graph (entity relationships)
  channelPromises.push({
    channel: 'graph',
    promise: graphChannel(request.user_id, request.query, config),
  })

  // Channel 8: Task (current project/task context)
  if (request.task_id || request.session_id) {
    channelPromises.push({
      channel: 'task',
      promise: taskChannel(request.user_id, request.task_id, request.session_id, config),
    })
  }

  // Channel 9: Analogical (case similarity under abstraction)
  if (queryEmbedding) {
    channelPromises.push({
      channel: 'analogical',
      promise: analogicalChannel(
        queryEmbedding,
        request.user_id,
        request.query,
        config
      ),
    })
  }

  // Execute all channels in parallel with timeout
  const timeoutMs = config.retrieval_timeout_ms
  const results = await Promise.allSettled(
    channelPromises.map(({ promise }) =>
      Promise.race([
        promise,
        new Promise<RetrievalCandidate[]>((_, reject) =>
          setTimeout(() => reject(new Error('Channel timeout')), timeoutMs)
        ),
      ])
    )
  )

  // Collect all candidates, logging any channel failures
  const allCandidates: RetrievalCandidate[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const channelName = channelPromises[i].channel
    if (result.status === 'fulfilled') {
      allCandidates.push(...result.value)
    } else {
      console.error(`HELIOS: Retrieval channel '${channelName}' failed:`, result.reason)
    }
  }

  // Deduplicate: same memory ID appearing from multiple channels
  const deduped = deduplicateCandidates(allCandidates)

  // Touch retrieved memories to update access counts
  const memoryIds = deduped.map((c) => c.memory.id).filter(Boolean)
  if (memoryIds.length > 0) {
    touchMemories(memoryIds).catch((err) =>
      console.error('HELIOS: Failed to touch memories:', err)
    )
  }

  return deduped
}

// ============================================
// INDIVIDUAL RETRIEVAL CHANNELS
// ============================================

async function vectorChannel(
  queryEmbedding: number[],
  userId: string,
  memoryClasses: MemoryClass[] | undefined,
  minConfidence: number,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  const results = await searchMemoriesVector(
    queryEmbedding,
    userId,
    memoryClasses,
    minConfidence,
    config.vector_match_threshold,
    config.max_retrieval_results_per_channel
  )

  return results.map((mem) => ({
    memory: mem as HeliosMemory,
    channel: 'vector' as RetrievalChannel,
    raw_score: mem.similarity,
    composite_score: 0, // Set by reranker
  }))
}

async function lexicalChannel(
  query: string,
  userId: string,
  memoryClasses: MemoryClass[] | undefined,
  minConfidence: number,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  const results = await searchMemoriesText(
    query,
    userId,
    memoryClasses,
    minConfidence,
    config.max_retrieval_results_per_channel
  )

  return results.map((mem) => ({
    memory: mem as HeliosMemory,
    channel: 'lexical' as RetrievalChannel,
    raw_score: mem.text_rank,
    composite_score: 0,
  }))
}

async function temporalChannel(
  userId: string,
  temporalAnchor: string | undefined,
  memoryClasses: MemoryClass[] | undefined,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  const results = await searchMemoriesTemporal(
    userId,
    temporalAnchor,
    memoryClasses,
    undefined,
    config.max_retrieval_results_per_channel
  )

  // Score by recency: more recent = higher score
  const now = Date.now()
  return results.map((mem) => {
    const age = now - new Date(mem.valid_from || mem.created_at).getTime()
    const dayAge = age / (1000 * 60 * 60 * 24)
    // Exponential decay: score drops by ~50% every 7 days
    const temporalScore = Math.exp(-0.1 * dayAge)

    return {
      memory: mem,
      channel: 'temporal' as RetrievalChannel,
      raw_score: temporalScore,
      composite_score: 0,
    }
  })
}

async function identityChannel(
  userId: string,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  // Identity memories: semantic memories about the user themselves
  const identityMemories = await getActiveMemories(
    userId,
    ['semantic'],
    config.max_retrieval_results_per_channel
  )

  // Filter to identity-relevant memories
  const identityKeywords = [
    'name', 'prefer', 'like', 'dislike', 'always', 'never', 'identity',
    'role', 'job', 'work', 'live', 'age', 'location', 'style', 'habit',
  ]

  return identityMemories
    .filter((mem) => {
      const lower = (mem.content_text + ' ' + mem.subject + ' ' + mem.predicate).toLowerCase()
      return identityKeywords.some((kw) => lower.includes(kw))
    })
    .map((mem) => ({
      memory: mem,
      channel: 'identity' as RetrievalChannel,
      raw_score: mem.importance,
      composite_score: 0,
    }))
}

async function proceduralChannel(
  userId: string,
  query: string,
  queryEmbedding: number[] | null,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  // Search procedural memories
  if (queryEmbedding) {
    const results = await searchMemoriesVector(
      queryEmbedding,
      userId,
      ['procedural'],
      0,
      config.vector_match_threshold,
      config.max_retrieval_results_per_channel
    )
    return results.map((mem) => ({
      memory: mem as HeliosMemory,
      channel: 'procedural' as RetrievalChannel,
      raw_score: mem.similarity,
      composite_score: 0,
    }))
  }

  // Fallback to text search for procedural memories
  const results = await searchMemoriesText(
    query,
    userId,
    ['procedural'],
    0,
    config.max_retrieval_results_per_channel
  )
  return results.map((mem) => ({
    memory: mem as HeliosMemory,
    channel: 'procedural' as RetrievalChannel,
    raw_score: mem.text_rank,
    composite_score: 0,
  }))
}

async function failureChannel(
  userId: string,
  query: string,
  queryEmbedding: number[] | null,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  // Search self-model memories (agent's knowledge of its own failures)
  if (queryEmbedding) {
    const results = await searchMemoriesVector(
      queryEmbedding,
      userId,
      ['self_model'],
      0,
      config.vector_match_threshold,
      Math.min(config.max_retrieval_results_per_channel, 5) // Cap failure memories
    )
    return results.map((mem) => ({
      memory: mem as HeliosMemory,
      channel: 'failure' as RetrievalChannel,
      raw_score: mem.similarity,
      composite_score: 0,
    }))
  }

  return []
}

async function graphChannel(
  userId: string,
  query: string,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  // Search for entities matching the query
  const entities = await searchEntities(userId, query, undefined, 5)
  if (entities.length === 0) return []

  // For each entity, get related memories (world_fact class)
  const candidates: RetrievalCandidate[] = []

  for (const entity of entities.slice(0, 3)) {
    // Get edges for this entity
    const edges = await getEdgesForEntity(entity.id, userId)

    // Get world_fact memories about this entity
    const entityMemories = await getActiveMemories(
      userId,
      ['world_fact', 'semantic'],
      config.max_retrieval_results_per_channel
    )

    const related = entityMemories.filter(
      (mem) =>
        mem.subject.toLowerCase().includes(entity.canonical_name.toLowerCase()) ||
        entity.canonical_name.toLowerCase().includes(mem.subject.toLowerCase())
    )

    for (const mem of related.slice(0, 5)) {
      candidates.push({
        memory: mem,
        channel: 'graph' as RetrievalChannel,
        raw_score: entity.confidence * 0.8,
        composite_score: 0,
      })
    }
  }

  return candidates
}

async function taskChannel(
  userId: string,
  taskId: string | undefined,
  sessionId: string | undefined,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  // Get working memory for current task/session
  const workingMemories = await getActiveMemories(
    userId,
    ['working'],
    config.max_retrieval_results_per_channel
  )

  return workingMemories
    .filter((mem) => {
      // Filter to memories associated with this task or session
      if (taskId && mem.scope.includes('task')) return true
      if (sessionId && mem.scope.includes('session')) return true
      return mem.memory_class === 'working' // Include all working memory
    })
    .map((mem) => ({
      memory: mem,
      channel: 'task' as RetrievalChannel,
      raw_score: mem.recency_score,
      composite_score: 0,
    }))
}

async function analogicalChannel(
  queryEmbedding: number[],
  userId: string,
  query: string,
  config: HeliosConfig
): Promise<RetrievalCandidate[]> {
  // Analogical retrieval: find episodic memories that are structurally similar
  // (similar situation, different domain). Uses slightly lower threshold.
  const results = await searchMemoriesVector(
    queryEmbedding,
    userId,
    ['episodic', 'procedural'],
    0,
    config.vector_match_threshold * 0.8, // Lower threshold for analogical reach
    Math.min(config.max_retrieval_results_per_channel, 5) // Cap analogical results
  )

  return results.map((mem) => ({
    memory: mem as HeliosMemory,
    channel: 'analogical' as RetrievalChannel,
    raw_score: mem.similarity * 0.9, // Slightly penalize analogical results
    composite_score: 0,
  }))
}

// ============================================
// DEDUPLICATION
// ============================================

/**
 * Deduplicate candidates that appear from multiple channels.
 * Keeps the entry with the highest raw score and records all source channels.
 */
function deduplicateCandidates(candidates: RetrievalCandidate[]): RetrievalCandidate[] {
  const bestByMemoryId = new Map<string, RetrievalCandidate & { channels: RetrievalChannel[] }>()

  for (const candidate of candidates) {
    const memId = candidate.memory.id
    if (!memId) continue

    const existing = bestByMemoryId.get(memId)
    if (!existing) {
      bestByMemoryId.set(memId, { ...candidate, channels: [candidate.channel] })
    } else {
      // Keep the higher raw score
      if (candidate.raw_score > existing.raw_score) {
        bestByMemoryId.set(memId, {
          ...candidate,
          channels: [...existing.channels, candidate.channel],
        })
      } else {
        existing.channels.push(candidate.channel)
      }
    }
  }

  return Array.from(bestByMemoryId.values()).map(({ channels, ...candidate }) => ({
    ...candidate,
    // Boost score for multi-channel hits (appeared in multiple search channels)
    raw_score: candidate.raw_score * (1 + 0.1 * (channels.length - 1)),
  }))
}
