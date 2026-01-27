/**
 * Context Builder for Jorkel
 *
 * Aggregates all user data to give Jorkel full awareness:
 * - Bank accounts & balances
 * - Recent transactions
 * - Subscriptions
 * - Google Drive files (multi-account)
 * - Gmail (multi-account)
 * - Google Photos (multi-account)
 * - Connected services status
 */

import { createClient } from '@/lib/supabase/server'
import { getRecentEmailsSummary, searchEmails, getUnreadCount } from '@/lib/google/gmail'
import { fullTextSearch, getFileSnippet } from '@/lib/google/drive'
import { getPhotosSummary, formatPhotosSummaryForContext } from '@/lib/google/photos'
import { getUpcomingEvents, EventSummary } from '@/lib/google/calendar'
import { analyzeSubscriptions, formatSubscriptionsForContext } from './subscriptionAnalyzer'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'
import {
  getAggregatedEmails,
  getAggregatedUnreadCount,
  getAggregatedPhotosSummary,
  formatAggregatedEmailsForContext,
  formatAggregatedPhotosForContext,
} from '@/services/google/aggregator'

interface BankAccount {
  id: string
  institution_name: string
  account_name: string
  account_type: string
  current_balance: number
  available_balance: number | null
  last_sync_at: string
}

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  category: string | null
  merchant_name: string | null
}

interface Subscription {
  id: string
  merchant_name: string
  amount: number
  frequency: string
  next_expected_date: string | null
}

interface DriveFile {
  id: string
  name: string
  mime_type: string
  modified_time: string
}

interface Project {
  id: string
  name: string
  client_name: string | null
  status: string
  priority: number
  description: string | null
  start_date: string | null
  due_date: string | null
}

interface Blocker {
  id: string
  type: string
  description: string
  project_name: string | null
  person: string | null
  waiting_since: string
  follow_up_attempts: number
  resolved: boolean
}

interface Client {
  id: string
  name: string
  status: string
  total_revenue: number | null
  total_expenses: number | null
  monthly_retainer: number | null
}

interface ScheduledTask {
  id: string
  title: string
  description: string | null
  priority: number
  scheduled_for: string
  status: string
  project_name: string | null
  client_name: string | null
}

interface UserContext {
  bankAccounts: BankAccount[]
  recentTransactions: Transaction[]
  subscriptions: Subscription[]
  driveFiles: DriveFile[]
  emailSummary: string | null
  unreadEmailCount: number
  photosSummary: string | null
  connectedServices: string[]
  totalBalance: number
  // New additions
  projects: Project[]
  blockers: Blocker[]
  clients: Client[]
  calendarEvents: EventSummary[]
  scheduledTasks: ScheduledTask[]
}

