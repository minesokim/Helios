// Project HELIOS - Synthetic Test Data Generator
// Generates realistic multi-session conversations with ground-truth QA pairs
// for evaluating memory systems without requiring external benchmark datasets.
//
// Each generated dataset exercises all LoCoMo task types and LongMemEval abilities:
// - Single-hop recall (simple facts)
// - Multi-hop reasoning (combining facts across sessions)
// - Temporal reasoning (ordering, time-based queries)
// - Knowledge updates (facts that change over time)
// - Abstention (questions about never-discussed topics)
// - Contradiction handling (conflicting statements)

import type {
  LoCoMoConversation,
  LoCoMoSession,
  LoCoMoTurn,
  LoCoMoQuestion,
  LoCoMoSpeaker,
  LongMemEvalDataset,
  LongMemEvalConversation,
  LongMemEvalQuestion,
  LongMemEvalAbility,
  LoCoMoTaskType,
} from './types'

// ============================================
// SEED DATA: Facts, preferences, events that form the ground truth
// ============================================

interface GroundTruthFact {
  id: string
  subject: string
  predicate: string
  value: string
  session_introduced: number
  session_updated?: number     // If fact changes
  updated_value?: string       // New value after update
  category: string
}

const GROUND_TRUTH_FACTS: GroundTruthFact[] = [
  // Personal info (stable)
  { id: 'f1', subject: 'David', predicate: 'lives_in', value: 'San Francisco', session_introduced: 1, category: 'personal_info' },
  { id: 'f2', subject: 'David', predicate: 'occupation', value: 'founder of Noctworks, an AI agency', session_introduced: 1, category: 'personal_info' },
  { id: 'f3', subject: 'David', predicate: 'plays_sport', value: 'tennis with a semi-western grip', session_introduced: 2, category: 'personal_info' },
  { id: 'f4', subject: 'David', predicate: 'business_partner', value: 'Haokun handles development', session_introduced: 1, category: 'personal_info' },
  { id: 'f5', subject: 'David', predicate: 'sales_partner', value: 'Johnny manages sales and marketing', session_introduced: 3, category: 'personal_info' },

  // Preferences (some change over time)
  { id: 'f6', subject: 'David', predicate: 'preferred_coffee', value: 'oat milk latte', session_introduced: 1, session_updated: 5, updated_value: 'black coffee, no sugar', category: 'preferences' },
  { id: 'f7', subject: 'David', predicate: 'work_hours', value: 'night owl, most productive after 10pm', session_introduced: 2, category: 'preferences' },
  { id: 'f8', subject: 'David', predicate: 'communication_style', value: 'dislikes AI-sounding responses, prefers natural conversation', session_introduced: 1, category: 'preferences' },
  { id: 'f9', subject: 'David', predicate: 'meeting_preference', value: 'no meetings before noon', session_introduced: 3, session_updated: 7, updated_value: 'flexible on meeting times now', category: 'preferences' },

  // Projects (evolving)
  { id: 'f10', subject: 'Jane AI', predicate: 'description', value: 'financial command center for Mary Cramer', session_introduced: 2, category: 'projects' },
  { id: 'f11', subject: 'Jane AI', predicate: 'tech_stack', value: 'Gemini for document processing, Claude for conversations', session_introduced: 2, category: 'projects' },
  { id: 'f12', subject: 'Mary Cramer', predicate: 'description', value: '70-year-old entrepreneur with cannabis, real estate, and aircraft businesses', session_introduced: 2, category: 'projects' },
  { id: 'f13', subject: 'Project Helios', predicate: 'description', value: 'personal JARVIS-style assistant with memory system', session_introduced: 4, category: 'projects' },
  { id: 'f14', subject: 'Project Helios', predicate: 'status', value: 'in early development', session_introduced: 4, session_updated: 8, updated_value: 'Phase 0 complete, memory system built', category: 'projects' },

  // Events (specific dates)
  { id: 'f15', subject: 'David', predicate: 'attended_event', value: 'AI startup meetup in SOMA', session_introduced: 3, category: 'events' },
  { id: 'f16', subject: 'David', predicate: 'client_meeting', value: 'demo for Mary Cramer and Jim the attorney', session_introduced: 4, category: 'events' },
  { id: 'f17', subject: 'David', predicate: 'won_deal', value: 'signed contract with Mary Cramer for $15,000/month', session_introduced: 6, category: 'events' },
  { id: 'f18', subject: 'David', predicate: 'tennis_match', value: 'beat Alex 6-4 6-3 at Golden Gate Park', session_introduced: 5, category: 'events' },

  // Financial facts
  { id: 'f19', subject: 'Noctworks', predicate: 'monthly_revenue', value: '$8,000', session_introduced: 3, session_updated: 6, updated_value: '$23,000', category: 'financial' },
  { id: 'f20', subject: 'David', predicate: 'savings_goal', value: '$50,000 emergency fund by end of year', session_introduced: 4, category: 'financial' },

  // Relationships
  { id: 'f21', subject: 'Jim', predicate: 'role', value: 'Mary Cramer\'s attorney, skeptical of vendors', session_introduced: 2, category: 'relationships' },
  { id: 'f22', subject: 'Alex', predicate: 'relationship', value: 'David\'s tennis partner and college friend', session_introduced: 5, category: 'relationships' },

  // Technical decisions
  { id: 'f23', subject: 'David', predicate: 'prefers_model', value: 'Claude over GPT for conversation quality', session_introduced: 3, category: 'technical' },
  { id: 'f24', subject: 'David', predicate: 'hosting', value: 'uses Supabase for all database needs', session_introduced: 1, category: 'technical' },
]

