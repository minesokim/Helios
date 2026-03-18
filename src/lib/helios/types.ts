// Project HELIOS - Core Type Definitions
// Memory operating system data model

// ============================================
// ENUMS
// ============================================

export const MEMORY_CLASSES = [
  'working',
  'episodic',
  'semantic',
  'procedural',
  'self_model',
  'world_fact',
] as const
export type MemoryClass = (typeof MEMORY_CLASSES)[number]

export const MEMORY_STATUSES = [
  'active',
  'superseded',
  'deleted',
  'decayed',
  'disputed',
  'archived',
] as const
export type MemoryStatus = (typeof MEMORY_STATUSES)[number]

export const SENSITIVITY_LEVELS = [
  'public',
  'personal',
  'sensitive',
  'restricted',
] as const
export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number]

export const MEMORY_SCOPES = [
  'user',
  'session',
  'task',
  'team',
  'world',
  'agent',
] as const
export type MemoryScope = (typeof MEMORY_SCOPES)[number]

export const DECAY_POLICIES = [
  'none',
  'standard',
  'aggressive',
  'session_only',
] as const
export type DecayPolicy = (typeof DECAY_POLICIES)[number]

export const WRITE_ACTIONS = [
  'add',
  'update',
  'merge',
  'supersede',
  'delete',
  'no_op',
  'defer',
] as const
export type WriteAction = (typeof WRITE_ACTIONS)[number]

