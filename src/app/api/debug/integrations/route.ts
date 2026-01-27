import { createClient } from '@/lib/supabase/server'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'
import { getUpcomingEvents } from '@/lib/google/calendar'
import { listEmails, getUnreadCount } from '@/lib/google/gmail'
import { getRecentPhotos, getAlbums } from '@/lib/google/photos'
import { NextResponse } from 'next/server'

// GET /api/debug/integrations - Test all integrations and return diagnostic info
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized - please log in first' }, { status: 401 })
    }

    const diagnostics: Record<string, unknown> = {
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    }

    // Check google_accounts table
    const accounts = await getAllAccounts(user.id)
    diagnostics.googleAccounts = {
      count: accounts.length,
      accounts: accounts.map(a => ({
        id: a.id,
        email: a.google_email,
        label: a.account_label,
        isActive: a.is_active,
        scopes: a.scopes,
        expiresAt: a.expires_at,
        lastSync: a.last_sync_at,
        syncError: a.sync_error,
      })),
    }

    // Check legacy google_oauth_tokens table
    const { data: legacyToken } = await supabase
      .from('google_oauth_tokens')
      .select('id, created_at, expires_at')
      .eq('user_id', user.id)
      .single()

    diagnostics.legacyGoogleToken = legacyToken ? {
      exists: true,
      expiresAt: legacyToken.expires_at,
    } : { exists: false }

    // Test each integration
    if (accounts.length > 0) {
      const account = accounts[0]
      const tokens = await getValidAccessToken(account.id, user.id)

      if (tokens) {
        diagnostics.tokenRefresh = 'SUCCESS'

        // Test Gmail
        try {
          const emails = await listEmails(tokens.accessToken, tokens.refreshToken, { maxResults: 3 })
          const unread = await getUnreadCount(tokens.accessToken, tokens.refreshToken)
          diagnostics.gmail = {
            status: 'SUCCESS',
            emailCount: emails.length,
            unreadCount: unread,
            sample: emails.slice(0, 2).map(e => ({ subject: e.subject, from: e.from })),
          }
        } catch (e) {
          diagnostics.gmail = { status: 'FAILED', error: String(e) }
        }

        // Test Calendar
        try {
          const events = await getUpcomingEvents(tokens.accessToken, tokens.refreshToken, 7, 5)
          diagnostics.calendar = {
            status: 'SUCCESS',
            eventCount: events.length,
            sample: events.slice(0, 3).map(e => ({ title: e.title, start: e.start })),
          }
        } catch (e) {
          diagnostics.calendar = { status: 'FAILED', error: String(e) }
        }

        // Test Photos
        try {
          const photos = await getRecentPhotos(tokens.accessToken, tokens.refreshToken, 5)
          const albums = await getAlbums(tokens.accessToken, tokens.refreshToken, 5)
          diagnostics.photos = {
            status: 'SUCCESS',
            photoCount: photos.length,
            albumCount: albums.length,
            sample: photos.slice(0, 2).map(p => ({ filename: p.filename, date: p.mediaMetadata?.creationTime })),
          }
        } catch (e) {
          diagnostics.photos = { status: 'FAILED', error: String(e) }
        }
      } else {
        diagnostics.tokenRefresh = 'FAILED - could not get valid access token'
      }
    }

    // Check database tables
    const { count: projectCount } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: blockerCount } = await supabase
      .from('blockers')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: contactCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: transactionCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: bankAccountCount } = await supabase
      .from('bank_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    diagnostics.database = {
      projects: projectCount || 0,
      blockers: blockerCount || 0,
      contacts: contactCount || 0,
      transactions: transactionCount || 0,
      bankAccounts: bankAccountCount || 0,
    }

    return NextResponse.json(diagnostics, {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json(
      { error: 'Debug failed', details: String(error) },
      { status: 500 }
    )
  }
}