// ============================================
// SESSION TEMPLATES
// ============================================

interface SessionTemplate {
  session_id: number
  date: string
  topic: string
  facts_introduced: string[]  // Fact IDs
  facts_updated?: string[]    // Fact IDs that get updated in this session
}

const SESSION_TEMPLATES: SessionTemplate[] = [
  {
    session_id: 1,
    date: '2025-11-01',
    topic: 'Initial setup and getting to know David',
    facts_introduced: ['f1', 'f2', 'f4', 'f6', 'f8', 'f24'],
  },
  {
    session_id: 2,
    date: '2025-11-05',
    topic: 'Jane AI project discussion',
    facts_introduced: ['f3', 'f7', 'f10', 'f11', 'f12', 'f21'],
  },
  {
    session_id: 3,
    date: '2025-11-12',
    topic: 'Business growth and AI meetup',
    facts_introduced: ['f5', 'f9', 'f15', 'f19', 'f23'],
  },
  {
    session_id: 4,
    date: '2025-11-20',
    topic: 'Project Helios kickoff and client demo',
    facts_introduced: ['f13', 'f14', 'f16', 'f20'],
  },
  {
    session_id: 5,
    date: '2025-12-01',
    topic: 'Tennis, coffee change, and life update',
    facts_introduced: ['f18', 'f22'],
    facts_updated: ['f6'],
  },
  {
    session_id: 6,
    date: '2025-12-10',
    topic: 'Mary Cramer deal signed, revenue update',
    facts_introduced: ['f17'],
    facts_updated: ['f19'],
  },
  {
    session_id: 7,
    date: '2025-12-20',
    topic: 'End of year reflection and schedule changes',
    facts_introduced: [],
    facts_updated: ['f9'],
  },
  {
    session_id: 8,
    date: '2026-01-10',
    topic: 'New year, Helios progress update',
    facts_introduced: [],
    facts_updated: ['f14'],
  },
]

// ============================================
// CONVERSATION GENERATION
// ============================================

function getFactById(id: string): GroundTruthFact | undefined {
  return GROUND_TRUTH_FACTS.find((f) => f.id === id)
}

function generateSessionTurns(template: SessionTemplate): LoCoMoTurn[] {
  const turns: LoCoMoTurn[] = []
  let turnId = 0

  // Opening
  turns.push({
    turn_id: turnId++,
    speaker_id: 'user',
    utterance: getSessionOpener(template),
  })

  turns.push({
    turn_id: turnId++,
    speaker_id: 'assistant',
    utterance: getAssistantResponse(template, 'opening'),
  })

  // Introduce facts
  for (const factId of template.facts_introduced) {
    const fact = getFactById(factId)
    if (!fact) continue

    turns.push({
      turn_id: turnId++,
      speaker_id: 'user',
      utterance: generateFactIntroduction(fact),
    })

    turns.push({
      turn_id: turnId++,
      speaker_id: 'assistant',
      utterance: generateFactAcknowledgment(fact),
    })
  }

  // Update facts
  if (template.facts_updated) {
    for (const factId of template.facts_updated) {
      const fact = getFactById(factId)
      if (!fact || !fact.updated_value) continue

      turns.push({
        turn_id: turnId++,
        speaker_id: 'user',
        utterance: generateFactUpdate(fact),
      })

      turns.push({
        turn_id: turnId++,
        speaker_id: 'assistant',
        utterance: `Got it. I'll remember that ${fact.subject} ${fact.predicate.replace(/_/g, ' ')} is now "${fact.updated_value}" instead of "${fact.value}".`,
      })
    }
  }

  // Closing
  turns.push({
    turn_id: turnId++,
    speaker_id: 'user',
    utterance: 'Alright, that is all for now. Talk later.',
  })

  turns.push({
    turn_id: turnId++,
    speaker_id: 'assistant',
    utterance: 'Sounds good. Have a great rest of your day.',
  })

  return turns
}

