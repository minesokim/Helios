// Project HELIOS - Write Engine
// FR-3: Support add, update, merge, supersede, delete, no-op, defer write actions
// FR-4: Attach provenance, timestamps, validity, confidence, sensitivity, scope
// The core decision-maker for memory persistence

import type {
  HeliosEvent,
  HeliosMemory,
  HeliosConfig,
  SalienceResult,
  WriteDecision,
  WriteAction,
  ContradictionInfo,
  MemoryClass,
} from '../types'
import { getEmbeddingProvider } from '../providers'
import {
  insertMemory,
  updateMemory,
  supersedeMemory,
  softDeleteMemory,
  countUserMemories,
  logMutation,
} from '../stores/memory-store'
import { detectContradictions, recordContradictions } from './contradiction-detector'

/**
 * Execute the full write path for a scored event.
 * This is the central write decision engine.
 *
 * Pipeline: scored event -> contradiction check -> write decision -> execute -> audit log
 */
export async function processWriteAction(
  event: HeliosEvent,
  salienceResult: SalienceResult,
  config: HeliosConfig
): Promise<{ memory: HeliosMemory | null; decision: WriteDecision }> {
  // Step 1: Check if this event passes the salience threshold
  if (salienceResult.salience_score < config.salience_threshold) {
    const decision: WriteDecision = {
      action: 'no_op',
      target_memory_id: null,
      confidence: 0.9,
      reasoning: `Salience score ${salienceResult.salience_score.toFixed(2)} below threshold ${config.salience_threshold}`,
      contradiction_detected: false,
      contradiction_details: null,
    }
    return { memory: null, decision }
  }

  // Step 2: Check user memory limit
  const memoryCount = await countUserMemories(event.user_id)
  if (memoryCount >= config.max_memories_per_user) {
    const decision: WriteDecision = {
      action: 'no_op',
      target_memory_id: null,
      confidence: 1.0,
      reasoning: `User memory limit reached (${memoryCount}/${config.max_memories_per_user})`,
      contradiction_detected: false,
      contradiction_details: null,
    }
    return { memory: null, decision }
  }

  // Step 3: Check for contradictions and duplicates
  const { contradictions, duplicateOf } = await detectContradictions(
    event.user_id,
    event.content,
    salienceResult.extracted_subject,
    salienceResult.extracted_predicate,
    salienceResult.extracted_object,
    salienceResult,
    config
  )

  // Step 4: Handle duplicate detection
  if (duplicateOf) {
    const decision: WriteDecision = {
      action: 'no_op',
      target_memory_id: duplicateOf,
      confidence: 0.9,
      reasoning: `Duplicate of existing memory ${duplicateOf}`,
      contradiction_detected: false,
      contradiction_details: null,
    }
    return { memory: null, decision }
  }

  // Step 5: Determine write action based on salience result and contradictions
  const writeAction = determineWriteAction(salienceResult, contradictions)

  // Step 6: Execute the write action
  const memory = await executeWriteAction(
    event,
    salienceResult,
    writeAction,
    contradictions,
    config
  )

  // Step 7: Record contradictions if any were detected
  if (memory && contradictions.length > 0) {
    await recordContradictions(event.user_id, memory.id, contradictions)
  }

  // Step 8: Log the mutation for audit trail
  if (config.enable_audit_logging && memory) {
    const mutationOp = writeAction.action === 'no_op' || writeAction.action === 'defer'
      ? 'add' as const
      : writeAction.action as 'add' | 'update' | 'merge' | 'supersede' | 'delete'
    await logMutation(event.user_id, mutationOp, {
      memory_id: memory.id,
      reason: writeAction.reasoning,
      details: {
        salience_score: salienceResult.salience_score,
        novelty_score: salienceResult.novelty_score,
        memory_class: salienceResult.memory_class_probabilities,
        contradictions_found: contradictions.length,
      },
      after_state: {
        subject: memory.subject,
        predicate: memory.predicate,
        content_text: memory.content_text,
        confidence: memory.confidence,
        importance: memory.importance,
      },
      triggered_by: 'write_engine',
      source_event_id: event.id,
    })
  }

  return { memory, decision: writeAction }
}

/**
 * Determine the appropriate write action based on salience analysis and contradiction state.
 */
