import { createClient } from '@/lib/supabase/server'
import { getUpcomingEvents, getTodaysEvents } from '@/lib/google/calendar'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'
import { createAuthenticatedClient } from '@/lib/google/oauth'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'

// GET /api/calendar/debug - Debug calendar integration
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accounts = await getAllAccounts(user.id)
    const debug: any[] = []

    for (const account of accounts) {
      const accountDebug: any = {
        email: account.google_email,
        label: account.account_label,
        hasCalendarScope: account.scopes?.includes('https://www.googleapis.com/auth/calendar.readonly'),
      }

      try {
        const tokens = await getValidAccessToken(account.id, user.id)
        if (!tokens) {
          accountDebug.tokenError = 'Failed to get valid access token'
          debug.push(accountDebug)
          continue
        }

        accountDebug.tokenValid = true

        // List all calendars for this account
        const auth = createAuthenticatedClient(tokens.accessToken, tokens.refreshToken)
        const calendar = google.calendar({ version: 'v3', auth })

        const { data: calendarList } = await calendar.calendarList.list()
        accountDebug.calendars = calendarList.items?.map(cal => ({
          id: cal.id,
          summary: cal.summary,
          primary: cal.primary,
          accessRole: cal.accessRole,
        })) || []

        // Try to fetch today's events from primary
        const todaysEvents = await getTodaysEvents(tokens.accessToken, tokens.refreshToken)
        accountDebug.todaysEventCount = todaysEvents.length
        accountDebug.todaysEvents = todaysEvents.slice(0, 3)

        // Try to fetch upcoming events from primary
        const upcomingEvents = await getUpcomingEvents(tokens.accessToken, tokens.refreshToken, 7, 10)
        accountDebug.upcomingEventCount = upcomingEvents.length
        accountDebug.upcomingEvents = upcomingEvents.slice(0, 3)

        // Also try fetching from all calendars to see if events exist elsewhere
        const allCalendarEvents: any[] = []
        const now = new Date()
        const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

        for (const cal of calendarList.items || []) {
          if (cal.id) {
            try {
              const { data } = await calendar.events.list({
                calendarId: cal.id,
                timeMin: now.toISOString(),
                timeMax: futureDate.toISOString(),
                maxResults: 5,
                singleEvents: true,
                orderBy: 'startTime',
              })
              if (data.items && data.items.length > 0) {
                allCalendarEvents.push({
                  calendarId: cal.id,
                  calendarName: cal.summary,
                  eventCount: data.items.length,
                  events: data.items.slice(0, 2).map(e => ({
                    summary: e.summary,
                    start: e.start?.dateTime || e.start?.date,
                  })),
                })
              }
            } catch (e) {
              // Skip calendars we can't access
            }
          }
        }
        accountDebug.eventsFromAllCalendars = allCalendarEvents

      } catch (error) {
        accountDebug.error = error instanceof Error ? error.message : String(error)
      }

      debug.push(accountDebug)
    }

    return NextResponse.json({
      userId: user.id,
      accountCount: accounts.length,
      accounts: debug,
    })
  } catch (error) {
    console.error('Calendar debug error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
