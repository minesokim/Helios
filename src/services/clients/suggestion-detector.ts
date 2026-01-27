/**
 * Client Suggestion Detection Service
 *
 * Analyzes multiple data sources to detect potential clients:
 * - Emails (sender domains, communication frequency)
 * - Documents (company names in file names, invoices)
 * - Conversations (mentions of working with someone)
 * - Calendar events (meeting attendees)
 */

import { createClient } from '@/lib/supabase/server'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'
import { getUpcomingEvents } from '@/lib/google/calendar'

// Known personal/service email domains to exclude
const EXCLUDED_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'aol.com',
  'protonmail.com',
  'mail.com',
  'live.com',
  'msn.com',
  // Common services
  'google.com',
  'apple.com',
  'amazon.com',
  'paypal.com',
  'stripe.com',
  'shopify.com',
  'squarespace.com',
  'wix.com',
  'github.com',
  'notion.so',
  'slack.com',
  'zoom.us',
  'calendly.com',
  'hubspot.com',
  'mailchimp.com',
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'noreply',
  'no-reply',
  'notifications',
  'updates',
  'support',
  'info',
  'help',
]

export interface DetectionResult {
  name: string
  company?: string
  email?: string
  type: 'company' | 'individual' | 'unknown'
  source: 'email' | 'document' | 'invoice' | 'conversation' | 'calendar'
  sourceId?: string
  confidence: number
  evidence: {
    emails?: { subject: string; date: string }[]
    documents?: { name: string; type: string }[]
    mentions?: { context: string; date: string }[]
    meetings?: { title: string; date: string }[]
  }
}

/**
 * Extract company name from email domain
 */
function extractCompanyFromDomain(domain: string): string {
  // Remove common TLDs and clean up
  const company = domain
    .replace(/\.(com|org|net|io|co|ai|dev|app|tech|agency|design|studio)$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase()) // Title case

  return company
}

/**
 * Extract name from email format "Name <email@domain.com>"
 */
