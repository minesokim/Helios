/**
 * Briefing Generation Service
 *
 * Generates contextual briefings for Jorkel AI based on:
 * - Active projects and blockers
 * - Calendar events
 * - Recent emails
 * - Watch triggers
 */

import { createClient } from '@/lib/supabase/server'
import {
  getAllUnresolvedBlockers,
  getActiveProjects,
  getBlockersForProject,
  getProjectByName,
  calculateDaysWaiting,
  calculateDaysSinceFollowUp,
  type Project,
  type Blocker,
  type Contact,
} from '@/services/projects'
import { getTodaysEvents, getUpcomingEvents, type EventSummary } from '@/lib/google/calendar'
import { searchEmails, createDraft, type EmailSummary } from '@/lib/google/gmail'

// Types
export interface ActionableItem {
  type: 'follow_up' | 'check_in' | 'deadline' | 'review' | 'respond'
  priority: number // 1-10
  project?: string
  client?: string
  description: string
  person?: string
  daysWaiting?: number
  suggestedAction?: string
  blockerId?: string
}

export interface Briefing {
  type: 'morning' | 'project' | 'urgent' | 'custom'
  generatedAt: string
  summary: string
  urgentItems: ActionableItem[]
  actionableItems: ActionableItem[]
  calendarEvents: EventSummary[]
  waitingOn: WaitingItem[]
  suggestions: string[]
}

export interface WaitingItem {
  project: string
  client?: string
  person: string
  description: string
  daysWaiting: number
  daysSinceFollowUp: number
  followUpAttempts: number
  responsiveness?: 'poor' | 'average' | 'good'
  missingItems: string[]
}

export interface EmailMatch {
  email: EmailSummary
  matchedTrigger: {
    blockerId: string
    projectName: string
    keywords: string[]
  }
}

// ============================================
// BRIEFING GENERATION
// ============================================

export async function generateMorningBriefing(
  userId: string,
  accessToken?: string,
  refreshToken?: string
): Promise<Briefing> {
  const [blockers, projects, events] = await Promise.all([
    getAllUnresolvedBlockers(userId),
    getActiveProjects(userId),
    accessToken ? getTodaysEvents(accessToken, refreshToken) : Promise.resolve([]),
  ])

  const urgentItems = getUrgentItems(blockers, projects)
  const actionableItems = getActionableItems(blockers, projects)
  const waitingOn = getWaitingItems(blockers)

  // Generate suggestions based on context
  const suggestions = generateSuggestions(urgentItems, actionableItems, events, waitingOn)

  // Build summary
  const summary = buildMorningSummary(urgentItems, actionableItems, events, waitingOn)

  const briefing: Briefing = {
    type: 'morning',
    generatedAt: new Date().toISOString(),
    summary,
    urgentItems,
    actionableItems: actionableItems.filter(item => !urgentItems.includes(item)),
    calendarEvents: events,
    waitingOn,
    suggestions,
  }

  // Save to history
  await saveBriefingHistory(userId, briefing)

  return briefing
}