function getSessionOpener(template: SessionTemplate): string {
  const openers = [
    `Hey, wanted to catch up about ${template.topic.toLowerCase()}.`,
    `Got some updates. Let's talk about ${template.topic.toLowerCase()}.`,
    `Quick check-in. ${template.topic}.`,
    `Back again. Need to discuss ${template.topic.toLowerCase()}.`,
  ]
  return openers[template.session_id % openers.length]
}

function getAssistantResponse(template: SessionTemplate, type: string): string {
  if (type === 'opening') {
    return `Hey! Good to hear from you. What's on your mind about ${template.topic.toLowerCase()}?`
  }
  return 'Got it.'
}

function generateFactIntroduction(fact: GroundTruthFact): string {
  const templates: Record<string, (f: GroundTruthFact) => string> = {
    personal_info: (f) => {
      switch (f.predicate) {
        case 'lives_in': return `By the way, I live in ${f.value}.`
        case 'occupation': return `So I am a ${f.value}.`
        case 'plays_sport': return `I have been playing ${f.value} lately.`
        case 'business_partner': return `My business partner ${f.value}.`
        case 'sales_partner': return `Also, ${f.value}.`
        default: return `About me: ${f.value}.`
      }
    },
    preferences: (f) => {
      switch (f.predicate) {
        case 'preferred_coffee': return `I always get a ${f.value} in the morning.`
        case 'work_hours': return `I am a ${f.value}.`
        case 'communication_style': return `One thing - I ${f.value.toLowerCase()}.`
        case 'meeting_preference': return `FYI, ${f.value}.`
        default: return `I prefer ${f.value}.`
      }
    },
    projects: (f) => `${f.subject} is a ${f.value}.`,
    events: (f) => {
      switch (f.predicate) {
        case 'attended_event': return `I went to an ${f.value} last week.`
        case 'client_meeting': return `Had a ${f.value} today.`
        case 'won_deal': return `Great news - I ${f.value}!`
        case 'tennis_match': return `Played tennis yesterday. ${f.value}.`
        default: return `Something happened: ${f.value}.`
      }
    },
    financial: (f) => {
      switch (f.predicate) {
        case 'monthly_revenue': return `Noctworks is doing ${f.value} per month now.`
        case 'savings_goal': return `My goal is ${f.value}.`
        default: return `Financial update: ${f.value}.`
      }
    },
    relationships: (f) => `${f.subject} is ${f.value}.`,
    technical: (f) => {
      switch (f.predicate) {
        case 'prefers_model': return `I ${f.value}.`
        case 'hosting': return `I ${f.value}.`
        default: return `Technical note: ${f.value}.`
      }
    },
  }

  const generator = templates[fact.category]
  return generator ? generator(fact) : `${fact.subject} ${fact.predicate}: ${fact.value}.`
}

function generateFactAcknowledgment(fact: GroundTruthFact): string {
  const acks = [
    `Noted. I will remember that.`,
    `Got it, thanks for sharing.`,
    `Interesting. I will keep that in mind.`,
    `Makes sense. Good to know.`,
  ]
  return acks[Math.abs(fact.id.charCodeAt(1)) % acks.length]
}

function generateFactUpdate(fact: GroundTruthFact): string {
  return `Actually, update on the ${fact.predicate.replace(/_/g, ' ')} thing. It has changed. Now it is "${fact.updated_value}" instead of "${fact.value}".`
}

// ============================================
// QUESTION GENERATION
// ============================================

