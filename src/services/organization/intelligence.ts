// Intelligent file organization service
// Enhances classification with people/project detection and smart path suggestions

import { createClient } from '@/lib/supabase/server'
import { classifyDocument, extractFileContent, type ClassificationResult, type FileToClassify } from '@/services/drive/classifier'
import { findPeopleInText, type PersonWithStats } from './people'
import { findProjectsInText, type ProjectWithStats } from './projects'
import type { Database } from '@/types/database'

type Person = Database['public']['Tables']['people']['Row']
type Project = Database['public']['Tables']['projects']['Row']
type DriveFile = Database['public']['Tables']['drive_files']['Row']

export interface IntelligentClassificationResult extends ClassificationResult {
  detectedPeople: Person[]
  detectedProjects: Project[]
  suggestedPath: string
  organizationConfidence: number
  pathReasoning: string
}

export interface OrganizationSuggestion {
  fileId: string
  fileName: string
  currentPath: string | null
  suggestedPath: string
  people: Person[]
  projects: Project[]
  confidence: number
  reasoning: string
}

// Folder structure templates
const FOLDER_STRUCTURE = {
  Business: {
    Clients: {},
    Projects: {},
    Invoices: {},
    Contracts: {},
    Taxes: {},
    Legal: {},
  },
  Personal: {
    Documents: {},
    Photos: {},
    Health: {},
  },
  Projects: {},
  Music: {
    Songs: {},
    Lyrics: {},
    SetLists: {},
  },
  Design: {
    Mockups: {},
    Assets: {},
    Logos: {},
  },
  Code: {},
}

// Intelligently classify a file with people/project detection
export async function intelligentClassify(
  userId: string,
  file: FileToClassify,
  fileContent: string | null,
  options?: {
    people?: Person[]
    projects?: Project[]
  }
): Promise<IntelligentClassificationResult> {
  // Get base classification
  const baseResult = await classifyDocument(file, fileContent)

  // Build searchable text
  const searchText = buildSearchableText(file, fileContent, baseResult)

  // Find people and projects
  let detectedPeople: Person[] = []
  let detectedProjects: Project[] = []

  if (options?.people) {
    detectedPeople = findPeopleInTextLocal(options.people, searchText)
  } else {
    detectedPeople = await findPeopleInText(userId, searchText)
  }

  if (options?.projects) {
    detectedProjects = findProjectsInTextLocal(options.projects, searchText)
  } else {
    detectedProjects = await findProjectsInText(userId, searchText)
  }

  // Generate suggested path
  const { path: suggestedPath, confidence: organizationConfidence, reasoning: pathReasoning } =
    generateSuggestedPath(baseResult, detectedPeople, detectedProjects, file)

  return {
    ...baseResult,
    detectedPeople,
    detectedProjects,
    suggestedPath,
    organizationConfidence,
    pathReasoning,
  }
}

// Batch intelligent classification with shared context
export async function batchIntelligentClassify(
  userId: string,
  accessToken: string,
  files: FileToClassify[],
  onProgress?: (completed: number, total: number, current: FileToClassify) => void
): Promise<Map<string, IntelligentClassificationResult>> {
  const supabase = await createClient()

  // Pre-fetch all people and projects for efficiency
  const { data: peopleData } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)

  const { data: projectsData } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)

  const people = (peopleData || []) as Person[]
  const projects = (projectsData || []) as Project[]

  const results = new Map<string, IntelligentClassificationResult>()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    if (onProgress) {
      onProgress(i, files.length, file)
    }

    // Extract content
    const content = await extractFileContent(accessToken, file.driveFileId, file.mimeType)

    // Intelligent classify with pre-fetched context
    const result = await intelligentClassify(userId, file, content, { people, projects })
    results.set(file.id, result)

    // Small delay
    if (i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return results
}

