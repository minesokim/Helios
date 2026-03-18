// Project HELIOS - LoCoMo Evaluation Harness
// Runs the LoCoMo benchmark (Long Context Conversation Memory) against HELIOS
//
// Protocol:
// 1. Feed conversation sessions into HELIOS memory (write path)
// 2. For each question, retrieve memory context and generate an answer
// 3. Score the answer against ground truth
// 4. Report aggregate metrics per task type

import { Helios } from '../index'
import type { HeliosConfig } from '../types'
import { generateLoCoMoDataset } from './synthetic-data'
import {
  exactMatch,
  bestTokenF1,
  rougeL,
  bleu1,
  abstentionAccuracy,
  computeAggregateMetrics,
} from './metrics'
import type { EvalResult } from './metrics'
import type {
  LoCoMoConversation,
  LoCoMoQuestion,
  EvalRun,
  EvalQuestionResult,
  AggregateReport,
  EvalConfig,
} from './types'
import { getReasoningProvider } from '../providers'

/**
 * Run the complete LoCoMo evaluation.
 */
export async function runLoCoMoEval(
  config?: Partial<HeliosConfig>,
  evalConfig?: EvalConfig
): Promise<EvalRun> {
  const runId = `locomo_${Date.now()}`
  const startedAt = new Date().toISOString()

  console.log(`[LoCoMo] Starting evaluation run: ${runId}`)

  // Initialize HELIOS with test config
  const helios = new Helios(config)

  // Load or generate dataset
  const dataset = generateLoCoMoDataset()

  console.log(
    `[LoCoMo] Dataset: ${dataset.sessions.length} sessions, ${dataset.questions.length} questions`
  )

  // Phase 1: Ingest all conversation sessions into HELIOS
  console.log('[LoCoMo] Phase 1: Ingesting conversation sessions...')
  const userId = 'eval-user-locomo'
  await ingestConversations(helios, userId, dataset)

  // Run the memory compiler to consolidate
  console.log('[LoCoMo] Phase 1.5: Running memory compiler...')
  await helios.runCompiler(userId)

  // Phase 2: Evaluate each question
  console.log('[LoCoMo] Phase 2: Evaluating questions...')
  const maxQuestions = evalConfig?.max_questions || dataset.questions.length
  const questionsToEval = dataset.questions.slice(0, maxQuestions)

  const results: EvalQuestionResult[] = []

  for (let i = 0; i < questionsToEval.length; i++) {
    const question = questionsToEval[i]
    console.log(
      `[LoCoMo] Question ${i + 1}/${questionsToEval.length}: ${question.task_type} - "${question.question.substring(0, 60)}..."`
    )

    const result = await evaluateQuestion(helios, userId, question, config || {})
    results.push(result)

    if (evalConfig?.verbose) {
      console.log(`  Prediction: "${result.prediction.substring(0, 100)}..."`)
      console.log(`  EM: ${result.exact_match.toFixed(2)}, F1: ${result.token_f1.toFixed(2)}, Latency: ${result.latency_ms}ms`)
    }
  }

  // Phase 3: Compute aggregate metrics
  console.log('[LoCoMo] Phase 3: Computing aggregate metrics...')
  const aggregate = computeLoCoMoReport(results, userId, helios)

  const completedAt = new Date().toISOString()

  console.log('[LoCoMo] Evaluation complete.')
  printLoCoMoReport(aggregate)

  return {
    run_id: runId,
    benchmark: 'locomo',
    started_at: startedAt,
    completed_at: completedAt,
    config: evalConfig || { benchmark: 'locomo' },
    results,
    aggregate,
    helios_config_snapshot: helios.getConfig() as unknown as Record<string, unknown>,
  }
}

/**
 * Ingest all conversation sessions into HELIOS memory.
 */
async function ingestConversations(
  helios: Helios,
  userId: string,
  dataset: LoCoMoConversation
): Promise<void> {
  for (const session of dataset.sessions) {
    console.log(`  Ingesting session ${session.session_id} (${session.date})...`)

    // Process turns as conversation pairs
    for (let i = 0; i < session.turns.length - 1; i += 2) {
      const userTurn = session.turns[i]
      const assistantTurn = session.turns[i + 1]

      if (!userTurn || !assistantTurn) continue
      if (userTurn.speaker_id !== 'user' || assistantTurn.speaker_id !== 'assistant') continue

      await helios.processConversationTurn(
        userId,
        userTurn.utterance,
        assistantTurn.utterance,
        {
          conversationId: `${dataset.conversation_id}_session_${session.session_id}`,
          sessionId: `session_${session.session_id}`,
        }
      )
    }
  }

  // Process any remaining backlog
  await helios.processBacklog(userId, 200)
}

/**
 * Evaluate a single question against HELIOS.
 */
