// Project HELIOS - Evaluation Metrics
// Implements all scoring metrics used by LoCoMo and LongMemEval benchmarks

/**
 * Exact match: binary score, 1 if prediction matches any acceptable answer.
 * Case-insensitive, whitespace-normalized.
 */
export function exactMatch(prediction: string, groundTruth: string | string[]): number {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const pred = normalize(prediction)

  const truths = Array.isArray(groundTruth) ? groundTruth : [groundTruth]
  return truths.some((t) => normalize(t) === pred) ? 1.0 : 0.0
}

/**
 * Token-level F1 score between prediction and ground truth.
 * Standard QA evaluation metric used by LoCoMo.
 */
export function tokenF1(prediction: string, groundTruth: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)

  const predTokens = tokenize(prediction)
  const truthTokens = tokenize(groundTruth)

  if (predTokens.length === 0 && truthTokens.length === 0) return 1.0
  if (predTokens.length === 0 || truthTokens.length === 0) return 0.0

  const truthSet = new Set(truthTokens)
  const predSet = new Set(predTokens)

  let overlap = 0
  for (const token of predTokens) {
    if (truthSet.has(token)) overlap++
  }

  const precision = overlap / predTokens.length
  const recall = overlap / truthTokens.length

  if (precision + recall === 0) return 0.0
  return (2 * precision * recall) / (precision + recall)
}

/**
 * Best token F1 across multiple acceptable answers.
 */
export function bestTokenF1(prediction: string, groundTruths: string | string[]): number {
  const truths = Array.isArray(groundTruths) ? groundTruths : [groundTruths]
  let best = 0
  for (const truth of truths) {
    best = Math.max(best, tokenF1(prediction, truth))
  }
  return best
}

/**
 * ROUGE-L: Longest common subsequence based metric.
 * Used for event summarization evaluation in LoCoMo.
 */
export function rougeL(prediction: string, reference: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)

  const predTokens = tokenize(prediction)
  const refTokens = tokenize(reference)

  if (predTokens.length === 0 || refTokens.length === 0) return 0.0

  // Compute LCS length using dynamic programming
  const lcsLength = computeLCS(predTokens, refTokens)

  const precision = lcsLength / predTokens.length
  const recall = lcsLength / refTokens.length

  if (precision + recall === 0) return 0.0

  // F-measure with beta=1 (equal weight to precision and recall)
  return (2 * precision * recall) / (precision + recall)
}

function computeLCS(a: string[], b: string[]): number {
  const m = a.length
  const n = b.length
  // Use two rows instead of full matrix for memory efficiency
  let prev = new Array(n + 1).fill(0)
  let curr = new Array(n + 1).fill(0)

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1])
      }
    }
    ;[prev, curr] = [curr, prev]
    curr.fill(0)
  }

  return prev[n]
}

/**
 * BLEU-1 (unigram BLEU): Precision-based metric with brevity penalty.
 * Used for dialog generation in LoCoMo.
 */
export function bleu1(prediction: string, reference: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)

  const predTokens = tokenize(prediction)
  const refTokens = tokenize(reference)

  if (predTokens.length === 0) return 0.0
  if (refTokens.length === 0) return 0.0

  // Count reference token frequencies
  const refCounts = new Map<string, number>()
  for (const token of refTokens) {
    refCounts.set(token, (refCounts.get(token) || 0) + 1)
  }

  // Clipped precision: count matches, capped by reference frequency
  let clippedMatches = 0
  const predCounts = new Map<string, number>()
  for (const token of predTokens) {
    predCounts.set(token, (predCounts.get(token) || 0) + 1)
  }

  for (const [token, count] of predCounts) {
    const refCount = refCounts.get(token) || 0
    clippedMatches += Math.min(count, refCount)
  }

  const precision = clippedMatches / predTokens.length

  // Brevity penalty
  const bp =
    predTokens.length >= refTokens.length
      ? 1.0
      : Math.exp(1 - refTokens.length / predTokens.length)

  return bp * precision
}

/**
 * Semantic similarity using embedding cosine distance.
 * Requires an embedding function to be passed in.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

/**
 * Abstention accuracy: measures ability to say "I don't know" correctly.
 * Used by LongMemEval.
 *
 * Returns 1.0 if:
 * - The question is unanswerable AND the system abstained
 * - The question is answerable AND the system provided an answer
 */
export function abstentionAccuracy(
  prediction: string,
  isUnanswerable: boolean
): number {
  const abstainPatterns = [
    /i don'?t know/i,
    /i'?m not sure/i,
    /no information/i,
    /cannot (find|recall|remember)/i,
    /don'?t have (enough )?(information|data|context)/i,
    /not enough (information|data|context)/i,
    /unable to (answer|determine|find)/i,
    /no relevant (memory|information|data)/i,
    /i don'?t have that information/i,
    /unknown/i,
    /n\/a/i,
  ]

  const systemAbstained = abstainPatterns.some((p) => p.test(prediction))

  if (isUnanswerable && systemAbstained) return 1.0
  if (!isUnanswerable && !systemAbstained) return 1.0
  return 0.0
}

