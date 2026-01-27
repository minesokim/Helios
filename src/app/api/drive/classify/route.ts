import { createClient } from '@/lib/supabase/server'
import { refreshAccessToken } from '@/lib/google/oauth'
import { classifyFiles, extractFileContent, classifyDocument } from '@/services/drive/classifier'
import { NextRequest, NextResponse } from 'next/server'
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
    } catch (refreshError) {
      console.error('Token refresh failed:', refreshError)
      return null
    }
  }

  return tokenData.access_token
}

// POST /api/drive/classify - Classify files using AI
export async function POST(request: NextRequest) {
  console.log('[AI Classify] Starting classification...')

  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const body = await request.json().catch(() => ({}))
    const { fileIds, limit = 10, zone = null } = body as {
      fileIds?: string[]
      limit?: number
      zone?: string | null
    }

    // Get access token
    const accessToken = await getValidAccessToken(supabase, user.id)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google Drive not connected' },
        { status: 401 }
      )
    }

    // Get files to classify
    let query = supabase
      .from('drive_files')
      .select('*')
      .eq('user_id', user.id)

    if (fileIds && fileIds.length > 0) {
      // Classify specific files
      query = query.in('id', fileIds)
    } else {
      // Classify files that haven't been AI-classified yet
      query = query.is('document_type', null)

      if (zone) {
        query = query.eq('zone', zone)
      }

      query = query.limit(limit)
    }

    const { data: files, error: filesError } = await query

    if (filesError) {
      console.error('[AI Classify] Error fetching files:', filesError)
      return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 })
    }

    const driveFiles = files as DriveFile[] | null

    if (!driveFiles || driveFiles.length === 0) {
      return NextResponse.json({
        success: true,
        classified: 0,
        message: 'No files to classify',
      })
    }

    console.log(`[AI Classify] Classifying ${driveFiles.length} files...`)

    // Convert to classifier format
    const filesToClassify = driveFiles.map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mime_type,
      fullPath: f.full_path,
      driveFileId: f.drive_file_id,
      textPreview: f.text_preview,
    }))

    // Classify files
    let classified = 0
    let errors = 0
    const results: Array<{ id: string; zone: string; documentType: string; confidence: number }> = []

    for (const file of filesToClassify) {
      try {
        console.log(`[AI Classify] Processing: ${file.name}`)

        // Extract content
        const content = await extractFileContent(
          accessToken,
          file.driveFileId,
          file.mimeType
        )

        // Classify with AI
        const result = await classifyDocument(file, content)

        console.log(`[AI Classify] Result for ${file.name}: ${result.zone} (${result.confidence})`)

        // Update database
        const { error: updateError } = await supabase
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

        if (updateError) {
          console.error(`[AI Classify] Error updating ${file.name}:`, updateError)
          errors++
        } else {
          classified++
          results.push({
            id: file.id,
            zone: result.zone,
            documentType: result.documentType,
            confidence: result.confidence,
          })
        }

        // Small delay between files
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (fileError) {
        console.error(`[AI Classify] Error classifying ${file.name}:`, fileError)
        errors++
      }
    }

    // Log the action
    await supabase
      .from('drive_audit_log')
      .insert({
        user_id: user.id,
        action: 'AI_CLASSIFY',
        action_params: {
          files_processed: driveFiles.length,
          classified,
          errors,
        },
        triggered_by: 'user',
      } as never)

    console.log(`[AI Classify] Complete! Classified: ${classified}, Errors: ${errors}`)

    return NextResponse.json({
      success: true,
      classified,
      errors,
      total: driveFiles.length,
      results,
    })

  } catch (error) {
    console.error('[AI Classify] Error:', error)
    return NextResponse.json(
      { error: 'Classification failed' },
      { status: 500 }
    )
  }
}

// GET /api/drive/classify - Get classification stats
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get counts
    const { count: total } = await supabase
      .from('drive_files')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: classified } = await supabase
      .from('drive_files')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('document_type', 'is', null)

    const { count: pending } = await supabase
      .from('drive_files')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('document_type', null)

    // Get last classification time from audit log
    const { data: lastClassifyLogData } = await supabase
      .from('drive_audit_log')
      .select('created_at, action_params')
      .eq('user_id', user.id)
      .in('action', ['AI_CLASSIFY', 'AUTO_CLASSIFY'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const lastClassifyLog = lastClassifyLogData as { created_at: string; action_params: unknown } | null

    let lastClassifiedAt: string | null = null
    let lastClassifyStats: { total_classified?: number; total_errors?: number } | null = null
    let newFilesSinceLastClassify = 0

    if (lastClassifyLog) {
      lastClassifiedAt = lastClassifyLog.created_at
      lastClassifyStats = lastClassifyLog.action_params as { total_classified?: number; total_errors?: number } | null

      // Count files added since last classification that are not yet classified
      const { count: newFiles } = await supabase
        .from('drive_files')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('document_type', null)
        .gt('created_at', lastClassifyLog.created_at)

      newFilesSinceLastClassify = newFiles || 0
    }

    return NextResponse.json({
      total: total || 0,
      classified: classified || 0,
      pending: pending || 0,
      lastClassifiedAt,
      lastClassifyStats,
      newFilesSinceLastClassify,
    })

  } catch (error) {
    console.error('[AI Classify] Stats error:', error)
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    )
  }
}
