// Project HELIOS - Memory Operating System
// Main orchestrator API: the single entry point for all memory operations

import type {
  HeliosConfig,
  HeliosEvent,
  HeliosMemory,
  HeliosPinnedBlock,
  HeliosEntity,
  MemoryBundle,
  MemoryHealth,
  CompilerResult,
  WriteDecision,
  SalienceResult,
  RetrievalRequest,
  BundleTurnType,
  MemoryClass,
  MemoryStatus,
  BlockType,
} from './types'
import { DEFAULT_CONFIG } from './types'
import { ingestEvent, ingestConversationTurn, ingestExternalData } from './services/event-ingester'
import { scoreEvent, scoreEventBatch } from './services/salience-scorer'
import { processWriteAction, processWriteBatch } from './services/write-engine'
import { assembleBundle } from './services/bundle-assembler'
import { runFullCompile } from './services/memory-compiler'
import {
  getUnprocessedEvents,
  markEventsProcessed,
  getActiveMemories,
  getMemoryById,
  updateMemory,
  softDeleteMemory,
  getPinnedBlocks,
  upsertPinnedBlock,
  deactivatePinnedBlock,
  getUserMemoriesPaginated,
  exportUserMemories,
  getMemoryHealth,
  getMutationHistory,
  logMutation,
  insertEntity,
  searchEntities,
  insertEdge,
  countUserMemories,
} from './stores/memory-store'
import { OllamaProvider } from './providers/ollama'

/**
 * HELIOS Memory Operating System
 *
 * Primary API for all memory operations. Initialize once per application
 * lifecycle with optional config overrides.
 */
export class Helios {
  private config: HeliosConfig

