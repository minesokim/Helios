// Project HELIOS - LongMemEval Evaluation Harness
// Tests 5 long-term memory abilities:
// 1. Information extraction (recall specific facts)
// 2. Multi-session reasoning (combine info across sessions)
// 3. Temporal reasoning (order, time-based queries)
// 4. Knowledge update (handle changed/updated facts)
// 5. Abstention (know when to say "I don't know")

import { Helios } from '../index'
import type { HeliosConfig } from '../types'
import { generateLongMemEvalDataset } from './synthetic-data'
import {
  exactMatch,
  bestTokenF1,
  rougeL,
  abstentionAccuracy,
  computeAggregateMetrics,
} from './metrics'
import type { EvalResult } from './metrics'
import type {
  LongMemEvalDataset,
  LongMemEvalQuestion,
  LongMemEvalAbility,
  EvalRun,
  EvalQuestionResult,
  AggregateReport,
  EvalConfig,
} from './types'
import { getReasoningProvider } from '../providers'

/**
 * Run the complete LongMemEval evaluation.
 */
export async function runLongMemEval(
  config?: Partial<HeliosConfig>,
  evalConfig?: EvalConfig
): Promise<EvalRun> {
  const runId = `longmemeval_${Date.now()}`
  const startedAt = new Date().toISOString()

  console.log(`[LongMemEval] Starting evaluation run: ${runId}`)

  const helios = new Helios(config)
  const dataset = generateLongMemEvalDataset()

  console.log(
    `[LongMemEval] Dataset: ${dataset.conversations.length} sessions, ${dataset.questions.length} questions`
  )

  // Phase 1: Ingest conversations session by session (simulating real usage over time)
  console.log('[LongMemEval] Phase 1: Ingesting conversations sequentially...')
  const userId = 'eval-user-longmemeval'
  await ingestSessions(helios, userId, dataset)

  // Run compiler between ingestion and evaluation
  console.log('[LongMemEval] Phase 1.5: Running memory compiler...')
  await helios.runCompiler(userId)

  // Get memory health before evaluation
  const healthBefore = await helios.getHealthReport(userId)
  console.log(`[LongMemEval] Memory state: ${healthBefore?.total_memories || 0} total memories, ${healthBefore?.active_memories || 0} active`)

  // Phase 2: Evaluate each question
  console.log('[LongMemEval] Phase 2: Evaluating questions...')
  const maxQuestions = evalConfig?.max_questions || dataset.questions.length
  const questionsToEval = dataset.questions.slice(0, maxQuestions)

  const results: EvalQuestionResult[] = []

  for (let i = 0; i < questionsToEval.length; i++) {
    const question = questionsToEval[i]
    console.log(
      `[LongMemEval] Question ${i + 1}/${questionsToEval.length}: [${question.ability}] "${question.question.substring(0, 60)}..."`
    )

    const result = await evaluateQuestion(helios, userId, question, config || {})
    results.push(result)

    if (evalConfig?.verbose) {
      console.log(`  Prediction: "${result.prediction.substring(0, 100)}..."`)
      console.log(`  EM: ${result.exact_match.toFixed(2)}, F1: ${result.token_f1.toFixed(2)}, Latency: ${result.latency_ms}ms`)
    }
  }

  // Phase 3: Compute aggregate metrics
  console.log('[LongMemEval] Phase 3: Computing aggregate metrics...')
  const healthAfter = await helios.getHealthReport(userId)
  const aggregate = computeLongMemEvalReport(results, healthAfter)

  const completedAt = new Date().toISOString()

  console.log('[LongMemEval] Evaluation complete.')
  printLongMemEvalReport(aggregate)

  return {
    run_id: runId,
    benchmark: 'longmemeval',
    started_at: startedAt,
    completed_at: completedAt,
    config: evalConfig || { benchmark: 'longmemeval' },
    results,
    aggregate,
    helios_config_snapshot: helios.getConfig() as unknown as Record<string, unknown>,
  }
}

/**
 * Ingest conversation sessions into HELIOS memory, one at a time,
 * simulating real-world temporal usage.
 */