function extractNameFromEmail(fromField: string): string | null {
  const match = fromField.match(/^([^<]+)(?:<[^>]+>)?$/)
  if (match && match[1]) {
    const name = match[1].trim().replace(/["']/g, '')
    // Filter out generic names
    if (name && !name.includes('@') && name.length > 2) {
      return name
    }
  }
  return null
}

/**
 * Check if domain should be excluded
 */
function isExcludedDomain(domain: string): boolean {
  const lowerDomain = domain.toLowerCase()
  return EXCLUDED_DOMAINS.some(excluded =>
    lowerDomain === excluded || lowerDomain.includes(excluded)
  )
}

/**
 * Detect potential clients from emails
 * Groups by sender domain and analyzes communication patterns
 */
export async function detectFromEmails(userId: string): Promise<DetectionResult[]> {
  const supabase = await createClient()
  const results: DetectionResult[] = []

  try {
    // Get recent emails from aggregated email data stored in context
    // We'll search the ai_messages for email-related conversations
    // and also look at the indexed email metadata

    const accounts = await getAllAccounts(userId)
    if (accounts.length === 0) return results

    // Aggregate email sender data from all accounts
    const senderMap = new Map<string, {
      name: string
      email: string
      domain: string
      emails: { subject: string; date: string }[]
      replyCount: number
    }>()

    for (const account of accounts) {
      try {
        const tokens = await getValidAccessToken(account.id, userId)
        if (!tokens) continue

        // Fetch recent emails via Gmail API
        const { google } = await import('googleapis')
        const gmail = google.gmail({ version: 'v1' })

        const response = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 100,
          q: 'newer_than:30d -category:promotions -category:social -category:updates',
          access_token: tokens.accessToken,
        })

        const messages = response.data.messages || []

        for (const msg of messages.slice(0, 50)) {
          try {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
              access_token: tokens.accessToken,
            })

            const headers = detail.data.payload?.headers || []
            const fromHeader = headers.find(h => h.name === 'From')?.value || ''
            const subject = headers.find(h => h.name === 'Subject')?.value || ''
            const date = headers.find(h => h.name === 'Date')?.value || ''

            // Extract email address from From header
            const emailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([^\s]+@[^\s]+)/)
            if (!emailMatch) continue

            const email = emailMatch[1].toLowerCase()
            const domain = email.split('@')[1]
            if (!domain || isExcludedDomain(domain)) continue

            const name = extractNameFromEmail(fromHeader) || extractCompanyFromDomain(domain)
            const key = email

            if (!senderMap.has(key)) {
              senderMap.set(key, {
                name,
                email,
                domain,
                emails: [],
                replyCount: 0,
              })
            }

            const sender = senderMap.get(key)!
            sender.emails.push({
              subject: subject.substring(0, 100),
              date: new Date(date).toISOString().split('T')[0],
            })

            // Check if this is a reply (subject starts with Re:)
            if (subject.toLowerCase().startsWith('re:')) {
              sender.replyCount++
            }
          } catch (e) {
            // Skip individual message errors
          }
        }
      } catch (e) {
        console.error(`Email detection failed for account ${account.google_email}:`, e)
      }
    }

    // Convert sender data to detection results
    for (const [, sender] of senderMap) {
      // Calculate confidence based on:
      // - Number of emails (more = higher)
      // - Reply count (replies indicate engagement)
      // - Recency (recent emails = higher)
      const emailCount = sender.emails.length
      const hasReplies = sender.replyCount > 0

      // Minimum threshold: at least 2 emails or 1 with reply
      if (emailCount < 2 && !hasReplies) continue

      let confidence = Math.min(0.9, 0.3 + (emailCount * 0.1) + (sender.replyCount * 0.15))
      if (hasReplies) confidence = Math.max(confidence, 0.6)

      // Determine type: company domain vs individual
      const isCompanyDomain = !sender.domain.match(/^\d/) && sender.domain.length > 5
      const type: 'company' | 'individual' | 'unknown' = isCompanyDomain ? 'company' : 'unknown'

      results.push({
        name: sender.name,
        company: isCompanyDomain ? extractCompanyFromDomain(sender.domain) : undefined,
        email: sender.email,
        type,
        source: 'email',
        sourceId: sender.email,
        confidence,
        evidence: {
          emails: sender.emails.slice(0, 5), // Keep top 5 as evidence
        },
      })
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence)
    return results.slice(0, 20) // Return top 20
  } catch (e) {
    console.error('Email detection failed:', e)
    return results
  }
}

/**
 * Detect potential clients from Google Drive documents
 * Looks for company names in file names and invoice metadata
 */
