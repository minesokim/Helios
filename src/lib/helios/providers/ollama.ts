// Project HELIOS - Ollama LLM Provider
// Handles all internal memory reasoning via local Ollama models

import type { LLMProvider, LLMMessage, LLMResponse, LLMOptions, HeliosConfig } from '../types'

interface OllamaChatRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  stream: false
  options?: {
    temperature?: number
    num_predict?: number
  }
  format?: 'json'
}

interface OllamaChatResponse {
  model: string
  message: { role: string; content: string }
  total_duration: number
  eval_count: number
  prompt_eval_count: number
}

interface OllamaEmbedRequest {
  model: string
  input: string | string[]
}

interface OllamaEmbedResponse {
  model: string
  embeddings: number[][]
}

export class OllamaProvider implements LLMProvider {
  private baseUrl: string
  private reasoningModel: string
  private embeddingModel: string

  constructor(config: HeliosConfig) {
    this.baseUrl = config.ollama_base_url.replace(/\/$/, '')
    this.reasoningModel = config.ollama_reasoning_model
    this.embeddingModel = config.ollama_embedding_model
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model_override || this.reasoningModel

    const request: OllamaChatRequest = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.1,
        num_predict: options?.max_tokens ?? 2048,
      },
    }

    const response = await this.fetchWithRetry<OllamaChatResponse>(
      `${this.baseUrl}/api/chat`,
      request
    )

    return {
      content: response.message.content,
      model: response.model,
      tokens_used: (response.eval_count || 0) + (response.prompt_eval_count || 0),
    }
  }

  async chatJson<T>(messages: LLMMessage[], options?: LLMOptions): Promise<T> {
    const model = options?.model_override || this.reasoningModel

    const request: OllamaChatRequest = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      format: 'json',
      options: {
        temperature: options?.temperature ?? 0,
        num_predict: options?.max_tokens ?? 4096,
      },
    }

    const response = await this.fetchWithRetry<OllamaChatResponse>(
      `${this.baseUrl}/api/chat`,
      request
    )

    const content = response.message.content.trim()

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

    throw new Error(`Failed to parse JSON from Ollama response: ${content.substring(0, 200)}`)
  }

  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text])
    return embeddings[0]
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    // Ollama /api/embed supports batch input
    const request: OllamaEmbedRequest = {
      model: this.embeddingModel,
      input: texts.length === 1 ? texts[0] : texts,
    }

    const response = await this.fetchWithRetry<OllamaEmbedResponse>(
      `${this.baseUrl}/api/embed`,
      request
    )

    if (!response.embeddings || response.embeddings.length === 0) {
      throw new Error('Ollama returned empty embeddings')
    }

    return response.embeddings
  }

  /**
   * Verify Ollama is reachable and models are available.
   */
  async healthCheck(): Promise<{
    healthy: boolean
    reasoning_model_available: boolean
    embedding_model_available: boolean
    error?: string
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        return {
          healthy: false,
          reasoning_model_available: false,
          embedding_model_available: false,
          error: `Ollama returned ${response.status}`,
        }
      }

      const data = (await response.json()) as { models: Array<{ name: string }> }
      const modelNames = data.models.map((m) => m.name)

      // Check if models are available (handle both "model" and "model:tag" formats)
      const reasoningAvailable = modelNames.some(
        (name) =>
          name === this.reasoningModel ||
          name.startsWith(this.reasoningModel + ':') ||
          this.reasoningModel.startsWith(name.split(':')[0])
      )
      const embeddingAvailable = modelNames.some(
        (name) =>
          name === this.embeddingModel ||
          name.startsWith(this.embeddingModel + ':') ||
          this.embeddingModel.startsWith(name.split(':')[0])
      )

      return {
        healthy: true,
        reasoning_model_available: reasoningAvailable,
        embedding_model_available: embeddingAvailable,
        error: !reasoningAvailable || !embeddingAvailable
          ? `Missing models. Available: ${modelNames.join(', ')}. Need: ${this.reasoningModel}, ${this.embeddingModel}`
          : undefined,
      }
    } catch (error) {
      return {
        healthy: false,
        reasoning_model_available: false,
        embedding_model_available: false,
        error: error instanceof Error ? error.message : 'Unknown error connecting to Ollama',
      }
    }
  }

  /**
   * Pull a model if not already available.
   */
  async pullModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to pull model ${modelName}: ${text}`)
    }
  }

  private async fetchWithRetry<T>(url: string, body: unknown, retries = 3): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120000), // 2 min timeout for LLM calls
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Ollama API error (${response.status}): ${errorText}`)
        }

        return (await response.json()) as T
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on non-retryable errors
        if (lastError.message.includes('404') || lastError.message.includes('model')) {
          throw lastError
        }

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
        }
      }
    }

    throw lastError || new Error('Failed after retries')
  }
}