export async function getUserDataContext(userId: string): Promise<string> {
  const supabase = await createClient()
  console.log('[Context] Fetching data for user:', userId)

  const context: UserContext = {
    bankAccounts: [],
    recentTransactions: [],
    subscriptions: [],
    driveFiles: [],
    emailSummary: null,
    unreadEmailCount: 0,
    photosSummary: null,
    connectedServices: [],
    totalBalance: 0,
    projects: [],
    blockers: [],
    clients: [],
    calendarEvents: [],
    scheduledTasks: [],
  }

  // Fetch bank accounts
  try {
    const { data: accounts } = await supabase
      .from('bank_accounts')
      .select('id, institution_name, account_name, account_type, current_balance, available_balance, last_sync_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('current_balance', { ascending: false }) as { data: BankAccount[] | null }

    console.log('[Context] Bank accounts fetched:', accounts?.length || 0)
    if (accounts && accounts.length > 0) {
      context.bankAccounts = accounts
      context.totalBalance = accounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0)
      context.connectedServices.push('Teller Banking')
      console.log('[Context] Total balance:', context.totalBalance)
    }
  } catch (e) {
    console.log('[Context] Bank accounts fetch exception:', e)
  }

  // Fetch recent transactions (last 30 days, limited for context efficiency)
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: transactionsData, error: txError } = await supabase
      .from('transactions')
      .select('id, date, description, amount, merchant_name')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(50)

    const transactions = transactionsData as { id: string; date: string; description: string; amount: number; merchant_name: string | null }[] | null

    if (txError) {
      console.log('[Context] Transactions query error:', txError)
    }

    console.log('[Context] Transactions fetched:', transactions?.length || 0)

    if (transactions && transactions.length > 0) {
      context.recentTransactions = transactions.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        merchant_name: t.merchant_name,
        category: null, // Skip category for now to ensure data flows
      }))
      console.log('[Context] Sample transaction:', context.recentTransactions[0])
    }
  } catch (e) {
    console.log('[Context] Transactions fetch exception:', e)
  }

  // Fetch subscriptions
  try {
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('id, merchant_name, amount, frequency, next_expected_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('amount', { ascending: false }) as { data: Subscription[] | null }

    if (subscriptions) {
      context.subscriptions = subscriptions
    }
  } catch (e) {
    console.log('Subscriptions fetch skipped:', e)
  }

  // Fetch Google Drive files (if connected)
  try {
    const { data: documents } = await supabase
      .from('documents')
      .select('id, name, mime_type, modified_time')
      .eq('user_id', userId)
      .eq('source', 'google_drive')
      .order('modified_time', { ascending: false })
      .limit(100) as { data: DriveFile[] | null }

    if (documents && documents.length > 0) {
      context.driveFiles = documents.map(d => ({
        id: d.id,
        name: d.name,
        mime_type: d.mime_type,
        modified_time: d.modified_time,
      }))
      context.connectedServices.push('Google Drive')
    }
  } catch (e) {
    console.log('Drive files fetch skipped:', e)
  }

  // Fetch projects
  try {
    const { data: projectsData } = await supabase
      .from('projects')
      .select('id, name, status, priority, description, start_date, due_date, client_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('status', ['active', 'on_hold', 'waiting'])
      .order('priority', { ascending: false })
      .limit(20)

    if (projectsData && projectsData.length > 0) {
      // Get client names
      const clientIds = [...new Set(projectsData.map(p => p.client_id).filter((id): id is string => id !== null))]
      const { data: clientsForProjects } = clientIds.length > 0
        ? await supabase.from('clients').select('id, name').in('id', clientIds)
        : { data: [] }
      const clientMap = new Map((clientsForProjects || []).map(c => [c.id, c.name]))

      context.projects = projectsData.map(p => ({
        id: p.id,
        name: p.name,
        client_name: p.client_id ? clientMap.get(p.client_id) || null : null,
        status: p.status,
        priority: p.priority,
        description: p.description,
        start_date: p.start_date,
        due_date: p.due_date,
      }))
      console.log('[Context] Projects fetched:', context.projects.length)
    }
  } catch (e) {
    console.log('Projects fetch skipped:', e)
  }

  // Fetch active blockers
  try {
    const { data: blockersData } = await supabase
      .from('blockers')
      .select('id, type, description, project_id, person, waiting_since, follow_up_attempts, resolved')
      .eq('user_id', userId)
      .eq('resolved', false)
      .order('waiting_since', { ascending: true })
      .limit(10)

    if (blockersData && blockersData.length > 0) {
      // Get project names
      const projectIds = [...new Set(blockersData.map(b => b.project_id).filter((id): id is string => id !== null))]
      const { data: projectsForBlockers } = projectIds.length > 0
        ? await supabase.from('projects').select('id, name').in('id', projectIds)
        : { data: [] }
      const projectMap = new Map((projectsForBlockers || []).map(p => [p.id, p.name]))

      context.blockers = blockersData.map(b => ({
        id: b.id,
        type: b.type,
        description: b.description,
        project_name: b.project_id ? projectMap.get(b.project_id) || null : null,
        person: b.person,
        waiting_since: b.waiting_since,
        follow_up_attempts: b.follow_up_attempts,
        resolved: b.resolved,
      }))
      console.log('[Context] Blockers fetched:', context.blockers.length)
    }
  } catch (e) {
    console.log('Blockers fetch skipped:', e)
  }

  // Fetch clients with financials
  try {
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, name, status, total_revenue, total_expenses, monthly_retainer')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('total_revenue', { ascending: false, nullsFirst: false })
      .limit(20)

    if (clientsData && clientsData.length > 0) {
      context.clients = clientsData
      console.log('[Context] Clients fetched:', context.clients.length)
    }
  } catch (e) {
    console.log('Clients fetch skipped:', e)
  }

  // Fetch scheduled tasks (upcoming 14 days)
  try {
    const twoWeeksFromNow = new Date()
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)

    const { data: tasksData } = await supabase
      .from('scheduled_tasks')
      .select('id, title, description, priority, scheduled_for, status, project_id, client_id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lte('scheduled_for', twoWeeksFromNow.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(20)

    if (tasksData && tasksData.length > 0) {
      // Get project and client names
      const projectIds = [...new Set(tasksData.map(t => t.project_id).filter((id): id is string => id !== null))]
      const clientIds = [...new Set(tasksData.map(t => t.client_id).filter((id): id is string => id !== null))]

      const { data: projectsForTasks } = projectIds.length > 0
        ? await supabase.from('projects').select('id, name').in('id', projectIds)
        : { data: [] }
      const { data: clientsForTasks } = clientIds.length > 0
        ? await supabase.from('clients').select('id, name').in('id', clientIds)
        : { data: [] }

      const projectMap = new Map((projectsForTasks || []).map(p => [p.id, p.name]))
      const clientMap = new Map((clientsForTasks || []).map(c => [c.id, c.name]))

      context.scheduledTasks = tasksData.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        scheduled_for: t.scheduled_for,
        status: t.status,
        project_name: t.project_id ? projectMap.get(t.project_id) || null : null,
        client_name: t.client_id ? clientMap.get(t.client_id) || null : null,
      }))
      console.log('[Context] Scheduled tasks fetched:', context.scheduledTasks.length)
    }
  } catch (e) {
    console.log('Scheduled tasks fetch skipped:', e)
  }

  // Fetch Gmail and Photos data from all connected Google accounts
  try {
    // Check for multi-account Google connections
    const googleAccounts = await getAllAccounts(userId)

    if (googleAccounts.length > 0) {
      // Multi-account: use aggregator
      context.connectedServices.push(`Google Accounts (${googleAccounts.length})`)

      // Get aggregated email data
      try {
        const emailResult = await getAggregatedEmails(userId, { maxResults: 15 })
        const unreadResult = await getAggregatedUnreadCount(userId)

        context.emailSummary = formatAggregatedEmailsForContext(emailResult, unreadResult)
        context.unreadEmailCount = unreadResult.total

        if (emailResult.emails.length > 0) {
          context.connectedServices.push('Gmail')
        }
      } catch (emailErr) {
        console.log('Gmail aggregation skipped:', emailErr)
      }

      // Photos disabled - scope issues causing slow failures
      // TODO: Re-enable after fixing OAuth scopes
      // try {
      //   const photosSummaries = await getAggregatedPhotosSummary(userId)
      //   context.photosSummary = formatAggregatedPhotosForContext(photosSummaries)
      //   if (photosSummaries.some(s => s.totalAlbums > 0 || s.recentPhotos.length > 0)) {
      //     context.connectedServices.push('Google Photos')
      //   }
      // } catch (photosErr) {
      //   console.log('Photos aggregation skipped:', photosErr)
      // }

      // Get calendar events from all accounts
      try {
        const allEvents: EventSummary[] = []
        for (const account of googleAccounts) {
          try {
            const tokens = await getValidAccessToken(account.id, userId)
            if (tokens) {
              const events = await getUpcomingEvents(tokens.accessToken, tokens.refreshToken, 7, 10)
              // Add account label to events
              events.forEach(e => {
                allEvents.push({
                  ...e,
                  title: googleAccounts.length > 1 ? `[${account.account_label}] ${e.title}` : e.title,
                })
              })
            }
          } catch (calErr) {
            console.log(`Calendar fetch failed for ${account.google_email}:`, calErr)
          }
        }
        // Sort by start time and dedupe
        context.calendarEvents = allEvents
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
          .slice(0, 15)

        if (context.calendarEvents.length > 0) {
          context.connectedServices.push('Google Calendar')
        }
        console.log('[Context] Calendar events fetched:', context.calendarEvents.length)
      } catch (calErr) {
        console.log('Calendar aggregation skipped:', calErr)
      }
    } else {
      // Fallback to legacy single-account google_oauth_tokens table
      const { data: googleToken } = await supabase
        .from('google_oauth_tokens')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .single() as { data: { access_token: string; refresh_token: string } | null }

      if (googleToken?.access_token) {
        if (!context.connectedServices.includes('Google Drive')) {
          context.connectedServices.push('Google Account')
        }

        // Get email summary
        try {
          context.emailSummary = await getRecentEmailsSummary(
            googleToken.access_token,
            googleToken.refresh_token,
            10
          )
          context.unreadEmailCount = await getUnreadCount(
            googleToken.access_token,
            googleToken.refresh_token
          )
          context.connectedServices.push('Gmail')
        } catch (emailErr) {
          console.log('Gmail fetch skipped (may need re-auth):', emailErr)
        }

        // Get Google Photos summary
        try {
          const photosSummary = await getPhotosSummary(
            googleToken.access_token,
            googleToken.refresh_token
          )
          context.photosSummary = formatPhotosSummaryForContext(photosSummary)
          if (photosSummary.totalAlbums > 0 || photosSummary.recentPhotos.length > 0) {
            context.connectedServices.push('Google Photos')
          }
        } catch (photosErr) {
          console.log('Photos fetch skipped (may need re-auth):', photosErr)
        }
      }
    }
  } catch (e) {
    // Table might not exist or no Google connection
    console.log('Google data fetch skipped:', e)
  }

  const formatted = formatContextForPrompt(context)
  console.log('[Context] Final context length:', formatted.length, 'chars')
  console.log('[Context] Preview:', formatted.substring(0, 500))
  return formatted
}