export async function detectFromDocuments(userId: string): Promise<DetectionResult[]> {
  const supabase = await createClient()
  const results: DetectionResult[] = []

  try {
    // Get documents from the indexed drive_files table
    const { data: documents } = await supabase
      .from('drive_files')
      .select('id, name, mime_type, drive_modified_time, drive_file_id')
      .eq('user_id', userId)
      .order('drive_modified_time', { ascending: false })
      .limit(200)

    if (!documents || documents.length === 0) return results

    // Patterns to detect company/client names in document names
    const patterns = [
      // Invoice patterns
      /invoice[_\s-]+(?:for[_\s-]+)?([A-Za-z][A-Za-z0-9\s&]+?)(?:\s*[-_]|\s*\d|\.)/i,
      /([A-Za-z][A-Za-z0-9\s&]+?)[_\s-]+invoice/i,
      // Contract patterns
      /contract[_\s-]+(?:with[_\s-]+)?([A-Za-z][A-Za-z0-9\s&]+?)(?:\s*[-_]|\s*\d|\.)/i,
      /([A-Za-z][A-Za-z0-9\s&]+?)[_\s-]+contract/i,
      // Proposal patterns
      /proposal[_\s-]+(?:for[_\s-]+)?([A-Za-z][A-Za-z0-9\s&]+?)(?:\s*[-_]|\s*\d|\.)/i,
      /([A-Za-z][A-Za-z0-9\s&]+?)[_\s-]+proposal/i,
      // SOW patterns
      /sow[_\s-]+(?:for[_\s-]+)?([A-Za-z][A-Za-z0-9\s&]+?)(?:\s*[-_]|\s*\d|\.)/i,
      // Project folder patterns
      /^([A-Za-z][A-Za-z0-9\s&]+?)[_\s-]+project/i,
      // Client folder patterns
      /^([A-Za-z][A-Za-z0-9\s&]+?)[_\s-]+(?:files|documents|assets)/i,
    ]

    const clientMap = new Map<string, {
      name: string
      documents: { name: string; type: string }[]
      hasInvoice: boolean
      hasContract: boolean
    }>()

    for (const doc of documents) {
      const fileName = doc.name || ''
      const mimeType = doc.mime_type || ''

      for (const pattern of patterns) {
        const match = fileName.match(pattern)
        if (match && match[1]) {
          const clientName = match[1].trim()
          // Filter out common words and short names
          if (clientName.length < 3) continue
          if (['the', 'and', 'for', 'with', 'new', 'old', 'draft', 'final', 'copy'].includes(clientName.toLowerCase())) continue

          const key = clientName.toLowerCase()
          if (!clientMap.has(key)) {
            clientMap.set(key, {
              name: clientName,
              documents: [],
              hasInvoice: false,
              hasContract: false,
            })
          }

          const client = clientMap.get(key)!
          client.documents.push({
            name: fileName,
            type: mimeType || 'unknown',
          })

          if (fileName.toLowerCase().includes('invoice')) client.hasInvoice = true
          if (fileName.toLowerCase().includes('contract')) client.hasContract = true
          break // Only match once per document
        }
      }
    }

    // Convert to detection results
    for (const [, client] of clientMap) {
      // Calculate confidence based on document types
      let confidence = 0.4 + (client.documents.length * 0.1)
      if (client.hasInvoice) confidence += 0.2
      if (client.hasContract) confidence += 0.15
      confidence = Math.min(0.9, confidence)

      const source: 'document' | 'invoice' = client.hasInvoice ? 'invoice' : 'document'

      results.push({
        name: client.name,
        company: client.name,
        type: 'company',
        source,
        confidence,
        evidence: {
          documents: client.documents.slice(0, 5),
        },
      })
    }

    results.sort((a, b) => b.confidence - a.confidence)
    return results.slice(0, 15)
  } catch (e) {
    console.error('Document detection failed:', e)
    return results
  }
}

/**
 * Detect potential clients from AI conversations
 * Searches for patterns like "working with X", "client X", "project for X"
 */
