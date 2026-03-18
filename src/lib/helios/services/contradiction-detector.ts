// Project HELIOS - Contradiction Detector and Deduplication Engine
// FR-5: Detect contradiction against prior facts and graph-neighbor implications
// Uses semantic similarity + LLM reasoning for conflict detection

import type {
  HeliosMemory,
  HeliosConfig,
  ContradictionInfo,
  ContradictionType,
  ContradictionResolution,
  LLMProvider,
  SalienceResult,
} from '../types'
import { getReasoningProvider, getEmbeddingProvider } from '../providers'
import {
  searchMemoriesVector,
  getMemoriesBySubject,
  insertContradiction,
  getContradictionsForMemory,
} from '../stores/memory-store'

interface ContradictionAnalysis {
  is_contradiction: boolean
  contradiction_type: ContradictionType
  confidence: number
  description: string
  suggested_resolution: ContradictionResolution
  is_duplicate: boolean
  duplicate_memory_id: string | null
}

const CONTRADICTION_SYSTEM_PROMPT = `You are HELIOS, a memory consistency engine. Your job is to compare a NEW candidate memory against EXISTING memories and determine if there are contradictions or duplicates.

For each comparison, determine:

1. IS_CONTRADICTION: Does the new memory conflict with the existing one? (true/false)

2. CONTRADICTION_TYPE (if contradiction exists):
   - "direct": They directly state opposite things
   - "temporal": The existing memory was true before but the new one updates/changes it
   - "partial": They partially overlap with some conflicting details
   - "implication": One implies something that conflicts with the other

3. CONFIDENCE: How confident are you in this assessment? (0.0-1.0)

4. DESCRIPTION: Brief explanation of the contradiction

5. SUGGESTED_RESOLUTION:
   - "a_wins": The existing memory should be kept, new one discarded
   - "b_wins": The new memory should supersede the existing one
   - "merged": Both contain valid info that should be merged
   - "both_valid_in_context": Both are true in different contexts/timeframes

6. IS_DUPLICATE: Is the new memory essentially the same as the existing one? (true/false)
   - Consider it a duplicate if it expresses the same fact, even with different wording

Respond with ONLY a JSON object. No explanation outside the JSON.`

/**
 * Check a candidate memory against existing memories for contradictions and duplicates.
 * Returns null if no issues found, or ContradictionInfo if a conflict exists.
 */
