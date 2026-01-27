// File indexing service for Document Intelligence
import { createClient } from '@/lib/supabase/server'
import { determineZone, isProtectedFile, type ZoneName } from './zones'
import type { Database } from '@/types/database'

type DriveFile = Database['public']['Tables']['drive_files']['Row']

export interface IndexResult {
  success: boolean
  fileId: string
  zone: ZoneName | null
  isProtected: boolean
  error?: string
}

// Index a single file (assign zone, check protection, etc)
export async function indexFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: DriveFile
): Promise<IndexResult> {
  try {
    // Determine zone based on path
    const zone = determineZone(
      file.full_path || '/',
      file.mime_type,
      file.name
    )

    // Check if file is protected
    const isProtected = isProtectedFile(
      file.name,
      file.extension,
      file.full_path || '/'
    )

    // Update file with zone and protection status
    const { error: updateError } = await supabase
      .from('drive_files')
      .update({
        zone,
        is_protected: isProtected,
        processing_status: isProtected ? 'skipped' : 'indexed',
      } as never)
      .eq('id', file.id)

    if (updateError) {
      return {
        success: false,
        fileId: file.id,
        zone: null,
        isProtected: false,
        error: updateError.message,
      }
    }

    return {
      success: true,
      fileId: file.id,
      zone,
      isProtected,
    }
  } catch (error) {
    return {
      success: false,
      fileId: file.id,
      zone: null,
      isProtected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Index multiple files
export async function indexFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  files: DriveFile[]
): Promise<{ success: number; errors: number; results: IndexResult[] }> {
  const results: IndexResult[] = []
  let success = 0
  let errors = 0

  for (const file of files) {
    const result = await indexFile(supabase, file)
    results.push(result)

    if (result.success) {
      success++
    } else {
      errors++
    }
  }

  return { success, errors, results }
}

// Get pending files that need indexing
export async function getPendingFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  limit: number = 100
): Promise<DriveFile[]> {
  const { data, error } = await supabase
    .from('drive_files')
    .select('*')
    .eq('user_id', userId)
    .eq('processing_status', 'pending')
    .limit(limit)

  if (error) {
    console.error('Error fetching pending files:', error)
    return []
  }

  return data || []
}

// Process pending files for a user
export async function processPendingFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  batchSize: number = 100
): Promise<{ success: number; errors: number; total: number }> {
  let totalSuccess = 0
  let totalErrors = 0
  let totalProcessed = 0

  let hasMore = true

  while (hasMore) {
    const files = await getPendingFiles(supabase, userId, batchSize)

    if (files.length === 0) {
      hasMore = false
      break
    }

    const { success, errors } = await indexFiles(supabase, files)
    totalSuccess += success
    totalErrors += errors
    totalProcessed += files.length

    // If we got fewer than batch size, we're done
    if (files.length < batchSize) {
      hasMore = false
    }
  }

  return {
    success: totalSuccess,
    errors: totalErrors,
    total: totalProcessed,
  }
}

// Get file statistics for a user
export async function getFileStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{
  total: number
  byZone: Record<string, number>
  byStatus: Record<string, number>
  protected: number
  duplicates: number
}> {
  // Get total count
  const { count: total } = await supabase
    .from('drive_files')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  // Get counts by zone
  const { data: zoneDataRaw } = await supabase
    .from('drive_files')
    .select('zone')
    .eq('user_id', userId)

  const zoneData = zoneDataRaw as Array<{ zone: string | null }> | null

  const byZone: Record<string, number> = {}
  if (zoneData) {
    for (const file of zoneData) {
      const zone = file.zone || 'UNKNOWN'
      byZone[zone] = (byZone[zone] || 0) + 1
    }
  }

  // Get counts by status
  const { data: statusDataRaw } = await supabase
    .from('drive_files')
    .select('processing_status')
    .eq('user_id', userId)

  const statusData = statusDataRaw as Array<{ processing_status: string }> | null

  const byStatus: Record<string, number> = {}
  if (statusData) {
    for (const file of statusData) {
      const status = file.processing_status || 'pending'
      byStatus[status] = (byStatus[status] || 0) + 1
    }
  }

  // Get protected count
  const { count: protectedCount } = await supabase
    .from('drive_files')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_protected', true)

  // Get duplicate count
  const { count: duplicateCount } = await supabase
    .from('drive_files')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_duplicate', true)

  return {
    total: total || 0,
    byZone,
    byStatus,
    protected: protectedCount || 0,
    duplicates: duplicateCount || 0,
  }
}
