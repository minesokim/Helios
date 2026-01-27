import { createClient } from '@/lib/supabase/server'
import { refreshAccessToken } from '@/lib/google/oauth'
import { extractFileContent } from '@/services/drive/classifier'
import {
  generateEmbedding,
  buildSearchableText,
  isEmbeddingsConfigured,
  EMBEDDING_DIMENSIONS,
} from '@/services/drive/embeddings'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'

type GoogleOAuthToken = Database['public']['Tables']['google_oauth_tokens']['Row']
type DriveFile = Database['public']['Tables']['drive_files']['Row']

// Helper to get valid access token
async function getValidAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  const tokenData = data as GoogleOAuthToken | null

  if (error || !tokenData) {
    return null
  }

  const expiresAt = new Date(tokenData.expires_at)
  const now = new Date()

  if (expiresAt <= now) {
    try {
      const newCredentials = await refreshAccessToken(tokenData.refresh_token)

      if (!newCredentials.access_token) {
        return null
      }

      const newExpiresAt = newCredentials.expiry_date
        ? new Date(newCredentials.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString()

      await supabase
        .from('google_oauth_tokens')
        .update({
          access_token: newCredentials.access_token,
          expires_at: newExpiresAt,
        } as never)
        .eq('user_id', userId)

      return newCredentials.access_token
    } catch {
      return null
    }
  }

  return tokenData.access_token
}

// GET - Get embedding stats
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if OpenAI is configured
    const configured = isEmbeddingsConfigured()

    // Get counts
    const { count: totalFiles } = await supabase
      .from('drive_files')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: classifiedFiles } = await supabase
      .from('drive_files')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('document_type', 'is', null)

    const { count: embeddedFiles } = await supabase
      .from('drive_file_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    return NextResponse.json({
      configured,
      total: totalFiles || 0,
      classified: classifiedFiles || 0,
      embedded: embeddedFiles || 0,
      pending: (classifiedFiles || 0) - (embeddedFiles || 0),
    })
  } catch (error) {
    console.error('[Embeddings] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get embedding stats' },
      { status: 500 }
    )
  }
}

// POST - Generate embeddings with streaming progress
export async function POST(request: NextRequest) {
  console.log('[Embeddings] Starting generation...')

  // Check if OpenAI is configured
  if (!isEmbeddingsConfigured()) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured. Add OPENAI_API_KEY to your environment.' },
      { status: 400 }
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const supabase = await createClient()

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (authError || !user) {
          send({ error: 'Unauthorized', done: true })
          controller.close()
          return
        }

        // Get access token for content extraction
        const accessToken = await getValidAccessToken(supabase, user.id)
        if (!accessToken) {
          send({ error: 'Google Drive not connected', done: true })
          controller.close()
          return
        }

        // Get files that are classified but don't have embeddings yet
        const { data: existingEmbeddings } = await supabase
          .from('drive_file_embeddings')
          .select('drive_file_id')
          .eq('user_id', user.id)

        const embeddedFileIds = new Set(
          (existingEmbeddings || []).map((e) => e.drive_file_id)
        )

        const { data: files } = await supabase
          .from('drive_files')
          .select('*')
          .eq('user_id', user.id)
          .not('document_type', 'is', null)

        const driveFiles = (files as DriveFile[] | null) || []
        const pendingFiles = driveFiles.filter(f => !embeddedFileIds.has(f.id))

        if (pendingFiles.length === 0) {
          send({
            status: 'complete',
            done: true,
            embedded: 0,
            message: 'All classified files already have embeddings.',
          })
          controller.close()
          return
        }

        send({
          status: 'starting',
          total: pendingFiles.length,
          message: `Generating embeddings for ${pendingFiles.length} files...`,
        })

        let totalEmbedded = 0
        let totalErrors = 0
        let totalTokens = 0

        for (let i = 0; i < pendingFiles.length; i++) {
          const file = pendingFiles[i]

          try {
            send({
              status: 'processing',
              current: file.name,
              progress: i + 1,
              total: pendingFiles.length,
              embedded: totalEmbedded,
              errors: totalErrors,
            })

            // Get content if we don't have text_preview
            let content = file.text_preview
            if (!content && file.mime_type) {
              content = await extractFileContent(
                accessToken,
                file.drive_file_id,
                file.mime_type,
                10000
              )
            }

            // Build searchable text
            const searchableText = buildSearchableText(
              file.name,
              content,
              file.summary,
              file.document_type,
              file.entities as Record<string, string[]> | null
            )

            // Generate embedding
            const { embedding, tokens } = await generateEmbedding(searchableText)
            totalTokens += tokens

            // Store embedding in database
            const { error: insertError } = await supabase
              .from('drive_file_embeddings')
              .insert({
                user_id: user.id,
                file_id: file.id,
                embedding: embedding,
                embedding_model: 'text-embedding-3-small',
                chunk_index: 0,
                chunk_text: searchableText.substring(0, 1000),
              } as never)

            if (insertError) {
              throw insertError
            }

            totalEmbedded++

            send({
              status: 'embedded',
              file: file.name,
              embedded: totalEmbedded,
              errors: totalErrors,
              tokens: totalTokens,
            })

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100))
          } catch (fileError) {
            totalErrors++
            console.error(`[Embeddings] Error for ${file.name}:`, fileError)
            send({
              status: 'error',
              file: file.name,
              error: fileError instanceof Error ? fileError.message : 'Unknown error',
              embedded: totalEmbedded,
              errors: totalErrors,
            })
          }
        }

        // Calculate estimated cost (text-embedding-3-small: $0.02 per 1M tokens)
        const estimatedCost = (totalTokens / 1_000_000) * 0.02

        // Log the action
        await supabase.from('drive_audit_log').insert({
          user_id: user.id,
          action: 'GENERATE_EMBEDDINGS',
          action_params: {
            total_embedded: totalEmbedded,
            total_errors: totalErrors,
            total_tokens: totalTokens,
            estimated_cost_usd: estimatedCost,
          },
          triggered_by: 'user',
        } as never)

        send({
          status: 'complete',
          done: true,
          embedded: totalEmbedded,
          errors: totalErrors,
          tokens: totalTokens,
          estimatedCost: `$${estimatedCost.toFixed(4)}`,
          message: `Done! Embedded ${totalEmbedded} files (${totalTokens.toLocaleString()} tokens, ~$${estimatedCost.toFixed(4)})`,
        })
      } catch (error) {
        console.error('[Embeddings] Error:', error)
        send({
          error: error instanceof Error ? error.message : 'Embedding generation failed',
          done: true,
        })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
