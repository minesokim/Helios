import { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Chunk size for embeddings (in characters)
const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 200

export async function generateEmbeddings(
  supabase: SupabaseClient,
  documentId: string,
  userId: string,
  text: string
): Promise<void> {
  // Delete existing embeddings for this document
  await supabase
    .from('document_embeddings')
    .delete()
    .eq('document_id', documentId)

  // Split text into chunks
  const chunks = splitIntoChunks(text, CHUNK_SIZE, CHUNK_OVERLAP)

  // Generate embeddings for each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    try {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunk,
      })

      const embedding = embeddingResponse.data[0].embedding

      // Store in database
      await supabase.from('document_embeddings').insert({
        document_id: documentId,
        user_id: userId,
        chunk_index: i,
        chunk_text: chunk,
        embedding,
      })
    } catch (error) {
      console.error(`Error generating embedding for chunk ${i}:`, error)
      // Continue with other chunks
    }
  }
}

function splitIntoChunks(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    // Find a good break point (end of sentence or paragraph)
    let end = start + chunkSize
    if (end < text.length) {
      // Look for sentence endings
      const breakPoints = ['. ', '.\n', '\n\n', '\n', ' ']
      for (const bp of breakPoints) {
        const lastBreak = text.lastIndexOf(bp, end)
        if (lastBreak > start + chunkSize / 2) {
          end = lastBreak + bp.length
          break
        }
      }
    } else {
      end = text.length
    }

    const chunk = text.slice(start, end).trim()
    if (chunk.length > 0) {
      chunks.push(chunk)
    }

    // Move start position with overlap
    start = end - overlap
    if (start >= text.length) break
  }

  return chunks
}
