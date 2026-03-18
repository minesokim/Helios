// Project HELIOS - Bundle Assembler
// FR-8: Produce memory bundles tailored to turn type
// Assembles pinned blocks + retrieved memories + entity context into
// a token-budgeted text block for injection into the LLM prompt

import type {
  MemoryBundle,
  BundleTurnType,
  RetrievalCandidate,
  HeliosMemory,
  HeliosPinnedBlock,
  HeliosEntity,
  HeliosEdge,
  HeliosContradiction,
  HeliosConfig,
  RetrievalRequest,
} from '../types'
import { getPinnedBlocks, getUnresolvedContradictions } from '../stores/memory-store'
import { retrieveFromAllChannels } from './retrieval-council'
import { rerankCandidates } from './reranker'
import { estimateTokens } from './event-ingester'

/**
 * Assemble a complete memory bundle for a given turn.
 * This is the primary interface for the serving layer to get memory context.
 */
export async function assembleBundle(
  request: RetrievalRequest,
  config: HeliosConfig
): Promise<MemoryBundle> {
  // Step 1: Get pinned blocks (always in context)
  const pinnedBlocks = await getPinnedBlocks(request.user_id)

  // Step 2: Run multi-channel retrieval
  const rawCandidates = await retrieveFromAllChannels(request, config)

  // Step 3: Rerank candidates
  const rankedCandidates = rerankCandidates(rawCandidates, request.turn_type, config)

  // Step 4: Get active contradictions (for transparency)
  const contradictions = await getUnresolvedContradictions(request.user_id, 5)

  // Step 5: Extract entity context from retrieved memories
  const { entities, edges } = extractEntityContext(rankedCandidates)

  // Step 6: Budget-aware assembly
  const assembled = assembleBudgetedText(
    pinnedBlocks,
    rankedCandidates,
    entities,
    edges,
    contradictions,
    request.turn_type,
    config
  )

  return {
    turn_type: request.turn_type,
    pinned_blocks: pinnedBlocks,
    retrieved_memories: assembled.includedMemories,
    entity_context: entities,
    relationship_context: edges,
    active_contradictions: contradictions,
    total_token_estimate: assembled.totalTokens,
    assembled_text: assembled.text,
  }
}

/**
 * Extract entities and edges mentioned in retrieved memories.
 */
function extractEntityContext(
  candidates: RetrievalCandidate[]
): { entities: HeliosEntity[]; edges: HeliosEdge[] } {
  // For now, entity context is derived from memory subjects.
  // A more sophisticated version would query the entity graph.
  return { entities: [], edges: [] }
}

/**
 * Assemble the final text within token budgets.
 * Priority order: pinned blocks > high-score memories > entity context > contradictions
 */
function assembleBudgetedText(
  pinnedBlocks: HeliosPinnedBlock[],
  rankedCandidates: RetrievalCandidate[],
  entities: HeliosEntity[],
  edges: HeliosEdge[],
  contradictions: HeliosContradiction[],
  turnType: BundleTurnType,
  config: HeliosConfig
): {
  text: string
  totalTokens: number
  includedMemories: RetrievalCandidate[]
} {
  const sections: string[] = []
  let tokenBudget = config.max_bundle_tokens
  const includedMemories: RetrievalCandidate[] = []

  // Section 1: Pinned blocks (highest priority, always included)
  const pinnedSection = assemblePinnedBlocks(pinnedBlocks, config.pinned_block_token_budget)
  if (pinnedSection) {
    const pinnedTokens = estimateTokens(pinnedSection)
    if (pinnedTokens <= tokenBudget) {
      sections.push(pinnedSection)
      tokenBudget -= pinnedTokens
    }
  }

  // Section 2: Retrieved memories (bulk of the budget)
  const memoryBudget = Math.min(tokenBudget * 0.8, config.retrieved_memory_token_budget)
  const memorySection = assembleMemories(
    rankedCandidates,
    memoryBudget,
    turnType,
    includedMemories
  )
  if (memorySection) {
    const memoryTokens = estimateTokens(memorySection)
    sections.push(memorySection)
    tokenBudget -= memoryTokens
  }

  // Section 3: Entity context (if budget remains)
  if (entities.length > 0 && tokenBudget > 200) {
    const entityBudget = Math.min(tokenBudget, config.entity_context_token_budget)
    const entitySection = assembleEntityContext(entities, edges, entityBudget)
    if (entitySection) {
      const entityTokens = estimateTokens(entitySection)
      sections.push(entitySection)
      tokenBudget -= entityTokens
    }
  }

  // Section 4: Active contradictions warning (if any, small budget)
  if (contradictions.length > 0 && tokenBudget > 100) {
    const contradictionSection = assembleContradictions(contradictions)
    if (contradictionSection) {
      sections.push(contradictionSection)
    }
  }

  const text = sections.join('\n\n')
  const totalTokens = estimateTokens(text)

  return { text, totalTokens, includedMemories }
}

