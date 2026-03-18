// Project HELIOS - Memory Store
// Supabase-backed CRUD operations for all HELIOS tables

import { createClient } from '@/lib/supabase/server'
import type {
  HeliosMemory,
  HeliosMemoryInsert,
  HeliosMemoryUpdate,
  HeliosEntity,
  HeliosEntityInsert,
  HeliosEdge,
  HeliosEdgeInsert,
  HeliosContradiction,
  HeliosEvent,
  HeliosEventInsert,
  HeliosPinnedBlock,
  HeliosPinnedBlockInsert,
  HeliosMutation,
  HeliosCompilerState,
  MemoryClass,
  MemoryStatus,
  MutationOperation,
  MutationTrigger,
  CompilerJobType,
  ContradictionType,
  ContradictionResolution,
  MemoryHealth,
} from '../types'

// ============================================
// EVENTS
// ============================================

export async function insertEvent(event: HeliosEventInsert & { content_hash: string; salience_score?: number; novelty_score?: number }): Promise<HeliosEvent | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_events')
    .insert(event)
    .select()
    .single()

  if (error) {
    console.error('HELIOS: Failed to insert event:', error.message)
    return null
  }
  return data as HeliosEvent
}

export async function getUnprocessedEvents(userId: string, limit = 50): Promise<HeliosEvent[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_events')
    .select('*')
    .eq('user_id', userId)
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('HELIOS: Failed to get unprocessed events:', error.message)
    return []
  }
  return (data || []) as HeliosEvent[]
}

export async function markEventsProcessed(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('helios_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .in('id', eventIds)
}

export async function checkEventDuplicate(contentHash: string, userId: string): Promise<boolean> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('helios_events')
    .select('id')
    .eq('user_id', userId)
    .eq('content_hash', contentHash)
    .limit(1)

  return (data?.length || 0) > 0
}

// ============================================
// MEMORIES
// ============================================

export async function insertMemory(memory: HeliosMemoryInsert): Promise<HeliosMemory | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_memories')
    .insert({
      ...memory,
      embedding: memory.embedding ? JSON.stringify(memory.embedding) : null,
    })
    .select()
    .single()

  if (error) {
    console.error('HELIOS: Failed to insert memory:', error.message)
    return null
  }
  return data as HeliosMemory
}

export async function updateMemory(
  memoryId: string,
  updates: HeliosMemoryUpdate
): Promise<HeliosMemory | null> {
  const supabase = await createClient()

  const updatePayload: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  }
  if (updates.embedding) {
    updatePayload.embedding = JSON.stringify(updates.embedding)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_memories')
    .update(updatePayload)
    .eq('id', memoryId)
    .select()
    .single()

  if (error) {
    console.error('HELIOS: Failed to update memory:', error.message)
    return null
  }
  return data as HeliosMemory
}

export async function getMemoryById(memoryId: string): Promise<HeliosMemory | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_memories')
    .select('*')
    .eq('id', memoryId)
    .is('deleted_at', null)
    .single()

  if (error) return null
  return data as HeliosMemory
}

