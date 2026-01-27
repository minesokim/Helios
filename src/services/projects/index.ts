/**
 * Project Intelligence Service
 *
 * Tracks projects, blockers, contacts, and provides
 * project management functionality for Jorkel.
 */

import { createClient } from '@/lib/supabase/server'

// Types
export interface Project {
  id: string
  user_id: string
  name: string
  client: string | null
  client_contact_id: string | null
  description: string | null
  status: 'active' | 'blocked' | 'waiting' | 'completed' | 'on_hold' | 'archived'
  priority: number
  related_emails: string[]
  related_files: string[]
  notes: string | null
  due_date: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Blocker {
  id: string
  user_id: string
  project_id: string
  type: 'external_approval' | 'waiting_on_person' | 'waiting_on_client' | 'technical' | 'dependency'
  description: string
  waiting_since: string
  person: string | null
  person_contact_id: string | null
  person_notes: string | null
  follow_up_attempts: number
  last_follow_up: string | null
  missing_items: string[]
  resolved: boolean
  resolved_at: string | null
  resolution_notes: string | null
}

export interface Contact {
  id: string
  user_id: string
  client_id: string | null
  name: string
  email: string | null
  phone: string | null
  role: string | null
  company: string | null
  notes: string | null
  last_contacted_at: string | null
}

export interface WatchTrigger {
  id: string
  user_id: string
  blocker_id: string
  source: 'email' | 'file' | 'calendar'
  from_contains: string | null
  subject_contains: string | null
  keywords: string[]
  on_trigger: 'notify' | 'draft_email' | 'mark_resolved'
  triggered: boolean
  triggered_at: string | null
}

// ============================================
// CONTACT MANAGEMENT
// ============================================

export async function createContact(
  userId: string,
  contact: Partial<Contact>
): Promise<Contact | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('contacts') as any)
    .insert({
      user_id: userId,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      company: contact.company,
      client_id: contact.client_id,
      notes: contact.notes,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating contact:', error)
    return null
  }

  return data as Contact
}

export async function updateContact(
  userId: string,
  contactId: string,
  updates: Partial<Contact>
): Promise<Contact | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('contacts') as any)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('Error updating contact:', error)
    return null
  }

  return data as Contact
}

export async function getContactByName(
  userId: string,
  name: string
): Promise<Contact | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', `%${name}%`)
    .is('deleted_at', null)
    .limit(1)
    .single()

  if (error) return null
  return data
}

export async function getAllContacts(userId: string): Promise<Contact[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('name')

  return data || []
}

// ============================================
// PROJECT MANAGEMENT
// ============================================

export async function createProject(
  userId: string,
  project: Partial<Project>
): Promise<Project | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('projects') as any)
    .insert({
      user_id: userId,
      name: project.name,
      client: project.client,
      client_contact_id: project.client_contact_id,
      description: project.description,
      status: project.status || 'active',
      priority: project.priority || 5,
      related_emails: project.related_emails || [],
      related_files: project.related_files || [],
      notes: project.notes,
      due_date: project.due_date,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating project:', error)
    return null
  }

  return data as Project
}

export async function updateProject(
  userId: string,
  projectId: string,
  updates: Partial<Project>
): Promise<Project | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('projects') as any)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('Error updating project:', error)
    return null
  }

  return data as Project
}

export async function getProjectByName(
  userId: string,
  name: string
): Promise<Project | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', `%${name}%`)
    .is('deleted_at', null)
    .limit(1)
    .single()

  if (error) return null
  return data
}

export async function getProjectsByClient(
  userId: string,
  client: string
): Promise<Project[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .ilike('client', `%${client}%`)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  return data || []
}

export async function getActiveProjects(userId: string): Promise<Project[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'blocked', 'waiting'])
    .is('deleted_at', null)
    .order('priority', { ascending: false })

  return data || []
}

export async function getAllProjects(userId: string): Promise<Project[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  return data || []
}

// ============================================
// BLOCKER MANAGEMENT
// ============================================