function formatContextForPrompt(context: UserContext): string {
  const sections: string[] = []

  // Connected services summary
  if (context.connectedServices.length > 0) {
    sections.push(`## Connected Services\n${context.connectedServices.join(', ')}`)
  }

  // Financial overview
  if (context.bankAccounts.length > 0) {
    const accountsSummary = context.bankAccounts.map(acc =>
      `- ${acc.institution_name} ${acc.account_name} (${acc.account_type}): $${acc.current_balance.toLocaleString()}`
    ).join('\n')

    sections.push(`## David's Bank Accounts (Total: $${context.totalBalance.toLocaleString()})
${accountsSummary}`)
  }

  // Spending summary (last 30 days - lean context)
  if (context.recentTransactions.length > 0) {
    const spending = context.recentTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    const income = context.recentTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0)

    // Group by merchant for top spending
    const byMerchant: Record<string, number> = {}
    context.recentTransactions.forEach(t => {
      if (t.amount < 0) {
        const merchant = t.merchant_name || t.description.substring(0, 30)
        byMerchant[merchant] = (byMerchant[merchant] || 0) + Math.abs(t.amount)
      }
    })

    const topMerchants = Object.entries(byMerchant)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([merchant, amt]) => `${merchant}: $${amt.toLocaleString()}`)
      .join(', ')

    // Recent notable transactions (last 10)
    const recentNotable = context.recentTransactions
      .slice(0, 10)
      .map(t => `${t.date}: ${t.merchant_name || t.description} ${t.amount > 0 ? '+' : ''}$${t.amount.toFixed(0)}`)
      .join('\n')

    sections.push(`## Last 30 Days Financial Summary
- Spending: $${spending.toLocaleString()} | Income: $${income.toLocaleString()} | Net: ${income - spending >= 0 ? '+' : ''}$${(income - spending).toLocaleString()}
- Top merchants: ${topMerchants}

Recent transactions:
${recentNotable}`)
  }

  // Subscriptions
  if (context.subscriptions.length > 0) {
    const monthlyTotal = context.subscriptions
      .filter(s => s.frequency === 'monthly')
      .reduce((sum, s) => sum + s.amount, 0)

    const subsList = context.subscriptions
      .slice(0, 10)
      .map(s => `- ${s.merchant_name}: $${s.amount}/${s.frequency}`)
      .join('\n')

    sections.push(`## Active Subscriptions (~$${monthlyTotal.toLocaleString()}/month)
${subsList}`)
  }

  // Google Drive files
  if (context.driveFiles.length > 0) {
    const fileTypes: Record<string, number> = {}
    context.driveFiles.forEach(f => {
      const type = f.mime_type.includes('document') ? 'Docs' :
                   f.mime_type.includes('spreadsheet') ? 'Sheets' :
                   f.mime_type.includes('presentation') ? 'Slides' :
                   f.mime_type.includes('pdf') ? 'PDFs' :
                   f.mime_type.includes('image') ? 'Images' : 'Other'
      fileTypes[type] = (fileTypes[type] || 0) + 1
    })

    const typeSummary = Object.entries(fileTypes)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ')

    const recentFiles = context.driveFiles
      .slice(0, 10)
      .map(f => `- ${f.name}`)
      .join('\n')

    sections.push(`## Google Drive (${context.driveFiles.length} files indexed)
File types: ${typeSummary}

Recent files:
${recentFiles}`)
  }

  // Gmail
  if (context.emailSummary) {
    sections.push(`## Gmail (${context.unreadEmailCount} unread)
${context.emailSummary}`)
  }

  // Google Photos
  if (context.photosSummary) {
    sections.push(context.photosSummary)
  }

  // Projects
  if (context.projects.length > 0) {
    const projectsList = context.projects.map(p => {
      const parts = [`- **${p.name}**`]
      if (p.client_name) parts.push(`(${p.client_name})`)
      parts.push(`[${p.status}]`)
      if (p.due_date) parts.push(`Due: ${p.due_date}`)
      if (p.priority >= 8) parts.push('HIGH PRIORITY')
      return parts.join(' ')
    }).join('\n')

    sections.push(`## Active Projects (${context.projects.length})
${projectsList}`)
  }

  // Blockers (high visibility)
  if (context.blockers.length > 0) {
    const now = new Date()
    const blockersList = context.blockers.map(b => {
      const daysWaiting = Math.floor((now.getTime() - new Date(b.waiting_since).getTime()) / (1000 * 60 * 60 * 24))
      const project = b.project_name ? ` (${b.project_name})` : ''
      const person = b.person ? ` - waiting on ${b.person}` : ''
      const followUps = b.follow_up_attempts > 0 ? ` [${b.follow_up_attempts} follow-ups]` : ''
      const urgency = daysWaiting > 7 ? ' !!!' : daysWaiting > 3 ? ' !!' : ''
      return `- [${b.type}]${project}${person}: ${b.description} (${daysWaiting} days)${followUps}${urgency}`
    }).join('\n')

    sections.push(`## Active Blockers (${context.blockers.length})
${blockersList}`)
  }

  // Clients
  if (context.clients.length > 0) {
    const clientsList = context.clients.map(c => {
      const revenue = c.total_revenue ? `$${c.total_revenue.toLocaleString()}` : '$0'
      const retainer = c.monthly_retainer ? ` ($${c.monthly_retainer}/mo retainer)` : ''
      return `- ${c.name}: ${revenue} total${retainer}`
    }).join('\n')

    const totalClientRevenue = context.clients.reduce((sum, c) => sum + (c.total_revenue || 0), 0)
    sections.push(`## Clients (${context.clients.length} active, $${totalClientRevenue.toLocaleString()} total revenue)
${clientsList}`)
  }

  // Calendar events
  if (context.calendarEvents.length > 0) {
    const now = new Date()
    const eventsList = context.calendarEvents.map(e => {
      const startDate = new Date(e.start)
      const isToday = startDate.toDateString() === now.toDateString()
      const isTomorrow = startDate.toDateString() === new Date(now.getTime() + 86400000).toDateString()

      const dateStr = isToday ? 'TODAY' : isTomorrow ? 'Tomorrow' :
        startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const timeStr = e.isAllDay ? 'All day' :
        startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

      let line = `- ${dateStr} ${timeStr}: ${e.title}`
      if (e.location) line += ` @ ${e.location}`
      if (e.attendees.length > 0) line += ` (with ${e.attendees.slice(0, 2).join(', ')})`
      return line
    }).join('\n')

    sections.push(`## Upcoming Calendar (next 7 days)
${eventsList}`)
  }

  // Scheduled tasks
  if (context.scheduledTasks.length > 0) {
    const now = new Date()
    const tasksList = context.scheduledTasks.map(t => {
      const dueDate = new Date(t.scheduled_for)
      const isOverdue = dueDate < now
      const isToday = dueDate.toDateString() === now.toDateString()
      const isTomorrow = dueDate.toDateString() === new Date(now.getTime() + 86400000).toDateString()

      const dateStr = isOverdue ? 'OVERDUE' : isToday ? 'TODAY' : isTomorrow ? 'Tomorrow' :
        dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

      const priority = t.priority >= 8 ? ' [HIGH]' : t.priority >= 5 ? '' : ' [low]'
      const context = t.project_name ? ` (${t.project_name})` : t.client_name ? ` (${t.client_name})` : ''

      return `- ${dateStr}${priority}: ${t.title}${context}`
    }).join('\n')

    const overdueCount = context.scheduledTasks.filter(t => new Date(t.scheduled_for) < now).length
    const header = overdueCount > 0 ? `## Scheduled Tasks (${overdueCount} OVERDUE)` : '## Scheduled Tasks'

    sections.push(`${header}
${tasksList}`)
  }

  if (sections.length === 0) {
    return '\n\n## Data Access\nNo external accounts connected yet. David can connect banking and Google services for full context.'
  }

  return '\n\n' + sections.join('\n\n')
}