export async function getMemoriesBySubject(
  userId: string,
  subject: string,
  memoryClasses?: MemoryClass[],
  limit = 20
): Promise<HeliosMemory[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('helios_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .ilike('subject', `%${subject}%`)
    .order('importance', { ascending: false })
    .limit(limit)

  if (memoryClasses && memoryClasses.length > 0) {
    query = query.in('memory_class', memoryClasses)
  }

  const { data, error } = await query
  if (error) {
    console.error('HELIOS: Failed to get memories by subject:', error.message)
    return []
  }
  return (data || []) as HeliosMemory[]
}

export async function getActiveMemories(
  userId: string,
  memoryClasses?: MemoryClass[],
  limit = 100
): Promise<HeliosMemory[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('helios_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('importance', { ascending: false })
    .order('recency_score', { ascending: false })
    .limit(limit)

  if (memoryClasses && memoryClasses.length > 0) {
    query = query.in('memory_class', memoryClasses)
  }

  const { data, error } = await query
  if (error) {
    console.error('HELIOS: Failed to get active memories:', error.message)
    return []
  }
  return (data || []) as HeliosMemory[]
}

export async function softDeleteMemory(memoryId: string): Promise<boolean> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('helios_memories')
    .update({
      deleted_at: new Date().toISOString(),
      status: 'deleted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoryId)

  if (error) {
    console.error('HELIOS: Failed to soft delete memory:', error.message)
    return false
  }
  return true
}

export async function supersedeMemory(
  oldMemoryId: string,
  newMemoryId: string
): Promise<boolean> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('helios_memories')
    .update({
      status: 'superseded',
      superseded_by: newMemoryId,
      valid_to: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', oldMemoryId)

  if (error) {
    console.error('HELIOS: Failed to supersede memory:', error.message)
    return false
  }
  return true
}

export async function countUserMemories(userId: string): Promise<number> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('helios_memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (error) return 0
  return count || 0
}

// ============================================
// VECTOR SEARCH
// ============================================

export async function searchMemoriesVector(
  queryEmbedding: number[],
  userId: string,
  memoryClasses?: MemoryClass[],
  minConfidence = 0.0,
  matchThreshold = 0.65,
  limit = 20
): Promise<Array<HeliosMemory & { similarity: number }>> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('helios_search_memories_vector', {
    query_embedding: JSON.stringify(queryEmbedding),
    p_user_id: userId,
    p_memory_classes: memoryClasses || null,
    p_min_confidence: minConfidence,
    p_match_threshold: matchThreshold,
    p_limit: limit,
  })

  if (error) {
    console.error('HELIOS: Vector search failed:', error.message)
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.memory_id,
    memory_class: row.memory_class,
    subject: row.subject,
    predicate: row.predicate,
    object: row.object,
    content_text: row.content_text,
    confidence: row.confidence,
    importance: row.importance,
    recency_score: row.recency_score,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    status: row.status,
    similarity: row.similarity,
  })) as Array<HeliosMemory & { similarity: number }>
}

export async function searchMemoriesText(
  query: string,
  userId: string,
  memoryClasses?: MemoryClass[],
  minConfidence = 0.0,
  limit = 20
): Promise<Array<HeliosMemory & { text_rank: number }>> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('helios_search_memories_text', {
    p_query: query,
    p_user_id: userId,
    p_memory_classes: memoryClasses || null,
    p_min_confidence: minConfidence,
    p_limit: limit,
  })

  if (error) {
    console.error('HELIOS: Text search failed:', error.message)
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.memory_id,
    memory_class: row.memory_class,
    subject: row.subject,
    predicate: row.predicate,
    object: row.object,
    content_text: row.content_text,
    confidence: row.confidence,
    importance: row.importance,
    recency_score: row.recency_score,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    status: row.status,
    text_rank: row.text_rank,
  })) as Array<HeliosMemory & { text_rank: number }>
}

export async function searchMemoriesTemporal(
  userId: string,
  pointInTime?: string,
  memoryClasses?: MemoryClass[],
  subject?: string,
  limit = 50
): Promise<HeliosMemory[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('helios_search_memories_temporal', {
    p_user_id: userId,
    p_point_in_time: pointInTime || new Date().toISOString(),
    p_memory_classes: memoryClasses || null,
    p_subject: subject || null,
    p_limit: limit,
  })

  if (error) {
    console.error('HELIOS: Temporal search failed:', error.message)
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.memory_id,
    memory_class: row.memory_class,
    subject: row.subject,
    predicate: row.predicate,
    object: row.object,
    content_text: row.content_text,
    confidence: row.confidence,
    importance: row.importance,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
  })) as HeliosMemory[]
}

export async function touchMemories(memoryIds: string[]): Promise<void> {
  if (memoryIds.length === 0) return
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)('helios_touch_memories', {
    p_memory_ids: memoryIds,
  })
}

// ============================================
// ENTITIES
// ============================================

export async function insertEntity(entity: HeliosEntityInsert): Promise<HeliosEntity | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_entities')
    .insert({
      ...entity,
      embedding: entity.embedding ? JSON.stringify(entity.embedding) : null,
    })
    .select()
    .single()

  if (error) {
    // Handle unique constraint - return existing entity
    if (error.code === '23505') {
      return getEntityByName(entity.user_id, entity.entity_type, entity.canonical_name)
    }
    console.error('HELIOS: Failed to insert entity:', error.message)
    return null
  }
  return data as HeliosEntity
}

export async function getEntityByName(
  userId: string,
  entityType: string,
  canonicalName: string
): Promise<HeliosEntity | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_entities')
    .select('*')
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('canonical_name', canonicalName)
    .eq('status', 'active')
    .is('deleted_at', null)
    .single()

  if (error) return null
  return data as HeliosEntity
}

export async function searchEntities(
  userId: string,
  query: string,
  entityTypes?: string[],
  limit = 20
): Promise<HeliosEntity[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('helios_entities')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .or(`canonical_name.ilike.%${query}%,description.ilike.%${query}%`)
    .order('confidence', { ascending: false })
    .limit(limit)

  if (entityTypes && entityTypes.length > 0) {
    q = q.in('entity_type', entityTypes)
  }

  const { data, error } = await q
  if (error) {
    console.error('HELIOS: Entity search failed:', error.message)
    return []
  }
  return (data || []) as HeliosEntity[]
}

