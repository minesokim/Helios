/**
 * RAG Tools for Jorkel
 *
 * Enables semantic search across documents, drive files, and conversations.
 * Uses existing embeddings infrastructure.
 */

import { ToolDefinition } from '../types'
import { createClient } from '@/lib/supabase/server'

// Source types for citations
interface DocumentSource {
  id: string
  title: string
  snippet: string
  similarity: number
  type: 'document'
}

interface DriveSource {
  id: string
  driveFileId: string
  name: string
  snippet: string
  similarity: number
  type: 'drive'
  url: string // Direct Google Drive link
}

type Source = DocumentSource | DriveSource

/**
 * Search documents and drive files semantically using embeddings
 * Returns structured sources with URLs for citation
 */
async function semanticSearch(
  userId: string,
  query: string,
  sources: ('documents' | 'drive')[] = ['documents', 'drive']
): Promise<{
  documents: DocumentSource[]
  driveFiles: DriveSource[]
  allSources: Source[]
}> {
  const supabase = await createClient()
  const results = {
    documents: [] as DocumentSource[],
    driveFiles: [] as DriveSource[],
    allSources: [] as Source[],
  }

  try {
    // Generate embedding for the query
    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // Search documents if requested
    if (sources.includes('documents')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: docResults } = await (supabase.rpc as any)('search_documents', {
          query_embedding: queryEmbedding,
          match_threshold: 0.65,
          match_count: 5,
          p_user_id: userId,
        })

        if (docResults && docResults.length > 0) {
          // Get document details
          const documentIds = [...new Set(docResults.map((r: { document_id: string }) => r.document_id))] as string[]
          const { data: documents } = await supabase
            .from('documents')
            .select('id, file_name, title')
            .in('id', documentIds)

          const docMap = new Map(documents?.map(d => [d.id, d]) || [])

          results.documents = docResults.map((r: { document_id: string; chunk_text: string; similarity: number }) => ({
            id: r.document_id,
            title: docMap.get(r.document_id)?.title || docMap.get(r.document_id)?.file_name || 'Unknown',
            snippet: r.chunk_text.substring(0, 300),
            similarity: r.similarity,
            type: 'document' as const,
          }))
        }
      } catch (e) {
        console.log('Document search failed:', e)
      }
    }

    // Search drive files if requested
    if (sources.includes('drive')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: driveResults } = await (supabase.rpc as any)('search_drive_files', {
          query_embedding: queryEmbedding,
          match_threshold: 0.65,
          match_count: 5,
          filter_user_id: userId,
          filter_zone: null,
        })

        if (driveResults && driveResults.length > 0) {
          // Get file details and chunks
          const fileIds = driveResults.map((r: { file_id: string }) => r.file_id)

          const { data: files } = await supabase
            .from('drive_files')
            .select('id, name, drive_file_id')
            .in('id', fileIds)

          const { data: chunks } = await supabase
            .from('drive_file_embeddings')
            .select('drive_file_id, chunk_text')
            .in('drive_file_id', fileIds)
            .limit(10)

          const fileMap = new Map(files?.map(f => [f.id, f]) || [])
          const chunkMap = new Map(chunks?.map(c => [c.drive_file_id, c.chunk_text]) || [])

          results.driveFiles = driveResults.map((r: { file_id: string; similarity: number }) => {
            const file = fileMap.get(r.file_id)
            const driveFileId = file?.drive_file_id || r.file_id
            return {
              id: r.file_id,
              driveFileId,
              name: file?.name || 'Unknown',
              snippet: chunkMap.get(r.file_id)?.substring(0, 300) || '',
              similarity: r.similarity,
              type: 'drive' as const,
              url: `https://drive.google.com/file/d/${driveFileId}/view`,
            }
          })
        }
      } catch (e) {
        console.log('Drive search failed:', e)
      }
    }
  } catch (e) {
    console.error('Semantic search failed:', e)
  }

  // Combine all sources and sort by similarity
  results.allSources = [
    ...results.documents,
    ...results.driveFiles,
  ].sort((a, b) => b.similarity - a.similarity)

  return results
}

export const ragTools: ToolDefinition[] = [
  {
    name: 'search_knowledge',
    description: `Search David's documents and files semantically to find relevant information.
Use this when David asks about:
- Specific documents, contracts, proposals, invoices
- Past work, projects, or client files
- Information that might be in his Drive or uploaded documents
- When you need to find supporting context for a response

This searches using AI embeddings, so describe WHAT you're looking for, not exact filenames.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'What to search for. Be descriptive. Example: "proposal for Mary Cramer cannabis business" or "invoice from last month"',
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['documents', 'drive'],
          },
          description: 'Which sources to search. Default: both documents and drive files.',
        },
      },
      required: ['query'],
    },
    handler: async (params, context) => {
      const query = params.query as string
      const sources = (params.sources as ('documents' | 'drive')[]) || ['documents', 'drive']

      const results = await semanticSearch(context.userId, query, sources)

      const totalResults = results.documents.length + results.driveFiles.length

      if (totalResults === 0) {
        return `No matching documents found for "${query}". Try a different search or the documents may not be indexed yet.`
      }

      const lines: string[] = [`Found ${totalResults} relevant items:\n`]

      if (results.documents.length > 0) {
        lines.push('**Documents:**')
        results.documents.forEach((doc, i) => {
          lines.push(`${i + 1}. ${doc.title} (${Math.round(doc.similarity * 100)}% match)`)
          if (doc.snippet) {
            lines.push(`   "${doc.snippet.trim()}..."`)
          }
        })
      }

      if (results.driveFiles.length > 0) {
        if (results.documents.length > 0) lines.push('')
        lines.push('**Drive Files:**')
        results.driveFiles.forEach((file, i) => {
          lines.push(`${i + 1}. [${file.name}](${file.url}) (${Math.round(file.similarity * 100)}% match)`)
          if (file.snippet) {
            lines.push(`   "${file.snippet.trim()}..."`)
          }
        })
      }

      // Add citation summary for AI to reference
      lines.push('')
      lines.push('---')
      lines.push('**Sources for citation:**')
      results.allSources.slice(0, 5).forEach((source, i) => {
        if (source.type === 'drive') {
          const driveSource = source as DriveSource
          lines.push(`[${i + 1}] ${driveSource.name}: ${driveSource.url}`)
        } else {
          lines.push(`[${i + 1}] ${source.title} (uploaded document)`)
        }
      })

      return lines.join('\n')
    },
  },
]
