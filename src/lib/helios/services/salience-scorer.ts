// Project HELIOS - Salience Scorer and Memory Classifier
// FR-2: Assign salience, novelty, memory class, sensitivity, and candidate write action
// Uses Ollama (local LLM) for classification to avoid API costs

import type {
  HeliosEvent,
  HeliosConfig,
  SalienceResult,
  MemoryClass,
  SensitivityLevel,
  WriteAction,
  LLMProvider,
} from '../types'
import { getReasoningProvider } from '../providers'

const SALIENCE_SYSTEM_PROMPT = `You are HELIOS, a memory classification engine. Your job is to analyze interaction events and determine:

1. SALIENCE: How important is this for long-term memory? (0.0-1.0)
   - 1.0: Critical life fact, major preference change, important commitment
   - 0.7-0.9: Meaningful personal info, project updates, stated preferences
   - 0.4-0.6: Useful context, moderate relevance
   - 0.1-0.3: Low importance, ephemeral
   - 0.0: Noise, filler, no memory value

2. NOVELTY: How new is this information likely to be? (0.0-1.0)
   - 1.0: Completely new topic or fact
   - 0.5: Update or elaboration on known topic
   - 0.0: Repetition of already-known information

3. MEMORY CLASS: Which type of memory should this become?
   - "episodic": A specific event, conversation, or experience with time context
   - "semantic": A stable fact, preference, identity detail, or domain knowledge
   - "procedural": A learned routine, habit, or "when X, do Y" pattern
   - "self_model": Information about the agent's own capabilities or limitations
   - "world_fact": A fact about external entities, their relationships, or state
   - "working": Only for short-lived task context (rarely assigned from events)

4. SENSITIVITY: How sensitive is this data?
   - "public": General knowledge, not personal
   - "personal": Personal but not sensitive (name, preferences, work info)
   - "sensitive": Financial, health, relationship details
   - "restricted": Passwords, SSNs, API keys, legal matters

5. CANDIDATE WRITE ACTION: What should the memory system do?
   - "add": New information, store it
   - "update": Modifies an existing known fact
   - "supersede": Replaces/contradicts a previous fact
   - "no_op": Not worth storing
   - "defer": Uncertain, needs more context

6. EXTRACTED SUBJECT/PREDICATE/OBJECT: Structure the memory content.
   - subject: The entity this is about (e.g., "David", "Project X", "Tennis")
   - predicate: The relationship or claim type (e.g., "prefers", "works_on", "located_in")
   - object: The value or detail (as a JSON object with relevant fields)

Respond with ONLY a JSON object matching this exact schema. No explanation.`

interface SalienceResponse {
  salience_score: number
  novelty_score: number
  memory_class: MemoryClass
  sensitivity_class: SensitivityLevel
  candidate_write_action: WriteAction
  extracted_subject: string
  extracted_predicate: string
  extracted_object: Record<string, unknown>
  reasoning: string
  memory_class_probabilities?: Record<string, number>
}

/**
 * Score an event for salience, novelty, and classify its memory type.
 * Uses the configured LLM provider (default: Ollama) for reasoning.
 */
