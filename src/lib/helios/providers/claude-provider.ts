// Project HELIOS - Claude LLM Provider (fallback/alternative)
// Uses Anthropic API for memory reasoning when Ollama is unavailable

import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, LLMMessage, LLMResponse, LLMOptions, HeliosConfig } from '../types'

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic
  private model: string

  constructor(config: HeliosConfig) {
    this.client = new Anthropic()
    this.model = config.claude_model_haiku // Use Haiku for memory internals (cost-conscious)
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model_override || this.model

    // Separate system message from conversation messages
    const systemMessage = messages.find((m) => m.role === 'system')?.content
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    // Ensure messages alternate and start with user
    if (chatMessages.length === 0 || chatMessages[0].role !== 'user') {
      chatMessages.unshift({ role: 'user', content: 'Process the following.' })
    }

    const response = await this.client.messages.create({
      model,
      max_tokens: options?.max_tokens ?? 2048,
      temperature: options?.temperature ?? 0.1,
      system: systemMessage,
      messages: chatMessages,
    })

    const textBlock = response.content.find((block: { type: string }) => block.type === 'text')
    const content = textBlock?.type === 'text' ? textBlock.text : ''

    return {
      content,
      model: response.model,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    }
  }

  async chatJson<T>(messages: LLMMessage[], options?: LLMOptions): Promise<T> {
    // Add JSON instruction to the last user message
    const augmentedMessages = [...messages]
    const lastUserIdx = augmentedMessages.findLastIndex((m) => m.role === 'user')
    if (lastUserIdx >= 0) {
      augmentedMessages[lastUserIdx] = {
        ...augmentedMessages[lastUserIdx],
        content:
          augmentedMessages[lastUserIdx].content +
          '\n\nRespond with valid JSON only. No markdown, no explanation, just the JSON object.',
      }
    }

    const response = await this.chat(augmentedMessages, {
      ...options,
      temperature: 0,
    })

    const content = response.content.trim()

    // Try direct parse first
    try {
      return JSON.parse(content) as T
    } catch {
      // Fall through to extraction
    }

    // Extract JSON from markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch?.[1]) {
      return JSON.parse(codeBlockMatch[1].trim()) as T
    }

    // Extract first JSON object or array
    const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (jsonMatch?.[1]) {
      return JSON.parse(jsonMatch[1]) as T
    }

    throw new Error(`Failed to parse JSON from Claude response: ${content.substring(0, 200)}`)
  }

  async embed(text: string): Promise<number[]> {
    // Claude doesn't have an embedding API; fall back to OpenAI-compatible endpoint
    // or use a local embedding model. For now, throw to force Ollama for embeddings.
    throw new Error(
      'Claude provider does not support embeddings. Use Ollama or configure an embedding endpoint.'
    )
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    throw new Error(
      'Claude provider does not support embeddings. Use Ollama or configure an embedding endpoint.'
    )
  }
}