export async function updateEntity(
  entityId: string,
  updates: Partial<Omit<HeliosEntity, 'id' | 'user_id' | 'created_at'>>
): Promise<HeliosEntity | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_entities')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', entityId)
    .select()
    .single()

  if (error) {
    console.error('HELIOS: Failed to update entity:', error.message)
    return null
  }
  return data as HeliosEntity
}

// ============================================
// EDGES (RELATIONSHIPS)
// ============================================

export async function insertEdge(edge: HeliosEdgeInsert): Promise<HeliosEdge | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_edges')
    .insert(edge)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return null // Duplicate edge
    console.error('HELIOS: Failed to insert edge:', error.message)
    return null
  }
  return data as HeliosEdge
}

export async function getEntityNeighborhood(
  entityId: string,
  userId: string,
  maxDepth = 2,
  limit = 50
): Promise<Array<{
  entity_id: string
  entity_type: string
  canonical_name: string
  description: string | null
  relation_type: string
  relation_direction: string
  related_entity_id: string
  related_entity_name: string
  edge_confidence: number
  edge_valid_from: string
  edge_valid_to: string | null
  depth: number
}>> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('helios_get_entity_neighborhood', {
    p_entity_id: entityId,
    p_user_id: userId,
    p_max_depth: maxDepth,
    p_limit: limit,
  })

  if (error) {
    console.error('HELIOS: Graph traversal failed:', error.message)
    return []
  }
  return data || []
}

export async function getEdgesForEntity(
  entityId: string,
  userId: string
): Promise<HeliosEdge[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_edges')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)
    .order('confidence', { ascending: false })

  if (error) {
    console.error('HELIOS: Failed to get edges:', error.message)
    return []
  }
  return (data || []) as HeliosEdge[]
}

// ============================================
// CONTRADICTIONS
// ============================================

export async function insertContradiction(
  userId: string,
  memoryAId: string,
  memoryBId: string,
  contradictionType: ContradictionType,
  description: string | null,
  confidence: number
): Promise<HeliosContradiction | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_contradictions')
    .insert({
      user_id: userId,
      memory_a_id: memoryAId,
      memory_b_id: memoryBId,
      contradiction_type: contradictionType,
      description,
      confidence,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return null // Already exists
    console.error('HELIOS: Failed to insert contradiction:', error.message)
    return null
  }
  return data as HeliosContradiction
}

export async function getUnresolvedContradictions(
  userId: string,
  limit = 50
): Promise<HeliosContradiction[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_contradictions')
    .select('*')
    .eq('user_id', userId)
    .eq('resolution', 'unresolved')
    .order('confidence', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('HELIOS: Failed to get contradictions:', error.message)
    return []
  }
  return (data || []) as HeliosContradiction[]
}

export async function resolveContradiction(
  contradictionId: string,
  resolution: ContradictionResolution
): Promise<boolean> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('helios_contradictions')
    .update({
      resolution,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', contradictionId)

  if (error) {
    console.error('HELIOS: Failed to resolve contradiction:', error.message)
    return false
  }
  return true
}

export async function getContradictionsForMemory(memoryId: string): Promise<HeliosContradiction[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_contradictions')
    .select('*')
    .or(`memory_a_id.eq.${memoryId},memory_b_id.eq.${memoryId}`)
    .eq('resolution', 'unresolved')

  if (error) return []
  return (data || []) as HeliosContradiction[]
}

// ============================================
// PINNED BLOCKS
// ============================================

export async function getPinnedBlocks(userId: string): Promise<HeliosPinnedBlock[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_pinned_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('priority', { ascending: false })

  if (error) {
    console.error('HELIOS: Failed to get pinned blocks:', error.message)
    return []
  }
  return (data || []) as HeliosPinnedBlock[]
}

export async function upsertPinnedBlock(block: HeliosPinnedBlockInsert): Promise<HeliosPinnedBlock | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_pinned_blocks')
    .upsert(
      {
        ...block,
        updated_at: new Date().toISOString(),
        last_refreshed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,block_type' }
    )
    .select()
    .single()

  if (error) {
    console.error('HELIOS: Failed to upsert pinned block:', error.message)
    return null
  }
  return data as HeliosPinnedBlock
}

export async function deactivatePinnedBlock(blockId: string): Promise<boolean> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('helios_pinned_blocks')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', blockId)

  if (error) {
    console.error('HELIOS: Failed to deactivate pinned block:', error.message)
    return false
  }
  return true
}

// ============================================
// MUTATIONS LOG
// ============================================

