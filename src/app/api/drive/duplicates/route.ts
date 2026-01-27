import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

type DriveFile = Database['public']['Tables']['drive_files']['Row']

export interface DuplicateGroup {
  id: string
  files: DriveFile[]
  similarity: number
  reason: string
}

// GET - Find potential duplicates
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

    // Try to use vector-based duplicate detection
    const { data: vectorDupes, error: rpcError } = await supabase.rpc(
      'find_duplicate_files' as never,
      {
        filter_user_id: user.id,
        similarity_threshold: 0.92, // High threshold for duplicates
      } as never
    )

    if (!rpcError && vectorDupes) {
      // Get file details for the duplicates
      const allFileIds = new Set<string>()
      const dupeArray = vectorDupes as Array<{ file_id_1: string; file_id_2: string; similarity: number }>
      for (const dupe of dupeArray) {
        allFileIds.add(dupe.file_id_1)
        allFileIds.add(dupe.file_id_2)
      }

      const { data: files } = await supabase
        .from('drive_files')
        .select('*')
        .in('id', Array.from(allFileIds))

      const fileMap = new Map((files || []).map((f: DriveFile) => [f.id, f]))

      // Group duplicates
      const groups = groupDuplicates(dupeArray, fileMap)

      return NextResponse.json({
        groups,
        count: groups.length,
        method: 'semantic',
      })
    }

    // Fallback to name-based duplicate detection
    console.log('[Duplicates] Falling back to name-based detection')
    return await findNameBasedDuplicates(supabase, user.id)
  } catch (error) {
    console.error('[Duplicates] Error:', error)
    return NextResponse.json(
      { error: 'Failed to find duplicates' },
      { status: 500 }
    )
  }
}

// Group duplicate pairs into clusters
function groupDuplicates(
  pairs: Array<{ file_id_1: string; file_id_2: string; similarity: number }>,
  fileMap: Map<string, DriveFile>
): DuplicateGroup[] {
  const groups: Map<string, Set<string>> = new Map()
  const similarityMap: Map<string, number> = new Map()

  for (const pair of pairs) {
    const id1 = pair.file_id_1
    const id2 = pair.file_id_2

    // Find existing groups
    let group1: string | null = null
    let group2: string | null = null

    for (const [groupId, members] of groups) {
      if (members.has(id1)) group1 = groupId
      if (members.has(id2)) group2 = groupId
    }

    if (group1 && group2 && group1 !== group2) {
      // Merge groups
      const members1 = groups.get(group1)!
      const members2 = groups.get(group2)!
      for (const member of members2) {
        members1.add(member)
      }
      groups.delete(group2)
    } else if (group1) {
      groups.get(group1)!.add(id2)
    } else if (group2) {
      groups.get(group2)!.add(id1)
    } else {
      // Create new group
      const groupId = `group_${groups.size}`
      groups.set(groupId, new Set([id1, id2]))
      similarityMap.set(groupId, pair.similarity)
    }
  }

  // Convert to output format
  const result: DuplicateGroup[] = []

  for (const [groupId, memberIds] of groups) {
    const files = Array.from(memberIds)
      .map(id => fileMap.get(id))
      .filter((f): f is DriveFile => f !== undefined)

    if (files.length > 1) {
      result.push({
        id: groupId,
        files,
        similarity: similarityMap.get(groupId) || 0.9,
        reason: 'Similar content detected',
      })
    }
  }

  return result.sort((a, b) => b.similarity - a.similarity)
}

// Fallback: Find duplicates based on name similarity
async function findNameBasedDuplicates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data: files } = await supabase
    .from('drive_files')
    .select('*')
    .eq('user_id', userId)
    .order('name')

  if (!files || files.length === 0) {
    return NextResponse.json({ groups: [], count: 0, method: 'name' })
  }

  const driveFiles = files as DriveFile[]

  // Group by normalized name
  const nameGroups: Map<string, DriveFile[]> = new Map()

  for (const file of driveFiles) {
    // Normalize name: lowercase, remove extension, remove numbers/dates
    const normalized = file.name
      .toLowerCase()
      .replace(/\.[^.]+$/, '') // Remove extension
      .replace(/\s*\(\d+\)\s*$/, '') // Remove (1), (2) etc
      .replace(/\s*-\s*copy\s*$/i, '') // Remove "- copy"
      .replace(/\s*copy\s*$/i, '') // Remove "copy"
      .replace(/\d{4}[-_]?\d{2}[-_]?\d{2}/g, '') // Remove dates
      .replace(/[_-]+/g, ' ')
      .trim()

    if (!nameGroups.has(normalized)) {
      nameGroups.set(normalized, [])
    }
    nameGroups.get(normalized)!.push(file)
  }

  // Filter to groups with duplicates
  const groups: DuplicateGroup[] = []

  for (const [name, groupFiles] of nameGroups) {
    if (groupFiles.length > 1) {
      groups.push({
        id: `name_${name.substring(0, 20)}`,
        files: groupFiles,
        similarity: 0.8,
        reason: 'Similar file names',
      })
    }
  }

  // Also check for exact size duplicates
  const sizeGroups: Map<string, DriveFile[]> = new Map()

  for (const file of driveFiles) {
    if (!file.size_bytes || file.size_bytes < 1000) continue // Skip tiny files

    const key = `${file.size_bytes}_${file.mime_type}`
    if (!sizeGroups.has(key)) {
      sizeGroups.set(key, [])
    }
    sizeGroups.get(key)!.push(file)
  }

  for (const [, groupFiles] of sizeGroups) {
    if (groupFiles.length > 1) {
      // Check if this group is already covered by name-based detection
      const existingFileIds = new Set(
        groups.flatMap(g => g.files.map(f => f.id))
      )
      const newFiles = groupFiles.filter(f => !existingFileIds.has(f.id))

      if (newFiles.length > 1) {
        groups.push({
          id: `size_${groupFiles[0].size_bytes}`,
          files: groupFiles,
          similarity: 0.85,
          reason: 'Same size and type',
        })
      }
    }
  }

  return NextResponse.json({
    groups: groups.sort((a, b) => b.files.length - a.files.length),
    count: groups.length,
    method: 'name',
  })
}
