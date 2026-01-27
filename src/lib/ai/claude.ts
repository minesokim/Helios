import Anthropic from '@anthropic-ai/sdk'

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Model selection based on task complexity
export const MODELS = {
  HAIKU: 'claude-3-5-haiku-20241022', // Fast, cheap - categorization, classification
  SONNET: 'claude-sonnet-4-20250514', // Balanced - queries, analysis
} as const

// Base message function
export async function sendMessage(
  messages: Anthropic.MessageParam[],
  options: {
    model?: string
    maxTokens?: number
    system?: string
    temperature?: number
  } = {}
) {
  const {
    model = MODELS.SONNET,
    maxTokens = 1024,
    system,
    temperature = 0,
  } = options

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
    temperature,
  })

  const textBlock = response.content.find((block) => block.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}

// Streaming message function
export async function* streamMessage(
  messages: Anthropic.MessageParam[],
  options: {
    model?: string
    maxTokens?: number
    system?: string
    temperature?: number
  } = {}
) {
  const {
    model = MODELS.SONNET,
    maxTokens = 2048,
    system,
    temperature = 0.7,
  } = options

  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages,
    temperature,
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text
    }
  }
}

// JSON response helper
export async function getJsonResponse<T>(
  prompt: string,
  options: {
    model?: string
    system?: string
  } = {}
): Promise<T> {
  const response = await sendMessage(
    [{ role: 'user', content: prompt }],
    {
      ...options,
      temperature: 0,
    }
  )

  // Extract JSON from response (handles markdown code blocks)
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    response.match(/\{[\s\S]*\}/) ||
    response.match(/\[[\s\S]*\]/)

  if (!jsonMatch) {
    throw new Error('No JSON found in response')
  }

  const jsonStr = jsonMatch[1] || jsonMatch[0]
  return JSON.parse(jsonStr.trim())
}
