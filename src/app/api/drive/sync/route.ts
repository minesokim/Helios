import { createClient } from '@/lib/supabase/server'
import { getAllFiles, getFolderStructure, buildFilePath } from '@/lib/google/drive'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'
import { NextRequest, NextResponse } from 'next/server'

// Helper to extract file extension
function getExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return null
  }
  return filename.substring(lastDot + 1).toLowerCase()
}

// POST /api/drive/sync - Sync files from Google Drive to database
export async function POST(request: NextRequest) {
  console.log('[Drive Sync] Starting sync...')
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[Drive Sync] User:', user?.id, 'Auth error:', authError?.message)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get optional accountId from request body
    let accountId: string | null = null
    try {
      const body = await request.json()
      accountId = body?.accountId || null
    } catch {
      // No body or not JSON, sync all accounts
    }

    // Get all accounts or specific account
    const accounts = await getAllAccounts(user.id)
    if (accounts.length === 0) {
      return NextResponse.json(
        { error: 'No Google accounts connected', code: 'NOT_CONNECTED' },
        { status: 401 }
      )
    }

    // Filter to specific account if requested
    const accountsToSync = accountId
      ? accounts.filter(a => a.id === accountId)
      : accounts

    if (accountsToSync.length === 0) {
      return NextResponse.json(
        { error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' },
        { status: 404 }
      )
    }

    let totalIndexed = 0
    let totalUpdated = 0
    let totalErrors = 0
    let totalFiles = 0

    // Sync each account
    for (const account of accountsToSync) {
      console.log(`[Drive Sync] Syncing account: ${account.google_email}`)

      // Get valid access token for this account
      const tokens = await getValidAccessToken(account.id, user.id)
      if (!tokens) {
        console.error(`[Drive Sync] No valid token for account: ${account.google_email}`)
        totalErrors++
        continue
      }

      try {
        // Get folder structure for building paths
        console.log('[Drive Sync] Getting folder structure...')
        const folders = await getFolderStructure(tokens.accessToken)
        console.log('[Drive Sync] Found', folders.size, 'folders')

        // Get all files from Drive
        console.log('[Drive Sync] Fetching all files from Drive...')
        const files = await getAllFiles(tokens.accessToken, {
          onProgress: (count) => {
            console.log(`[Drive Sync] Fetched ${count} files from Drive...`)
          },
        })
        console.log('[Drive Sync] Total files fetched:', files.length)
        totalFiles += files.length

        // Process files in batches
        const batchSize = 100
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize)

          const fileRecords = batch.map((file) => {
            const fullPath = buildFilePath(file, folders)
            const extension = file.name ? getExtension(file.name) : null

            return {
              user_id: user.id,
              google_account_id: account.id,
              drive_file_id: file.id!,
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
          })

          // Upsert files
          const { error: upsertError } = await supabase
            .from('drive_files')
            .upsert(fileRecords as never, {
              onConflict: 'user_id,drive_file_id',
              ignoreDuplicates: false,
            })

          if (upsertError) {
            console.error('Error upserting files:', upsertError)
            totalErrors += batch.length
          } else {
            totalIndexed += batch.length
          }
        }

        console.log(`[Drive Sync] Completed sync for ${account.google_email}`)
      } catch (accountError) {
        console.error(`[Drive Sync] Error syncing account ${account.google_email}:`, accountError)
        totalErrors++
      }
    }

    // Log the sync action
    await supabase
      .from('drive_audit_log')
      .insert({
        user_id: user.id,
        action: 'FULL_SYNC',
        action_params: {
          total_files: totalFiles,
          indexed: totalIndexed,
          errors: totalErrors,
          accounts_synced: accountsToSync.map(a => a.google_email),
        },
        triggered_by: 'user',
      } as never)

    console.log('[Drive Sync] Sync complete! Total:', totalFiles, 'Indexed:', totalIndexed, 'Errors:', totalErrors)
    return NextResponse.json({
      success: true,
      totalFiles,
      indexed: totalIndexed,
      updated: totalUpdated,
      errors: totalErrors,
      accountsSynced: accountsToSync.length,
    })
  } catch (error) {
    console.error('[Drive Sync] Error:', error)
    return NextResponse.json(
      { error: 'Failed to sync Google Drive' },
      { status: 500 }
    )
  }
}

// GET /api/drive/sync - Get sync status
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if any accounts are connected
    const accounts = await getAllAccounts(user.id)

    if (accounts.length === 0) {
      return NextResponse.json({
        connected: false,
        totalFiles: 0,
        lastSync: null,
        accounts: [],
      })
    }

    // Get file counts
    const { count: totalFiles } = await supabase
      .from('drive_files')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    // Get last sync
    const { data } = await supabase
      .from('drive_audit_log')
      .select('created_at, action_params')
      .eq('user_id', user.id)
      .eq('action', 'FULL_SYNC')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const lastSyncLog = data as { created_at: string; action_params: Record<string, unknown> } | null

    return NextResponse.json({
      connected: true,
      totalFiles: totalFiles || 0,
      lastSync: lastSyncLog?.created_at || null,
      lastSyncDetails: lastSyncLog?.action_params || null,
      accounts: accounts.map(a => ({
        id: a.id,
        email: a.google_email,
        label: a.account_label,
      })),
    })
  } catch (error) {
    console.error('Drive sync status error:', error)
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    )
  }
}
