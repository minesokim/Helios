// Project HELIOS - Memory Compiler
// FR-9: Consolidate episodes into semantic summaries and procedural rules
// Background process that turns raw experiences into abstractions and habits

import type {
  HeliosMemory,
  HeliosConfig,
  CompilerResult,
  CompilerJobType,
  MemoryHealth,
  LLMProvider,
} from '../types'
import { getReasoningProvider, getEmbeddingProvider } from '../providers'
import {
  getActiveMemories,
  insertMemory,
  updateMemory,
  supersedeMemory,
  softDeleteMemory,
  decayRecencyScores,
  getUnresolvedContradictions,
  resolveContradiction,
  getMemoryById,
  getMemoryHealth,
  createCompilerJob,
  updateCompilerJob,
  logMutation,
} from '../stores/memory-store'

const CONSOLIDATION_SYSTEM_PROMPT = `You are HELIOS Memory Compiler. Your job is to analyze a batch of episodic memories and produce consolidated summaries.

For each group of related episodes, produce:
1. A SUMMARY: A concise semantic memory that captures the essential information
2. CONFIDENCE: How confident you are in this summary (0.0-1.0)
3. IMPORTANCE: How important this consolidated knowledge is (0.0-1.0)
4. SUBJECT: The entity or topic this is about
5. PREDICATE: The claim or relationship type

Rules:
- Preserve temporal ordering when it matters
- Note contradictions or changes over time
- Prefer specific facts over vague impressions
- Include attribution ("as of [date]") for time-sensitive facts
- Do not invent information not present in the episodes

Respond with ONLY a JSON array of consolidated memories.`

const PROCEDURE_EXTRACTION_PROMPT = `You are HELIOS Memory Compiler. Analyze these episodic memories for recurring patterns and extract procedural rules.

A procedural rule captures "when X happens, do Y" or "the user prefers Z approach for W type of tasks."

For each pattern you detect, produce:
1. RULE: A clear, actionable procedural statement
2. CONFIDENCE: How well-supported this pattern is (0.0-1.0)
3. IMPORTANCE: How broadly applicable this pattern is (0.0-1.0)
4. TRIGGER: What conditions activate this procedure
5. EVIDENCE_COUNT: How many episodes support this pattern

Rules:
- Only extract patterns supported by at least 2 episodes
- Be specific about conditions and actions
- Note any exceptions or limitations
- Distinguish user preferences from agent-learned behaviors

Respond with ONLY a JSON array of procedure objects.`

const CONTRADICTION_RESOLUTION_PROMPT = `You are HELIOS Memory Compiler. Two memories contradict each other. Determine the correct resolution.

Consider:
1. Which memory is more recent?
2. Which has higher confidence?
3. Is this a temporal change (both were true at different times)?
4. Could both be true in different contexts?

Respond with ONLY a JSON object containing:
- resolution: "a_wins" | "b_wins" | "merged" | "both_valid_in_context"
- reasoning: brief explanation
- merged_content: (only if resolution is "merged") the combined memory text`

interface ConsolidatedMemory {
  summary: string
  confidence: number
  importance: number
  subject: string
  predicate: string
}

interface ExtractedProcedure {
  rule: string
  confidence: number
  importance: number
  trigger: string
  evidence_count: number
}

/**
 * Run a full compile cycle for a user.
 * Executes all compiler stages: consolidate, extract procedures, decay, resolve contradictions.
 */