export async function generateProjectBriefing(
  userId: string,
  projectName: string,
  accessToken?: string,
  refreshToken?: string
): Promise<string> {
  const project = await getProjectByName(userId, projectName)

  if (!project) {
    return `I don't have a project called "${projectName}" tracked. Would you like me to create one?`
  }

  const blockers = await getBlockersForProject(userId, project.id)
  const upcomingEvents = accessToken
    ? await getUpcomingEvents(accessToken, refreshToken, 14)
    : []

  // Filter events related to this project/client
  const relevantEvents = upcomingEvents.filter(
    e =>
      e.title.toLowerCase().includes(project.name.toLowerCase()) ||
      (project.client && e.title.toLowerCase().includes(project.client.toLowerCase()))
  )

  let briefing = `**${project.name}**`
  if (project.client) briefing += ` (${project.client})`
  briefing += `\n\nStatus: ${formatStatus(project.status)}`
  if (project.priority >= 8) briefing += ' ⚡ High Priority'

  if (project.description) {
    briefing += `\n\n${project.description}`
  }

  if (blockers.length > 0) {
    briefing += `\n\n**Current Blockers (${blockers.length}):**`
    for (const blocker of blockers) {
      const daysWaiting = calculateDaysWaiting(blocker.waiting_since)
      briefing += `\n• ${blocker.description}`
      if (blocker.person) briefing += ` (waiting on ${blocker.person})`
      briefing += ` — ${daysWaiting} days`
      if (blocker.follow_up_attempts > 0) {
        briefing += `, ${blocker.follow_up_attempts} follow-ups`
      }
    }
  } else if (project.status === 'active') {
    briefing += `\n\nNo blockers — project is progressing.`
  }

  if (relevantEvents.length > 0) {
    briefing += `\n\n**Upcoming Events:**`
    for (const event of relevantEvents.slice(0, 3)) {
      const date = new Date(event.start).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      briefing += `\n• ${date}: ${event.title}`
    }
  }

  if (project.due_date) {
    const dueDate = new Date(project.due_date)
    const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysUntilDue <= 7) {
      briefing += `\n\n⚠️ Due in ${daysUntilDue} days (${dueDate.toLocaleDateString()})`
    }
  }

  // Save to history
  await saveBriefingHistory(userId, {
    type: 'project',
    generatedAt: new Date().toISOString(),
    summary: briefing,
    urgentItems: [],
    actionableItems: [],
    calendarEvents: relevantEvents,
    waitingOn: [],
    suggestions: [],
  }, project.id)

  return briefing
}

// ============================================
// ACTIONABLE ITEMS
// ============================================