// Get specific data on demand (for tools)
export async function getBankAccountDetails(userId: string, accountId?: string) {
  const supabase = await createClient()

  if (accountId) {
    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('id', accountId)
      .single()
    return data
  }

  const { data } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)

  return data
}

export async function getTransactionsByDateRange(
  userId: string,
  startDate: string,
  endDate: string,
  category?: string
): Promise<Transaction[] | null> {
  const supabase = await createClient()

  let query = supabase
    .from('transactions')
    .select('id, date, description, amount, category, merchant_name')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }

  const { data } = await query
  return data as Transaction[] | null
}

export async function searchDriveFiles(userId: string, query: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('source', 'google_drive')
    .ilike('name', `%${query}%`)
    .limit(20)

  return data
}

// Full-text search inside Google Drive documents (no download needed)
// Now supports multi-account - searches across all connected Google accounts
export async function searchDriveContent(userId: string, query: string) {
  try {
    // Get all connected Google accounts
    const accounts = await getAllAccounts(userId)

    if (accounts.length === 0) {
      return null
    }

    const allResults: {
      id: string | null | undefined
      name: string | null | undefined
      mimeType: string | null | undefined
      modifiedTime: string | null | undefined
      webViewLink: string | null | undefined
      snippet: string | null
      accountLabel: string
      googleEmail: string
    }[] = []

    // Search across all accounts in parallel
    await Promise.all(
      accounts.map(async (account) => {
        try {
          const tokens = await getValidAccessToken(account.id, userId)
          if (!tokens) return

          // Use Google's built-in full-text search
          const files = await fullTextSearch(tokens.accessToken, query, {
            maxResults: 10,
          })

          if (!files || files.length === 0) return

          // Get snippets for top results
          const results = await Promise.all(
            files.slice(0, 5).map(async (file) => {
              let snippet: string | null = null

              // Only get snippets for exportable Google files
              if (file.mimeType?.startsWith('application/vnd.google-apps.')) {
                snippet = await getFileSnippet(
                  tokens.accessToken,
                  file.id!,
                  query,
                  file.mimeType
                )
              }

              return {
                id: file.id,
                name: file.name,
                mimeType: file.mimeType,
                modifiedTime: file.modifiedTime,
                webViewLink: file.webViewLink,
                snippet,
                accountLabel: account.account_label,
                googleEmail: account.google_email,
              }
            })
          )

          allResults.push(...results)
        } catch (e) {
          console.error(`Drive search failed for ${account.google_email}:`, e)
        }
      })
    )

    if (allResults.length === 0) {
      return null
    }

    // Sort by modified time (newest first)
    allResults.sort((a, b) => {
      const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
      const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
      return timeB - timeA
    })

    return allResults.slice(0, 10)
  } catch (e) {
    console.error('Drive content search failed:', e)
    return null
  }
}

