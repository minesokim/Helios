import { createClient } from '@/lib/supabase/server'
import { getAggregatedEmails, getAggregatedUnreadCount } from '@/services/google/aggregator'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'
import { listEmails } from '@/lib/google/gmail'
import { NextResponse } from 'next/server'

// Email type for the response
interface EmailItem {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  isUnread: boolean
  accountId: string
  accountLabel: string
  googleEmail: string
  type: 'inbox' | 'sent'
}

// GET /api/gmail/check - Get recent emails and unread counts for polling
export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if sent emails are requested
    const { searchParams } = new URL(request.url)
    const includeSent = searchParams.get('sent') === 'true'

    // Fetch aggregated emails from all accounts
    const [emailResult, unreadResult] = await Promise.all([
      getAggregatedEmails(user.id, { maxResults: 20 }),
      getAggregatedUnreadCount(user.id),
    ])

    // Transform emails for the widget
    const emails: EmailItem[] = emailResult.emails.map(email => ({
      id: email.id,
      threadId: email.threadId,
      subject: email.subject,
      from: email.from,
      to: email.to,
      date: email.date,
      snippet: email.snippet,
      isUnread: email.isUnread,
      accountId: email.accountId,
      accountLabel: email.accountLabel,
      googleEmail: email.googleEmail,
      type: 'inbox' as const,
    }))

    // Fetch sent emails if requested
    let sentEmails: EmailItem[] = []
    if (includeSent) {
      const accounts = await getAllAccounts(user.id)
      for (const account of accounts) {
        try {
          const tokens = await getValidAccessToken(account.id, user.id)
          if (tokens) {
            const sent = await listEmails(tokens.accessToken, tokens.refreshToken, {
              maxResults: 10,
              labelIds: ['SENT'],
            })
            sentEmails.push(...sent.map(email => ({
              id: email.id,
              threadId: email.threadId,
              subject: email.subject,
              from: email.from,
              to: email.to,
              date: email.date,
              snippet: email.snippet,
              isUnread: false,
              accountId: account.id,
              accountLabel: account.account_label,
              googleEmail: account.google_email,
              type: 'sent' as const,
            })))
          }
        } catch (e) {
          console.error(`Failed to fetch sent for ${account.google_email}:`, e)
        }
      }
      // Sort sent by date
      sentEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      sentEmails = sentEmails.slice(0, 15)
    }

    return NextResponse.json({
      emails,
      sentEmails,
      totalUnread: unreadResult.total,
      unreadByAccount: unreadResult.byAccount,
    })
  } catch (error) {
    console.error('Gmail check error:', error)
    // Return empty data instead of error to not break the widget
    return NextResponse.json({
      emails: [],
      sentEmails: [],
      totalUnread: 0,
      unreadByAccount: [],
      error: String(error),
    })
  }
}
