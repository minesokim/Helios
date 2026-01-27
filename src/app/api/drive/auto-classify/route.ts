import { createClient } from '@/lib/supabase/server'
import { refreshAccessToken } from '@/lib/google/oauth'
import { extractFileContent, classifyDocument } from '@/services/drive/classifier'
import { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

type GoogleOAuthToken = Database['public']['Tables']['google_oauth_tokens']['Row']
type DriveFile = Database['public']['Tables']['drive_files']['Row']

// Helper to get valid access token
async function getValidAccessToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
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

// Process a single file
async function processFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accessToken: string,
  file: DriveFile
): Promise<{ success: boolean; zone?: string; type?: string }> {
  try {
    const content = await extractFileContent(
      accessToken,
      file.drive_file_id,
      file.mime_type
    )

    const result = await classifyDocument({
      id: file.id,
      name: file.name,
      mimeType: file.mime_type,
      fullPath: file.full_path,
      driveFileId: file.drive_file_id,
    }, content)

    await supabase
      .from('drive_files')
      .update({
        zone: result.zone,
        document_type: result.documentType,
        confidence_score: result.confidence,
        summary: result.summary,
        entities: result.entities,
        suggested_name: result.suggestedName || null,
        text_preview: content ? content.substring(0, 500) : null,
        processing_status: 'classified',
        last_processed_at: new Date().toISOString(),
      } as never)
      .eq('id', file.id)

    return { success: true, zone: result.zone, type: result.documentType }
  } catch {
    return { success: false }
  }
}

// POST /api/drive/auto-classify - Stream classification progress with parallel processing
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          send({ error: 'Unauthorized', done: true })
          controller.close()
          return
        }

        const accessToken = await getValidAccessToken(supabase, user.id)
        if (!accessToken) {
          send({ error: 'Google Drive not connected', done: true })
          controller.close()
          return
        }

        // Get all pending files upfront
        const { data: allFiles } = await supabase
          .from('drive_files')
          .select('*')
          .eq('user_id', user.id)
          .is('document_type', null)
          .limit(500) // Cap at 500 files per run

        const files = (allFiles as DriveFile[] | null) || []

        if (files.length === 0) {
          send({ status: 'complete', done: true, classified: 0, message: 'No files to classify' })
          controller.close()
          return
        }

        send({ status: 'starting', total: files.length })

        let totalClassified = 0
        let totalErrors = 0
        const PARALLEL_BATCH_SIZE = 5 // Process 5 files at a time

        // Process in parallel batches
        for (let i = 0; i < files.length; i += PARALLEL_BATCH_SIZE) {
          const batch = files.slice(i, i + PARALLEL_BATCH_SIZE)

          // Process batch in parallel
          const results = await Promise.all(
            batch.map(file => processFile(supabase, accessToken, file))
          )

          // Count results
          for (const result of results) {
            if (result.success) {
              totalClassified++
            } else {
              totalErrors++
            }
          }

          // Send progress update
          send({
            status: 'progress',
            classified: totalClassified,
            errors: totalErrors,
            remaining: files.length - (i + batch.length),
            current: batch[batch.length - 1]?.name,
          })

          // Small delay between batches to avoid rate limits
          if (i + PARALLEL_BATCH_SIZE < files.length) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }

        // Log the action
        await supabase
          .from('drive_audit_log')
          .insert({
            user_id: user.id,
            action: 'AUTO_CLASSIFY',
            action_params: {
              total_classified: totalClassified,
              total_errors: totalErrors,
            },
            triggered_by: 'user',
          } as never)

        send({
          status: 'complete',
          done: true,
          classified: totalClassified,
          errors: totalErrors,
          message: `Done! Classified ${totalClassified} files.`,
        })

      } catch (error) {
        send({
          error: error instanceof Error ? error.message : 'Classification failed',
          done: true
        })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