export async function addBlocker(
  userId: string,
  projectId: string,
  blocker: Partial<Blocker>
): Promise<Blocker | null> {
  const supabase = await createClient()

  // First, update project status to blocked
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('projects') as any)
    .update({ status: 'blocked', updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', userId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('blockers') as any)
    .insert({
      user_id: userId,
      project_id: projectId,
      type: blocker.type || 'technical',
      description: blocker.description,
      waiting_since: blocker.waiting_since || new Date().toISOString(),
      person: blocker.person,
      person_contact_id: blocker.person_contact_id,
      person_notes: blocker.person_notes,
      follow_up_attempts: blocker.follow_up_attempts || 0,
      last_follow_up: blocker.last_follow_up,
      missing_items: blocker.missing_items || [],
    })
    .select()
    .single()

  if (error) {
    console.error('Error adding blocker:', error)
    return null
  }

  return data as Blocker
}

export async function resolveBlocker(
  userId: string,
  projectId: string,
  blockerId: string,
  resolutionNotes?: string
): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('blockers') as any)
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_notes: resolutionNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', blockerId)
    .eq('user_id', userId)

  if (error) {
    console.error('Error resolving blocker:', error)
    return false
  }

  // Check if project has any remaining unresolved blockers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: remainingBlockers } = await (supabase.from('blockers') as any)
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('resolved', false)

  // If no blockers remain, update project status to active
  if (!remainingBlockers || remainingBlockers.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('projects') as any)
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', userId)
  }

  return true
}

export async function recordFollowUp(
  userId: string,
  projectId: string,
  blockerId: string,
  method: 'email' | 'call' | 'text' | 'in_person' | 'other' = 'email',
  notes?: string,
  emailThreadId?: string
): Promise<boolean> {
  const supabase = await createClient()

  // Update blocker
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: blockerError } = await (supabase.from('blockers') as any)
    .update({
      follow_up_attempts: (supabase.rpc as any)('increment', { x: 1 }) as unknown as number,
      last_follow_up: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', blockerId)
    .eq('user_id', userId)

  if (blockerError) {
    // Fallback: get current value and increment manually
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentBlocker } = await (supabase.from('blockers') as any)
      .select('follow_up_attempts')
      .eq('id', blockerId)
      .single()

    if (currentBlocker) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('blockers') as any)
        .update({
          follow_up_attempts: (currentBlocker.follow_up_attempts || 0) + 1,
          last_follow_up: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', blockerId)
        .eq('user_id', userId)
    }
  }

  // Get blocker for contact info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: blocker } = await (supabase.from('blockers') as any)
    .select('person_contact_id')
    .eq('id', blockerId)
    .single()

  // Record in follow_up_history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('follow_up_history') as any).insert({
    user_id: userId,
    blocker_id: blockerId,
    contact_id: blocker?.person_contact_id,
    method,
    notes,
    email_thread_id: emailThreadId,
  })

  return true
}

export async function getBlockersForProject(
  userId: string,
  projectId: string
): Promise<Blocker[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('blockers')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('resolved', false)
    .order('waiting_since', { ascending: true })

  return data || []
}

export async function getAllUnresolvedBlockers(userId: string): Promise<(Blocker & { project: Project })[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('blockers')
    .select('*, project:projects(*)')
    .eq('user_id', userId)
    .eq('resolved', false)
    .order('waiting_since', { ascending: true })

  return data || []
}

// ============================================
// WATCH TRIGGERS
// ============================================

export async function addWatchTrigger(
  userId: string,
  blockerId: string,
  trigger: Partial<WatchTrigger>
): Promise<WatchTrigger | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('watch_triggers') as any)
    .insert({
      user_id: userId,
      blocker_id: blockerId,
      source: trigger.source || 'email',
      from_contains: trigger.from_contains,
      subject_contains: trigger.subject_contains,
      keywords: trigger.keywords || [],
      on_trigger: trigger.on_trigger || 'notify',
    })
    .select()
    .single()

  if (error) {
    console.error('Error adding watch trigger:', error)
    return null
  }

  return data as WatchTrigger
}

export async function getActiveWatchTriggers(userId: string): Promise<WatchTrigger[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('watch_triggers')
    .select('*')
    .eq('user_id', userId)
    .eq('triggered', false)

  return data || []
}

export async function markTriggerFired(
  triggerId: string,
  triggerData?: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('watch_triggers') as any)
    .update({
      triggered: true,
      triggered_at: new Date().toISOString(),
      trigger_data: triggerData,
    })
    .eq('id', triggerId)
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function calculateDaysWaiting(waitingSince: string): number {
  const start = new Date(waitingSince)
  const now = new Date()
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

export function calculateDaysSinceFollowUp(lastFollowUp: string | null, waitingSince: string): number {
  const referenceDate = lastFollowUp ? new Date(lastFollowUp) : new Date(waitingSince)
  const now = new Date()
  return Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24))
}
