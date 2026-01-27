// Document embedding service for semantic search
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Embedding model - text-embedding-3-small is fast and cheap
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

export interface EmbeddingResult {
  embedding: number[]
  tokens: number
}

// Generate embedding for a single text
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  // Clean and truncate text (model has 8191 token limit)
  const cleanedText = text
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 30000) // ~7500 tokens approximately

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleanedText,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  return {
    embedding: response.data[0].embedding,
    tokens: response.usage.total_tokens,
  }
}

// Generate embeddings for multiple texts in batch
export async function generateEmbeddings(
  texts: string[]
): Promise<EmbeddingResult[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  // Clean texts
  const cleanedTexts = texts.map(text =>
    text.replace(/\s+/g, ' ').trim().substring(0, 30000)
  )

  // OpenAI supports batching up to ~2048 inputs
  const batchSize = 100
  const results: EmbeddingResult[] = []

  for (let i = 0; i < cleanedTexts.length; i += batchSize) {
    const batch = cleanedTexts.slice(i, i + batchSize)

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    })

    const tokensPerItem = Math.floor(response.usage.total_tokens / batch.length)

    for (const item of response.data) {
      results.push({
        embedding: item.embedding,
        tokens: tokensPerItem,
      })
    }
  }

  return results
}

// Build searchable text from file metadata and content
export function buildSearchableText(
  name: string,
  content: string | null,
  summary: string | null,
  documentType: string | null,
  entities: Record<string, string[]> | null
): string {
  const parts: string[] = []

  // File name is important for search
  parts.push(`File: ${name}`)

  // Document type
  if (documentType) {
    parts.push(`Type: ${documentType}`)
  }

  // Summary from classification
  if (summary) {
    parts.push(`Summary: ${summary}`)
  }

  // Entities for better search
  if (entities) {
    if (entities.people?.length) {
      parts.push(`People: ${entities.people.join(', ')}`)
    }
    if (entities.companies?.length) {
      parts.push(`Companies: ${entities.companies.join(', ')}`)
    }
    if (entities.topics?.length) {
      parts.push(`Topics: ${entities.topics.join(', ')}`)
    }
    if (entities.dates?.length) {
      parts.push(`Dates: ${entities.dates.join(', ')}`)
    }
    if (entities.amounts?.length) {
      parts.push(`Amounts: ${entities.amounts.join(', ')}`)
    }
  }

  // Actual content (most weight)
  if (content) {
    parts.push(`Content: ${content}`)
  }

  return parts.join('\n\n')
}

// Calculate cosine similarity between two embeddings
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Check if OpenAI API key is configured
export function isEmbeddingsConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}

export { EMBEDDING_DIMENSIONS }