export const EVENT_TYPES = [
  'user_message',
  'assistant_message',
  'tool_call',
  'tool_result',
  'system_event',
  'external_data',
  'user_action',
  'feedback',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const ENTITY_TYPES = [
  'person',
  'organization',
  'project',
  'product',
  'location',
  'concept',
  'event',
  'tool',
  'skill',
  'preference',
  'goal',
] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export const CONTRADICTION_TYPES = [
  'direct',
  'temporal',
  'partial',
  'implication',
] as const
export type ContradictionType = (typeof CONTRADICTION_TYPES)[number]

export const CONTRADICTION_RESOLUTIONS = [
  'unresolved',
  'a_wins',
  'b_wins',
  'merged',
  'both_valid_in_context',
] as const
export type ContradictionResolution = (typeof CONTRADICTION_RESOLUTIONS)[number]

export const MUTATION_OPERATIONS = [
  'add',
  'update',
  'merge',
  'supersede',
  'delete',
  'decay',
  'pin',
  'unpin',
  'archive',
  'restore',
  'compiler_consolidate',
  'compiler_abstract',
  'compiler_decay',
  'resolve_contradiction',
] as const
export type MutationOperation = (typeof MUTATION_OPERATIONS)[number]

export const MUTATION_TRIGGERS = [
  'system',
  'user',
  'write_engine',
  'compiler',
  'decay_job',
  'api',
] as const
export type MutationTrigger = (typeof MUTATION_TRIGGERS)[number]

export const COMPILER_JOB_TYPES = [
  'consolidate_episodes',
  'extract_procedures',
  'decay_stale',
  'resolve_contradictions',
  'health_check',
  'full_compile',
] as const
export type CompilerJobType = (typeof COMPILER_JOB_TYPES)[number]

export const BLOCK_TYPES = [
  'identity',
  'persona',
  'user_profile',
  'current_goals',
  'active_tasks',
  'critical_preferences',
  'constraints',
  'custom',
] as const
export type BlockType = (typeof BLOCK_TYPES)[number]

export const BUNDLE_TURN_TYPES = [
  'answering',
  'planning',
  'summarizing',
  'tool_use',
  'reflection',
  'recovery',
] as const
export type BundleTurnType = (typeof BUNDLE_TURN_TYPES)[number]

// ============================================
// CORE DATA MODELS
// ============================================

export interface HeliosEvent {
  id: string
  user_id: string
  event_type: EventType
  content: string
  content_hash: string
  metadata: Record<string, unknown>
  conversation_id: string | null
  session_id: string | null
  source_system: string
  salience_score: number
  novelty_score: number
  processed: boolean
  processed_at: string | null
  created_at: string
}

export interface HeliosEventInsert {
  user_id: string
  event_type: EventType
  content: string
  metadata?: Record<string, unknown>
  conversation_id?: string | null
  session_id?: string | null
  source_system?: string
}

export interface HeliosMemory {
  id: string
  user_id: string
  memory_class: MemoryClass
  subject: string
  predicate: string
  object: Record<string, unknown>
  content_text: string
  source_event_ids: string[]
  source_description: string | null
  observed_at: string
  valid_from: string
  valid_to: string | null
  confidence: number
  importance: number
  recency_score: number
  access_count: number
  last_accessed_at: string | null
  sensitivity: SensitivityLevel
  scope: MemoryScope[]
  status: MemoryStatus
  superseded_by: string | null
  decay_policy: DecayPolicy
  embedding: number[] | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface HeliosMemoryInsert {
  user_id: string
  memory_class: MemoryClass
  subject: string
  predicate: string
  object: Record<string, unknown>
  content_text: string
  source_event_ids?: string[]
  source_description?: string | null
  observed_at?: string
  valid_from?: string
  valid_to?: string | null
  confidence?: number
  importance?: number
  sensitivity?: SensitivityLevel
  scope?: MemoryScope[]
  decay_policy?: DecayPolicy
  embedding?: number[] | null
}

export interface HeliosMemoryUpdate {
  subject?: string
  predicate?: string
  object?: Record<string, unknown>
  content_text?: string
  source_event_ids?: string[]
  valid_to?: string | null
  confidence?: number
  importance?: number
  recency_score?: number
  sensitivity?: SensitivityLevel
  scope?: MemoryScope[]
  status?: MemoryStatus
  superseded_by?: string | null
  decay_policy?: DecayPolicy
  embedding?: number[] | null
}

export interface HeliosEntity {
  id: string
  user_id: string
  entity_type: EntityType
  canonical_name: string
  aliases: string[]
  description: string | null
  properties: Record<string, unknown>
  embedding: number[] | null
  confidence: number
  status: 'active' | 'merged' | 'deleted'
  merged_into: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface HeliosEntityInsert {
  user_id: string
  entity_type: EntityType
  canonical_name: string
  aliases?: string[]
  description?: string | null
  properties?: Record<string, unknown>
  embedding?: number[] | null
  confidence?: number
}

export interface HeliosEdge {
  id: string
  user_id: string
  source_entity_id: string
  target_entity_id: string
  relation_type: string
  properties: Record<string, unknown>
  weight: number
  valid_from: string
  valid_to: string | null
  source_memory_ids: string[]
  confidence: number
  status: 'active' | 'superseded' | 'deleted'
  created_at: string
  updated_at: string
}

export interface HeliosEdgeInsert {
  user_id: string
  source_entity_id: string
  target_entity_id: string
  relation_type: string
  properties?: Record<string, unknown>
  weight?: number
  valid_from?: string
  valid_to?: string | null
  source_memory_ids?: string[]
  confidence?: number
}

export interface HeliosContradiction {
  id: string
  user_id: string
  memory_a_id: string
  memory_b_id: string
  contradiction_type: ContradictionType
  description: string | null
  resolution: ContradictionResolution
  resolved_at: string | null
  confidence: number
  created_at: string
}

export interface HeliosPinnedBlock {
  id: string
  user_id: string
  block_type: BlockType
  label: string
  content: string
  priority: number
  char_limit: number
  is_active: boolean
  last_refreshed_at: string
  created_at: string
  updated_at: string
}

export interface HeliosPinnedBlockInsert {
  user_id: string
  block_type: BlockType
  label: string
  content: string
  priority?: number
  char_limit?: number
}

export interface HeliosMutation {
  id: string
  user_id: string
  memory_id: string | null
  entity_id: string | null
  edge_id: string | null
  operation: MutationOperation
  reason: string | null
  details: Record<string, unknown>
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  triggered_by: MutationTrigger
  source_event_id: string | null
  created_at: string
}

export interface HeliosCompilerState {
  id: string
  user_id: string
  job_type: CompilerJobType
  status: 'pending' | 'running' | 'completed' | 'failed'
  items_processed: number
  items_total: number
  details: Record<string, unknown>
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

// ============================================
// SERVICE INTERFACES
// ============================================

export interface SalienceResult {
  salience_score: number
  novelty_score: number
  memory_class_probabilities: Record<MemoryClass, number>
  sensitivity_class: SensitivityLevel
  candidate_write_action: WriteAction
  extracted_subject: string
  extracted_predicate: string
  extracted_object: Record<string, unknown>
  reasoning: string
}

export interface WriteDecision {
  action: WriteAction
  target_memory_id: string | null   // For update/merge/supersede
  confidence: number
  reasoning: string
  contradiction_detected: boolean
  contradiction_details: ContradictionInfo | null
}

export interface ContradictionInfo {
  type: ContradictionType
  conflicting_memory_id: string
  conflicting_content: string
  description: string
  suggested_resolution: ContradictionResolution
}

export interface RetrievalRequest {
  user_id: string
  query: string
  turn_type: BundleTurnType
  conversation_context?: string
  session_id?: string
  task_id?: string
  memory_classes?: MemoryClass[]
  max_results?: number
  min_confidence?: number
  temporal_anchor?: string   // Point in time for temporal queries
  include_superseded?: boolean
}

export interface RetrievalCandidate {
  memory: HeliosMemory
  channel: RetrievalChannel
  raw_score: number           // Channel-specific score (similarity, rank, etc.)
  composite_score: number     // Final weighted score after reranking
}

export const RETRIEVAL_CHANNELS = [
  'vector',
  'lexical',
  'graph',
  'temporal',
  'identity',
  'task',
  'procedural',
  'failure',
  'analogical',
] as const
export type RetrievalChannel = (typeof RETRIEVAL_CHANNELS)[number]

export interface RerankerWeights {
  relevance: number
  freshness: number
  authority: number
  specificity: number
  confidence: number
  safety: number
}

export interface MemoryBundle {
  turn_type: BundleTurnType
  pinned_blocks: HeliosPinnedBlock[]
  retrieved_memories: RetrievalCandidate[]
  entity_context: HeliosEntity[]
  relationship_context: HeliosEdge[]
  active_contradictions: HeliosContradiction[]
  total_token_estimate: number
  assembled_text: string
}

export interface CompilerResult {
  job_type: CompilerJobType
  memories_consolidated: number
  procedures_extracted: number
  memories_decayed: number
  contradictions_resolved: number
  new_abstractions_created: number
  health_metrics: MemoryHealth
}

export interface MemoryHealth {
  total_memories: number
  active_memories: number
  superseded_memories: number
  decayed_memories: number
  disputed_memories: number
  unresolved_contradictions: number
  total_entities: number
  total_edges: number
  pinned_blocks: number
  memories_by_class: Record<string, number>
  avg_confidence: number
  low_confidence_count: number
  stale_memory_count: number
  total_events: number
  unprocessed_events: number
}

// ============================================
// LLM PROVIDER INTERFACE
// ============================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  model: string
  tokens_used: number
}

export interface LLMProvider {
  /**
   * Send a chat completion request and get a text response.
   */
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>

  /**
   * Send a chat completion request and parse the response as JSON.
   */
  chatJson<T>(messages: LLMMessage[], options?: LLMOptions): Promise<T>

  /**
   * Generate an embedding vector for the given text.
   */
  embed(text: string): Promise<number[]>

  /**
   * Generate embedding vectors for multiple texts in batch.
   */
  embedBatch(texts: string[]): Promise<number[][]>
}

export interface LLMOptions {
  temperature?: number
  max_tokens?: number
  model_override?: string
}

// ============================================
// CONFIGURATION
// ============================================

export interface HeliosConfig {
  // LLM settings
  llm_provider: 'ollama' | 'claude' | 'openai'
  ollama_base_url: string
  ollama_reasoning_model: string      // Model for classification, write decisions, etc.
  ollama_embedding_model: string      // Model for embeddings
  embedding_dimensions: number

  // Claude fallback (for user-facing chat, not memory internals)
  claude_model_haiku: string
  claude_model_sonnet: string

  // Write path settings
  salience_threshold: number          // Min salience to trigger memory write
  novelty_threshold: number           // Min novelty to treat as new info
  max_similar_memories_for_dedup: number
  contradiction_confidence_threshold: number

  // Retrieval settings
  vector_match_threshold: number
  max_retrieval_results_per_channel: number
  max_total_retrieval_results: number
  retrieval_timeout_ms: number

  // Reranker weights
  reranker_weights: RerankerWeights

  // Memory compiler settings
  compiler_episode_batch_size: number
  compiler_min_episodes_for_procedure: number
  compiler_decay_factor: number
  compiler_min_recency: number
  compiler_stale_threshold_days: number

  // Token budgets
  max_bundle_tokens: number
  pinned_block_token_budget: number
  retrieved_memory_token_budget: number
  entity_context_token_budget: number

  // Safety
  blocked_sensitivity_levels: SensitivityLevel[]
  max_memories_per_user: number
  enable_audit_logging: boolean
}

export const DEFAULT_CONFIG: HeliosConfig = {
  llm_provider: 'ollama',
  ollama_base_url: 'http://localhost:11434',
  ollama_reasoning_model: 'llama3.1:8b',
  ollama_embedding_model: 'nomic-embed-text',
  embedding_dimensions: 1536,

  claude_model_haiku: 'claude-3-5-haiku-20241022',
  claude_model_sonnet: 'claude-sonnet-4-20250514',

  salience_threshold: 0.3,
  novelty_threshold: 0.2,
  max_similar_memories_for_dedup: 10,
  contradiction_confidence_threshold: 0.6,

  vector_match_threshold: 0.65,
  max_retrieval_results_per_channel: 15,
  max_total_retrieval_results: 40,
  retrieval_timeout_ms: 5000,

  reranker_weights: {
    relevance: 0.30,
    freshness: 0.15,
    authority: 0.10,
    specificity: 0.15,
    confidence: 0.15,
    safety: 0.15,
  },

  compiler_episode_batch_size: 50,
  compiler_min_episodes_for_procedure: 3,
  compiler_decay_factor: 0.995,
  compiler_min_recency: 0.01,
  compiler_stale_threshold_days: 30,

  max_bundle_tokens: 8000,
  pinned_block_token_budget: 2000,
  retrieved_memory_token_budget: 4000,
  entity_context_token_budget: 2000,

  blocked_sensitivity_levels: ['restricted'],
  max_memories_per_user: 100000,
  enable_audit_logging: true,
}