async function evaluateQuestion(
  helios: Helios,
  userId: string,
  question: LoCoMoQuestion,
  config: Partial<HeliosConfig>
): Promise<EvalQuestionResult> {
  const startTime = Date.now()

  // Determine turn type based on question task type
  const turnType =
    question.task_type === 'event_summarization'
      ? 'summarizing' as const
      : question.task_type === 'temporal_qa'
        ? 'answering' as const
        : 'answering' as const

  // Get memory bundle
  const bundle = await helios.getMemoryBundle(userId, question.question, turnType)

  // Generate answer using the reasoning LLM with memory context
  const prediction = await generateAnswer(question, bundle.assembled_text, config)

  const latencyMs = Date.now() - startTime

  // Score
  const em = question.is_unanswerable
    ? 0 // Don't score EM for unanswerable
    : Array.isArray(question.answer)
      ? Math.max(...question.answer.map((a) => exactMatch(prediction, a)))
      : exactMatch(prediction, question.answer)

  const f1 = question.is_unanswerable
    ? 0
    : bestTokenF1(prediction, question.answer)

  const rouge = question.task_type === 'event_summarization' && !question.is_unanswerable
    ? rougeL(prediction, Array.isArray(question.answer) ? question.answer[0] : question.answer)
    : null

  const bleuScore = question.task_type === 'event_summarization' && !question.is_unanswerable
    ? bleu1(prediction, Array.isArray(question.answer) ? question.answer[0] : question.answer)
    : null

  const abstention = question.is_unanswerable != null
    ? abstentionAccuracy(prediction, question.is_unanswerable)
    : null

  return {
    question_id: question.question_id,
    task_type: question.task_type,
    question: question.question,
    prediction,
    ground_truth: question.answer,
    is_correct: em > 0 || f1 > 0.8,
    exact_match: em,
    token_f1: f1,
    rouge_l: rouge,
    bleu_1: bleuScore,
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

/**
 * Generate an answer to a question using the LLM with memory context.
 */
async function generateAnswer(
  question: LoCoMoQuestion,
  memoryContext: string,
  config: Partial<HeliosConfig>
): Promise<string> {
  const fullConfig = { ...require('../types').DEFAULT_CONFIG, ...config }
  const provider = getReasoningProvider(fullConfig)

  const systemPrompt = `You are answering questions about a person based on your memory of past conversations.

${memoryContext}

Rules:
- Answer based ONLY on what you remember from the conversations above.
- Be concise and direct. Give the specific answer, not a paragraph.
- If the information was updated or changed, give the CURRENT/LATEST value.
- If you genuinely do not have the information, say "I don't have that information."
- Do not make up or infer information that was not discussed.`

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
    console.error(`[LoCoMo] Failed to generate answer for ${question.question_id}:`, error)
    return 'Error generating answer.'
  }
}

/**
 * Compute the aggregate LoCoMo report.
 */
function computeLoCoMoReport(
  results: EvalQuestionResult[],
  userId: string,
  helios: Helios
): AggregateReport {
  const evalResults: EvalResult[] = results.map((r) => ({
    question_id: r.question_id,
    task_type: r.task_type,
    prediction: r.prediction,
    ground_truth: r.ground_truth,
    exact_match: r.exact_match,
    token_f1: r.token_f1,
    rouge_l: r.rouge_l ?? undefined,
    bleu_1: r.bleu_1 ?? undefined,
    abstention_accuracy: r.abstention_accuracy ?? undefined,
    latency_ms: r.latency_ms,
    tokens_used: r.tokens_used,
    memory_context_tokens: r.memory_context_tokens,
  }))

  const agg = computeAggregateMetrics(evalResults)

  return {
    benchmark: 'LoCoMo',
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
    total_memories_at_end: 0, // Will be populated from health check
    contradictions_at_end: 0,
    superseded_at_end: 0,
  }
}

function printLoCoMoReport(report: AggregateReport): void {
  console.log('\n========================================')
  console.log('  LoCoMo Evaluation Report')
  console.log('========================================')
  console.log(`Total questions: ${report.total_questions}`)
  console.log(`Overall Exact Match: ${(report.overall_accuracy * 100).toFixed(1)}%`)
  console.log(`Overall Token F1:    ${(report.overall_f1 * 100).toFixed(1)}%`)
  console.log(`Avg latency:         ${report.avg_latency_ms.toFixed(0)}ms`)
  console.log(`P50 latency:         ${report.p50_latency_ms.toFixed(0)}ms`)
  console.log(`P95 latency:         ${report.p95_latency_ms.toFixed(0)}ms`)
  console.log(`Avg context tokens:  ${report.avg_memory_context_tokens.toFixed(0)}`)
  console.log('')
  console.log('By task type:')
  for (const [type, metrics] of Object.entries(report.by_task_type)) {
    console.log(
      `  ${type.padEnd(25)} n=${metrics.count}  EM=${(metrics.accuracy * 100).toFixed(1)}%  F1=${(metrics.f1 * 100).toFixed(1)}%  latency=${metrics.avg_latency_ms.toFixed(0)}ms`
    )
  }
  console.log('========================================\n')
}