// Auto-create People and Projects from extracted entities
export async function autoCreateEntities(
  userId: string,
  result: ClassificationResult,
  existingPeople: Person[],
  existingProjects: Project[]
): Promise<{ newPeople: Person[]; newProjects: Project[] }> {
  const supabase = await createClient()
  const newPeople: Person[] = []
  const newProjects: Project[] = []

  // Normalize names for comparison
  const existingPeopleNames = new Set(existingPeople.map(p => p.name.toLowerCase()))
  const existingCompanies = new Set(existingPeople.map(p => p.company?.toLowerCase()).filter(Boolean))
  const existingProjectNames = new Set(existingProjects.map(p => p.name.toLowerCase()))

  // Auto-create People from detected names
  for (const personName of result.entities.people || []) {
    const nameLower = personName.toLowerCase()
    // Skip if already exists or is too short/generic
    if (existingPeopleNames.has(nameLower) || personName.length < 3) continue
    // Skip common generic words
    if (['the', 'this', 'that', 'user', 'admin', 'owner', 'author'].includes(nameLower)) continue

    const { data: newPerson, error } = await supabase
      .from('people')
      .insert({
        user_id: userId,
        name: personName,
        relationship: 'contact', // Default relationship
        source: 'auto_detected',
        notes: `Auto-detected from file classification`,
      } as never)
      .select()
      .single()

    if (!error && newPerson) {
      newPeople.push(newPerson as Person)
      existingPeopleNames.add(nameLower)
    }
  }

  // Auto-create People from detected companies (as organization contacts)
  for (const companyName of result.entities.companies || []) {
    const nameLower = companyName.toLowerCase()
    // Skip if already exists or is too short
    if (existingCompanies.has(nameLower) || existingPeopleNames.has(nameLower) || companyName.length < 3) continue
    // Skip generic terms
    if (['inc', 'llc', 'ltd', 'corp', 'company'].includes(nameLower)) continue

    const { data: newPerson, error } = await supabase
      .from('people')
      .insert({
        user_id: userId,
        name: companyName,
        company: companyName,
        relationship: 'company',
        source: 'auto_detected',
        notes: `Auto-detected company from file classification`,
      } as never)
      .select()
      .single()

    if (!error && newPerson) {
      newPeople.push(newPerson as Person)
      existingCompanies.add(nameLower)
    }
  }

  // Auto-create Projects from significant topics (only for business/client zones)
  if (['BUSINESS', 'CLIENTS', 'PROJECTS'].includes(result.zone)) {
    for (const topic of result.entities.topics || []) {
      const topicLower = topic.toLowerCase()
      // Skip if already exists, too short, or too generic
      if (existingProjectNames.has(topicLower) || topic.length < 4) continue
      // Skip generic terms
      if (['document', 'file', 'report', 'email', 'meeting', 'notes', 'draft'].includes(topicLower)) continue

      const { data: newProject, error } = await supabase
        .from('projects')
        .insert({
          user_id: userId,
          name: topic,
          status: 'active',
          keywords: [topicLower],
          source: 'auto_detected',
          description: `Auto-detected from file classification`,
        } as never)
        .select()
        .single()

      if (!error && newProject) {
        newProjects.push(newProject as Project)
        existingProjectNames.add(topicLower)
      }
    }
  }

  return { newPeople, newProjects }
}

