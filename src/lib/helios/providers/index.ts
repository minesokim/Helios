// Project HELIOS - LLM Provider Factory
// Creates the appropriate LLM provider based on configuration

import type { LLMProvider, HeliosConfig } from '../types'
import { OllamaProvider } from './ollama'
import { ClaudeProvider } from './claude-provider'

let cachedProvider: LLMProvider | null = null
let cachedEmbeddingProvider: LLMProvider | null = null
let cachedConfig: HeliosConfig | null = null

/**
 * Get the reasoning LLM provider for memory system internals.
 * Default: Ollama (runs locally, no API cost for memory reasoning).
 */
export function getReasoningProvider(config: HeliosConfig): LLMProvider {
  // Return cached if config hasn't changed
  if (cachedProvider && cachedConfig === config) {
    return cachedProvider
  }

  switch (config.llm_provider) {
    case 'ollama':
      cachedProvider = new OllamaProvider(config)
      break
    case 'claude':
      cachedProvider = new ClaudeProvider(config)
      break
    default:
      cachedProvider = new OllamaProvider(config)
  }

  cachedConfig = config
  return cachedProvider
}

/**
 * Get the embedding provider. Always uses Ollama since Claude
 * doesn't have an embedding API.
 */
export function getEmbeddingProvider(config: HeliosConfig): LLMProvider {
  if (cachedEmbeddingProvider && cachedConfig === config) {
    return cachedEmbeddingProvider
  }

  // Embeddings always go through Ollama (or a compatible endpoint)
  cachedEmbeddingProvider = new OllamaProvider(config)
  cachedConfig = config
  return cachedEmbeddingProvider
}

/**
 * Reset cached providers (useful for testing or config changes).
 */
export function resetProviders(): void {
  cachedProvider = null
  cachedEmbeddingProvider = null
  cachedConfig = null
}

export { OllamaProvider } from './ollama'
export { ClaudeProvider } from './claude-provider'