export async function semanticSearchDocuments(userId: string, query: string) {
  const supabase = await createClient()

  try {
    // Generate embedding for the query
    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // Search using pgvector similarity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: results, error } = await (supabase.rpc as any)('search_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 10,
      p_user_id: userId,
    })

    if (error || !results || results.length === 0) {
      return null
    }

    // Get document details
    const documentIds = Array.from(new Set(results.map((r: { document_id: string }) => r.document_id))) as string[]
    const { data: documents } = await supabase
      .from('documents')
      .select('id, file_name, title, document_type')
      .in('id', documentIds)

    // Combine results with document info
    return results.map((result: { document_id: string; chunk_text: string; similarity: number }) => ({
      ...result,
      document: documents?.find((d: { id: string }) => d.id === result.document_id),
    }))
  } catch (e) {
    console.error('Semantic search failed:', e)
    return null
  }
}

export async function searchUserEmails(userId: string, query: string) {
  const supabase = await createClient()

  try {
    const { data: googleToken } = await supabase
      .from('google_oauth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .single() as { data: { access_token: string; refresh_token: string } | null }

    if (!googleToken?.access_token) {
      return null
    }

    const emails = await searchEmails(
      googleToken.access_token,
      query,
      googleToken.refresh_token,
      10
    )

    return emails
  } catch (e) {
    console.error('Email search failed:', e)
    return null
  }
}