// Save intelligent classification results to database
export async function saveIntelligentClassification(
  userId: string,
  fileId: string,
  result: IntelligentClassificationResult,
  options?: {
    autoCreateEntities?: boolean
    existingPeople?: Person[]
    existingProjects?: Project[]
  }
): Promise<{ newPeople: Person[]; newProjects: Project[] }> {
  const supabase = await createClient()
  let newPeople: Person[] = []
  let newProjects: Project[] = []

  // Auto-create entities if enabled
  if (options?.autoCreateEntities && options.existingPeople && options.existingProjects) {
    const created = await autoCreateEntities(
      userId,
      result,
      options.existingPeople,
      options.existingProjects
    )
    newPeople = created.newPeople
    newProjects = created.newProjects
  }

  // Combine detected + newly created for storage
  const allDetectedPeople = [
    ...result.detectedPeople.map(p => p.name),
    ...newPeople.map(p => p.name),
  ]
  const allDetectedProjects = [
    ...result.detectedProjects.map(p => p.name),
    ...newProjects.map(p => p.name),
  ]

  // Update drive_files with classification and organization info
  await supabase
    .from('drive_files')
    .update({
      zone: result.zone,
      document_type: result.documentType,
      confidence_score: result.confidence,
      summary: result.summary,
      entities: result.entities,
      suggested_name: result.suggestedName || null,
      detected_people: allDetectedPeople,
      detected_projects: allDetectedProjects,
      suggested_path: result.suggestedPath,
      organization_confidence: result.organizationConfidence,
      organization_status: result.organizationConfidence > 0.8 ? 'suggested' : 'pending',
      processing_status: 'classified',
      last_processed_at: new Date().toISOString(),
    } as never)
    .eq('id', fileId)

  // Create file associations for detected people
  for (const person of [...result.detectedPeople, ...newPeople]) {
    await supabase
      .from('file_associations')
      .upsert({
        user_id: userId,
        drive_file_id: fileId,
        person_id: person.id,
        association_type: 'detected',
        confidence: result.confidence,
        context: `Detected in: ${result.summary}`,
      } as never, {
        onConflict: 'drive_file_id,person_id',
      })
  }

  // Create file associations for detected projects
  for (const project of [...result.detectedProjects, ...newProjects]) {
    await supabase
      .from('file_associations')
      .upsert({
        user_id: userId,
        drive_file_id: fileId,
        project_id: project.id,
        association_type: 'detected',
        confidence: result.confidence,
        context: `Detected in: ${result.summary}`,
      } as never, {
        onConflict: 'drive_file_id,project_id',
      })
  }

  return { newPeople, newProjects }
}

// Get organization suggestions for files
export async function getOrganizationSuggestions(
  userId: string,
  options?: {
    limit?: number
    minConfidence?: number
    zone?: string
  }
): Promise<OrganizationSuggestion[]> {
  const supabase = await createClient()

  let query = supabase
    .from('drive_files')
    .select('*')
    .eq('user_id', userId)
    .not('suggested_path', 'is', null)
    .neq('organization_status', 'organized')

  if (options?.minConfidence) {
    query = query.gte('organization_confidence', options.minConfidence)
  }

  if (options?.zone) {
    query = query.eq('zone', options.zone)
  }

  query = query
    .order('organization_confidence', { ascending: false })
    .limit(options?.limit || 50)

  const { data: files } = await query

  if (!files) return []

  const suggestions: OrganizationSuggestion[] = []

  for (const file of files as DriveFile[]) {
    // Get associated people
    const { data: peopleAssoc } = await supabase
      .from('file_associations')
      .select('people(*)')
      .eq('drive_file_id', file.id)
      .not('person_id', 'is', null)

    // Get associated projects
    const { data: projectsAssoc } = await supabase
      .from('file_associations')
      .select('projects(*)')
      .eq('drive_file_id', file.id)
      .not('project_id', 'is', null)

    suggestions.push({
      fileId: file.id,
      fileName: file.name,
      currentPath: file.full_path,
      suggestedPath: file.suggested_path || '',
      people: ((peopleAssoc || []) as Array<{ people: Person }>).map(a => a.people).filter(Boolean),
      projects: ((projectsAssoc || []) as Array<{ projects: Project }>).map(a => a.projects).filter(Boolean),
      confidence: file.organization_confidence || 0,
      reasoning: `Zone: ${file.zone}, Type: ${file.document_type}`,
    })
  }

  return suggestions
}

// Mark a file as organized (user approved the suggestion)
export async function markFileOrganized(
  userId: string,
  fileId: string,
  newPath?: string
): Promise<void> {
  const supabase = await createClient()

  await supabase
    .from('drive_files')
    .update({
      organization_status: 'organized',
      full_path: newPath,
    } as never)
    .eq('user_id', userId)
    .eq('id', fileId)
}

// Helper: Build searchable text from file info and content
function buildSearchableText(
  file: FileToClassify,
  content: string | null,
  classification: ClassificationResult
): string {
  const parts: string[] = [
    file.name,
    file.fullPath || '',
    content || '',
    classification.summary,
    ...(classification.entities.people || []),
    ...(classification.entities.companies || []),
    ...(classification.entities.topics || []),
  ]

  return parts.filter(Boolean).join(' ')
}