/**
 * Contradiction detection accuracy.
 * Measures if the system correctly identifies when new info contradicts stored memory.
 */
export function contradictionAccuracy(
  systemDetected: boolean,
  groundTruthContradiction: boolean
): number {
  return systemDetected === groundTruthContradiction ? 1.0 : 0.0
}

/**
 * Temporal ordering accuracy.
 * Measures if the system correctly orders events in time.
 */
export function temporalOrderAccuracy(
  predictedOrder: string[],
  correctOrder: string[]
): number {
  if (predictedOrder.length !== correctOrder.length) return 0.0
  if (predictedOrder.length === 0) return 1.0

  // Kendall's tau-like metric: fraction of correctly ordered pairs
  let concordant = 0
  let total = 0

  for (let i = 0; i < correctOrder.length; i++) {
    for (let j = i + 1; j < correctOrder.length; j++) {
      const predI = predictedOrder.indexOf(correctOrder[i])
      const predJ = predictedOrder.indexOf(correctOrder[j])

      if (predI === -1 || predJ === -1) continue

      total++
      if (predI < predJ) concordant++
    }
  }

  return total === 0 ? 0.0 : concordant / total
}

// ============================================
// AGGREGATE METRICS
// ============================================

export interface EvalResult {
  question_id: string
  task_type: string
  prediction: string
  ground_truth: string | string[]
  exact_match: number
  token_f1: number
  rouge_l?: number
  bleu_1?: number
  abstention_accuracy?: number
  contradiction_accuracy?: number
  temporal_accuracy?: number
  latency_ms: number
  tokens_used: number
  memory_context_tokens: number
}

export interface AggregateMetrics {
  total_questions: number
  avg_exact_match: number
  avg_token_f1: number
  avg_rouge_l: number
  avg_bleu_1: number
  avg_abstention_accuracy: number
  avg_contradiction_accuracy: number
  avg_temporal_accuracy: number
  avg_latency_ms: number
  avg_tokens_used: number
  avg_memory_context_tokens: number
  p50_latency_ms: number
  p95_latency_ms: number
  by_task_type: Record<string, TaskTypeMetrics>
}

export interface TaskTypeMetrics {
  count: number
  avg_exact_match: number
  avg_token_f1: number
  avg_rouge_l: number
  avg_latency_ms: number
}

export function computeAggregateMetrics(results: EvalResult[]): AggregateMetrics {
  if (results.length === 0) {
    return {
      total_questions: 0,
      avg_exact_match: 0,
      avg_token_f1: 0,
      avg_rouge_l: 0,
      avg_bleu_1: 0,
      avg_abstention_accuracy: 0,
      avg_contradiction_accuracy: 0,
      avg_temporal_accuracy: 0,
      avg_latency_ms: 0,
      avg_tokens_used: 0,
      avg_memory_context_tokens: 0,
      p50_latency_ms: 0,
      p95_latency_ms: 0,
      by_task_type: {},
    }
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
  const percentile = (arr: number[], p: number) => {
    const sorted = [...arr].sort((a, b) => a - b)
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, idx)]
  }

  const latencies = results.map((r) => r.latency_ms)

  // Group by task type
  const byType = new Map<string, EvalResult[]>()
  for (const r of results) {
    const group = byType.get(r.task_type) || []
    group.push(r)
    byType.set(r.task_type, group)
  }

  const taskTypeMetrics: Record<string, TaskTypeMetrics> = {}
  for (const [type, group] of byType) {
    taskTypeMetrics[type] = {
      count: group.length,
      avg_exact_match: avg(group.map((r) => r.exact_match)),
      avg_token_f1: avg(group.map((r) => r.token_f1)),
      avg_rouge_l: avg(group.filter((r) => r.rouge_l != null).map((r) => r.rouge_l!)),
      avg_latency_ms: avg(group.map((r) => r.latency_ms)),
    }
  }

  return {
    total_questions: results.length,
    avg_exact_match: avg(results.map((r) => r.exact_match)),
    avg_token_f1: avg(results.map((r) => r.token_f1)),
    avg_rouge_l: avg(
      results.filter((r) => r.rouge_l != null).map((r) => r.rouge_l!)
    ),
    avg_bleu_1: avg(
      results.filter((r) => r.bleu_1 != null).map((r) => r.bleu_1!)
    ),
    avg_abstention_accuracy: avg(
      results.filter((r) => r.abstention_accuracy != null).map((r) => r.abstention_accuracy!)
    ),
    avg_contradiction_accuracy: avg(
      results.filter((r) => r.contradiction_accuracy != null).map((r) => r.contradiction_accuracy!)
    ),
    avg_temporal_accuracy: avg(
      results.filter((r) => r.temporal_accuracy != null).map((r) => r.temporal_accuracy!)
    ),
    avg_latency_ms: avg(latencies),
    avg_tokens_used: avg(results.map((r) => r.tokens_used)),
    avg_memory_context_tokens: avg(results.map((r) => r.memory_context_tokens)),
    p50_latency_ms: percentile(latencies, 50),
    p95_latency_ms: percentile(latencies, 95),
    by_task_type: taskTypeMetrics,
  }
}