async function ingestSessions(
  helios: Helios,
  userId: string,
  dataset: LongMemEvalDataset
): Promise<void> {
  for (const session of dataset.conversations) {
    console.log(`  Ingesting session ${session.session_id} (${session.timestamp})...`)

    for (let i = 0; i < session.turns.length - 1; i += 2) {
      const userTurn = session.turns[i]
      const assistantTurn = session.turns[i + 1]

      if (!userTurn || !assistantTurn) continue
      if (userTurn.role !== 'user' || assistantTurn.role !== 'assistant') continue

      await helios.processConversationTurn(
        userId,
        userTurn.content,
        assistantTurn.content,
        {
          conversationId: `${session.conversation_id}_session_${session.session_id}`,
          sessionId: `session_${session.session_id}`,
        }
      )
    }

    // Process backlog after each session to ensure all events are handled
    await helios.processBacklog(userId, 100)
  }
}

/**
 * Evaluate a single LongMemEval question.
 */
async function evaluateQuestion(
  helios: Helios,
  userId: string,
  question: LongMemEvalQuestion,
  config: Partial<HeliosConfig>
): Promise<EvalQuestionResult> {
  const startTime = Date.now()

  // Map ability to turn type for retrieval optimization
  const turnType = mapAbilityToTurnType(question.ability)

  // Get memory bundle
  const bundle = await helios.getMemoryBundle(userId, question.question, turnType)

  // Generate answer using the reasoning LLM
  const prediction = await generateAnswer(question, bundle.assembled_text, config)

  const latencyMs = Date.now() - startTime

  // Score based on question type
  let em = 0
  let f1 = 0
  let rouge: number | null = null
  let abstention: number | null = null

  if (question.is_unanswerable) {
    // For unanswerable questions, measure abstention
    abstention = abstentionAccuracy(prediction, true)
    em = abstention // Treat correct abstention as exact match
    f1 = abstention
  } else {
    em = Array.isArray(question.answer)
      ? Math.max(...question.answer.map((a) => exactMatch(prediction, a)))
      : exactMatch(prediction, question.answer)

    f1 = bestTokenF1(prediction, question.answer)

    // ROUGE-L for longer answers (multi-session reasoning, temporal)
    if (question.ability === 'multi_session_reasoning' || question.ability === 'temporal_reasoning') {
      rouge = rougeL(
        prediction,
        Array.isArray(question.answer) ? question.answer[0] : question.answer
      )
    }
  }

  return {
    question_id: question.question_id,
    task_type: question.ability,
    question: question.question,
    prediction,
    ground_truth: question.answer,
    is_correct: em > 0 || f1 > 0.8,
    exact_match: em,
    token_f1: f1,
    rouge_l: rouge,
    bleu_1: null,
    abstention_accuracy: abstention,
    contradiction_accuracy: null,
    temporal_accuracy: null,
    latency_ms: latencyMs,
    tokens_used: bundle.total_token_estimate,
    memory_context_tokens: bundle.total_token_estimate,
    memories_retrieved: bundle.retrieved_memories.length,
    retrieval_channels_used: [...new Set(bundle.retrieved_memories.map((m) => m.channel))],
    write_actions_taken: [],
    contradictions_detected: bundle.active_contradictions.length,
  }
}

function mapAbilityToTurnType(ability: LongMemEvalAbility) {
  switch (ability) {
    case 'information_extraction':
      return 'answering' as const
    case 'multi_session_reasoning':
      return 'answering' as const
    case 'temporal_reasoning':
      return 'answering' as const
    case 'knowledge_update':
      return 'answering' as const
    case 'abstention':
      return 'answering' as const
    default:
      return 'answering' as const
  }
}

/**
 * Generate an answer using the LLM with memory context.
 */
