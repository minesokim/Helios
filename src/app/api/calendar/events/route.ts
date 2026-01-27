import { createClient } from '@/lib/supabase/server'
import { getUpcomingEvents, getTodaysEvents, type EventSummary } from '@/lib/google/calendar'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'
import { NextResponse } from 'next/server'

interface EventWithAccount extends EventSummary {
  accountId: string
  accountLabel: string
  googleEmail: string
}

// GET /api/calendar/events - Get upcoming calendar events from all accounts
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

    // Get all connected Google accounts
    const accounts = await getAllAccounts(user.id)

    if (accounts.length === 0) {
      return NextResponse.json({
        events: [],
        todaysEvents: [],
        debug: 'No Google accounts connected'
      })
    }

    const allEvents: EventWithAccount[] = []
    const allTodaysEvents: EventWithAccount[] = []
    const errors: string[] = []

    // Fetch events from all accounts in parallel
    await Promise.all(
      accounts.map(async (account) => {
        try {
          const tokens = await getValidAccessToken(account.id, user.id)
          if (!tokens) {
            errors.push(`Token refresh failed for ${account.google_email}`)
            return
          }

          // Fetch upcoming events (next 7 days)
          const upcomingEvents = await getUpcomingEvents(
            tokens.accessToken,
            tokens.refreshToken,
            7,
            20
          )

          // Fetch today's events specifically
          const todaysEvents = await getTodaysEvents(
            tokens.accessToken,
            tokens.refreshToken
          )

          // Add account info to events
          const eventsWithAccount = upcomingEvents.map(event => ({
            ...event,
            accountId: account.id,
            accountLabel: account.account_label,
            googleEmail: account.google_email,
          }))

          const todaysWithAccount = todaysEvents.map(event => ({
            ...event,
            accountId: account.id,
            accountLabel: account.account_label,
            googleEmail: account.google_email,
          }))

          allEvents.push(...eventsWithAccount)
          allTodaysEvents.push(...todaysWithAccount)
        } catch (error) {
          console.error(`Calendar fetch error for ${account.google_email}:`, error)
          errors.push(`Failed to fetch from ${account.google_email}: ${error}`)
        }
      })
    )

    // Sort all events by start time
    allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    allTodaysEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    // Transform for frontend compatibility
    const transformedEvents = allEvents.map(event => ({
      id: event.id,
      summary: event.title,
      start: event.start,
      end: event.end,
      isAllDay: event.isAllDay,
      location: event.location,
      accountId: event.accountId,
      accountLabel: event.accountLabel,
    }))

    const transformedTodays = allTodaysEvents.map(event => ({
      id: event.id,
      summary: event.title,
      start: event.start,
      end: event.end,
      isAllDay: event.isAllDay,
      location: event.location,
      accountId: event.accountId,
      accountLabel: event.accountLabel,
    }))

    return NextResponse.json({
      events: transformedEvents,
      todaysEvents: transformedTodays,
      accountCount: accounts.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Calendar events error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch calendar events', events: [], todaysEvents: [] },
      { status: 500 }
    )
  }
}
