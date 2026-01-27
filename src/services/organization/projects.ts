import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type Project = Database['public']['Tables']['projects']['Row']
type ProjectInsert = Database['public']['Tables']['projects']['Insert']
type ProjectUpdate = Database['public']['Tables']['projects']['Update']
type Person = Database['public']['Tables']['people']['Row']

export type ProjectStatus = 'active' | 'completed' | 'archived' | 'on_hold'

export interface ProjectWithStats extends Project {
  file_count?: number
  member_count?: number
  members?: Array<{
    person: Person
    role: string
  }>
}

// Create a new project
export async function createProject(
  userId: string,
  data: Omit<ProjectInsert, 'user_id'>
): Promise<Project> {
  const supabase = await createClient()

  // Generate keywords from name and description
  const autoKeywords = generateKeywords(data.name, data.description || '')

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      ...data,
      user_id: userId,
      keywords: [...(data.keywords || []), ...autoKeywords],
    } as never)
    .select()
    .single()

  if (error) throw error
  return project as Project
}

// Get a project by ID
export async function getProject(
  userId: string,
  projectId: string,
  includeMembers = false
): Promise<ProjectWithStats | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('id', projectId)
    .is('deleted_at', null)
    .single()

  if (error) return null

  const project = data as Project

  if (includeMembers) {
    const { data: members } = await supabase
      .from('project_members')
      .select(`
        role,
        people!inner(*)
      `)
      .eq('project_id', projectId)

    return {
      ...project,
      members: ((members || []) as Array<{ role: string; people: Person }>).map(m => ({
        person: m.people,
        role: m.role,
      })),
      member_count: (members || []).length,
    }
  }

  return project
}