function generateLoCoMoQuestions(): LoCoMoQuestion[] {
  const questions: LoCoMoQuestion[] = []
  let qId = 0

  // SINGLE-HOP QA: Direct recall of a single fact
  questions.push({
    question_id: `locomo_sh_${qId++}`,
    question: 'Where does David live?',
    answer: ['San Francisco'],
    task_type: 'single_hop_qa',
    category: 'personal_info',
    evidence_session_ids: [1],
    reasoning_type: 'single_hop',
  })

  questions.push({
    question_id: `locomo_sh_${qId++}`,
    question: 'What sport does David play?',
    answer: ['tennis', 'tennis with a semi-western grip'],
    task_type: 'single_hop_qa',
    category: 'personal_info',
    evidence_session_ids: [2],
    reasoning_type: 'single_hop',
  })

  questions.push({
    question_id: `locomo_sh_${qId++}`,
    question: 'Who is David\'s business partner?',
    answer: ['Haokun', 'Haokun handles development'],
    task_type: 'single_hop_qa',
    category: 'personal_info',
    evidence_session_ids: [1],
    reasoning_type: 'single_hop',
  })

  questions.push({
    question_id: `locomo_sh_${qId++}`,
    question: 'What is Jane AI?',
    answer: ['financial command center for Mary Cramer', 'a financial command center'],
    task_type: 'single_hop_qa',
    category: 'projects',
    evidence_session_ids: [2],
    reasoning_type: 'single_hop',
  })

  questions.push({
    question_id: `locomo_sh_${qId++}`,
    question: 'What is David\'s savings goal?',
    answer: ['$50,000 emergency fund by end of year', '$50,000', '50000'],
    task_type: 'single_hop_qa',
    category: 'financial',
    evidence_session_ids: [4],
    reasoning_type: 'single_hop',
  })

  // MULTI-HOP QA: Requires combining facts from multiple sessions
  questions.push({
    question_id: `locomo_mh_${qId++}`,
    question: 'Who manages development for the company that David founded?',
    answer: ['Haokun'],
    task_type: 'multi_hop_qa',
    category: 'personal_info',
    evidence_session_ids: [1],
    reasoning_type: 'multi_hop',
  })

  questions.push({
    question_id: `locomo_mh_${qId++}`,
    question: 'What AI model does the project for Mary Cramer use for document processing?',
    answer: ['Gemini'],
    task_type: 'multi_hop_qa',
    category: 'projects',
    evidence_session_ids: [2],
    reasoning_type: 'multi_hop',
  })

  questions.push({
    question_id: `locomo_mh_${qId++}`,
    question: 'How much does David\'s agency earn per month now and who is his biggest client?',
    answer: ['$23,000 per month, Mary Cramer', '$23,000 and Mary Cramer'],
    task_type: 'multi_hop_qa',
    category: 'financial',
    evidence_session_ids: [3, 6],
    reasoning_type: 'multi_hop',
  })

  // TEMPORAL QA: Time-ordered reasoning
  questions.push({
    question_id: `locomo_tq_${qId++}`,
    question: 'What coffee did David prefer before he switched to black coffee?',
    answer: ['oat milk latte'],
    task_type: 'temporal_qa',
    category: 'preferences',
    evidence_session_ids: [1, 5],
    reasoning_type: 'temporal',
  })

  questions.push({
    question_id: `locomo_tq_${qId++}`,
    question: 'Did David sign the Mary Cramer deal before or after he started working on Project Helios?',
    answer: ['after', 'after he started working on Project Helios'],
    task_type: 'temporal_qa',
    category: 'events',
    evidence_session_ids: [4, 6],
    reasoning_type: 'temporal',
  })

  questions.push({
    question_id: `locomo_tq_${qId++}`,
    question: 'What was Noctworks\' monthly revenue before the Mary Cramer deal?',
    answer: ['$8,000'],
    task_type: 'temporal_qa',
    category: 'financial',
    evidence_session_ids: [3],
    reasoning_type: 'temporal',
  })

  questions.push({
    question_id: `locomo_tq_${qId++}`,
    question: 'What is David\'s current meeting preference?',
    answer: ['flexible on meeting times now', 'flexible on meeting times'],
    task_type: 'temporal_qa',
    category: 'preferences',
    evidence_session_ids: [3, 7],
    reasoning_type: 'temporal',
  })

  // EVENT SUMMARIZATION
  questions.push({
    question_id: `locomo_es_${qId++}`,
    question: 'Summarize the major business milestones David achieved between November and December 2025.',
    answer: [
      'David attended an AI startup meetup, had a demo for Mary Cramer, signed a $15,000/month contract with her, and grew Noctworks revenue from $8,000 to $23,000 per month.',
    ],
    task_type: 'event_summarization',
    category: 'events',
    evidence_session_ids: [3, 4, 6],
    reasoning_type: 'multi_hop',
  })

  // OPEN DOMAIN: Requires general knowledge combined with conversation context
  questions.push({
    question_id: `locomo_od_${qId++}`,
    question: 'David plays tennis. What grip style does he use and on what surface?',
    answer: ['semi-western grip on hard courts', 'semi-western grip'],
    task_type: 'open_domain_qa',
    category: 'personal_info',
    evidence_session_ids: [2],
    reasoning_type: 'single_hop',
  })

  // UNANSWERABLE (for abstention testing)
  questions.push({
    question_id: `locomo_ua_${qId++}`,
    question: 'What is David\'s favorite restaurant?',
    answer: [],
    task_type: 'single_hop_qa',
    category: 'preferences',
    is_unanswerable: true,
  })

  questions.push({
    question_id: `locomo_ua_${qId++}`,
    question: 'How many employees does Noctworks have?',
    answer: [],
    task_type: 'single_hop_qa',
    category: 'financial',
    is_unanswerable: true,
  })

  return questions
}

