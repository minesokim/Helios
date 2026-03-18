// Project HELIOS - Reranker
// FR-7: Score candidates on relevance, freshness, authority, specificity,
//       confidence, and safety. Produce final ranked list.

import type {
  RetrievalCandidate,
  RerankerWeights,
  HeliosConfig,
  BundleTurnType,
  HeliosMemory,
} from '../types'

/**
 * Rerank retrieval candidates using a weighted composite score.
 * Adapts weights based on the turn type (answering vs planning vs reflection, etc.)
 */
export function rerankCandidates(
  candidates: RetrievalCandidate[],
  turnType: BundleTurnType,
  config: HeliosConfig
): RetrievalCandidate[] {
  if (candidates.length === 0) return []

  // Adapt weights based on turn type
  const weights = adaptWeightsForTurnType(config.reranker_weights, turnType)

  // Score each candidate
  const scored = candidates.map((candidate) => ({
    ...candidate,
    composite_score: computeCompositeScore(candidate, weights),
  }))

  // Sort by composite score descending
  scored.sort((a, b) => b.composite_score - a.composite_score)

  // Apply diversity penalty: down-rank very similar adjacent results
  const diversified = applyDiversityPenalty(scored)

  // Cap at max results
  return diversified.slice(0, config.max_total_retrieval_results)
}

/**
 * Compute the weighted composite score for a single candidate.
 */
function computeCompositeScore(
  candidate: RetrievalCandidate,
  weights: RerankerWeights
): number {
  const mem = candidate.memory

  // Relevance: raw channel score (already normalized 0-1 from each channel)
  const relevance = Math.min(candidate.raw_score, 1.0)

  // Freshness: recency score + temporal decay
  const freshness = computeFreshness(mem)

  // Authority: confidence + source reliability + access frequency
  const authority = computeAuthority(mem)

  // Specificity: how specific vs generic the memory is
  const specificity = computeSpecificity(mem)

  // Confidence: direct confidence score
  const confidence = mem.confidence || 0.5

  // Safety: penalize superseded, disputed, or restricted memories
  const safety = computeSafety(mem)

  const composite =
    weights.relevance * relevance +
    weights.freshness * freshness +
    weights.authority * authority +
    weights.specificity * specificity +
    weights.confidence * confidence +
    weights.safety * safety

  return Math.max(0, Math.min(1, composite))
}

/**
 * Compute freshness score based on recency and temporal validity.
 */