export async function scoreEvent(
  event: HeliosEvent,
  config: HeliosConfig,
  recentContext?: string
): Promise<SalienceResult> {
  const provider = getReasoningProvider(config)

  // Build the analysis prompt with event context
  const contextBlock = recentContext
    ? `\n\nRecent conversation context (for novelty assessment):\n${recentContext}`
    : ''

  const userPrompt = `Analyze this interaction event and classify it for the memory system.

Event type: ${event.event_type}
Source: ${event.source_system}
Timestamp: ${event.created_at}
Content:
"""
${event.content}
"""

Event metadata: ${JSON.stringify(event.metadata, null, 2)}${contextBlock}

Respond with a JSON object containing: salience_score, novelty_score, memory_class, sensitivity_class, candidate_write_action, extracted_subject, extracted_predicate, extracted_object (as JSON object), reasoning.`

  try {
    const result = await provider.chatJson<SalienceResponse>(
      [
        { role: 'system', content: SALIENCE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0, max_tokens: 1024 }
    )

    // Clamp scores to valid ranges
    const salienceScore = Math.max(0, Math.min(1, result.salience_score || 0))
    const noveltyScore = Math.max(0, Math.min(1, result.novelty_score || 0))

    // Build class probabilities from the primary classification
    const classProbabilities: Record<MemoryClass, number> = {
      working: 0,
      episodic: 0,
      semantic: 0,
      procedural: 0,
      self_model: 0,
      world_fact: 0,
    }

    if (result.memory_class_probabilities) {
      for (const [cls, prob] of Object.entries(result.memory_class_probabilities)) {
        if (cls in classProbabilities) {
          classProbabilities[cls as MemoryClass] = prob
        }
      }
    } else {
      // If LLM didn't return probabilities, assign high confidence to primary class
      classProbabilities[result.memory_class] = 0.85
    }

    return {
      salience_score: salienceScore,
      novelty_score: noveltyScore,
      memory_class_probabilities: classProbabilities,
      sensitivity_class: result.sensitivity_class || 'personal',
      candidate_write_action: result.candidate_write_action || 'add',
      extracted_subject: result.extracted_subject || 'unknown',
      extracted_predicate: result.extracted_predicate || 'relates_to',
      extracted_object: result.extracted_object || { value: event.content },
      reasoning: result.reasoning || '',
    }
  } catch (error) {
    console.error('HELIOS: Salience scoring failed, using heuristic fallback:', error)
    return heuristicScore(event)
  }
}

/**
 * Batch score multiple events. Processes sequentially to avoid
 * overwhelming the local LLM.
 */
export async function scoreEventBatch(
  events: HeliosEvent[],
  config: HeliosConfig,
  recentContext?: string
): Promise<Map<string, SalienceResult>> {
  const results = new Map<string, SalienceResult>()

  for (const event of events) {
    const result = await scoreEvent(event, config, recentContext)
    results.set(event.id, result)
  }

  return results
}

/**
 * Heuristic fallback scoring when LLM is unavailable.
 * Uses metadata signals extracted during ingestion.
 */
function heuristicScore(event: HeliosEvent): SalienceResult {
  const meta = event.metadata as Record<string, unknown>
  let salience = 0.3
  let novelty = 0.5

  // Boost salience for content signals
  if (meta.has_strong_sentiment) salience += 0.15
  if (meta.has_temporal_reference) salience += 0.1
  if (meta.has_financial_content) salience += 0.2
  if (meta.is_imperative) salience += 0.05
  if (meta.contains_question) salience += 0.05

  // Boost for longer content (more likely to be substantial)
  const wordCount = (meta.word_count as number) || 0
  if (wordCount > 50) salience += 0.1
  if (wordCount > 100) salience += 0.1

  // Determine memory class from event type
  let memoryClass: MemoryClass = 'episodic'
  if (event.event_type === 'external_data') memoryClass = 'world_fact'
  if (event.event_type === 'feedback') memoryClass = 'procedural'
  if (event.event_type === 'user_message' && meta.has_strong_sentiment) memoryClass = 'semantic'

  // Determine sensitivity
  let sensitivity: SensitivityLevel = 'personal'
  if (meta.has_financial_content) sensitivity = 'sensitive'

  // Determine write action
  let writeAction: WriteAction = 'add'
  if (salience < 0.2) writeAction = 'no_op'

  salience = Math.max(0, Math.min(1, salience))

  return {
    salience_score: salience,
    novelty_score: novelty,
    memory_class_probabilities: {
      working: 0,
      episodic: memoryClass === 'episodic' ? 0.7 : 0.1,
      semantic: memoryClass === 'semantic' ? 0.7 : 0.1,
      procedural: memoryClass === 'procedural' ? 0.7 : 0.05,
      self_model: 0.02,
      world_fact: memoryClass === 'world_fact' ? 0.7 : 0.03,
    },
    sensitivity_class: sensitivity,
    candidate_write_action: writeAction,
    extracted_subject: 'unknown',
    extracted_predicate: 'relates_to',
    extracted_object: { value: event.content.substring(0, 500) },
    reasoning: 'Heuristic fallback - LLM unavailable',
  }
}
