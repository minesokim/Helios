import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type Person = Database['public']['Tables']['people']['Row']
type PersonInsert = Database['public']['Tables']['people']['Insert']
type PersonUpdate = Database['public']['Tables']['people']['Update']

export type RelationshipType = 'client' | 'vendor' | 'collaborator' | 'personal' | 'contact'

export interface PersonWithStats extends Person {
  file_count?: number
  project_count?: number
}

// Create a new person
export async function createPerson(
  userId: string,
  data: Omit<PersonInsert, 'user_id'>
): Promise<Person> {
  const supabase = await createClient()

  // Generate name aliases from the full name
  const nameAliases = generateNameAliases(data.name)

  const { data: person, error } = await supabase
    .from('people')
    .insert({
      ...data,
      user_id: userId,
      name_aliases: [...(data.name_aliases || []), ...nameAliases],
    } as never)
    .select()
    .single()

  if (error) throw error
  return person as Person
}

// Get a person by ID
export async function getPerson(userId: string, personId: string): Promise<Person | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .eq('id', personId)
    .is('deleted_at', null)
    .single()

  if (error) return null
  return data as Person
}

// Get all people for a user
export async function getAllPeople(
  userId: string,
  options?: {
    relationship?: RelationshipType
    search?: string
    limit?: number
    offset?: number
    includeStats?: boolean
  }
): Promise<PersonWithStats[]> {
  const supabase = await createClient()

  let query = supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('name')

  if (options?.relationship) {
    query = query.eq('relationship', options.relationship)
  }

  if (options?.search) {
    query = query.or(
      `name.ilike.%${options.search}%,company.ilike.%${options.search}%,email.ilike.%${options.search}%`
    )
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options?.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) throw error
  const people = (data || []) as Person[]

  // Add stats if requested
  if (options?.includeStats && people.length > 0) {
    const personIds = people.map(p => p.id)

    // Get file counts
    const { data: fileCounts } = await supabase
      .from('file_associations')
      .select('person_id')
      .in('person_id', personIds)

    // Get project counts
    const { data: projectCounts } = await supabase
      .from('project_members')
      .select('person_id')
      .in('person_id', personIds)

    const fileCountMap = new Map<string, number>()
    const projectCountMap = new Map<string, number>()

    const fileCountsTyped = (fileCounts || []) as Array<{ person_id: string | null }>
    const projectCountsTyped = (projectCounts || []) as Array<{ person_id: string }>

    for (const fc of fileCountsTyped) {
      if (fc.person_id) {
        const count = fileCountMap.get(fc.person_id) || 0
        fileCountMap.set(fc.person_id, count + 1)
      }
    }

    for (const pc of projectCountsTyped) {
      const count = projectCountMap.get(pc.person_id) || 0
      projectCountMap.set(pc.person_id, count + 1)
    }

    return people.map(p => ({
      ...p,
      file_count: fileCountMap.get(p.id) || 0,
      project_count: projectCountMap.get(p.id) || 0,
    }))
  }

  return people
}

// Update a person
export async function updatePerson(
  userId: string,
  personId: string,
  data: PersonUpdate
): Promise<Person> {
  const supabase = await createClient()

  // Regenerate aliases if name changed
  let updates = { ...data }
  if (data.name) {
    const newAliases = generateNameAliases(data.name)
    updates.name_aliases = [...(data.name_aliases || []), ...newAliases]
  }

  const { data: person, error } = await supabase
    .from('people')
    .update(updates as never)
    .eq('user_id', userId)
    .eq('id', personId)
    .select()
    .single()

  if (error) throw error
  return person as Person
}

// Soft delete a person
export async function deletePerson(userId: string, personId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('people')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('user_id', userId)
    .eq('id', personId)

  if (error) throw error
}

