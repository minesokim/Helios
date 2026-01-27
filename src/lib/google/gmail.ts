/**
 * Gmail API integration for Jorkel
 *
 * Read-only access to user's Gmail:
 * - List recent emails
 * - Search emails
 * - Get email content
 *
 * Supports multi-account via accountId parameter
 */

import { google } from 'googleapis'
import { createAuthenticatedClient } from './oauth'
import { getValidAccessToken, type AccountTokens } from './token-manager'

export interface EmailSummary {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  labels: string[]
  isUnread: boolean
}

export interface EmailFull extends EmailSummary {
  body: string
  attachments: { filename: string; mimeType: string; size: number }[]
}

function decodeBase64(data: string): string {
  // Gmail uses URL-safe base64
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Buffer.from(base64, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function extractHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase())
  return header?.value || ''
}

function parseEmailParts(parts: any[]): string {
  let body = ''

  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      body += decodeBase64(part.body.data)
    } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
      // Fallback to HTML if no plain text
      const html = decodeBase64(part.body.data)
      // Strip HTML tags for plain text
      body = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    } else if (part.parts) {
      body += parseEmailParts(part.parts)
    }
  }

  return body
}

export async function listEmails(
  accessToken: string,
  refreshToken?: string,
  options: {
    maxResults?: number
    query?: string
    labelIds?: string[]
  } = {}
): Promise<EmailSummary[]> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const gmail = google.gmail({ version: 'v1', auth })

  const { maxResults = 20, query, labelIds } = options

  const { data } = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query,
    labelIds,
  })

  if (!data.messages) {
    return []
  }

  // Fetch full metadata for each message
  const emails: EmailSummary[] = []

  for (const msg of data.messages.slice(0, maxResults)) {
    try {
      const { data: fullMsg } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date'],
      })

      const headers = fullMsg.payload?.headers || []

      emails.push({
        id: msg.id!,
        threadId: msg.threadId!,
        subject: extractHeader(headers, 'Subject') || '(No Subject)',
        from: extractHeader(headers, 'From'),
        to: extractHeader(headers, 'To'),
        date: extractHeader(headers, 'Date'),
        snippet: fullMsg.snippet || '',
        labels: fullMsg.labelIds || [],
        isUnread: fullMsg.labelIds?.includes('UNREAD') || false,
      })
    } catch (e) {
      console.error('Error fetching email:', msg.id, e)
    }
  }

  return emails
}

export async function getEmail(
  accessToken: string,
  emailId: string,
  refreshToken?: string
): Promise<EmailFull | null> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const gmail = google.gmail({ version: 'v1', auth })

  try {
    const { data } = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    })

    const headers = data.payload?.headers || []
    let body = ''
    const attachments: { filename: string; mimeType: string; size: number }[] = []

    // Extract body
    if (data.payload?.body?.data) {
      body = decodeBase64(data.payload.body.data)
    } else if (data.payload?.parts) {
      body = parseEmailParts(data.payload.parts)

      // Extract attachments info
      for (const part of data.payload.parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType || 'application/octet-stream',
            size: part.body.size || 0,
          })
        }
      }
    }

    return {
      id: data.id!,
      threadId: data.threadId!,
      subject: extractHeader(headers, 'Subject') || '(No Subject)',
      from: extractHeader(headers, 'From'),
      to: extractHeader(headers, 'To'),
      date: extractHeader(headers, 'Date'),
      snippet: data.snippet || '',
      labels: data.labelIds || [],
      isUnread: data.labelIds?.includes('UNREAD') || false,
      body: body.substring(0, 5000), // Limit body size
      attachments,
    }
  } catch (e) {
    console.error('Error fetching full email:', emailId, e)
    return null
  }
}

export async function searchEmails(
  accessToken: string,
  query: string,
  refreshToken?: string,
  maxResults = 10
): Promise<EmailSummary[]> {
  return listEmails(accessToken, refreshToken, { query, maxResults })
}

export async function getUnreadCount(
  accessToken: string,
  refreshToken?: string,
  options: { importantOnly?: boolean; customQuery?: string } = {}
): Promise<number> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const gmail = google.gmail({ version: 'v1', auth })

  // If importantOnly or customQuery, count unread matching that filter
  if (options.importantOnly || options.customQuery) {
    const query = options.customQuery || 'is:unread (is:important OR category:primary)'
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: `is:unread ${options.customQuery || '(is:important OR category:primary)'}`,
      maxResults: 100, // Cap at 100 for performance
    })
    return data.resultSizeEstimate || data.messages?.length || 0
  }

  // Default: get total inbox unread count
  const { data } = await gmail.users.labels.get({
    userId: 'me',
    id: 'INBOX',
  })

  return data.messagesUnread || 0
}

export async function createDraft(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  refreshToken?: string,
  options?: { cc?: string; bcc?: string; replyTo?: string }
): Promise<{ id: string; message: { id: string } } | null> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const gmail = google.gmail({ version: 'v1', auth })

  // Create RFC 2822 formatted email
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
  ]
  if (options?.cc) headers.push(`Cc: ${options.cc}`)
  if (options?.bcc) headers.push(`Bcc: ${options.bcc}`)
  if (options?.replyTo) headers.push(`Reply-To: ${options.replyTo}`)
  headers.push('Content-Type: text/plain; charset=utf-8')
  headers.push('')
  headers.push(body)

  const email = headers.join('\n')

  // Base64 encode
  const encodedEmail = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    const { data } = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedEmail,
        },
      },
    })

    return data as { id: string; message: { id: string } }
  } catch (error) {
    console.error('Error creating draft:', error)
    return null
  }
}