function determineWriteAction(
  salienceResult: SalienceResult,
  contradictions: ContradictionInfo[]
): WriteDecision {
  // If the salience scorer already suggests an action, respect it as a starting point
  let action: WriteAction = salienceResult.candidate_write_action
  let targetMemoryId: string | null = null
  let contradictionDetected = false
  let contradictionDetails: ContradictionInfo | null = null

  // Override based on contradiction analysis
  if (contradictions.length > 0) {
    contradictionDetected = true
    const primaryContradiction = contradictions[0]
    contradictionDetails = primaryContradiction

    switch (primaryContradiction.suggested_resolution) {
      case 'b_wins':
        // New memory wins: supersede the old one
        action = 'supersede'
        targetMemoryId = primaryContradiction.conflicting_memory_id
        break

      case 'a_wins':
        // Existing memory wins: don't store the new one
        action = 'no_op'
        targetMemoryId = primaryContradiction.conflicting_memory_id
        break

      case 'merged':
        // Both have value: merge them
        action = 'merge'
        targetMemoryId = primaryContradiction.conflicting_memory_id
        break

      case 'both_valid_in_context':
        // Both are valid: add the new one (both coexist)
        action = 'add'
        break

      default:
        // Default to adding as a new memory
        action = 'add'
    }
  }

  // If novelty is very low and no contradiction, likely a repeat
  if (
    salienceResult.novelty_score < 0.15 &&
    !contradictionDetected &&
    action !== 'no_op'
  ) {
    action = 'no_op'
  }

  const reasoning = buildWriteReasoning(action, salienceResult, contradictionDetails)

  return {
    action,
    target_memory_id: targetMemoryId,
    confidence: contradictionDetected
      ? contradictionDetails?.suggested_resolution === 'b_wins'
        ? 0.85
        : 0.7
      : 0.8,
    reasoning,
    contradiction_detected: contradictionDetected,
    contradiction_details: contradictionDetails,
  }
}

/**
 * Execute the chosen write action against the store.
 */
async function executeWriteAction(
  event: HeliosEvent,
  salienceResult: SalienceResult,
  decision: WriteDecision,
  contradictions: ContradictionInfo[],
  config: HeliosConfig
): Promise<HeliosMemory | null> {
  // Determine the winning memory class
  const memoryClass = getTopMemoryClass(salienceResult.memory_class_probabilities)

  // Generate embedding for the memory content
  let embedding: number[] | null = null
  try {
    const embeddingProvider = getEmbeddingProvider(config)
    embedding = await embeddingProvider.embed(event.content)
  } catch (error) {
    console.error('HELIOS: Failed to generate embedding for memory:', error)
    // Continue without embedding; search will still work via text index
  }

  switch (decision.action) {
    case 'add':
      return insertMemory({
        user_id: event.user_id,
        memory_class: memoryClass,
        subject: salienceResult.extracted_subject,
        predicate: salienceResult.extracted_predicate,
        object: salienceResult.extracted_object,
        content_text: event.content,
        source_event_ids: [event.id],
        source_description: `From ${event.event_type} via ${event.source_system}`,
        observed_at: event.created_at,
        confidence: computeInitialConfidence(salienceResult),
        importance: salienceResult.salience_score,
        sensitivity: salienceResult.sensitivity_class,
        scope: ['user'],
        decay_policy: memoryClass === 'episodic' ? 'standard' : 'none',
        embedding,
      })

    case 'update':
      if (!decision.target_memory_id) {
        // No target to update; fall back to add
        return insertMemory({
          user_id: event.user_id,
          memory_class: memoryClass,
          subject: salienceResult.extracted_subject,
          predicate: salienceResult.extracted_predicate,
          object: salienceResult.extracted_object,
          content_text: event.content,
          source_event_ids: [event.id],
          source_description: `From ${event.event_type} via ${event.source_system}`,
          confidence: computeInitialConfidence(salienceResult),
          importance: salienceResult.salience_score,
          sensitivity: salienceResult.sensitivity_class,
          scope: ['user'],
          decay_policy: memoryClass === 'episodic' ? 'standard' : 'none',
          embedding,
        })
      }

      return updateMemory(decision.target_memory_id, {
        object: salienceResult.extracted_object,
        content_text: event.content,
        source_event_ids: [event.id],
        confidence: computeInitialConfidence(salienceResult),
        importance: Math.max(salienceResult.salience_score, 0.5), // Don't decrease importance on update
        recency_score: 1.0, // Reset recency on update
        embedding,
      })

    case 'supersede':
      // Create new memory and mark old one as superseded
      const newMemory = await insertMemory({
        user_id: event.user_id,
        memory_class: memoryClass,
        subject: salienceResult.extracted_subject,
        predicate: salienceResult.extracted_predicate,
        object: salienceResult.extracted_object,
        content_text: event.content,
        source_event_ids: [event.id],
        source_description: `Supersedes memory ${decision.target_memory_id}`,
        confidence: computeInitialConfidence(salienceResult),
        importance: salienceResult.salience_score,
        sensitivity: salienceResult.sensitivity_class,
        scope: ['user'],
        decay_policy: memoryClass === 'episodic' ? 'standard' : 'none',
        embedding,
      })

      if (newMemory && decision.target_memory_id) {
        await supersedeMemory(decision.target_memory_id, newMemory.id)

        // Log the supersession
        if (config.enable_audit_logging) {
          await logMutation(event.user_id, 'supersede', {
            memory_id: decision.target_memory_id,
            reason: `Superseded by ${newMemory.id}: ${decision.reasoning}`,
            details: { new_memory_id: newMemory.id },
            triggered_by: 'write_engine',
            source_event_id: event.id,
          })
        }
      }

      return newMemory

    case 'merge':
      if (!decision.target_memory_id) {
        // No target to merge with; fall back to add
        return insertMemory({
          user_id: event.user_id,
          memory_class: memoryClass,
          subject: salienceResult.extracted_subject,
          predicate: salienceResult.extracted_predicate,
          object: salienceResult.extracted_object,
          content_text: event.content,
          source_event_ids: [event.id],
          source_description: `From ${event.event_type} via ${event.source_system}`,
          confidence: computeInitialConfidence(salienceResult),
          importance: salienceResult.salience_score,
          sensitivity: salienceResult.sensitivity_class,
          scope: ['user'],
          decay_policy: memoryClass === 'episodic' ? 'standard' : 'none',
          embedding,
        })
      }

      // Merge: update the existing memory with combined information
      return updateMemory(decision.target_memory_id, {
        object: {
          ...salienceResult.extracted_object,
          _merged_from_event: event.id,
        },
        content_text: `${event.content}`,
        source_event_ids: [event.id],
        confidence: Math.min(computeInitialConfidence(salienceResult) + 0.1, 1.0), // Boost confidence on merge
        importance: Math.max(salienceResult.salience_score, 0.5),
        recency_score: 1.0,
        embedding,
      })

    case 'delete':
      if (decision.target_memory_id) {
        await softDeleteMemory(decision.target_memory_id)
        if (config.enable_audit_logging) {
          await logMutation(event.user_id, 'delete', {
            memory_id: decision.target_memory_id,
            reason: decision.reasoning,
            triggered_by: 'write_engine',
            source_event_id: event.id,
          })
        }
      }
      return null

    case 'no_op':
    case 'defer':
      return null

    default:
      return null
  }
}