export function getActionableItems(
  blockers: (Blocker & { project: Project })[],
  projects: Project[]
): ActionableItem[] {
  const items: ActionableItem[] = []

  for (const blocker of blockers) {
    const daysWaiting = calculateDaysWaiting(blocker.waiting_since)
    const daysSinceFollowUp = calculateDaysSinceFollowUp(blocker.last_follow_up, blocker.waiting_since)

    // Calculate priority
    let priority = 5
    if (daysWaiting > 14) priority += 2
    else if (daysWaiting > 7) priority += 1

    if (daysSinceFollowUp > 7) priority += 2
    else if (daysSinceFollowUp > 3) priority += 1

    if (blocker.project.priority >= 8) priority += 1

    priority = Math.min(priority, 10)

    // Determine action type
    let actionType: ActionableItem['type'] = 'follow_up'
    let suggestedAction = `Follow up with ${blocker.person || 'them'}`

    if (blocker.type === 'external_approval') {
      actionType = 'check_in'
      suggestedAction = `Check on approval status`
    } else if (blocker.type === 'technical') {
      actionType = 'review'
      suggestedAction = `Review technical blocker`
    }

    if (blocker.follow_up_attempts >= 3 && daysSinceFollowUp > 5) {
      suggestedAction = `Escalate — ${blocker.follow_up_attempts} attempts with no response`
    }

    items.push({
      type: actionType,
      priority,
      project: blocker.project.name,
      client: blocker.project.client || undefined,
      description: blocker.description,
      person: blocker.person || undefined,
      daysWaiting,
      suggestedAction,
      blockerId: blocker.id,
    })
  }

  // Add deadline-based items
  for (const project of projects) {
    if (project.due_date) {
      const daysUntilDue = Math.ceil(
        (new Date(project.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )

      if (daysUntilDue <= 3 && daysUntilDue >= 0) {
        items.push({
          type: 'deadline',
          priority: 9,
          project: project.name,
          client: project.client || undefined,
          description: `Due in ${daysUntilDue} days`,
          suggestedAction: `Review status and ensure on track`,
        })
      } else if (daysUntilDue <= 7 && daysUntilDue > 3) {
        items.push({
          type: 'deadline',
          priority: 7,
          project: project.name,
          client: project.client || undefined,
          description: `Due in ${daysUntilDue} days`,
          suggestedAction: `Check progress against deadline`,
        })
      }
    }
  }

  return items.sort((a, b) => b.priority - a.priority)
}

export function getUrgentItems(
  blockers: (Blocker & { project: Project })[],
  projects: Project[]
): ActionableItem[] {
  const allItems = getActionableItems(blockers, projects)
  return allItems.filter(item => item.priority >= 8)
}

function getWaitingItems(blockers: (Blocker & { project: Project })[]): WaitingItem[] {
  return blockers
    .filter(b => b.type === 'waiting_on_person' || b.type === 'waiting_on_client')
    .map(blocker => ({
      project: blocker.project.name,
      client: blocker.project.client || undefined,
      person: blocker.person || 'Unknown',
      description: blocker.description,
      daysWaiting: calculateDaysWaiting(blocker.waiting_since),
      daysSinceFollowUp: calculateDaysSinceFollowUp(blocker.last_follow_up, blocker.waiting_since),
      followUpAttempts: blocker.follow_up_attempts,
      missingItems: blocker.missing_items,
    }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting)
}

// ============================================
// EMAIL WATCH & UNBLOCKER DETECTION
// ============================================

export async function checkEmailsForUnblockers(
  userId: string,
  accessToken: string,
  refreshToken?: string
): Promise<EmailMatch[]> {
  const supabase = await createClient()

  // Get active watch triggers
  interface WatchTrigger {
    id: string
    blocker_id: string
    from_contains?: string
    subject_contains?: string
    keywords?: string[]
    blocker?: {
      id: string
      project?: { name: string; client: string | null }
    }
  }
  const { data: triggers } = await supabase
    .from('watch_triggers')
    .select(`
      *,
      blocker:blockers(
        *,
        project:projects(name, client)
      )
    `)
    .eq('user_id', userId)
    .eq('triggered', false)
    .eq('source', 'email') as { data: WatchTrigger[] | null }

  if (!triggers || triggers.length === 0) {
    return []
  }

  const matches: EmailMatch[] = []

  for (const trigger of triggers) {
    // Build search query
    const searchParts: string[] = []
    if (trigger.from_contains) {
      searchParts.push(`from:${trigger.from_contains}`)
    }
    if (trigger.subject_contains) {
      searchParts.push(`subject:${trigger.subject_contains}`)
    }
    // Add keyword search
    if (trigger.keywords && trigger.keywords.length > 0) {
      searchParts.push(`(${trigger.keywords.join(' OR ')})`)
    }

    // Search only recent emails (last 3 days)
    searchParts.push('newer_than:3d')

    const query = searchParts.join(' ')

    try {
      const emails = await searchEmails(accessToken, query, refreshToken, 5)

      for (const email of emails) {
        // Check if this email matches our criteria
        const matchesFrom = !trigger.from_contains ||
          email.from.toLowerCase().includes(trigger.from_contains.toLowerCase())
        const matchesSubject = !trigger.subject_contains ||
          email.subject.toLowerCase().includes(trigger.subject_contains.toLowerCase())
        const matchesKeyword = !trigger.keywords?.length ||
          trigger.keywords.some((kw: string) =>
            email.subject.toLowerCase().includes(kw.toLowerCase()) ||
            email.snippet.toLowerCase().includes(kw.toLowerCase())
          )

        if (matchesFrom && matchesSubject && matchesKeyword) {
          matches.push({
            email,
            matchedTrigger: {
              blockerId: trigger.blocker_id,
              projectName: trigger.blocker?.project?.name || 'Unknown Project',
              keywords: trigger.keywords || [],
            },
          })

          // Mark trigger as fired
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('watch_triggers') as any)
            .update({
              triggered: true,
              triggered_at: new Date().toISOString(),
              trigger_data: {
                email_id: email.id,
                email_subject: email.subject,
                email_from: email.from,
              },
            })
            .eq('id', trigger.id)
        }
      }
    } catch (error) {
      console.error('Error searching emails for trigger:', trigger.id, error)
    }
  }

  return matches
}

// ============================================
// FOLLOW-UP EMAIL DRAFTING
// ============================================

export async function draftFollowUpEmail(
  userId: string,
  blockerId: string,
  accessToken: string,
  refreshToken?: string
): Promise<{ draftId: string; to: string; subject: string; body: string } | null> {
  const supabase = await createClient()

  // Get blocker with project and contact info
  interface BlockerWithRelations {
    id: string
    description: string
    waiting_since: string
    follow_up_attempts: number
    missing_items?: string[]
    project?: { name: string; client: string | null }
    contact?: { id: string; name: string; email: string; responsiveness: string | null }
  }
  const { data: blocker } = await supabase
    .from('blockers')
    .select(`
      *,
      project:projects(name, client),
      contact:contacts(name, email, responsiveness)
    `)
    .eq('id', blockerId)
    .eq('user_id', userId)
    .single() as { data: BlockerWithRelations | null }

  if (!blocker || !blocker.contact?.email) {
    return null
  }

  const daysWaiting = calculateDaysWaiting(blocker.waiting_since)
  const contact = blocker.contact

  // Generate email content based on context
  let subject = `Following up: ${blocker.project?.name || 'Project'}`
  let body = `Hi ${contact.name},\n\n`

  if (blocker.follow_up_attempts === 0) {
    body += `I wanted to follow up on ${blocker.description}.\n\n`
    body += `It's been ${daysWaiting} days since we last discussed this. `
    body += `Please let me know if you need any additional information from my end.\n\n`
  } else if (blocker.follow_up_attempts < 3) {
    body += `Just circling back on ${blocker.description}.\n\n`
    if (blocker.missing_items?.length) {
      body += `As a reminder, I'm still waiting on:\n`
      blocker.missing_items.forEach((item: string) => {
        body += `• ${item}\n`
      })
      body += '\n'
    }
    body += `Let me know if there's anything blocking progress on your end.\n\n`
  } else {
    // More direct for repeat follow-ups
    subject = `Urgent: ${blocker.project?.name || 'Project'} - Action Needed`
    body += `I've reached out a few times about ${blocker.description} and wanted to check in again.\n\n`
    body += `This has been pending for ${daysWaiting} days and is blocking progress on our end. `
    body += `Could you please provide an update or let me know if we need to escalate?\n\n`
  }

  body += `Thanks,\nDavid`

  // Create draft in Gmail
  const draft = await createDraft(accessToken, contact.email, subject, body, refreshToken)

  if (!draft) {
    return null
  }

  // Record the follow-up attempt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('follow_up_history') as any).insert({
    user_id: userId,
    blocker_id: blockerId,
    contact_id: contact.id,
    method: 'email',
    notes: `Draft created: ${subject}`,
  })

  return {
    draftId: draft.id,
    to: contact.email,
    subject,
    body,
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateSuggestions(
  urgentItems: ActionableItem[],
  actionableItems: ActionableItem[],
  events: EventSummary[],
  waitingOn: WaitingItem[]
): string[] {
  const suggestions: string[] = []

  // Suggest follow-ups for stale blockers
  const staleWaiting = waitingOn.filter(w => w.daysSinceFollowUp > 5 && w.followUpAttempts < 3)
  if (staleWaiting.length > 0) {
    const person = staleWaiting[0].person
    suggestions.push(`Follow up with ${person} — no response in ${staleWaiting[0].daysSinceFollowUp} days`)
  }

  // Suggest escalation for persistent blockers
  const needsEscalation = waitingOn.filter(w => w.followUpAttempts >= 3 && w.daysSinceFollowUp > 3)
  if (needsEscalation.length > 0) {
    suggestions.push(`Consider escalating ${needsEscalation[0].project} blocker — ${needsEscalation[0].followUpAttempts} attempts`)
  }

  // Suggest prep for upcoming meetings
  const soonMeetings = events.filter(e => {
    const startTime = new Date(e.start)
    const hoursUntil = (startTime.getTime() - Date.now()) / (1000 * 60 * 60)
    return hoursUntil > 0 && hoursUntil < 2
  })
  if (soonMeetings.length > 0) {
    suggestions.push(`Prep for upcoming meeting: ${soonMeetings[0].title}`)
  }

  // Suggest tackling high-priority items
  if (urgentItems.length > 0 && urgentItems[0].type === 'deadline') {
    suggestions.push(`Focus on ${urgentItems[0].project} — deadline approaching`)
  }

  return suggestions.slice(0, 3)
}

function buildMorningSummary(
  urgentItems: ActionableItem[],
  actionableItems: ActionableItem[],
  events: EventSummary[],
  waitingOn: WaitingItem[]
): string {
  const parts: string[] = []

  // Greeting based on time
  const hour = new Date().getHours()
  if (hour < 12) {
    parts.push('Good morning, David.')
  } else if (hour < 17) {
    parts.push('Good afternoon, David.')
  } else {
    parts.push('Good evening, David.')
  }

  // Calendar summary
  if (events.length > 0) {
    parts.push(`You have ${events.length} event${events.length > 1 ? 's' : ''} today.`)
    const nextEvent = events[0]
    if (!nextEvent.isAllDay) {
      const time = new Date(nextEvent.start).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
      parts.push(`First up is "${nextEvent.title}" at ${time}.`)
    }
  } else {
    parts.push('Your calendar is clear today.')
  }

  // Urgent items
  if (urgentItems.length > 0) {
    parts.push(`\n\n**${urgentItems.length} urgent item${urgentItems.length > 1 ? 's' : ''} need attention:**`)
    for (const item of urgentItems.slice(0, 3)) {
      parts.push(`• ${item.project}: ${item.description}`)
    }
  }

  // Waiting summary
  if (waitingOn.length > 0) {
    const longestWait = waitingOn[0]
    parts.push(`\n\nYou're waiting on ${waitingOn.length} people. Longest: ${longestWait.person} (${longestWait.daysWaiting} days).`)
  }

  return parts.join(' ')
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    active: '🟢 Active',
    blocked: '🔴 Blocked',
    waiting: '🟡 Waiting',
    completed: '✅ Completed',
    on_hold: '⏸️ On Hold',
  }
  return statusMap[status] || status
}

async function saveBriefingHistory(
  userId: string,
  briefing: Briefing,
  projectId?: string
): Promise<void> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('briefing_history') as any).insert({
    user_id: userId,
    briefing_type: briefing.type,
    project_id: projectId,
    content: briefing.summary,
    items_count: briefing.urgentItems.length + briefing.actionableItems.length,
  })
}

// ============================================
// VOICE COMMAND PARSING
// ============================================

export function parseBriefingIntent(transcript: string): {
  type: 'morning' | 'project' | 'urgent' | null
  projectName?: string
} {
  const lower = transcript.toLowerCase()

  // Morning briefing triggers
  if (
    lower.includes('good morning') ||
    lower.includes('morning briefing') ||
    lower.includes('brief me') ||
    lower.includes("what's on my plate") ||
    lower.includes('what do i have today')
  ) {
    return { type: 'morning' }
  }

  // Urgent items
  if (
    lower.includes('urgent') ||
    lower.includes('what needs attention') ||
    lower.includes('what should i focus on')
  ) {
    return { type: 'urgent' }
  }

  // Project-specific briefing
  const projectPatterns = [
    /(?:update|status|briefing|brief|tell me about|how is|what's happening with)\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+project)?$/i,
    /(?:what's|what is)\s+(?:the\s+)?status\s+(?:of|on)\s+(.+?)(?:\s+project)?$/i,
  ]

  for (const pattern of projectPatterns) {
    const match = transcript.match(pattern)
    if (match) {
      return { type: 'project', projectName: match[1].trim() }
    }
  }

  return { type: null }
}