export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  refreshToken?: string,
  options?: { cc?: string; bcc?: string; replyTo?: string; threadId?: string }
): Promise<{ id: string; threadId: string; labelIds: string[] } | null> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const gmail = google.gmail({ version: 'v1', auth })

  // Create RFC 2822 formatted email
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
  ]
  if (options?.cc) headers.push(`Cc: ${options.cc}`)
  if (options?.bcc) headers.push(`Bcc: ${options.bcc}`)
  if (options?.replyTo) headers.push(`Reply-To: ${options.replyTo}`)
  headers.push('Content-Type: text/plain; charset=utf-8')
  headers.push('')
  headers.push(body)

  const email = headers.join('\n')

  // Base64 encode
  const encodedEmail = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    const { data } = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
        threadId: options?.threadId,
      },
    })

    return data as { id: string; threadId: string; labelIds: string[] }
  } catch (error) {
    console.error('Error sending email:', error)
    return null
  }
}

export async function getRecentEmailsSummary(
  accessToken: string,
  refreshToken?: string,
  maxResults = 10
): Promise<string> {
  const emails = await listEmails(accessToken, refreshToken, { maxResults })

  if (emails.length === 0) {
    return 'No recent emails.'
  }

  const unreadCount = emails.filter(e => e.isUnread).length

  const summary = emails.map(e => {
    const date = new Date(e.date).toLocaleDateString()
    const unread = e.isUnread ? '[UNREAD] ' : ''
    const from = e.from.replace(/<[^>]+>/, '').trim() // Remove email address, keep name
    return `${unread}${date} - ${from}: ${e.subject}`
  }).join('\n')

  return `Recent emails (${unreadCount} unread):\n${summary}`
}

// ============================================
// Multi-Account Wrapper Functions
// ============================================

export interface EmailWithAccount extends EmailSummary {
  accountId: string
  accountLabel: string
  googleEmail: string
}

/**
 * List emails for a specific account by accountId
 */
export async function listEmailsForAccount(
  accountId: string,
  userId: string,
  options: {
    maxResults?: number
    query?: string
    labelIds?: string[]
  } = {}
): Promise<{ emails: EmailWithAccount[]; tokens: AccountTokens | null }> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return { emails: [], tokens: null }
  }

  const emails = await listEmails(tokens.accessToken, tokens.refreshToken, options)

  const emailsWithAccount: EmailWithAccount[] = emails.map(email => ({
    ...email,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }))

  return { emails: emailsWithAccount, tokens }
}

/**
 * Get full email for a specific account by accountId
 */
export async function getEmailForAccount(
  accountId: string,
  userId: string,
  emailId: string
): Promise<EmailFull | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return null
  }

  return getEmail(tokens.accessToken, emailId, tokens.refreshToken)
}

/**
 * Search emails for a specific account by accountId
 */
export async function searchEmailsForAccount(
  accountId: string,
  userId: string,
  query: string,
  maxResults = 10
): Promise<EmailWithAccount[]> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return []
  }

  const emails = await searchEmails(tokens.accessToken, query, tokens.refreshToken, maxResults)

  return emails.map(email => ({
    ...email,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }))
}

/**
 * Get unread count for a specific account by accountId
 */
export async function getUnreadCountForAccount(
  accountId: string,
  userId: string,
  options: { importantOnly?: boolean; customQuery?: string } = {}
): Promise<{ count: number; accountLabel: string } | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return null
  }

  const count = await getUnreadCount(tokens.accessToken, tokens.refreshToken, options)

  return { count, accountLabel: tokens.accountLabel }
}

/**
 * Create draft for a specific account by accountId
 */
export async function createDraftForAccount(
  accountId: string,
  userId: string,
  to: string,
  subject: string,
  body: string,
  options?: { cc?: string; bcc?: string; replyTo?: string }
): Promise<{ id: string; message: { id: string }; fromEmail: string } | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return null
  }

  const draft = await createDraft(tokens.accessToken, to, subject, body, tokens.refreshToken, options)
  if (!draft) return null

  return { ...draft, fromEmail: tokens.googleEmail }
}

/**
 * Send email for a specific account by accountId
 */
export async function sendEmailForAccount(
  accountId: string,
  userId: string,
  to: string,
  subject: string,
  body: string,
  options?: { cc?: string; bcc?: string; replyTo?: string; threadId?: string }
): Promise<{ id: string; threadId: string; fromEmail: string } | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return null
  }

  const result = await sendEmail(tokens.accessToken, to, subject, body, tokens.refreshToken, options)
  if (!result) return null

  return { id: result.id, threadId: result.threadId, fromEmail: tokens.googleEmail }
}

/**
 * Get email summary for a specific account by accountId
 */
export async function getRecentEmailsSummaryForAccount(
  accountId: string,
  userId: string,
  maxResults = 10
): Promise<{ summary: string; accountLabel: string } | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return null
  }

  const summary = await getRecentEmailsSummary(tokens.accessToken, tokens.refreshToken, maxResults)

  return { summary, accountLabel: tokens.accountLabel }
}