export async function logMutation(
  userId: string,
  operation: MutationOperation,
  options: {
    memory_id?: string
    entity_id?: string
    edge_id?: string
    reason?: string
    details?: Record<string, unknown>
    before_state?: Record<string, unknown>
    after_state?: Record<string, unknown>
    triggered_by?: MutationTrigger
    source_event_id?: string
  }
): Promise<HeliosMutation | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_mutations')
    .insert({
      user_id: userId,
      operation,
      memory_id: options.memory_id || null,
      entity_id: options.entity_id || null,
      edge_id: options.edge_id || null,
      reason: options.reason || null,
      details: options.details || {},
      before_state: options.before_state || null,
      after_state: options.after_state || null,
      triggered_by: options.triggered_by || 'system',
      source_event_id: options.source_event_id || null,
    })
    .select()
    .single()

  if (error) {
    console.error('HELIOS: Failed to log mutation:', error.message)
    return null
  }
  return data as HeliosMutation
}

export async function getMutationHistory(
  userId: string,
  memoryId?: string,
  limit = 50
): Promise<HeliosMutation[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('helios_mutations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (memoryId) {
    query = query.eq('memory_id', memoryId)
  }

  const { data, error } = await query
  if (error) {
    console.error('HELIOS: Failed to get mutation history:', error.message)
    return []
  }
  return (data || []) as HeliosMutation[]
}

// ============================================
// COMPILER STATE
// ============================================

export async function createCompilerJob(
  userId: string,
  jobType: CompilerJobType,
  itemsTotal: number
): Promise<HeliosCompilerState | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('helios_compiler_state')
    .insert({
      user_id: userId,
      job_type: jobType,
      items_total: itemsTotal,
      started_at: new Date().toISOString(),
      status: 'running',
    })
    .select()
    .single()

  if (error) {
    console.error('HELIOS: Failed to create compiler job:', error.message)
    return null
  }
  return data as HeliosCompilerState
}

export async function updateCompilerJob(
  jobId: string,
  updates: Partial<HeliosCompilerState>
): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('helios_compiler_state')
    .update(updates)
    .eq('id', jobId)
}

// ============================================
// HEALTH / DIAGNOSTICS
// ============================================

export async function getMemoryHealth(userId: string): Promise<MemoryHealth | null> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('helios_memory_health', {
    p_user_id: userId,
  })

  if (error) {
    console.error('HELIOS: Failed to get memory health:', error.message)
    return null
  }
  return data as MemoryHealth
}

export async function decayRecencyScores(
  userId: string,
  decayFactor = 0.995,
  minRecency = 0.01
): Promise<number> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('helios_decay_recency_scores', {
    p_user_id: userId,
    p_decay_factor: decayFactor,
    p_min_recency: minRecency,
  })

  if (error) {
    console.error('HELIOS: Decay failed:', error.message)
    return 0
  }
  return data as number
}

// ============================================
// BULK OPERATIONS
// ============================================

export async function getUserMemoriesPaginated(
  userId: string,
  page = 1,
  pageSize = 50,
  memoryClass?: MemoryClass,
  status?: MemoryStatus
): Promise<{ memories: HeliosMemory[]; total: number }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('helios_memories')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (memoryClass) query = query.eq('memory_class', memoryClass)
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) {
    console.error('HELIOS: Failed to get paginated memories:', error.message)
    return { memories: [], total: 0 }
  }
  return { memories: (data || []) as HeliosMemory[], total: count || 0 }
}

export async function exportUserMemories(userId: string): Promise<{
  memories: HeliosMemory[]
  entities: HeliosEntity[]
  edges: HeliosEdge[]
  pinned_blocks: HeliosPinnedBlock[]
  contradictions: HeliosContradiction[]
}> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [memoriesRes, entitiesRes, edgesRes, blocksRes, contradictionsRes] = await Promise.all([
    sb.from('helios_memories').select('*').eq('user_id', userId).is('deleted_at', null),
    sb.from('helios_entities').select('*').eq('user_id', userId).is('deleted_at', null),
    sb.from('helios_edges').select('*').eq('user_id', userId).eq('status', 'active'),
    sb.from('helios_pinned_blocks').select('*').eq('user_id', userId),
    sb.from('helios_contradictions').select('*').eq('user_id', userId),
  ])

  return {
    memories: (memoriesRes.data || []) as HeliosMemory[],
    entities: (entitiesRes.data || []) as HeliosEntity[],
    edges: (edgesRes.data || []) as HeliosEdge[],
    pinned_blocks: (blocksRes.data || []) as HeliosPinnedBlock[],
    contradictions: (contradictionsRes.data || []) as HeliosContradiction[],
  }
}