// Search people by name (including aliases)
export async function searchPeople(
  userId: string,
  query: string,
  limit = 10
): Promise<Array<Person & { match_score: number }>> {
  const supabase = await createClient()

  // Use the database function for better matching
  const { data, error } = await supabase.rpc('search_people' as never, {
    p_user_id: userId,
    p_query: query,
  } as never)

  if (error) {
    // Fallback to simple search
    const { data: fallbackData } = await supabase
      .from('people')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .or(`name.ilike.%${query}%,company.ilike.%${query}%`)
      .limit(limit)

    return ((fallbackData || []) as Person[]).map(p => ({
      ...p,
      match_score: p.name.toLowerCase().includes(query.toLowerCase()) ? 0.8 : 0.5,
    }))
  }

  return (data || []) as Array<Person & { match_score: number }>
}

// Find people mentioned in text
export async function findPeopleInText(userId: string, text: string): Promise<Person[]> {
  const supabase = await createClient()

  // Get all people for the user
  const { data: people } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (!people) return []

  const textLower = text.toLowerCase()
  const matches: Person[] = []

  for (const person of people as Person[]) {
    // Check full name
    if (textLower.includes(person.name.toLowerCase())) {
      matches.push(person)
      continue
    }

    // Check aliases
    for (const alias of person.name_aliases || []) {
      if (alias.length > 2 && textLower.includes(alias.toLowerCase())) {
        matches.push(person)
        break
      }
    }

    // Check company
    if (person.company && textLower.includes(person.company.toLowerCase())) {
      matches.push(person)
    }
  }

  return matches
}

// Get files associated with a person
export async function getPersonFiles(
  userId: string,
  personId: string
): Promise<Array<{ file_id: string; name: string; full_path: string | null; association_type: string; confidence: number | null }>> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_person_files' as never, {
    p_person_id: personId,
  } as never)

  if (error) {
    // Fallback
    const { data: fallbackData } = await supabase
      .from('file_associations')
      .select(`
        drive_file_id,
        association_type,
        confidence,
        drive_files!inner(name, full_path)
      `)
      .eq('user_id', userId)
      .eq('person_id', personId)

    return ((fallbackData || []) as Array<{
      drive_file_id: string
      association_type: string
      confidence: number | null
      drive_files: { name: string; full_path: string | null }
    }>).map(d => ({
      file_id: d.drive_file_id,
      name: d.drive_files.name,
      full_path: d.drive_files.full_path,
      association_type: d.association_type,
      confidence: d.confidence,
    }))
  }

  return (data || []) as Array<{ file_id: string; name: string; full_path: string | null; association_type: string; confidence: number | null }>
}

// Associate a file with a person
export async function associateFileWithPerson(
  userId: string,
  fileId: string,
  personId: string,
  options?: {
    associationType?: string
    confidence?: number
    context?: string
  }
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('file_associations')
    .upsert({
      user_id: userId,
      drive_file_id: fileId,
      person_id: personId,
      association_type: options?.associationType || 'manual',
      confidence: options?.confidence,
      context: options?.context,
    } as never, {
      onConflict: 'drive_file_id,person_id',
    })

  if (error) throw error
}

// Remove file association
export async function removeFileAssociation(
  userId: string,
  fileId: string,
  personId: string
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('file_associations')
    .delete()
    .eq('user_id', userId)
    .eq('drive_file_id', fileId)
    .eq('person_id', personId)

  if (error) throw error
}

// Helper: Generate name aliases from full name
function generateNameAliases(fullName: string): string[] {
  const aliases: string[] = []
  const parts = fullName.trim().split(/\s+/)

  if (parts.length === 0) return aliases

  // First name
  if (parts[0]) {
    aliases.push(parts[0])
  }

  // Last name
  if (parts.length > 1) {
    aliases.push(parts[parts.length - 1])
  }

  // First initial + last name (e.g., "M. Cramer")
  if (parts.length > 1) {
    aliases.push(`${parts[0][0]}. ${parts[parts.length - 1]}`)
  }

  // Last name, First name (e.g., "Cramer, Mary")
  if (parts.length > 1) {
    aliases.push(`${parts[parts.length - 1]}, ${parts[0]}`)
  }

  return aliases.filter(a => a.length > 1)
}