async function generateAnswer(
  question: LongMemEvalQuestion,
  memoryContext: string,
  config: Partial<HeliosConfig>
): Promise<string> {
  const fullConfig = { ...require('../types').DEFAULT_CONFIG, ...config }
  const provider = getReasoningProvider(fullConfig)

  const systemPrompt = `You are a personal assistant with long-term memory. Answer questions based on what you remember from past conversations.

${memoryContext}

Rules:
- Answer based ONLY on your memory of past conversations.
- Be concise. Give the specific answer, not a paragraph.
- If a fact was updated or changed in a later conversation, give the CURRENT value.
- If you genuinely do not have the information in your memory, say "I don't have that information."
- Do not guess or infer facts that were never discussed.
- For temporal questions, pay attention to the order events happened.`

  try {
    const response = await provider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question.question },
      ],
      { temperature: 0, max_tokens: 300 }
    )

    return response.content.trim()
  } catch (error) {
    console.error(`[LongMemEval] Failed to generate answer for ${question.question_id}:`, error)
    return 'Error generating answer.'
  }
}

/**
 * Compute aggregate LongMemEval report with per-ability breakdown.
 */
function computeLongMemEvalReport(
  results: EvalQuestionResult[],
  health: Record<string, unknown> | null
): AggregateReport {
  const evalResults: EvalResult[] = results.map((r) => ({
    question_id: r.question_id,
    task_type: r.task_type,
    prediction: r.prediction,
    ground_truth: r.ground_truth,
    exact_match: r.exact_match,
    token_f1: r.token_f1,
    rouge_l: r.rouge_l ?? undefined,
    abstention_accuracy: r.abstention_accuracy ?? undefined,
    latency_ms: r.latency_ms,
    tokens_used: r.tokens_used,
    memory_context_tokens: r.memory_context_tokens,
  }))

  const agg = computeAggregateMetrics(evalResults)

  return {
    benchmark: 'LongMemEval',
    total_questions: agg.total_questions,
    overall_accuracy: agg.avg_exact_match,
    overall_f1: agg.avg_token_f1,
    by_task_type: Object.fromEntries(
      Object.entries(agg.by_task_type).map(([type, metrics]) => [
        type,
        {
          count: metrics.count,
          accuracy: metrics.avg_exact_match,
          f1: metrics.avg_token_f1,
          avg_latency_ms: metrics.avg_latency_ms,
        },
      ])
    ),
    avg_latency_ms: agg.avg_latency_ms,
    p50_latency_ms: agg.p50_latency_ms,
    p95_latency_ms: agg.p95_latency_ms,
    total_tokens_used: agg.avg_tokens_used * agg.total_questions,
    avg_memory_context_tokens: agg.avg_memory_context_tokens,
    total_memories_at_end: (health as Record<string, number>)?.total_memories || 0,
    contradictions_at_end: (health as Record<string, number>)?.unresolved_contradictions || 0,
    superseded_at_end: (health as Record<string, number>)?.superseded_memories || 0,
  }
}

function printLongMemEvalReport(report: AggregateReport): void {
  console.log('\n========================================')
  console.log('  LongMemEval Evaluation Report')
  console.log('========================================')
  console.log(`Total questions: ${report.total_questions}`)
  console.log(`Overall Accuracy:    ${(report.overall_accuracy * 100).toFixed(1)}%`)
  console.log(`Overall Token F1:    ${(report.overall_f1 * 100).toFixed(1)}%`)
  console.log(`Avg latency:         ${report.avg_latency_ms.toFixed(0)}ms`)
  console.log(`P50 latency:         ${report.p50_latency_ms.toFixed(0)}ms`)
  console.log(`P95 latency:         ${report.p95_latency_ms.toFixed(0)}ms`)
  console.log(`Avg context tokens:  ${report.avg_memory_context_tokens.toFixed(0)}`)
  console.log('')
  console.log('Memory health at end:')
  console.log(`  Total memories:       ${report.total_memories_at_end}`)
  console.log(`  Contradictions:       ${report.contradictions_at_end}`)
  console.log(`  Superseded:           ${report.superseded_at_end}`)
  console.log('')
  console.log('By ability:')
  for (const [ability, metrics] of Object.entries(report.by_task_type)) {
    console.log(
      `  ${ability.padEnd(28)} n=${metrics.count}  Acc=${(metrics.accuracy * 100).toFixed(1)}%  F1=${(metrics.f1 * 100).toFixed(1)}%  latency=${metrics.avg_latency_ms.toFixed(0)}ms`
    )
  }
  console.log('========================================\n')
}