function computeFreshness(mem: HeliosMemory): number {
  // Recency score is already maintained by the store
  const recency = mem.recency_score || 0.5

  // Check if memory is temporally valid right now
  const now = Date.now()
  if (mem.valid_to && new Date(mem.valid_to).getTime() < now) {
    return recency * 0.3 // Heavily penalize expired memories
  }

  // Boost recently accessed memories
  const accessBoost = mem.last_accessed_at
    ? Math.max(0, 1 - (now - new Date(mem.last_accessed_at).getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 0

  return Math.min(1, recency * 0.7 + accessBoost * 0.3)
}

/**
 * Compute authority based on confidence, access pattern, and source.
 */
function computeAuthority(mem: HeliosMemory): number {
  const confidence = mem.confidence || 0.5

  // Frequently accessed memories are more authoritative
  const accessFrequency = Math.min(1, (mem.access_count || 0) / 50)

  // Semantic and procedural memories are more authoritative than episodic
  const classBoost =
    mem.memory_class === 'semantic'
      ? 0.15
      : mem.memory_class === 'procedural'
        ? 0.1
        : mem.memory_class === 'self_model'
          ? 0.1
          : 0

  return Math.min(1, confidence * 0.6 + accessFrequency * 0.2 + classBoost + 0.1)
}

/**
 * Compute specificity: how specific and actionable the memory is.
 */
function computeSpecificity(mem: HeliosMemory): number {
  const content = mem.content_text || ''

  // Longer, more detailed content is generally more specific
  const lengthScore = Math.min(1, content.length / 500)

  // Presence of structured data (specific names, numbers, dates)
  let structureScore = 0
  if (/\d/.test(content)) structureScore += 0.2      // Contains numbers
  if (/@/.test(content)) structureScore += 0.1        // Contains mentions
  if (/\$[\d,.]+/.test(content)) structureScore += 0.2 // Financial values
  if (/\d{4}-\d{2}/.test(content)) structureScore += 0.15 // Date references

  // Subject specificity: known entity vs generic
  const subjectScore = mem.subject && mem.subject !== 'unknown' ? 0.3 : 0

  return Math.min(1, lengthScore * 0.3 + structureScore + subjectScore)
}

/**
 * Compute safety score: penalize memories that shouldn't be surfaced.
 */
function computeSafety(mem: HeliosMemory): number {
  let score = 1.0

  // Penalize by status
  switch (mem.status) {
    case 'active':
      break // No penalty
    case 'superseded':
      score *= 0.2 // Heavy penalty for superseded
      break
    case 'disputed':
      score *= 0.5 // Moderate penalty for disputed
      break
    case 'decayed':
      score *= 0.3 // Heavy penalty for decayed
      break
    case 'archived':
      score *= 0.4
      break
    case 'deleted':
      return 0 // Never surface deleted memories
  }

  // Penalize by sensitivity
  switch (mem.sensitivity) {
    case 'restricted':
      score *= 0.1 // Almost never surface restricted
      break
    case 'sensitive':
      score *= 0.7 // Mild penalty for sensitive
      break
    default:
      break // No penalty for public/personal
  }

  return score
}

/**
 * Adapt reranker weights based on the turn type.
 * Different types of interactions need different memory emphasis.
 */
function adaptWeightsForTurnType(
  baseWeights: RerankerWeights,
  turnType: BundleTurnType
): RerankerWeights {
  switch (turnType) {
    case 'answering':
      // Standard weights work well for answering
      return baseWeights

    case 'planning':
      // Planning needs more procedural/historical weight and less freshness
      return {
        ...baseWeights,
        relevance: baseWeights.relevance * 1.2,
        freshness: baseWeights.freshness * 0.7,
        authority: baseWeights.authority * 1.3,
        specificity: baseWeights.specificity * 1.1,
      }

    case 'summarizing':
      // Summarizing needs broad coverage with high authority
      return {
        ...baseWeights,
        relevance: baseWeights.relevance * 0.8,
        freshness: baseWeights.freshness * 0.9,
        authority: baseWeights.authority * 1.4,
        specificity: baseWeights.specificity * 0.8,
      }

    case 'tool_use':
      // Tool use needs high specificity and recent context
      return {
        ...baseWeights,
        relevance: baseWeights.relevance * 1.0,
        freshness: baseWeights.freshness * 1.3,
        specificity: baseWeights.specificity * 1.3,
      }

    case 'reflection':
      // Reflection needs failure memories, self-model, and procedures
      return {
        ...baseWeights,
        relevance: baseWeights.relevance * 0.9,
        authority: baseWeights.authority * 1.2,
        confidence: baseWeights.confidence * 0.8, // Accept lower-confidence for introspection
      }

    case 'recovery':
      // Recovery after errors: prioritize failure memories and procedures
      return {
        ...baseWeights,
        relevance: baseWeights.relevance * 1.3,
        freshness: baseWeights.freshness * 1.2,
        authority: baseWeights.authority * 1.1,
        safety: baseWeights.safety * 1.3,
      }

    default:
      return baseWeights
  }
}

/**
 * Apply diversity penalty to prevent too many similar results.
 * Uses a simple subject-based diversity: if consecutive results have
 * the same subject, penalize later ones.
 */
function applyDiversityPenalty(
  candidates: RetrievalCandidate[]
): RetrievalCandidate[] {
  if (candidates.length <= 1) return candidates

  const result: RetrievalCandidate[] = []
  const subjectCounts = new Map<string, number>()
  const classCounts = new Map<string, number>()

  for (const candidate of candidates) {
    const subject = candidate.memory.subject?.toLowerCase() || 'unknown'
    const memClass = candidate.memory.memory_class || 'episodic'

    const subjectCount = subjectCounts.get(subject) || 0
    const classCount = classCounts.get(memClass) || 0

    // Penalize repeats of the same subject
    const subjectPenalty = subjectCount > 0 ? Math.pow(0.8, subjectCount) : 1.0
    // Lighter penalty for same memory class
    const classPenalty = classCount > 2 ? Math.pow(0.9, classCount - 2) : 1.0

    result.push({
      ...candidate,
      composite_score: candidate.composite_score * subjectPenalty * classPenalty,
    })

    subjectCounts.set(subject, subjectCount + 1)
    classCounts.set(memClass, classCount + 1)
  }

  // Re-sort after diversity adjustment
  result.sort((a, b) => b.composite_score - a.composite_score)

  return result
}