/**
 * Assemble pinned blocks into a formatted section.
 */
function assemblePinnedBlocks(blocks: HeliosPinnedBlock[], budget: number): string | null {
  if (blocks.length === 0) return null

  const lines: string[] = ['## Active Context']
  let tokens = estimateTokens('## Active Context\n')

  // Sort by priority (highest first)
  const sorted = [...blocks].sort((a, b) => b.priority - a.priority)

  for (const block of sorted) {
    const blockText = `### ${block.label}\n${block.content}`
    const blockTokens = estimateTokens(blockText)

    if (tokens + blockTokens > budget) break
    lines.push(blockText)
    tokens += blockTokens
  }

  return lines.length > 1 ? lines.join('\n\n') : null
}

/**
 * Assemble retrieved memories into a formatted section.
 */
function assembleMemories(
  candidates: RetrievalCandidate[],
  budget: number,
  turnType: BundleTurnType,
  includedRef: RetrievalCandidate[]
): string | null {
  if (candidates.length === 0) return null

  const header = getMemorySectionHeader(turnType)
  const lines: string[] = [header]
  let tokens = estimateTokens(header + '\n')

  for (const candidate of candidates) {
    const mem = candidate.memory
    const formatted = formatMemoryForPrompt(mem, candidate)
    const memTokens = estimateTokens(formatted)

    if (tokens + memTokens > budget) break

    lines.push(formatted)
    tokens += memTokens
    includedRef.push(candidate)
  }

  return lines.length > 1 ? lines.join('\n') : null
}

/**
 * Format a single memory for prompt injection.
 * Concise but informative.
 */
function formatMemoryForPrompt(
  mem: HeliosMemory,
  candidate: RetrievalCandidate
): string {
  const parts: string[] = []

  // Class indicator
  const classIcon = getClassIcon(mem.memory_class)

  // Validity indicator
  let validityNote = ''
  if (mem.valid_to) {
    const validTo = new Date(mem.valid_to)
    if (validTo < new Date()) {
      validityNote = ' [EXPIRED]'
    }
  }

  // Confidence indicator
  const confNote = mem.confidence < 0.4 ? ' [low confidence]' : ''

  // Status indicator
  const statusNote = mem.status === 'disputed' ? ' [DISPUTED]' : ''

  parts.push(
    `${classIcon} ${mem.content_text}${validityNote}${confNote}${statusNote}`
  )

  return parts.join('')
}

/**
 * Get section header based on turn type.
 */
function getMemorySectionHeader(turnType: BundleTurnType): string {
  switch (turnType) {
    case 'answering':
      return '## What you remember'
    case 'planning':
      return '## Relevant context for planning'
    case 'summarizing':
      return '## Background knowledge'
    case 'tool_use':
      return '## Relevant context'
    case 'reflection':
      return '## Self-knowledge and past experience'
    case 'recovery':
      return '## Past failures and lessons learned'
    default:
      return '## Memory context'
  }
}

/**
 * Get a class indicator icon/prefix.
 */
function getClassIcon(memoryClass: string): string {
  switch (memoryClass) {
    case 'semantic':
      return '[fact]'
    case 'episodic':
      return '[event]'
    case 'procedural':
      return '[procedure]'
    case 'self_model':
      return '[self]'
    case 'world_fact':
      return '[world]'
    case 'working':
      return '[active]'
    default:
      return '[-]'
  }
}

/**
 * Assemble entity context section.
 */
function assembleEntityContext(
  entities: HeliosEntity[],
  edges: HeliosEdge[],
  budget: number
): string | null {
  if (entities.length === 0) return null

  const lines: string[] = ['## Known entities']
  let tokens = estimateTokens('## Known entities\n')

  for (const entity of entities) {
    const line = `- ${entity.canonical_name} (${entity.entity_type}): ${entity.description || 'No description'}`
    const lineTokens = estimateTokens(line)
    if (tokens + lineTokens > budget) break
    lines.push(line)
    tokens += lineTokens
  }

  if (edges.length > 0) {
    lines.push('')
    lines.push('Relationships:')
    for (const edge of edges.slice(0, 10)) {
      const line = `- ${edge.relation_type} (confidence: ${edge.confidence.toFixed(2)})`
      const lineTokens = estimateTokens(line)
      if (tokens + lineTokens > budget) break
      lines.push(line)
      tokens += lineTokens
    }
  }

  return lines.length > 1 ? lines.join('\n') : null
}

/**
 * Assemble contradictions warning section.
 */
function assembleContradictions(contradictions: HeliosContradiction[]): string | null {
  if (contradictions.length === 0) return null

  const lines = [
    '## Unresolved contradictions',
    `Note: There are ${contradictions.length} unresolved contradiction(s) in memory. Some recalled facts may be inconsistent.`,
  ]

  return lines.join('\n')
}