  constructor(config?: Partial<HeliosConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ============================================
  // WRITE PATH: Ingest -> Score -> Write
  // ============================================

  /**
   * Process a user message through the full memory pipeline.
   * This is the primary write entry point for chat interactions.
   *
   * Pipeline: ingest -> score salience -> contradiction check -> write decision -> commit
   */
  async processMessage(
    userId: string,
    message: string,
    options?: {
      conversationId?: string
      sessionId?: string
      sourceSystem?: string
      recentContext?: string
    }
  ): Promise<{
    event: HeliosEvent | null
    memory: HeliosMemory | null
    decision: WriteDecision | null
    salience: SalienceResult | null
  }> {
    // Step 1: Ingest the event
    const event = await ingestEvent(
      {
        user_id: userId,
        event_type: 'user_message',
        content: message,
        conversation_id: options?.conversationId,
        session_id: options?.sessionId,
        source_system: options?.sourceSystem || 'chat',
      },
      this.config
    )

    if (!event) {
      return { event: null, memory: null, decision: null, salience: null }
    }

    // Step 2: Score salience
    const salience = await scoreEvent(event, this.config, options?.recentContext)

    // Step 3: Process write action (includes contradiction detection)
    const { memory, decision } = await processWriteAction(event, salience, this.config)

    // Step 4: Mark event as processed
    await markEventsProcessed([event.id])

    return { event, memory, decision, salience }
  }

  /**
   * Process a conversation turn (user message + assistant response).
   */
  async processConversationTurn(
    userId: string,
    userMessage: string,
    assistantResponse: string,
    options?: {
      conversationId?: string
      sessionId?: string
      recentContext?: string
    }
  ): Promise<{
    userResult: { memory: HeliosMemory | null; decision: WriteDecision | null }
    assistantResult: { memory: HeliosMemory | null; decision: WriteDecision | null }
  }> {
    // Process user message
    const userResult = await this.processMessage(userId, userMessage, options)

    // Process assistant response (generally lower salience)
    const assistantEvent = await ingestEvent(
      {
        user_id: userId,
        event_type: 'assistant_message',
        content: assistantResponse,
        conversation_id: options?.conversationId,
        session_id: options?.sessionId,
        source_system: 'chat',
      },
      this.config
    )

    let assistantMemory: HeliosMemory | null = null
    let assistantDecision: WriteDecision | null = null

    if (assistantEvent) {
      const salience = await scoreEvent(assistantEvent, this.config, options?.recentContext)
      const result = await processWriteAction(assistantEvent, salience, this.config)
      assistantMemory = result.memory
      assistantDecision = result.decision
      await markEventsProcessed([assistantEvent.id])
    }

    return {
      userResult: { memory: userResult.memory, decision: userResult.decision },
      assistantResult: { memory: assistantMemory, decision: assistantDecision },
    }
  }

  /**
   * Ingest external data (banking, calendar, email, etc.) into memory.
   */
  async ingestExternalData(
    userId: string,
    sourceSystem: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<{ memory: HeliosMemory | null; decision: WriteDecision | null }> {
    const event = await ingestExternalData(userId, sourceSystem, content, metadata, this.config)
    if (!event) return { memory: null, decision: null }

    const salience = await scoreEvent(event, this.config)
    const { memory, decision } = await processWriteAction(event, salience, this.config)
    await markEventsProcessed([event.id])

    return { memory, decision }
  }

  /**
   * Process all unprocessed events for a user.
   * Useful for batch processing after a period of event accumulation.
   */
  async processBacklog(userId: string, limit = 50): Promise<{
    processed: number
    memoriesCreated: number
  }> {
    const events = await getUnprocessedEvents(userId, limit)
    if (events.length === 0) return { processed: 0, memoriesCreated: 0 }

    const salienceResults = await scoreEventBatch(events, this.config)
    const writeResults = await processWriteBatch(events, salienceResults, this.config)

    const eventIds = events.map((e) => e.id)
    await markEventsProcessed(eventIds)

    const memoriesCreated = writeResults.filter((r) => r.memory !== null).length

    return { processed: events.length, memoriesCreated }
  }

  // ============================================
  // READ PATH: Retrieve -> Rerank -> Bundle
  // ============================================

  /**
   * Get a memory bundle for a given query and turn type.
   * This is the primary read entry point.
   * Returns assembled text ready for injection into the LLM prompt.
   */
  async getMemoryBundle(
    userId: string,
    query: string,
    turnType: BundleTurnType = 'answering',
    options?: {
      sessionId?: string
      taskId?: string
      memoryClasses?: MemoryClass[]
      maxResults?: number
      minConfidence?: number
      temporalAnchor?: string
    }
  ): Promise<MemoryBundle> {
    const request: RetrievalRequest = {
      user_id: userId,
      query,
      turn_type: turnType,
      session_id: options?.sessionId,
      task_id: options?.taskId,
      memory_classes: options?.memoryClasses,
      max_results: options?.maxResults,
      min_confidence: options?.minConfidence,
      temporal_anchor: options?.temporalAnchor,
    }

    return assembleBundle(request, this.config)
  }

  /**
   * Get just the assembled memory text for direct prompt injection.
   * Convenience wrapper around getMemoryBundle.
   */
  async getMemoryContext(
    userId: string,
    query: string,
    turnType: BundleTurnType = 'answering'
  ): Promise<string> {
    const bundle = await this.getMemoryBundle(userId, query, turnType)
    return bundle.assembled_text
  }

  // ============================================
  // MEMORY MANAGEMENT
  // ============================================

  /**
   * Get a specific memory by ID.
   */
  async getMemory(memoryId: string): Promise<HeliosMemory | null> {
    return getMemoryById(memoryId)
  }

  /**
   * Browse user memories with pagination and filtering.
   */
  async browseMemories(
    userId: string,
    options?: {
      page?: number
      pageSize?: number
      memoryClass?: MemoryClass
      status?: MemoryStatus
    }
  ): Promise<{ memories: HeliosMemory[]; total: number }> {
    return getUserMemoriesPaginated(
      userId,
      options?.page || 1,
      options?.pageSize || 50,
      options?.memoryClass,
      options?.status
    )
  }

  /**
   * Delete a memory (soft delete with audit trail).
   */
  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    const memory = await getMemoryById(memoryId)
    if (!memory || memory.user_id !== userId) return false

    const success = await softDeleteMemory(memoryId)
    if (success) {
      await logMutation(userId, 'delete', {
        memory_id: memoryId,
        reason: 'User-initiated deletion',
        before_state: {
          subject: memory.subject,
          content_text: memory.content_text,
        },
        triggered_by: 'user',
      })
    }
    return success
  }

  /**
   * Update a memory's confidence or importance.
   */
  async adjustMemory(
    userId: string,
    memoryId: string,
    adjustments: { confidence?: number; importance?: number }
  ): Promise<HeliosMemory | null> {
    const memory = await getMemoryById(memoryId)
    if (!memory || memory.user_id !== userId) return null

    const updated = await updateMemory(memoryId, adjustments)
    if (updated) {
      await logMutation(userId, 'update', {
        memory_id: memoryId,
        reason: 'User adjustment',
        before_state: { confidence: memory.confidence, importance: memory.importance },
        after_state: adjustments,
        triggered_by: 'user',
      })
    }
    return updated
  }

  /**
   * Export all user memory data.
   */
  async exportAllMemories(userId: string): Promise<{
    memories: HeliosMemory[]
    entities: HeliosEntity[]
    pinned_blocks: HeliosPinnedBlock[]
  }> {
    const data = await exportUserMemories(userId)
    return {
      memories: data.memories,
      entities: data.entities,
      pinned_blocks: data.pinned_blocks,
    }
  }

  /**
   * Get mutation/audit history for a memory or for the user.
   */
  async getMutationHistory(userId: string, memoryId?: string, limit = 50) {
    return getMutationHistory(userId, memoryId, limit)
  }

  // ============================================
  // PINNED BLOCKS
  // ============================================

  /**
   * Get all active pinned blocks for a user.
   */
  async getPinnedBlocks(userId: string): Promise<HeliosPinnedBlock[]> {
    return getPinnedBlocks(userId)
  }

  /**
   * Set or update a pinned block.
   */
  async setPinnedBlock(
    userId: string,
    blockType: BlockType,
    label: string,
    content: string,
    priority?: number
  ): Promise<HeliosPinnedBlock | null> {
    const block = await upsertPinnedBlock({
      user_id: userId,
      block_type: blockType,
      label,
      content,
      priority,
    })

    if (block) {
      await logMutation(userId, 'pin', {
        reason: `Pinned block: ${label}`,
        details: { block_type: blockType, label },
        triggered_by: 'user',
      })
    }

    return block
  }

  /**
   * Remove a pinned block.
   */
  async removePinnedBlock(userId: string, blockId: string): Promise<boolean> {
    const success = await deactivatePinnedBlock(blockId)
    if (success) {
      await logMutation(userId, 'unpin', {
        reason: 'Pinned block removed',
        details: { block_id: blockId },
        triggered_by: 'user',
      })
    }
    return success
  }

  // ============================================
  // ENTITIES AND GRAPH
  // ============================================

  /**
   * Create or get an entity in the world graph.
   */
  async upsertEntity(
    userId: string,
    entityType: string,
    name: string,
    description?: string,
    properties?: Record<string, unknown>
  ): Promise<HeliosEntity | null> {
    return insertEntity({
      user_id: userId,
      entity_type: entityType as HeliosEntity['entity_type'],
      canonical_name: name,
      description,
      properties,
    })
  }

  /**
   * Search entities by name or description.
   */
  async searchEntities(
    userId: string,
    query: string,
    entityTypes?: string[]
  ): Promise<HeliosEntity[]> {
    return searchEntities(userId, query, entityTypes)
  }

  /**
   * Create an edge between two entities.
   */
  async createEdge(
    userId: string,
    sourceEntityId: string,
    targetEntityId: string,
    relationType: string,
    confidence?: number
  ) {
    return insertEdge({
      user_id: userId,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      relation_type: relationType,
      confidence,
    })
  }

  // ============================================
  // COMPILER AND MAINTENANCE
  // ============================================

  /**
   * Run the memory compiler (consolidation, procedure extraction, decay, contradiction resolution).
   */
  async runCompiler(userId: string): Promise<CompilerResult> {
    return runFullCompile(userId, this.config)
  }

  /**
   * Get memory health diagnostics for a user.
   */
  async getHealthReport(userId: string): Promise<MemoryHealth | null> {
    return getMemoryHealth(userId)
  }

  /**
   * Get total memory count for a user.
   */
  async getMemoryCount(userId: string): Promise<number> {
    return countUserMemories(userId)
  }

  // ============================================
  // SYSTEM
  // ============================================

  /**
   * Check if the Ollama provider is healthy and models are available.
   */
  async checkLLMHealth(): Promise<{
    healthy: boolean
    reasoning_model_available: boolean
    embedding_model_available: boolean
    error?: string
  }> {
    if (this.config.llm_provider !== 'ollama') {
      return { healthy: true, reasoning_model_available: true, embedding_model_available: true }
    }

    const provider = new OllamaProvider(this.config)
    return provider.healthCheck()
  }

  /**
   * Get current configuration.
   */
  getConfig(): HeliosConfig {
    return { ...this.config }
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(updates: Partial<HeliosConfig>): void {
    this.config = { ...this.config, ...updates }
  }
}

// ============================================
// SINGLETON AND EXPORTS
// ============================================

let instance: Helios | null = null

/**
 * Get the global HELIOS instance.
 * Creates one with default config if not already initialized.
 */
export function getHelios(config?: Partial<HeliosConfig>): Helios {
  if (!instance || config) {
    instance = new Helios(config)
  }
  return instance
}

// Re-export types
export type {
  HeliosConfig,
  HeliosEvent,
  HeliosMemory,
  HeliosEntity,
  HeliosEdge,
  HeliosPinnedBlock,
  HeliosContradiction,
  HeliosMutation,
  MemoryBundle,
  MemoryHealth,
  CompilerResult,
  WriteDecision,
  SalienceResult,
  RetrievalRequest,
  RetrievalCandidate,
  BundleTurnType,
  MemoryClass,
  MemoryStatus,
  SensitivityLevel,
  BlockType,
  LLMProvider,
} from './types'

export { DEFAULT_CONFIG } from './types'
