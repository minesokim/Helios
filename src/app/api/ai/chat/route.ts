import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { recordUsage, checkBudget } from '@/services/budget'
import { getOrCreateConversation, getConversationHistory, saveMessage } from '@/services/ai/conversation'
import { embedMessage } from '@/services/embeddings/conversations'
import { buildSystemPrompt } from './system-prompt'
import { ChatRequest } from './types'

// Use Grok (xAI) - OpenAI-compatible API
const USE_GROK = !!process.env.XAI_API_KEY

const grok = USE_GROK ? new OpenAI({
  apiKey: process.env.XAI_API_KEY!,
  baseURL: 'https://api.x.ai/v1',
}) : null

// Grok 4.1 models
const GROK_MODELS = {
  fast: 'grok-4-1-fast-non-reasoning',
  smart: 'grok-4-1-fast-reasoning',
} as const

// Claude fallback models
const CLAUDE_MODELS = {
  fast: 'claude-3-5-haiku-20241022',
  smart: 'claude-sonnet-4-5-20250929',
} as const

// Triggers for reasoning model
const REASONING_TRIGGERS = [
  'analyze', 'explain', 'compare', 'summarize', 'review', 'evaluate',
  'plan', 'strategy', 'why', 'how does', 'what if', 'help me figure',
  'think', 'reason', 'consider', 'decision', 'should i',
]

function selectModel(message: string): { model: string; maxTokens: number; useReasoning: boolean } {
  const lower = message.toLowerCase()
  const needsReasoning = message.length > 80 || REASONING_TRIGGERS.some(t => lower.includes(t))

  if (USE_GROK) {
    return {
      model: needsReasoning ? GROK_MODELS.smart : GROK_MODELS.fast,
      maxTokens: needsReasoning ? 2048 : 1024,
      useReasoning: needsReasoning,
    }
  }
  return { model: CLAUDE_MODELS.fast, maxTokens: 512, useReasoning: false }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, conversationId: requestConversationId, budgetOverride, inputSource = 'typed', stream = true }: ChatRequest & { stream?: boolean } = await request.json()

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Check budget
    let budgetStatus = { allowed: true, isNearLimit: false, usagePercent: 0, reason: null as string | null }
    try {
      budgetStatus = await checkBudget(user.id, 0.01)
      if (!budgetStatus.allowed && !budgetOverride) {
        return NextResponse.json({ error: 'budget_exceeded', message: budgetStatus.reason, canOverride: true, budgetStatus }, { status: 429 })
      }
    } catch { /* Budget tables may not exist */ }

    // Choose model
    const { model, maxTokens, useReasoning } = selectModel(message)

    // Conversation management
    let conversationId = requestConversationId || crypto.randomUUID()
    let history: { role: 'user' | 'assistant'; content: string }[] = []
    const historyLimit = 4
    try {
      conversationId = await getOrCreateConversation(user.id, requestConversationId)
      history = await getConversationHistory(user.id, conversationId, historyLimit)
      await saveMessage(user.id, conversationId, 'user', message, inputSource as 'typed' | 'voice')
    } catch { /* Conversation tables may not exist */ }

    const systemPrompt = await buildSystemPrompt(user.id, 'fast')

    console.log(`[Chat] Using Grok (${model})${useReasoning ? ' [REASONING]' : ''} ${stream ? '[STREAMING]' : ''} for: "${message.substring(0, 50)}..."`)

    if (USE_GROK && grok && stream) {
      // STREAMING RESPONSE
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.filter(m => m.content?.trim()).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: message },
      ]

      const grokStream = await grok.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages,
        stream: true,
      })

      // Create a TransformStream to process chunks
      const encoder = new TextEncoder()
      let fullResponse = ''

      const readable = new ReadableStream({
        async start(controller) {
          try {
            // Send conversation ID first
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', conversationId })}\n\n`))

            for await (const chunk of grokStream) {
              const content = chunk.choices[0]?.delta?.content || ''
              if (content) {
                fullResponse += content
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`))
              }
            }

            // Send completion signal
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', fullResponse })}\n\n`))
            controller.close()

            // Save message and record usage in background
            saveMessage(user.id, conversationId, 'assistant', fullResponse)
              .then(result => {
                if (result?.id) {
                  embedMessage(user.id, conversationId, result.id, fullResponse, 'assistant').catch(() => {})
                }
              })
              .catch(() => {})

            recordUsage(user.id, {
              api_provider: 'grok',
              api_endpoint: '/chat/completions',
              model,
              input_tokens: Math.ceil((systemPrompt.length + message.length) / 4),
              output_tokens: Math.ceil(fullResponse.length / 4),
              request_type: 'chat',
              success: true,
            }).catch(() => {})

          } catch (error) {
            console.error('Stream error:', error)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`))
            controller.close()
          }
        }
      })

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // NON-STREAMING FALLBACK
    let responseText = ''
    let totalInputTokens = 0, totalOutputTokens = 0

    if (USE_GROK && grok) {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.filter(m => m.content?.trim()).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: message },
      ]

      const response = await grok.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages,
      })

      responseText = response.choices[0]?.message?.content || ''
      totalInputTokens = response.usage?.prompt_tokens || 0
      totalOutputTokens = response.usage?.completion_tokens || 0
    } else {
      // Claude fallback
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

      const messages = [
        ...history.filter(m => m.content?.trim()).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: message },
      ]

      const response = await claude.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      })

      responseText = response.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text)
        .join('')
      totalInputTokens = response.usage?.input_tokens || 0
      totalOutputTokens = response.usage?.output_tokens || 0
    }

    // Save and record
    let assistantMessageId: string | null = null
    try {
      const result = await saveMessage(user.id, conversationId, 'assistant', responseText)
      assistantMessageId = result?.id || null
    } catch { /* ignore */ }

    if (assistantMessageId) {
      embedMessage(user.id, conversationId, assistantMessageId, responseText, 'assistant').catch(() => {})
    }
    try {
      await recordUsage(user.id, {
        api_provider: USE_GROK ? 'grok' : 'claude',
        api_endpoint: USE_GROK ? '/chat/completions' : '/messages',
        model,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        request_type: 'chat',
        success: true,
      })
    } catch { /* ignore */ }

    return NextResponse.json({
      response: responseText,
      conversationId,
      budgetWarning: budgetStatus.isNearLimit ? `${budgetStatus.usagePercent.toFixed(0)}% of budget used` : null,
    })
  } catch (error) {
    console.error('=== CHAT API ERROR ===', error)
    return NextResponse.json(
      { error: 'Failed to process message', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