// Get all projects for a user
export async function getAllProjects(
  userId: string,
  options?: {
    status?: ProjectStatus
    search?: string
    limit?: number
    offset?: number
    includeStats?: boolean
  }
): Promise<ProjectWithStats[]> {
  const supabase = await createClient()

  let query = supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,description.ilike.%${options.search}%`)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options?.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) throw error
  const projects = (data || []) as Project[]

  // Add stats if requested
  if (options?.includeStats && projects.length > 0) {
    const projectIds = projects.map(p => p.id)

    // Get file counts
    const { data: fileCounts } = await supabase
      .from('file_associations')
      .select('project_id')
      .in('project_id', projectIds)

    // Get member counts
    const { data: memberCounts } = await supabase
      .from('project_members')
      .select('project_id')
      .in('project_id', projectIds)

    const fileCountMap = new Map<string, number>()
    const memberCountMap = new Map<string, number>()

    const fileCountsTyped = (fileCounts || []) as Array<{ project_id: string | null }>
    const memberCountsTyped = (memberCounts || []) as Array<{ project_id: string }>

    for (const fc of fileCountsTyped) {
      if (fc.project_id) {
        const count = fileCountMap.get(fc.project_id) || 0
        fileCountMap.set(fc.project_id, count + 1)
      }
    }

    for (const mc of memberCountsTyped) {
      const count = memberCountMap.get(mc.project_id) || 0
      memberCountMap.set(mc.project_id, count + 1)
    }

    return projects.map(p => ({
      ...p,
      file_count: fileCountMap.get(p.id) || 0,
      member_count: memberCountMap.get(p.id) || 0,
    }))
  }

  return projects
}

// Update a project
export async function updateProject(
  userId: string,
  projectId: string,
  data: ProjectUpdate
): Promise<Project> {
  const supabase = await createClient()

  // Regenerate keywords if name or description changed
  let updates = { ...data }
  if (data.name || data.description) {
    const currentProject = await getProject(userId, projectId)
    if (currentProject) {
      const newKeywords = generateKeywords(
        data.name || currentProject.name,
        data.description || currentProject.description || ''
      )
      updates.keywords = [
        ...(data.keywords || currentProject.keywords || []),
        ...newKeywords,
      ]
    }
  }

  const { data: project, error } = await supabase
    .from('projects')
    .update(updates as never)
    .eq('user_id', userId)
    .eq('id', projectId)
    .select()
    .single()

  if (error) throw error
  return project as Project
}

// Soft delete a project
export async function deleteProject(userId: string, projectId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('user_id', userId)
    .eq('id', projectId)

  if (error) throw error
}

// Add a member to a project
export async function addProjectMember(
  userId: string,
  projectId: string,
  personId: string,
  role = 'member'
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('project_members').upsert(
    {
      user_id: userId,
      project_id: projectId,
      person_id: personId,
      role,
    } as never,
    {
      onConflict: 'project_id,person_id',
    }
  )

  if (error) throw error
}

// Remove a member from a project
export async function removeProjectMember(
  projectId: string,
  personId: string
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('person_id', personId)

  if (error) throw error
}

// Get project members
export async function getProjectMembers(
  projectId: string
): Promise<Array<{ person: Person; role: string }>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('project_members')
    .select(`
      role,
      people!inner(*)
    `)
    .eq('project_id', projectId)

  if (error) throw error

  return ((data || []) as Array<{ role: string; people: Person }>).map(m => ({
    person: m.people,
    role: m.role,
  }))
}

// Find projects that match text content
export async function findProjectsInText(userId: string, text: string): Promise<Project[]> {
  const supabase = await createClient()

  // Get all active projects
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)

  if (!projects) return []

  const textLower = text.toLowerCase()
  const matches: Project[] = []

  for (const project of projects as Project[]) {
    // Check project name
    if (textLower.includes(project.name.toLowerCase())) {
      matches.push(project)
      continue
    }

    // Check keywords
    for (const keyword of project.keywords || []) {
      if (keyword.length > 2 && textLower.includes(keyword.toLowerCase())) {
        matches.push(project)
        break
      }
    }
  }

  return matches
}

// Get files associated with a project
export async function getProjectFiles(
  userId: string,
  projectId: string
): Promise<
  Array<{
    file_id: string
    name: string
    full_path: string | null
    association_type: string
    confidence: number | null
  }>
> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_project_files' as never, {
    p_project_id: projectId,
  } as never)

  if (error) {
    // Fallback
    const { data: fallbackData } = await supabase
      .from('file_associations')
      .select(
        `
        drive_file_id,
        association_type,
        confidence,
        drive_files!inner(name, full_path)
      `
      )
      .eq('user_id', userId)
      .eq('project_id', projectId)

    return (
      (fallbackData || []) as Array<{
        drive_file_id: string
        association_type: string
        confidence: number | null
        drive_files: { name: string; full_path: string | null }
      }>
    ).map(d => ({
      file_id: d.drive_file_id,
      name: d.drive_files.name,
      full_path: d.drive_files.full_path,
      association_type: d.association_type,
      confidence: d.confidence,
    }))
  }

  return (data || []) as Array<{
    file_id: string
    name: string
    full_path: string | null
    association_type: string
    confidence: number | null
  }>
}

// Associate a file with a project
export async function associateFileWithProject(
  userId: string,
  fileId: string,
  projectId: string,
  options?: {
    associationType?: string
    confidence?: number
    context?: string
  }
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('file_associations')
    .upsert(
      {
        user_id: userId,
        drive_file_id: fileId,
        project_id: projectId,
        association_type: options?.associationType || 'manual',
        confidence: options?.confidence,
        context: options?.context,
      } as never,
      {
        onConflict: 'drive_file_id,project_id',
      }
    )

  if (error) throw error
}

// Remove file association from project
export async function removeProjectFileAssociation(
  userId: string,
  fileId: string,
  projectId: string
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('file_associations')
    .delete()
    .eq('user_id', userId)
    .eq('drive_file_id', fileId)
    .eq('project_id', projectId)

  if (error) throw error
}

// Helper: Generate keywords from name and description
function generateKeywords(name: string, description: string): string[] {
  const text = `${name} ${description}`.toLowerCase()

  // Common stop words to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
  ])

  // Extract words
  const words = text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))

  // Deduplicate
  return [...new Set(words)]
}