// Helper: Find people in text using pre-fetched list
function findPeopleInTextLocal(people: Person[], text: string): Person[] {
  const textLower = text.toLowerCase()
  const matches: Person[] = []

  for (const person of people) {
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

// Helper: Find projects in text using pre-fetched list
function findProjectsInTextLocal(projects: Project[], text: string): Project[] {
  const textLower = text.toLowerCase()
  const matches: Project[] = []

  for (const project of projects) {
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

// Helper: Generate suggested path based on classification and associations
function generateSuggestedPath(
  classification: ClassificationResult,
  people: Person[],
  projects: Project[],
  file: FileToClassify
): { path: string; confidence: number; reasoning: string } {
  const reasons: string[] = []
  let confidence = classification.confidence

  // Start with zone-based path
  let basePath = ''

  switch (classification.zone) {
    case 'BUSINESS':
      basePath = 'Business'
      break
    case 'CLIENTS':
      basePath = 'Business/Clients'
      break
    case 'PROJECTS':
      basePath = 'Projects'
      break
    case 'MUSIC':
      basePath = 'Music'
      break
    case 'DESIGN':
      basePath = 'Design'
      break
    case 'PHOTOGRAPHY':
      basePath = 'Photography'
      break
    case 'PERSONAL':
      basePath = 'Personal'
      break
    case 'CODE':
      basePath = 'Code'
      break
    default:
      basePath = 'Inbox'
      confidence *= 0.5
  }

  // Special handling for gaming/Minecraft
  const fileNameLower = file.name.toLowerCase()
  const docTypeLower = classification.documentType.toLowerCase()
  if (
    fileNameLower.includes('minecraft') ||
    docTypeLower.includes('minecraft') ||
    docTypeLower.includes('gaming')
  ) {
    if (fileNameLower.includes('minecraft') || docTypeLower.includes('minecraft')) {
      basePath = 'Personal/Gaming/Minecraft'
      reasons.push('Minecraft content detected')
    } else {
      basePath = 'Personal/Gaming'
      reasons.push('Gaming content detected')
    }
  }

  // If we found a client, use their folder
  const client = people.find(p => p.relationship === 'client')
  if (client) {
    basePath = `Business/Clients/${client.name}`
    reasons.push(`Client detected: ${client.name}`)
    confidence = Math.min(confidence + 0.1, 1.0)
  }

  // If we found a project, use its folder
  if (projects.length > 0) {
    const project = projects[0]
    if (project.base_folder_path) {
      basePath = project.base_folder_path
    } else {
      basePath = `Projects/${project.name}`
    }
    reasons.push(`Project detected: ${project.name}`)
    confidence = Math.min(confidence + 0.1, 1.0)
  }

  // Add document type subfolder
  let subFolder = ''
  const docType = classification.documentType.toLowerCase()

  if (docType.includes('invoice')) {
    subFolder = 'Invoices'
  } else if (docType.includes('contract')) {
    subFolder = 'Contracts'
  } else if (docType.includes('proposal')) {
    subFolder = 'Proposals'
  } else if (docType.includes('receipt')) {
    subFolder = 'Receipts'
  } else if (docType.includes('tax') || docType.includes('1099') || docType.includes('w-2')) {
    subFolder = 'Taxes'
  } else if (docType.includes('mockup') || docType.includes('wireframe')) {
    subFolder = 'Mockups'
  } else if (docType.includes('logo')) {
    subFolder = 'Logos'
  } else if (docType.includes('lyrics') || docType.includes('chord')) {
    subFolder = 'Songs'
  }

  if (subFolder) {
    reasons.push(`Document type: ${classification.documentType}`)
  }

  const finalPath = subFolder ? `${basePath}/${subFolder}` : basePath
  const reasoning = reasons.length > 0 ? reasons.join('; ') : `Zone classification: ${classification.zone}`

  return {
    path: finalPath,
    confidence,
    reasoning,
  }
}