/**
 * Get the most likely memory class from probabilities.
 */
function getTopMemoryClass(probabilities: Record<MemoryClass, number>): MemoryClass {
  let topClass: MemoryClass = 'episodic'
  let topProb = 0

  for (const [cls, prob] of Object.entries(probabilities)) {
    if (prob > topProb) {
      topProb = prob
      topClass = cls as MemoryClass
    }
  }

  return topClass
}

/**
 * Compute initial confidence for a new memory based on salience analysis.
 */
function computeInitialConfidence(salienceResult: SalienceResult): number {
  // Base confidence from salience and novelty
  const base = (salienceResult.salience_score * 0.6 + salienceResult.novelty_score * 0.4)

  // Adjust based on source: direct user statements get higher confidence
  const sourceBoost = salienceResult.candidate_write_action === 'add' ? 0.1 : 0

  return Math.min(Math.max(base + sourceBoost, 0.1), 0.95) // Cap between 0.1 and 0.95
}

/**
 * Build a human-readable reasoning string for the write decision.
 */
function buildWriteReasoning(
  action: WriteAction,
  salienceResult: SalienceResult,
  contradiction: ContradictionInfo | null
): string {
  const parts: string[] = []

  parts.push(`Salience: ${salienceResult.salience_score.toFixed(2)}`)
  parts.push(`Novelty: ${salienceResult.novelty_score.toFixed(2)}`)

  if (contradiction) {
    parts.push(`Contradiction (${contradiction.type}): ${contradiction.description}`)
    parts.push(`Resolution: ${contradiction.suggested_resolution}`)
  }

  parts.push(`Action: ${action}`)

  if (salienceResult.reasoning) {
    parts.push(salienceResult.reasoning)
  }

  return parts.join('. ')
}

/**
 * Process a batch of scored events through the write engine.
 */
export async function processWriteBatch(
  events: HeliosEvent[],
  salienceResults: Map<string, SalienceResult>,
  config: HeliosConfig
): Promise<Array<{ event: HeliosEvent; memory: HeliosMemory | null; decision: WriteDecision }>> {
  const results: Array<{
    event: HeliosEvent
    memory: HeliosMemory | null
    decision: WriteDecision
  }> = []

  for (const event of events) {
    const salienceResult = salienceResults.get(event.id)
    if (!salienceResult) continue

    const { memory, decision } = await processWriteAction(event, salienceResult, config)
    results.push({ event, memory, decision })
  }

  return results
}
