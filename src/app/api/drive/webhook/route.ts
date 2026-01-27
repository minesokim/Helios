/**
 * Google Drive Webhook Handler
 *
 * Receives push notifications when files change in Google Drive.
 * Automatically indexes new files and triggers classification.
 *
 * Google sends POST requests with headers:
 * - X-Goog-Channel-ID: The channel ID we registered
 * - X-Goog-Resource-ID: The resource being watched
 * - X-Goog-Resource-State: 'sync', 'change', or 'update'
 * - X-Goog-Changed: What changed (for 'change' state)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getChanges, getFile, buildFilePath, getFolderStructure } from '@/lib/google/drive'
import { refreshAccessToken } from '@/lib/google/oauth'
import { extractFileContent, classifyDocument } from '@/services/drive/classifier'
import type { Database } from '@/types/database'

type GoogleOAuthToken = Database['public']['Tables']['google_oauth_tokens']['Row']
type DriveWatchChannel = {
  id: string
  user_id: string
  channel_id: string
  resource_id: string
  page_token: string
  expires_at: string
}

// Helper to extract file extension
function getExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return null
  }
  return filename.substring(lastDot + 1).toLowerCase()
}

// Helper to get valid access token
async function getValidAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('google_oauth_tokens') as any)
        .update({
          access_token: newCredentials.access_token,
          expires_at: newExpiresAt,
        })
        .eq('user_id', userId)

      return newCredentials.access_token
    } catch {
      return null
    }
  }

  return tokenData.access_token
}

// Process a single new/updated file
async function processNewFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accessToken: string,
  userId: string,
  fileId: string,
  folders: Map<string, Awaited<ReturnType<typeof getFile>>>
): Promise<{ action: 'created' | 'updated' | 'classified' | 'error'; fileName?: string }> {
  try {
    // Get full file details
    const file = await getFile(accessToken, fileId)
    if (!file || !file.id || file.trashed) {
      return { action: 'error' }
    }

    const fullPath = buildFilePath(file, folders as Map<string, NonNullable<typeof file>>)
    const extension = file.name ? getExtension(file.name) : null

    const fileRecord = {
      user_id: userId,
      drive_file_id: file.id,
      drive_parent_folder_id: file.parents?.[0] || null,
      name: file.name || 'Unknown',
      original_name: file.name || null,
      mime_type: file.mimeType || null,
      extension,
      size_bytes: file.size ? parseInt(file.size) : null,
      drive_created_time: file.createdTime || null,
      drive_modified_time: file.modifiedTime || null,
      full_path: fullPath,
      content_hash: file.md5Checksum || null,
      processing_status: 'pending',
    }

    // Upsert the file
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingFile } = await (supabase.from('drive_files') as any)
      .select('id, document_type')
      .eq('user_id', userId)
      .eq('drive_file_id', file.id)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upsertedFile, error: upsertError } = await (supabase.from('drive_files') as any)
      .upsert(fileRecord, {
        onConflict: 'user_id,drive_file_id',
        ignoreDuplicates: false,
      })
      .select('id, name, mime_type, full_path, drive_file_id')
      .single()

    if (upsertError || !upsertedFile) {
      console.error('Error upserting file:', upsertError)
      return { action: 'error', fileName: file.name || undefined }
    }

    const isNew = !existingFile
    const wasUnclassified = !existingFile?.document_type

    // Auto-classify new files or files that weren't classified before
    if (isNew || wasUnclassified) {
      try {
        const content = await extractFileContent(
          accessToken,
          file.id,
          file.mimeType || null
        )

        const result = await classifyDocument({
          id: upsertedFile.id,
          name: upsertedFile.name,
          mimeType: upsertedFile.mime_type,
          fullPath: upsertedFile.full_path,
          driveFileId: upsertedFile.drive_file_id,
        }, content)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('drive_files') as any)
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
          })
          .eq('id', upsertedFile.id)

        return { action: 'classified', fileName: file.name || undefined }
      } catch (classifyError) {
        console.error('Error auto-classifying file:', classifyError)
        // File is still indexed, just not classified
        return { action: isNew ? 'created' : 'updated', fileName: file.name || undefined }
      }
    }

    return { action: 'updated', fileName: file.name || undefined }
  } catch (error) {
    console.error('Error processing file:', error)
    return { action: 'error' }
  }
}

// POST /api/drive/webhook - Receive webhook notifications from Google Drive
export async function POST(request: NextRequest) {
  const channelId = request.headers.get('X-Goog-Channel-ID')
  const resourceId = request.headers.get('X-Goog-Resource-ID')
  const resourceState = request.headers.get('X-Goog-Resource-State')

  console.log('[Drive Webhook] Received:', { channelId, resourceId, resourceState })

  // Acknowledge sync requests immediately
  if (resourceState === 'sync') {
    console.log('[Drive Webhook] Sync ping acknowledged')
    return NextResponse.json({ status: 'ok' })
  }

  // Only process change events
  if (resourceState !== 'change') {
    return NextResponse.json({ status: 'ignored' })
  }

  if (!channelId || !resourceId) {
    return NextResponse.json({ error: 'Missing channel or resource ID' }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Find the watch channel to get the user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: watchChannel } = await (supabase.from('drive_watch_channels') as any)
      .select('*')
      .eq('channel_id', channelId)
      .eq('resource_id', resourceId)
      .single() as { data: DriveWatchChannel | null }

    if (!watchChannel) {
      console.error('[Drive Webhook] Unknown channel:', channelId)
      return NextResponse.json({ error: 'Unknown channel' }, { status: 404 })
    }

    // Get access token for the user
    const accessToken = await getValidAccessToken(supabase, watchChannel.user_id)
    if (!accessToken) {
      console.error('[Drive Webhook] No valid access token for user:', watchChannel.user_id)
      return NextResponse.json({ error: 'No access token' }, { status: 401 })
    }

    // Get changes since last page token
    const { changes, newPageToken } = await getChanges(accessToken, watchChannel.page_token)

    console.log(`[Drive Webhook] Found ${changes.length} changes for user ${watchChannel.user_id}`)

    if (changes.length === 0) {
      // Update page token even if no changes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('drive_watch_channels') as any)
        .update({ page_token: newPageToken })
        .eq('id', watchChannel.id)

      return NextResponse.json({ status: 'ok', changes: 0 })
    }

    // Get folder structure for building paths
    const folders = await getFolderStructure(accessToken)

    // Process each change
    const results = {
      created: 0,
      updated: 0,
      classified: 0,
      deleted: 0,
      errors: 0,
    }

    const newFiles: string[] = []

    for (const change of changes) {
      if (change.removed || !change.fileId) {
        // File was deleted
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('drive_files') as any)
          .delete()
          .eq('user_id', watchChannel.user_id)
          .eq('drive_file_id', change.fileId)

        results.deleted++
        continue
      }

      // Process the new/updated file
      const result = await processNewFile(
        supabase,
        accessToken,
        watchChannel.user_id,
        change.fileId,
        folders as Map<string, Awaited<ReturnType<typeof getFile>>>
      )

      if (result.action === 'classified') {
        results.classified++
        if (result.fileName) newFiles.push(result.fileName)
      } else if (result.action === 'created') {
        results.created++
        if (result.fileName) newFiles.push(result.fileName)
      } else if (result.action === 'updated') {
        results.updated++
      } else {
        results.errors++
      }
    }

    // Update page token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('drive_watch_channels') as any)
      .update({ page_token: newPageToken })
      .eq('id', watchChannel.id)

    // Log the webhook processing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('drive_audit_log') as any).insert({
      user_id: watchChannel.user_id,
      action: 'WEBHOOK_PROCESSED',
      action_params: {
        channel_id: channelId,
        changes_count: changes.length,
        ...results,
        new_files: newFiles.slice(0, 10), // Log first 10 new files
      },
      triggered_by: 'webhook',
    })

    console.log('[Drive Webhook] Processed:', results)

    return NextResponse.json({
      status: 'ok',
      processed: changes.length,
      ...results,
    })
  } catch (error) {
    console.error('[Drive Webhook] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET /api/drive/webhook - Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Drive webhook endpoint is active',
  })
}