function generateLongMemEvalQuestions(): LongMemEvalQuestion[] {
  const questions: LongMemEvalQuestion[] = []
  let qId = 0

  // INFORMATION EXTRACTION
  questions.push({
    question_id: `lme_ie_${qId++}`,
    question: 'What is David\'s occupation?',
    answer: ['founder of Noctworks, an AI agency', 'founder of Noctworks'],
    ability: 'information_extraction',
    difficulty: 'easy',
    num_sessions_required: 1,
    requires_update_tracking: false,
    is_unanswerable: false,
    evidence_session_ids: [1],
  })

  questions.push({
    question_id: `lme_ie_${qId++}`,
    question: 'Who is Jim in relation to Mary Cramer?',
    answer: ['her attorney', 'Mary Cramer\'s attorney, skeptical of vendors'],
    ability: 'information_extraction',
    difficulty: 'easy',
    num_sessions_required: 1,
    requires_update_tracking: false,
    is_unanswerable: false,
    evidence_session_ids: [2],
  })

  questions.push({
    question_id: `lme_ie_${qId++}`,
    question: 'What is Project Helios?',
    answer: ['personal JARVIS-style assistant with memory system', 'a personal JARVIS-style assistant'],
    ability: 'information_extraction',
    difficulty: 'easy',
    num_sessions_required: 1,
    requires_update_tracking: false,
    is_unanswerable: false,
    evidence_session_ids: [4],
  })

  // MULTI-SESSION REASONING
  questions.push({
    question_id: `lme_ms_${qId++}`,
    question: 'What are all the people David works with and their roles?',
    answer: ['Haokun handles development, Johnny manages sales and marketing'],
    ability: 'multi_session_reasoning',
    difficulty: 'medium',
    num_sessions_required: 2,
    requires_update_tracking: false,
    is_unanswerable: false,
    evidence_session_ids: [1, 3],
  })

  questions.push({
    question_id: `lme_ms_${qId++}`,
    question: 'How did Noctworks revenue change over time and what caused the biggest increase?',
    answer: ['Revenue grew from $8,000 to $23,000 per month, primarily from signing Mary Cramer\'s $15,000/month contract'],
    ability: 'multi_session_reasoning',
    difficulty: 'hard',
    num_sessions_required: 3,
    requires_update_tracking: true,
    is_unanswerable: false,
    evidence_session_ids: [3, 6],
  })

  // TEMPORAL REASONING
  questions.push({
    question_id: `lme_tr_${qId++}`,
    question: 'List the major events in David\'s life in chronological order from November to December 2025.',
    answer: ['AI startup meetup, client demo with Mary and Jim, tennis match against Alex, signed Mary Cramer contract'],
    ability: 'temporal_reasoning',
    difficulty: 'hard',
    num_sessions_required: 4,
    requires_update_tracking: false,
    is_unanswerable: false,
    evidence_session_ids: [3, 4, 5, 6],
  })

  questions.push({
    question_id: `lme_tr_${qId++}`,
    question: 'When David first discussed Project Helios, what was its status, and what is it now?',
    answer: ['Initially in early development, now Phase 0 complete with memory system built'],
    ability: 'temporal_reasoning',
    difficulty: 'medium',
    num_sessions_required: 2,
    requires_update_tracking: true,
    is_unanswerable: false,
    evidence_session_ids: [4, 8],
  })

  // KNOWLEDGE UPDATE
  questions.push({
    question_id: `lme_ku_${qId++}`,
    question: 'What coffee does David drink now?',
    answer: ['black coffee, no sugar', 'black coffee'],
    ability: 'knowledge_update',
    difficulty: 'medium',
    num_sessions_required: 2,
    requires_update_tracking: true,
    is_unanswerable: false,
    evidence_session_ids: [1, 5],
  })

  questions.push({
    question_id: `lme_ku_${qId++}`,
    question: 'What is David\'s current stance on meeting times?',
    answer: ['flexible on meeting times now', 'flexible on meeting times'],
    ability: 'knowledge_update',
    difficulty: 'medium',
    num_sessions_required: 2,
    requires_update_tracking: true,
    is_unanswerable: false,
    evidence_session_ids: [3, 7],
  })

  questions.push({
    question_id: `lme_ku_${qId++}`,
    question: 'What is Noctworks\' current monthly revenue?',
    answer: ['$23,000'],
    ability: 'knowledge_update',
    difficulty: 'easy',
    num_sessions_required: 2,
    requires_update_tracking: true,
    is_unanswerable: false,
    evidence_session_ids: [3, 6],
  })

  // ABSTENTION
  questions.push({
    question_id: `lme_ab_${qId++}`,
    question: 'What programming language does David prefer?',
    answer: [],
    ability: 'abstention',
    difficulty: 'easy',
    num_sessions_required: 0,
    requires_update_tracking: false,
    is_unanswerable: true,
    evidence_session_ids: [],
  })

  questions.push({
    question_id: `lme_ab_${qId++}`,
    question: 'What is David\'s home address?',
    answer: [],
    ability: 'abstention',
    difficulty: 'easy',
    num_sessions_required: 0,
    requires_update_tracking: false,
    is_unanswerable: true,
    evidence_session_ids: [],
  })

  questions.push({
    question_id: `lme_ab_${qId++}`,
    question: 'How many clients does Noctworks currently have?',
    answer: [],
    ability: 'abstention',
    difficulty: 'medium',
    num_sessions_required: 0,
    requires_update_tracking: false,
    is_unanswerable: true,
    evidence_session_ids: [],
  })

  return questions
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Generate a complete LoCoMo-format conversation dataset with ground-truth QA.
 */
export function generateLoCoMoDataset(): LoCoMoConversation {
  const speakers: LoCoMoSpeaker[] = [
    { speaker_id: 'user', name: 'David', description: 'Noctworks founder, AI agency owner' },
    { speaker_id: 'assistant', name: 'Helios', description: 'AI personal assistant' },
  ]

  const sessions: LoCoMoSession[] = SESSION_TEMPLATES.map((template) => ({
    session_id: template.session_id,
    date: template.date,
    turns: generateSessionTurns(template),
  }))

  const questions = generateLoCoMoQuestions()

  return {
    conversation_id: 'helios_eval_001',
    speakers,
    sessions,
    questions,
  }
}

/**
 * Generate a complete LongMemEval-format dataset with ground-truth QA.
 */
export function generateLongMemEvalDataset(): LongMemEvalDataset {
  const conversations: LongMemEvalConversation[] = SESSION_TEMPLATES.map((template) => {
    const turns = generateSessionTurns(template)
    return {
      conversation_id: `helios_eval_001`,
      session_id: template.session_id,
      turns: turns.map((t) => ({
        role: t.speaker_id as 'user' | 'assistant',
        content: t.utterance,
      })),
      timestamp: template.date,
    }
  })

  const questions = generateLongMemEvalQuestions()

  return { conversations, questions }
}

/**
 * Get the ground truth facts for validation and debugging.
 */
export function getGroundTruthFacts(): GroundTruthFact[] {
  return [...GROUND_TRUTH_FACTS]
}

/**
 * Get the current value of a fact (accounting for updates).
 */
export function getCurrentFactValue(factId: string): string | null {
  const fact = getFactById(factId)
  if (!fact) return null
  return fact.updated_value || fact.value
}