export async function runFullCompile(
  userId: string,
  config: HeliosConfig
): Promise<CompilerResult> {
  const result: CompilerResult = {
    job_type: 'full_compile',
    memories_consolidated: 0,
    procedures_extracted: 0,
    memories_decayed: 0,
    contradictions_resolved: 0,
    new_abstractions_created: 0,
    health_metrics: {} as MemoryHealth,
  }

  // Create compiler job for tracking
  const job = await createCompilerJob(userId, 'full_compile', 4)

  try {
    // Stage 1: Consolidate episodic memories
    const consolidated = await consolidateEpisodes(userId, config)
    result.memories_consolidated = consolidated.consolidated
    result.new_abstractions_created += consolidated.created

    if (job) {
      await updateCompilerJob(job.id, { items_processed: 1 })
    }

    // Stage 2: Extract procedural rules
    const procedures = await extractProcedures(userId, config)
    result.procedures_extracted = procedures.extracted
    result.new_abstractions_created += procedures.created

    if (job) {
      await updateCompilerJob(job.id, { items_processed: 2 })
    }

    // Stage 3: Decay stale memories
    const decayed = await decayStaleMemories(userId, config)
    result.memories_decayed = decayed

    if (job) {
      await updateCompilerJob(job.id, { items_processed: 3 })
    }

    // Stage 4: Resolve contradictions
    const resolved = await resolveContradictions(userId, config)
    result.contradictions_resolved = resolved

    if (job) {
      await updateCompilerJob(job.id, { items_processed: 4 })
    }

    // Get final health metrics
    const health = await getMemoryHealth(userId)
    if (health) {
      result.health_metrics = health
    }

    if (job) {
      await updateCompilerJob(job.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        details: result as unknown as Record<string, unknown>,
      })
    }
  } catch (error) {
    console.error('HELIOS: Compiler full cycle failed:', error)
    if (job) {
      await updateCompilerJob(job.id, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return result
}

/**
 * Consolidate episodic memories into semantic summaries.
 * Groups related episodes by subject, then summarizes each group.
 */
async function consolidateEpisodes(
  userId: string,
  config: HeliosConfig
): Promise<{ consolidated: number; created: number }> {
  const episodes = await getActiveMemories(
    userId,
    ['episodic'],
    config.compiler_episode_batch_size
  )

  if (episodes.length < 3) {
    return { consolidated: 0, created: 0 }
  }

  // Group episodes by subject
  const groups = new Map<string, HeliosMemory[]>()
  for (const episode of episodes) {
    const subject = episode.subject.toLowerCase()
    const group = groups.get(subject) || []
    group.push(episode)
    groups.set(subject, group)
  }

  let consolidated = 0
  let created = 0

  const reasoningProvider = getReasoningProvider(config)
  const embeddingProvider = getEmbeddingProvider(config)

  for (const [subject, group] of groups) {
    // Only consolidate groups with enough episodes
    if (group.length < 3) continue

    const episodeSummary = group
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(
        (ep, i) =>
          `[Episode ${i + 1}] (${ep.created_at})\n${ep.content_text}`
      )
      .join('\n\n')

    try {
      const result = await reasoningProvider.chatJson<ConsolidatedMemory[]>(
        [
          { role: 'system', content: CONSOLIDATION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Consolidate these ${group.length} episodic memories about "${subject}":\n\n${episodeSummary}`,
          },
        ],
        { temperature: 0.1, max_tokens: 2048 }
      )

      if (Array.isArray(result)) {
        for (const consolidated_mem of result) {
          // Generate embedding for the consolidated memory
          let embedding: number[] | null = null
          try {
            embedding = await embeddingProvider.embed(consolidated_mem.summary)
          } catch {
            // Continue without embedding
          }

          const newMemory = await insertMemory({
            user_id: userId,
            memory_class: 'semantic',
            subject: consolidated_mem.subject || subject,
            predicate: consolidated_mem.predicate || 'consolidated_from_episodes',
            object: {
              source_episode_count: group.length,
              consolidated_at: new Date().toISOString(),
            },
            content_text: consolidated_mem.summary,
            source_event_ids: group.flatMap((ep) => ep.source_event_ids || []),
            source_description: `Consolidated from ${group.length} episodes about "${subject}"`,
            confidence: consolidated_mem.confidence || 0.7,
            importance: consolidated_mem.importance || 0.6,
            sensitivity: 'personal',
            scope: ['user'],
            decay_policy: 'none', // Consolidated memories don't decay
            embedding,
          })

          if (newMemory) {
            created++
            await logMutation(userId, 'compiler_consolidate', {
              memory_id: newMemory.id,
              reason: `Consolidated ${group.length} episodes about "${subject}"`,
              details: { source_episodes: group.map((ep) => ep.id) },
              triggered_by: 'compiler',
            })
          }
        }
      }

      // Mark original episodes as archived (not deleted, for audit trail)
      for (const episode of group) {
        await updateMemory(episode.id, { status: 'archived' })
        consolidated++
      }
    } catch (error) {
      console.error(`HELIOS: Failed to consolidate episodes for "${subject}":`, error)
    }
  }

  return { consolidated, created }
}

/**
 * Extract procedural rules from repeated patterns in episodic/semantic memories.
 */
async function extractProcedures(
  userId: string,
  config: HeliosConfig
): Promise<{ extracted: number; created: number }> {
  // Get recent episodic and semantic memories for pattern detection
  const memories = await getActiveMemories(
    userId,
    ['episodic', 'semantic'],
    config.compiler_episode_batch_size * 2
  )

  if (memories.length < config.compiler_min_episodes_for_procedure) {
    return { extracted: 0, created: 0 }
  }

  const reasoningProvider = getReasoningProvider(config)
  const embeddingProvider = getEmbeddingProvider(config)

  const memorySummary = memories
    .slice(0, 30) // Cap to prevent overly long prompts
    .map(
      (mem, i) =>
        `[Memory ${i + 1}] (class: ${mem.memory_class}, subject: ${mem.subject})\n${mem.content_text}`
    )
    .join('\n\n')

  let extracted = 0
  let created = 0

  try {
    const procedures = await reasoningProvider.chatJson<ExtractedProcedure[]>(
      [
        { role: 'system', content: PROCEDURE_EXTRACTION_PROMPT },
        {
          role: 'user',
          content: `Analyze these ${memories.length} memories for recurring patterns:\n\n${memorySummary}`,
        },
      ],
      { temperature: 0.1, max_tokens: 2048 }
    )

    if (Array.isArray(procedures)) {
      for (const proc of procedures) {
        if (proc.evidence_count < config.compiler_min_episodes_for_procedure) continue

        let embedding: number[] | null = null
        try {
          embedding = await embeddingProvider.embed(proc.rule)
        } catch {
          // Continue without embedding
        }

        const newMemory = await insertMemory({
          user_id: userId,
          memory_class: 'procedural',
          subject: proc.trigger || 'general',
          predicate: 'procedure',
          object: {
            rule: proc.rule,
            trigger: proc.trigger,
            evidence_count: proc.evidence_count,
            extracted_at: new Date().toISOString(),
          },
          content_text: `When ${proc.trigger}: ${proc.rule}`,
          source_description: `Extracted from ${proc.evidence_count} supporting memories`,
          confidence: proc.confidence || 0.6,
          importance: proc.importance || 0.5,
          sensitivity: 'personal',
          scope: ['user'],
          decay_policy: 'none',
          embedding,
        })

        if (newMemory) {
          created++
          extracted++
          await logMutation(userId, 'compiler_abstract', {
            memory_id: newMemory.id,
            reason: `Extracted procedure: ${proc.rule}`,
            details: { trigger: proc.trigger, evidence_count: proc.evidence_count },
            triggered_by: 'compiler',
          })
        }
      }
    }
  } catch (error) {
    console.error('HELIOS: Procedure extraction failed:', error)
  }

  return { extracted, created }
}

/**
 * Decay stale memories by reducing recency scores.
 */
async function decayStaleMemories(
  userId: string,
  config: HeliosConfig
): Promise<number> {
  return decayRecencyScores(userId, config.compiler_decay_factor, config.compiler_min_recency)
}

/**
 * Attempt to resolve unresolved contradictions using LLM reasoning.
 */
async function resolveContradictions(
  userId: string,
  config: HeliosConfig
): Promise<number> {
  const contradictions = await getUnresolvedContradictions(userId, 10) // Process up to 10 per cycle
  if (contradictions.length === 0) return 0

  const reasoningProvider = getReasoningProvider(config)
  let resolved = 0

  for (const contradiction of contradictions) {
    const memoryA = await getMemoryById(contradiction.memory_a_id)
    const memoryB = await getMemoryById(contradiction.memory_b_id)

    if (!memoryA || !memoryB) {
      // One side no longer exists; auto-resolve
      await resolveContradiction(
        contradiction.id,
        memoryA ? 'a_wins' : memoryB ? 'b_wins' : 'both_valid_in_context'
      )
      resolved++
      continue
    }

    try {
      const result = await reasoningProvider.chatJson<{
        resolution: 'a_wins' | 'b_wins' | 'merged' | 'both_valid_in_context'
        reasoning: string
        merged_content?: string
      }>(
        [
          { role: 'system', content: CONTRADICTION_RESOLUTION_PROMPT },
          {
            role: 'user',
            content: `Memory A (id: ${memoryA.id}, created: ${memoryA.created_at}, confidence: ${memoryA.confidence}):\n${memoryA.content_text}\n\nMemory B (id: ${memoryB.id}, created: ${memoryB.created_at}, confidence: ${memoryB.confidence}):\n${memoryB.content_text}`,
          },
        ],
        { temperature: 0, max_tokens: 1024 }
      )

      // Execute the resolution
      switch (result.resolution) {
        case 'a_wins':
          await updateMemory(memoryB.id, { status: 'superseded', superseded_by: memoryA.id })
          break
        case 'b_wins':
          await updateMemory(memoryA.id, { status: 'superseded', superseded_by: memoryB.id })
          break
        case 'merged':
          if (result.merged_content) {
            const embeddingProvider = getEmbeddingProvider(config)
            let embedding: number[] | null = null
            try {
              embedding = await embeddingProvider.embed(result.merged_content)
            } catch {
              // Continue without embedding
            }

            const merged = await insertMemory({
              user_id: userId,
              memory_class: memoryA.memory_class,
              subject: memoryA.subject,
              predicate: memoryA.predicate,
              object: {
                merged_from: [memoryA.id, memoryB.id],
                merged_at: new Date().toISOString(),
              },
              content_text: result.merged_content,
              source_event_ids: [
                ...(memoryA.source_event_ids || []),
                ...(memoryB.source_event_ids || []),
              ],
              source_description: `Merged from memories ${memoryA.id} and ${memoryB.id}`,
              confidence: Math.max(memoryA.confidence, memoryB.confidence),
              importance: Math.max(memoryA.importance, memoryB.importance),
              sensitivity: memoryA.sensitivity,
              scope: memoryA.scope,
              decay_policy: 'none',
              embedding,
            })

            if (merged) {
              await updateMemory(memoryA.id, { status: 'superseded', superseded_by: merged.id })
              await updateMemory(memoryB.id, { status: 'superseded', superseded_by: merged.id })
            }
          }
          break
        case 'both_valid_in_context':
          // Both are valid; no memory changes needed
          break
      }

      await resolveContradiction(contradiction.id, result.resolution)
      resolved++

      await logMutation(userId, 'resolve_contradiction', {
        details: {
          contradiction_id: contradiction.id,
          memory_a: memoryA.id,
          memory_b: memoryB.id,
          resolution: result.resolution,
          reasoning: result.reasoning,
        },
        triggered_by: 'compiler',
      })
    } catch (error) {
      console.error('HELIOS: Contradiction resolution failed:', error)
    }
  }

  return resolved
}
