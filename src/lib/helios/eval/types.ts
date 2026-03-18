// Project HELIOS - Evaluation Types
// Data structures for LoCoMo and LongMemEval benchmark harnesses

// ============================================
// COMMON TYPES
// ============================================

export interface EvalConfig {
  // Which benchmark to run
  benchmark: 'locomo' | 'longmemeval' | 'both'

  // Data source
  data_path?: string         // Path to benchmark dataset JSON
  use_synthetic?: boolean    // Generate synthetic test data if no dataset

  // Execution
  max_questions?: number     // Cap for debugging
  parallel_workers?: number  // Concurrent question evaluation
  timeout_per_question_ms?: number

  // Output
  output_path?: string       // Where to write results
  verbose?: boolean
}

// ============================================
// LoCoMo TYPES
// ============================================

/**
 * A LoCoMo conversation consists of multiple sessions between speakers,
 * spanning days/weeks/months. Each session has multiple turns.
 */
export interface LoCoMoConversation {
  conversation_id: string
  speakers: LoCoMoSpeaker[]
  sessions: LoCoMoSession[]
  questions: LoCoMoQuestion[]
}

export interface LoCoMoSpeaker {
  speaker_id: string
  name: string
  description?: string
}

export interface LoCoMoSession {
  session_id: number
  date: string               // ISO date string
  location?: string
  turns: LoCoMoTurn[]
}

export interface LoCoMoTurn {
  turn_id: number
  speaker_id: string
  utterance: string
  timestamp?: string
}

export interface LoCoMoQuestion {
  question_id: string
  question: string
  answer: string | string[]  // Acceptable answers
  task_type: LoCoMoTaskType
  category?: string          // e.g., "personal_info", "events", "preferences"
  evidence_session_ids?: number[]  // Which sessions contain the evidence
  reasoning_type?: string    // "single_hop", "multi_hop", "temporal", etc.
  is_unanswerable?: boolean  // For abstention testing
}

export const LOCOMO_TASK_TYPES = [
  'single_hop_qa',       // Answer from one piece of evidence
  'multi_hop_qa',        // Requires combining evidence across sessions
  'temporal_qa',         // Requires temporal reasoning (before/after/during)
  'open_domain_qa',      // General knowledge + conversation context
  'event_summarization', // Summarize events from conversation
] as const
export type LoCoMoTaskType = (typeof LOCOMO_TASK_TYPES)[number]

// ============================================
// LongMemEval TYPES
// ============================================

/**
 * LongMemEval tests 5 memory abilities across multi-session conversations.
 */
export interface LongMemEvalDataset {
  conversations: LongMemEvalConversation[]
  questions: LongMemEvalQuestion[]
}

export interface LongMemEvalConversation {
  conversation_id: string
  session_id: number
  turns: LongMemEvalTurn[]
  timestamp: string
}

export interface LongMemEvalTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface LongMemEvalQuestion {
  question_id: string
  question: string
  answer: string | string[]
  ability: LongMemEvalAbility
  difficulty: 'easy' | 'medium' | 'hard'
  num_sessions_required: number     // How many sessions the evidence spans
  requires_update_tracking: boolean // Does this test knowledge update handling?
  is_unanswerable: boolean          // Should the system abstain?
  evidence_session_ids: number[]
  metadata?: Record<string, unknown>
}

export const LONGMEMEVAL_ABILITIES = [
  'information_extraction',  // Recall specific facts from past sessions
  'multi_session_reasoning', // Combine info from multiple sessions
  'temporal_reasoning',      // Reason about time, order, sequence
  'knowledge_update',        // Handle changed/updated facts correctly
  'abstention',              // Know when to say "I don't know"
] as const
export type LongMemEvalAbility = (typeof LONGMEMEVAL_ABILITIES)[number]

// ============================================
// EVALUATION RUN TYPES
// ============================================

export interface EvalRun {
  run_id: string
  benchmark: 'locomo' | 'longmemeval'
  started_at: string
  completed_at?: string
  config: EvalConfig
  results: EvalQuestionResult[]
  aggregate: AggregateReport | null
  helios_config_snapshot: Record<string, unknown>
}

export interface EvalQuestionResult {
  question_id: string
  task_type: string
  question: string
  prediction: string
  ground_truth: string | string[]
  is_correct: boolean

  // Metrics
  exact_match: number
  token_f1: number
  rouge_l: number | null
  bleu_1: number | null
  abstention_accuracy: number | null
  contradiction_accuracy: number | null
  temporal_accuracy: number | null

  // Performance
  latency_ms: number
  tokens_used: number
  memory_context_tokens: number

  // Debug info
  memories_retrieved: number
  retrieval_channels_used: string[]
  write_actions_taken: string[]
  contradictions_detected: number
}

export interface AggregateReport {
  benchmark: string
  total_questions: number
  overall_accuracy: number
  overall_f1: number

  // Per-task-type breakdown
  by_task_type: Record<
    string,
    {
      count: number
      accuracy: number
      f1: number
      avg_latency_ms: number
    }
  >

  // Performance
  avg_latency_ms: number
  p50_latency_ms: number
  p95_latency_ms: number
  total_tokens_used: number
  avg_memory_context_tokens: number

  // Memory system health
  total_memories_at_end: number
  contradictions_at_end: number
  superseded_at_end: number

  // Comparison baselines
  vs_full_context?: {
    accuracy_delta: number
    latency_delta_ms: number
    token_savings_pct: number
  }
}