export async function detectFromConversations(userId: string): Promise<DetectionResult[]> {
  const supabase = await createClient()
  const results: DetectionResult[] = []

  try {
    // Get recent AI messages
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: messages } = await (supabase as any)
      .from('ai_messages')
      .select('id, content, created_at')
      .eq('user_id', userId)
      .eq('role', 'user') // Only user messages
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(200)

    if (!messages || messages.length === 0) return results

    // Patterns to detect client mentions
    const patterns = [
      /working (?:on|with) ([A-Z][a-zA-Z0-9\s&']+?)(?:'s|\s+project|\s+website|\s+app|\s+on|\.|,|$)/gi,
      /client (?:is |named |called )?([A-Z][a-zA-Z0-9\s&']+?)(?:'s|\s+wants|\s+needs|\s+project|\.|,|$)/gi,
      /(?:project|job|gig) (?:for|with) ([A-Z][a-zA-Z0-9\s&']+?)(?:'s|\s+is|\.|,|$)/gi,
      /([A-Z][a-zA-Z0-9\s&']+?) (?:hired|reached out|contacted|wants|needs)/gi,
      /meeting with ([A-Z][a-zA-Z0-9\s&']+?)(?:'s|\s+about|\s+today|\s+tomorrow|\.|,|$)/gi,
      /proposal (?:for|to) ([A-Z][a-zA-Z0-9\s&']+?)(?:'s|\.|,|$)/gi,
      /invoice (?:for|to) ([A-Z][a-zA-Z0-9\s&']+?)(?:'s|\.|,|$)/gi,
    ]

    const clientMap = new Map<string, {
      name: string
      mentions: { context: string; date: string }[]
    }>()

    for (const msg of messages) {
      const content = msg.content

      for (const pattern of patterns) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0
        let match

        while ((match = pattern.exec(content)) !== null) {
          const clientName = match[1].trim()

          // Filter out common words and short names
          if (clientName.length < 3) continue
          const lowerName = clientName.toLowerCase()
          if (['the', 'my', 'our', 'their', 'this', 'that', 'some', 'new', 'today', 'tomorrow', 'next'].includes(lowerName)) continue

          // Skip if it looks like a common phrase
          if (['someone', 'anyone', 'something', 'nothing', 'everything'].includes(lowerName)) continue

          const key = lowerName
          if (!clientMap.has(key)) {
            clientMap.set(key, {
              name: clientName,
              mentions: [],
            })
          }

          const client = clientMap.get(key)!
          // Get surrounding context
          const matchIndex = match.index
          const contextStart = Math.max(0, matchIndex - 30)
          const contextEnd = Math.min(content.length, matchIndex + match[0].length + 30)
          const context = content.substring(contextStart, contextEnd)

          client.mentions.push({
            context: context.replace(/\n/g, ' ').trim(),
            date: new Date(msg.created_at).toISOString().split('T')[0],
          })
        }
      }
    }

    // Also check AI memories for client-related info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: memories } = await (supabase as any)
      .from('ai_memories')
      .select('content, created_at')
      .eq('user_id', userId)
      .eq('category', 'work')
      .limit(50)

    if (memories) {
      for (const memory of memories) {
        // Look for client mentions in memories
        const clientMatch = memory.content.match(/client[:\s]+([A-Z][a-zA-Z0-9\s&']+)/i)
        if (clientMatch) {
          const clientName = clientMatch[1].trim()
          const key = clientName.toLowerCase()

          if (!clientMap.has(key)) {
            clientMap.set(key, {
              name: clientName,
              mentions: [],
            })
          }

          const client = clientMap.get(key)!
          client.mentions.push({
            context: memory.content.substring(0, 100),
            date: new Date(memory.created_at).toISOString().split('T')[0],
          })
        }
      }
    }

    // Convert to detection results
    for (const [, client] of clientMap) {
      // Need at least 2 mentions for conversation-based detection
      if (client.mentions.length < 2) continue

      const confidence = Math.min(0.8, 0.4 + (client.mentions.length * 0.1))

      results.push({
        name: client.name,
        company: client.name,
        type: 'unknown',
        source: 'conversation',
        confidence,
        evidence: {
          mentions: client.mentions.slice(0, 5),
        },
      })
    }

    results.sort((a, b) => b.confidence - a.confidence)
    return results.slice(0, 10)
  } catch (e) {
    console.error('Conversation detection failed:', e)
    return results
  }
}

/**
 * Detect potential clients from calendar events
 * Extracts attendee emails from meetings
 */
export async function detectFromCalendar(userId: string): Promise<DetectionResult[]> {
  const supabase = await createClient()
  const results: DetectionResult[] = []

  try {
    const accounts = await getAllAccounts(userId)
    if (accounts.length === 0) return results

    const attendeeMap = new Map<string, {
      name: string
      email: string
      domain: string
      meetings: { title: string; date: string }[]
    }>()

    for (const account of accounts) {
      try {
        const tokens = await getValidAccessToken(account.id, userId)
        if (!tokens) continue

        // Get upcoming and past events (last 30 days + next 30 days)
        const events = await getUpcomingEvents(tokens.accessToken, tokens.refreshToken, 30, 50)

        for (const event of events) {
          // Skip events without external attendees
          if (!event.attendees || event.attendees.length === 0) continue

          for (const attendee of event.attendees) {
            // Extract email from attendee (could be name or email)
            const emailMatch = attendee.match(/([^\s]+@[^\s]+)/i)
            if (!emailMatch) continue

            const email = emailMatch[1].toLowerCase()
            const domain = email.split('@')[1]
            if (!domain || isExcludedDomain(domain)) continue

            // Skip own domain
            if (account.google_email.endsWith('@' + domain)) continue

            const name = extractCompanyFromDomain(domain)
            const key = domain

            if (!attendeeMap.has(key)) {
              attendeeMap.set(key, {
                name,
                email,
                domain,
                meetings: [],
              })
            }

            const att = attendeeMap.get(key)!
            att.meetings.push({
              title: event.title.substring(0, 100),
              date: new Date(event.start).toISOString().split('T')[0],
            })
          }
        }
      } catch (e) {
        console.error(`Calendar detection failed for account ${account.google_email}:`, e)
      }
    }

    // Convert to detection results
    for (const [, attendee] of attendeeMap) {
      // Need at least 2 meetings for calendar-based detection
      if (attendee.meetings.length < 2) continue

      // Higher confidence for recurring meetings
      const confidence = Math.min(0.85, 0.4 + (attendee.meetings.length * 0.15))

      results.push({
        name: attendee.name,
        company: attendee.name,
        email: attendee.email,
        type: 'company',
        source: 'calendar',
        confidence,
        evidence: {
          meetings: attendee.meetings.slice(0, 5),
        },
      })
    }

    results.sort((a, b) => b.confidence - a.confidence)
    return results.slice(0, 10)
  } catch (e) {
    console.error('Calendar detection failed:', e)
    return results
  }
}

/**
 * Debug wrappers for detection functions
 */
async function detectFromEmailsWithDebug(userId: string): Promise<{ results: DetectionResult[]; debug: string }> {
  try {
    const accounts = await getAllAccounts(userId)
    if (accounts.length === 0) {
      return { results: [], debug: 'No Google accounts connected' }
    }

    const results = await detectFromEmails(userId)
    return {
      results,
      debug: `Found ${accounts.length} account(s), detected ${results.length} potential clients`,
    }
  } catch (e) {
    return { results: [], debug: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }
  }
}

async function detectFromDocumentsWithDebug(userId: string): Promise<{ results: DetectionResult[]; debug: string }> {
  try {
    const supabase = await createClient()
    const { data: docs, error } = await supabase
      .from('drive_files')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (error) {
      return { results: [], debug: `DB error: ${error.message}` }
    }

    if (!docs || docs.length === 0) {
      return { results: [], debug: 'No documents indexed in drive_files' }
    }

    const results = await detectFromDocuments(userId)
    return {
      results,
      debug: `Found documents in DB, detected ${results.length} potential clients`,
    }
  } catch (e) {
    return { results: [], debug: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }
  }
}

async function detectFromConversationsWithDebug(userId: string): Promise<{ results: DetectionResult[]; debug: string }> {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: messages, error } = await (supabase as any)
      .from('ai_messages')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (error) {
      return { results: [], debug: `DB error: ${error.message}` }
    }

    if (!messages || messages.length === 0) {
      return { results: [], debug: 'No AI conversations found' }
    }

    const results = await detectFromConversations(userId)
    return {
      results,
      debug: `Found AI messages, detected ${results.length} potential clients`,
    }
  } catch (e) {
    return { results: [], debug: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }
  }
}

async function detectFromCalendarWithDebug(userId: string): Promise<{ results: DetectionResult[]; debug: string }> {
  try {
    const accounts = await getAllAccounts(userId)
    if (accounts.length === 0) {
      return { results: [], debug: 'No Google accounts connected' }
    }

    const results = await detectFromCalendar(userId)
    return {
      results,
      debug: `Found ${accounts.length} account(s), detected ${results.length} potential clients from calendar`,
    }
  } catch (e) {
    return { results: [], debug: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }
  }
}

/**
 * Run all detection methods and deduplicate results
 */
export async function runFullDetection(userId: string): Promise<{
  results: DetectionResult[]
  sourceCounts: Record<string, number>
  debug: {
    emailDebug: string
    docDebug: string
    convDebug: string
    calDebug: string
  }
}> {
  // Run all detectors in parallel with debug info
  const [emailData, docData, convData, calData] = await Promise.all([
    detectFromEmailsWithDebug(userId),
    detectFromDocumentsWithDebug(userId),
    detectFromConversationsWithDebug(userId),
    detectFromCalendarWithDebug(userId),
  ])

  const emailResults = emailData.results
  const docResults = docData.results
  const convResults = convData.results
  const calResults = calData.results

  const debug = {
    emailDebug: emailData.debug,
    docDebug: docData.debug,
    convDebug: convData.debug,
    calDebug: calData.debug,
  }

  // Merge and deduplicate by email or name
  const mergedMap = new Map<string, DetectionResult>()

  const allResults = [...emailResults, ...docResults, ...convResults, ...calResults]

  for (const result of allResults) {
    // Use email as key if available, otherwise use lowercase name
    const key = result.email?.toLowerCase() || result.name.toLowerCase()

    if (mergedMap.has(key)) {
      const existing = mergedMap.get(key)!
      // Merge evidence and take higher confidence
      existing.confidence = Math.max(existing.confidence, result.confidence)
      if (result.evidence.emails) {
        existing.evidence.emails = [...(existing.evidence.emails || []), ...result.evidence.emails]
      }
      if (result.evidence.documents) {
        existing.evidence.documents = [...(existing.evidence.documents || []), ...result.evidence.documents]
      }
      if (result.evidence.mentions) {
        existing.evidence.mentions = [...(existing.evidence.mentions || []), ...result.evidence.mentions]
      }
      if (result.evidence.meetings) {
        existing.evidence.meetings = [...(existing.evidence.meetings || []), ...result.evidence.meetings]
      }
      // Update type if we have more specific info
      if (result.type !== 'unknown' && existing.type === 'unknown') {
        existing.type = result.type
      }
      // Add email if missing
      if (result.email && !existing.email) {
        existing.email = result.email
      }
    } else {
      mergedMap.set(key, { ...result })
    }
  }

  const results = Array.from(mergedMap.values())
  results.sort((a, b) => b.confidence - a.confidence)

  return {
    results: results.slice(0, 30),
    sourceCounts: {
      email: emailResults.length,
      document: docResults.length,
      conversation: convResults.length,
      calendar: calResults.length,
    },
    debug,
  }
}

/**
 * Save detection results as client suggestions
 */
export async function saveDetectionResults(
  userId: string,
  results: DetectionResult[]
): Promise<{ created: number; skipped: number }> {
  const supabase = await createClient()
  let created = 0
  let skipped = 0

  // Get existing clients and suggestions to avoid duplicates
  const { data: existingClients } = await supabase
    .from('clients')
    .select('email, name')
    .eq('user_id', userId)
    .is('deleted_at', null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingSuggestions } = await (supabase as any)
    .from('client_suggestions')
    .select('suggested_email, suggested_name')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])

  const existingEmails = new Set([
    ...(existingClients?.map(c => c.email?.toLowerCase()) || []).filter(Boolean),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(existingSuggestions?.map((s: any) => s.suggested_email?.toLowerCase()) || []).filter(Boolean),
  ])

  const existingNames = new Set([
    ...(existingClients?.map(c => c.name?.toLowerCase()) || []).filter(Boolean),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(existingSuggestions?.map((s: any) => s.suggested_name?.toLowerCase()) || []).filter(Boolean),
  ])

  for (const result of results) {
    // Skip if email or name already exists
    if (result.email && existingEmails.has(result.email.toLowerCase())) {
      skipped++
      continue
    }
    if (existingNames.has(result.name.toLowerCase())) {
      skipped++
      continue
    }

    // Insert suggestion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('client_suggestions')
      .upsert({
        user_id: userId,
        suggested_name: result.name,
        suggested_company: result.company,
        suggested_email: result.email,
        suggested_type: result.type,
        source: result.source,
        source_id: result.sourceId,
        confidence: result.confidence,
        evidence: result.evidence,
        status: 'pending',
      }, {
        onConflict: 'user_id,suggested_email',
        ignoreDuplicates: true,
      })

    if (!error) {
      created++
      existingEmails.add(result.email?.toLowerCase() || '')
      existingNames.add(result.name.toLowerCase())
    } else {
      skipped++
    }
  }

  return { created, skipped }
}

/**
 * Get pending client suggestions
 */
export async function getPendingSuggestions(userId: string): Promise<{
  id: string
  suggested_name: string
  suggested_company: string | null
  suggested_email: string | null
  suggested_type: string
  source: string
  confidence: number
  evidence: DetectionResult['evidence']
  created_at: string
}[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('client_suggestions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)

  return data || []
}

/**
 * Approve a suggestion and create a client
 */
export async function approveSuggestion(
  userId: string,
  suggestionId: string,
  overrides?: {
    name?: string
    company?: string
    email?: string
    type?: string
  }
): Promise<{ client: { id: string; name: string } | null; error?: string }> {
  const supabase = await createClient()

  // Get the suggestion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: suggestion, error: fetchError } = await (supabase as any)
    .from('client_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !suggestion) {
    return { client: null, error: 'Suggestion not found' }
  }

  // Create the client
  const { data: client, error: createError } = await supabase
    .from('clients')
    .insert({
      user_id: userId,
      name: overrides?.name || suggestion.suggested_name,
      company: overrides?.company || suggestion.suggested_company,
      email: overrides?.email || suggestion.suggested_email,
      type: overrides?.type || suggestion.suggested_type,
      source: 'ai_suggested',
      status: 'lead', // New clients from suggestions start as leads
    })
    .select('id, name')
    .single()

  if (createError || !client) {
    return { client: null, error: createError?.message || 'Failed to create client' }
  }

  // Update suggestion status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('client_suggestions')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      merged_into_client_id: client.id,
    })
    .eq('id', suggestionId)

  return { client }
}

/**
 * Reject a suggestion
 */
export async function rejectSuggestion(
  userId: string,
  suggestionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('client_suggestions')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', suggestionId)
    .eq('user_id', userId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Merge suggestion into existing client
 */
export async function mergeSuggestion(
  userId: string,
  suggestionId: string,
  targetClientId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get the suggestion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: suggestion } = await (supabase as any)
    .from('client_suggestions')
    .select('suggested_email')
    .eq('id', suggestionId)
    .eq('user_id', userId)
    .single()

  if (!suggestion) {
    return { success: false, error: 'Suggestion not found' }
  }

  // Get the target client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (supabase as any)
    .from('clients')
    .select('emails')
    .eq('id', targetClientId)
    .eq('user_id', userId)
    .single()

  if (!client) {
    return { success: false, error: 'Client not found' }
  }

  // Add email to client's emails array if not already present
  if (suggestion.suggested_email) {
    const existingEmails = client.emails || []
    if (!existingEmails.includes(suggestion.suggested_email)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('clients')
        .update({
          emails: [...existingEmails, suggestion.suggested_email],
        })
        .eq('id', targetClientId)
    }
  }

  // Update suggestion status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('client_suggestions')
    .update({
      status: 'merged',
      reviewed_at: new Date().toISOString(),
      merged_into_client_id: targetClientId,
    })
    .eq('id', suggestionId)

  return { success: true }
}
