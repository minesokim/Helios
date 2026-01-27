/**
 * Client Linked Data API
 *
 * GET - Returns linked emails, documents, and conversations for a client
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  request: Request,
  context: RouteContext
) {
  const supabase = await createClient()
  const params = await context.params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = params.id

  try {
    // Get the client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Prepare search terms: email, company name, client name
    const searchTerms: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientAny = client as any
    if (clientAny.email) searchTerms.push(clientAny.email)
    if (clientAny.emails?.length) searchTerms.push(...clientAny.emails)
    if (clientAny.company) searchTerms.push(clientAny.company)
    if (clientAny.name && clientAny.name !== clientAny.company) searchTerms.push(clientAny.name)

    // Search for linked emails
    const linkedEmails: {
      id: string
      subject: string
      from: string
      date: string
      snippet: string
      accountLabel: string
    }[] = []

    if (searchTerms.length > 0) {
      try {
        const accounts = await getAllAccounts(user.id)

        for (const account of accounts) {
          try {
            const tokens = await getValidAccessToken(account.id, user.id)
            if (!tokens) continue

            const { google } = await import('googleapis')
            const gmail = google.gmail({ version: 'v1' })

            // Build search query from terms (OR them together for email addresses)
            const emailTerms = searchTerms.filter(t => t.includes('@'))
            const nameTerms = searchTerms.filter(t => !t.includes('@'))

            let query = ''
            if (emailTerms.length > 0) {
              query = emailTerms.map(e => `from:${e} OR to:${e}`).join(' OR ')
            }
            if (nameTerms.length > 0 && query) {
              query += ' OR ' + nameTerms.map(n => `"${n}"`).join(' OR ')
            } else if (nameTerms.length > 0) {
              query = nameTerms.map(n => `"${n}"`).join(' OR ')
            }

            const response = await gmail.users.messages.list({
              userId: 'me',
              maxResults: 10,
              q: query,
              access_token: tokens.accessToken,
            })

            const messages = response.data.messages || []

            for (const msg of messages.slice(0, 5)) {
              try {
                const detail = await gmail.users.messages.get({
                  userId: 'me',
                  id: msg.id!,
                  format: 'metadata',
                  metadataHeaders: ['From', 'Subject', 'Date'],
                  access_token: tokens.accessToken,
                })

                const headers = detail.data.payload?.headers || []
                linkedEmails.push({
                  id: msg.id!,
                  subject: headers.find(h => h.name === 'Subject')?.value || '(No subject)',
                  from: headers.find(h => h.name === 'From')?.value || '',
                  date: headers.find(h => h.name === 'Date')?.value || '',
                  snippet: detail.data.snippet || '',
                  accountLabel: account.account_label,
                })
              } catch {
                // Skip individual message errors
              }
            }
          } catch {
            // Skip account errors
          }
        }
      } catch (e) {
        console.error('Email search failed:', e)
      }
    }

    // Search for linked documents
    const linkedDocuments: {
      id: string
      name: string
      mimeType: string
      modifiedTime: string
      webViewLink: string
    }[] = []

    if (searchTerms.length > 0) {
      try {
        // Search local drive_files index
        for (const term of searchTerms.filter(t => !t.includes('@'))) {
          const { data: docs } = await supabase
            .from('drive_files')
            .select('id, name, mime_type, drive_modified_time, drive_file_id')
            .eq('user_id', user.id)
            .ilike('name', `%${term}%`)
            .limit(10)

          if (docs) {
            for (const doc of docs) {
              // Avoid duplicates
              if (!linkedDocuments.find(d => d.id === doc.id)) {
                linkedDocuments.push({
                  id: doc.id,
                  name: doc.name,
                  mimeType: doc.mime_type || '',
                  modifiedTime: doc.drive_modified_time || '',
                  webViewLink: `https://drive.google.com/file/d/${doc.drive_file_id}/view`,
                })
              }
            }
          }
        }
      } catch (e) {
        console.error('Document search failed:', e)
      }
    }

    // Search for linked conversations
    const linkedConversations: {
      id: string
      title: string
      snippet: string
      date: string
    }[] = []

    if (searchTerms.length > 0) {
      try {
        for (const term of searchTerms.filter(t => !t.includes('@'))) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: messages } = await (supabase as any)
            .from('ai_messages')
            .select('id, content, created_at, conversation_id')
            .eq('user_id', user.id)
            .ilike('content', `%${term}%`)
            .order('created_at', { ascending: false })
            .limit(10)

          if (messages) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const convIds = [...new Set(messages.map((m: any) => m.conversation_id))]

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: convs } = await (supabase as any)
              .from('ai_conversations')
              .select('id, title, created_at')
              .in('id', convIds)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const convMap = new Map(convs?.map((c: any) => [c.id, c]) || [])

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const msg of messages as any[]) {
              const conv = convMap.get(msg.conversation_id)
              if (!conv) continue

              // Avoid duplicates
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if (!linkedConversations.find(c => c.id === (conv as any).id)) {
                linkedConversations.push({
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  id: (conv as any).id,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  title: (conv as any).title || 'Untitled conversation',
                  snippet: msg.content.substring(0, 150),
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  date: (conv as any).created_at,
                })
              }
            }
          }
        }
      } catch (e) {
        console.error('Conversation search failed:', e)
      }
    }

    // Get financial data
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const [revenueRes, expensesRes] = await Promise.all([
      supabase
        .from('client_revenue')
        .select('*')
        .eq('client_id', clientId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gte('revenue_date', twelveMonthsAgo.toISOString().split('T')[0])
        .order('revenue_date', { ascending: false }),
      supabase
        .from('client_expenses')
        .select('*')
        .eq('client_id', clientId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gte('expense_date', twelveMonthsAgo.toISOString().split('T')[0])
        .order('expense_date', { ascending: false }),
    ])

    return NextResponse.json({
      client,
      linked: {
        emails: linkedEmails.slice(0, 10),
        documents: linkedDocuments.slice(0, 10),
        conversations: linkedConversations.slice(0, 10),
      },
      financials: {
        revenue: revenueRes.data || [],
        expenses: expensesRes.data || [],
      },
    })
  } catch (error) {
    console.error('Get linked data error:', error)
    return NextResponse.json(
      { error: 'Failed to get linked data' },
      { status: 500 }
    )
  }
}
