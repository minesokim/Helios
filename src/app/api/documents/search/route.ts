import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface SearchResult {
  document_id: string
  chunk_text: string
  similarity: number
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query, limit = 10, threshold = 0.7 } = await request.json()

  if (!query) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 })
  }

  try {
    // Generate embedding for search query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // Search using pgvector similarity
    const rpcParams = {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      p_user_id: user.id,
    }
    const rpcResult = await supabase.rpc('search_documents', rpcParams as never)
    const results = rpcResult.data as SearchResult[] | null
    const error = rpcResult.error

    if (error) {
      throw error
    }

    if (!results || results.length === 0) {
      return NextResponse.json({ results: [], query })
    }

    // Get full document details for each result
    const documentIds = [...new Set(results.map(r => r.document_id))]

    const docResult = await supabase
      .from('documents')
      .select('id, file_name, title, document_type, storage_path, created_at')
      .in('id', documentIds)

    const documents = docResult.data as Array<{
      id: string
      file_name: string
      title: string | null
      document_type: string | null
      storage_path: string
      created_at: string
    }> | null

    // Combine results with document info
    const enrichedResults = results.map(result => ({
      ...result,
      document: documents?.find(d => d.id === result.document_id),
    }))

    return NextResponse.json({
      results: enrichedResults,
      query,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