export async function detectContradictions(
  userId: string,
  candidateContent: string,
  candidateSubject: string,
  candidatePredicate: string,
  candidateObject: Record<string, unknown>,
  salienceResult: SalienceResult,
  config: HeliosConfig
): Promise<{
  contradictions: ContradictionInfo[]
  duplicateOf: string | null
}> {
  const contradictions: ContradictionInfo[] = []
  let duplicateOf: string | null = null

  // Step 1: Find similar memories by embedding
  const embeddingProvider = getEmbeddingProvider(config)
  let similarMemories: Array<HeliosMemory & { similarity: number }> = []

  try {
    const embedding = await embeddingProvider.embed(candidateContent)
    similarMemories = await searchMemoriesVector(
      embedding,
      userId,
      undefined, // All memory classes
      0.0,
      0.5, // Lower threshold to catch potential conflicts
      config.max_similar_memories_for_dedup
    )
  } catch (error) {
    console.error('HELIOS: Embedding search failed during contradiction check:', error)
  }

  // Step 2: Also get memories with matching subjects
  const subjectMemories = await getMemoriesBySubject(
    userId,
    candidateSubject,
    undefined,
    config.max_similar_memories_for_dedup
  )

  // Deduplicate the candidate memory lists
  const seenIds = new Set<string>()
  const allCandidates: HeliosMemory[] = []

  for (const mem of similarMemories) {
    if (!seenIds.has(mem.id)) {
      seenIds.add(mem.id)
      allCandidates.push(mem)
    }
  }
  for (const mem of subjectMemories) {
    if (!seenIds.has(mem.id)) {
      seenIds.add(mem.id)
      allCandidates.push(mem)
    }
  }

  if (allCandidates.length === 0) {
    return { contradictions: [], duplicateOf: null }
  }

  // Step 3: Use LLM to analyze each potential conflict
  const reasoningProvider = getReasoningProvider(config)

  // Batch the candidates into a single LLM call for efficiency
  const existingMemoriesSummary = allCandidates
    .slice(0, 10) // Cap at 10 to limit prompt size
    .map((mem, i) => {
      return `[Memory ${i + 1}] (id: ${mem.id})
Class: ${mem.memory_class}
Subject: ${mem.subject}
Predicate: ${mem.predicate}
Content: ${mem.content_text}
Valid from: ${mem.valid_from}
Confidence: ${mem.confidence}`
    })
    .join('\n\n')

  const analysisPrompt = `Compare this NEW candidate memory against the EXISTING memories below.

NEW CANDIDATE:
Subject: ${candidateSubject}
Predicate: ${candidatePredicate}
Object: ${JSON.stringify(candidateObject)}
Full content: ${candidateContent}

EXISTING MEMORIES:
${existingMemoriesSummary}

For each existing memory, determine if there is a contradiction or if the new candidate is a duplicate. Return a JSON object with this structure:
{
  "analyses": [
    {
      "existing_memory_id": "the id",
      "is_contradiction": true/false,
      "contradiction_type": "direct"|"temporal"|"partial"|"implication",
      "confidence": 0.0-1.0,
      "description": "brief explanation",
      "suggested_resolution": "a_wins"|"b_wins"|"merged"|"both_valid_in_context",
      "is_duplicate": true/false
    }
  ]
}`

  try {
    const result = await reasoningProvider.chatJson<{
      analyses: ContradictionAnalysis[]
    }>(
      [
        { role: 'system', content: CONTRADICTION_SYSTEM_PROMPT },
        { role: 'user', content: analysisPrompt },
      ],
      { temperature: 0, max_tokens: 2048 }
    )

    if (result.analyses && Array.isArray(result.analyses)) {
      for (const analysis of result.analyses) {
        // Handle duplicates
        if (analysis.is_duplicate && analysis.duplicate_memory_id) {
          duplicateOf = analysis.duplicate_memory_id
        } else if (analysis.is_duplicate) {
          // Find the memory ID from the analysis context
          const matchingCandidate = allCandidates.find(
            (m) => m.id === (analysis as unknown as Record<string, unknown>).existing_memory_id
          )
          if (matchingCandidate) {
            duplicateOf = matchingCandidate.id
          }
        }

        // Handle contradictions
        if (
          analysis.is_contradiction &&
          analysis.confidence >= config.contradiction_confidence_threshold
        ) {
          const existingMemoryId =
            (analysis as unknown as Record<string, unknown>).existing_memory_id as string
          const existingMemory = allCandidates.find((m) => m.id === existingMemoryId)

          if (existingMemory) {
            contradictions.push({
              type: analysis.contradiction_type || 'direct',
              conflicting_memory_id: existingMemory.id,
              conflicting_content: existingMemory.content_text,
              description: analysis.description || 'Contradiction detected',
              suggested_resolution: analysis.suggested_resolution || 'b_wins',
            })
          }
        }
      }
    }
  } catch (error) {
    console.error('HELIOS: LLM contradiction analysis failed, using similarity fallback:', error)
    // Fallback: use high similarity as a duplicate indicator
    return similarityFallback(similarMemories, candidateContent, config)
  }

  return { contradictions, duplicateOf }
}

/**
 * Record detected contradictions in the database.
 */
export async function recordContradictions(
  userId: string,
  newMemoryId: string,
  contradictions: ContradictionInfo[]
): Promise<void> {
  for (const contradiction of contradictions) {
    await insertContradiction(
      userId,
      contradiction.conflicting_memory_id,
      newMemoryId,
      contradiction.type,
      contradiction.description,
      0.5 // Initial confidence; the write engine may adjust
    )
  }
}

/**
 * Fallback contradiction detection using pure similarity scores.
 * No LLM needed - just compares embedding distances.
 */
function similarityFallback(
  similarMemories: Array<HeliosMemory & { similarity: number }>,
  candidateContent: string,
  config: HeliosConfig
): { contradictions: ContradictionInfo[]; duplicateOf: string | null } {
  let duplicateOf: string | null = null

  // Very high similarity (>0.95) = likely duplicate
  const highSimilarity = similarMemories.filter((m) => m.similarity > 0.95)
  if (highSimilarity.length > 0) {
    duplicateOf = highSimilarity[0].id
  }

  // We can't reliably detect semantic contradictions without LLM
  // but very similar memories about the same subject with different content
  // might be worth flagging
  const contradictions: ContradictionInfo[] = []

  return { contradictions, duplicateOf }
}
