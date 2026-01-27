import { createClient } from '@/lib/supabase/server'
import {
  generateEmbedding,
  isEmbeddingsConfigured,
} from '@/services/drive/embeddings'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'

type DriveFile = Database['public']['Tables']['drive_files']['Row']

export interface SearchResult {
  file: DriveFile
  similarity: number
  matchReason: string
}

// POST - Semantic search
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { query, zone, limit = 20 } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    // Check if embeddings are configured
    if (!isEmbeddingsConfigured()) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured for semantic search' },
        { status: 400 }
      )
    }

    // Generate embedding for the search query
    const { embedding: queryEmbedding } = await generateEmbedding(query)

    // Use pgvector to find similar documents
    // We need to use a raw SQL query for vector similarity search
    const { data: searchResults, error: searchError } = await supabase.rpc(
      'search_drive_files' as never,
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: limit,
        filter_user_id: user.id,
        filter_zone: zone || null,
      } as never
    )

    if (searchError) {
      console.error('[Search] RPC error:', searchError)

      // Fallback to basic text search if RPC doesn't exist
      if (searchError.message.includes('function') || searchError.message.includes('does not exist')) {
        console.log('[Search] Falling back to text search')
        return await fallbackTextSearch(supabase, user.id, query, zone, limit)
      }

      throw searchError
    }

    // Cast search results to expected type
    const searchResultsArray = (searchResults || []) as Array<{ file_id: string; similarity: number }>

    // Get full file details for the results
    const fileIds = searchResultsArray.map((r) => r.file_id)

    if (fileIds.length === 0) {
      return NextResponse.json({ results: [], query })
    }

    const { data: files } = await supabase
      .from('drive_files')
      .select('*')
      .in('id', fileIds)

    // Map results with similarity scores
    const results: SearchResult[] = searchResultsArray.map(
      (result) => {
        const file = (files || []).find((f: DriveFile) => f.id === result.file_id)
        return {
          file: file!,
          similarity: result.similarity,
          matchReason: getMatchReason(result.similarity),
        }
      }
    ).filter((r) => r.file)

    return NextResponse.json({
      results,
      query,
      count: results.length,
    })
  } catch (error) {
    console.error('[Search] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}

// Fallback to basic text search when vector search isn't available
async function fallbackTextSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  query: string,
  zone: string | null,
  limit: number
) {
  // Split query into words for text matching
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)

  let queryBuilder = supabase
    .from('drive_files')
    .select('*')
    .eq('user_id', userId)
    .limit(limit)

  if (zone) {
    queryBuilder = queryBuilder.eq('zone', zone)
  }

  const { data: files } = await queryBuilder

  if (!files) {
    return NextResponse.json({ results: [], query, fallback: true })
  }

  // Score files based on text matching
  const scoredFiles = (files as DriveFile[]).map(file => {
    let score = 0
    const searchText = [
      file.name,
      file.summary,
      file.document_type,
      file.text_preview,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    for (const word of words) {
      if (searchText.includes(word)) {
        score += 1
        // Bonus for name match
        if (file.name.toLowerCase().includes(word)) {
          score += 0.5
        }
      }
    }

    return { file, score }
  })

  // Filter and sort by score
  const results: SearchResult[] = scoredFiles
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ file, score }) => ({
      file,
      similarity: Math.min(score / words.length, 1),
      matchReason: 'Text match',
    }))

  return NextResponse.json({
    results,
    query,
    count: results.length,
    fallback: true,
  })
}

function getMatchReason(similarity: number): string {
  if (similarity > 0.8) return 'Highly relevant'
  if (similarity > 0.6) return 'Strong match'
  if (similarity > 0.4) return 'Related'
  return 'Possibly related'
}
