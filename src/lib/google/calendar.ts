/**
 * Google Calendar API integration for Jorkel
 *
 * Read-only access to user's calendar:
 * - Get today's events
 * - Get upcoming events
 * - Search events
 */

import { google, calendar_v3 } from 'googleapis'
import { createAuthenticatedClient } from './oauth'

export type CalendarEvent = calendar_v3.Schema$Event

export interface EventSummary {
  id: string
  title: string
  description: string | null
  start: string
  end: string
  location: string | null
  attendees: string[]
  isAllDay: boolean
  status: string
  htmlLink: string | null
}

function formatEvent(event: CalendarEvent): EventSummary {
  const start = event.start?.dateTime || event.start?.date || ''
  const end = event.end?.dateTime || event.end?.date || ''
  const isAllDay = !event.start?.dateTime

  return {
    id: event.id || '',
    title: event.summary || '(No title)',
    description: event.description || null,
    start,
    end,
    location: event.location || null,
    attendees: event.attendees?.map(a => a.email || a.displayName || 'Unknown') || [],
    isAllDay,
    status: event.status || 'confirmed',
    htmlLink: event.htmlLink || null,
  }
}

export async function getTodaysEvents(
  accessToken: string,
  refreshToken?: string
): Promise<EventSummary[]> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  try {
    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    })

    return (data.items || []).map(formatEvent)
  } catch (error) {
    console.error('Error fetching today\'s events:', error)
    return []
  }
}

export async function getUpcomingEvents(
  accessToken: string,
  refreshToken?: string,
  days: number = 7,
  maxResults: number = 20
): Promise<EventSummary[]> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  try {
    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: futureDate.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    })

    return (data.items || []).map(formatEvent)
  } catch (error) {
    console.error('Error fetching upcoming events:', error)
    return []
  }
}

export async function searchEvents(
  accessToken: string,
  query: string,
  refreshToken?: string,
  maxResults: number = 10
): Promise<EventSummary[]> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  // Search in past 30 days and future 90 days
  const now = new Date()
  const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  try {
    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      q: query,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    })

    return (data.items || []).map(formatEvent)
  } catch (error) {
    console.error('Error searching events:', error)
    return []
  }
}

export async function getEventById(
  accessToken: string,
  eventId: string,
  refreshToken?: string
): Promise<EventSummary | null> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  try {
    const { data } = await calendar.events.get({
      calendarId: 'primary',
      eventId,
    })

    return formatEvent(data)
  } catch (error) {
    console.error('Error fetching event:', error)
    return null
  }
}

export async function formatTodaysAgenda(
  accessToken: string,
  refreshToken?: string
): Promise<string> {
  const events = await getTodaysEvents(accessToken, refreshToken)

  if (events.length === 0) {
    return 'No events scheduled for today.'
  }

  const lines = events.map(e => {
    const time = e.isAllDay
      ? 'All day'
      : new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    let line = `${time} - ${e.title}`
    if (e.location) line += ` (${e.location})`
    if (e.attendees.length > 0) line += ` with ${e.attendees.slice(0, 2).join(', ')}`

    return line
  })

  return `Today's agenda (${events.length} events):\n${lines.join('\n')}`
}

// ============================================
// Write Operations (require calendar.events scope)
// ============================================

export interface CreateEventOptions {
  title: string
  start: Date
  end: Date
  description?: string
  location?: string
  attendees?: string[] // email addresses
  timeZone?: string
}

export async function createEvent(
  accessToken: string,
  options: CreateEventOptions,
  refreshToken?: string
): Promise<{ event: EventSummary } | { error: string }> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const timeZone = options.timeZone || 'America/Los_Angeles'

  try {
    const { data } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: options.title,
        description: options.description,
        location: options.location,
        start: {
          dateTime: options.start.toISOString(),
          timeZone,
        },
        end: {
          dateTime: options.end.toISOString(),
          timeZone,
        },
        attendees: options.attendees?.map(email => ({ email })),
      },
    })

    return { event: formatEvent(data) }
  } catch (error: any) {
    console.error('Error creating calendar event:', error)
    const message = error?.response?.data?.error?.message
      || error?.message
      || 'Unknown error'
    return { error: message }
  }
}

export async function deleteEvent(
  accessToken: string,
  eventId: string,
  refreshToken?: string
): Promise<boolean> {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    })
    return true
  } catch (error) {
    console.error('Error deleting calendar event:', error)
    return false
  }
}

// ============================================
// Multi-Account Wrapper Functions
// ============================================

import { getValidAccessToken } from './token-manager'

export async function createEventForAccount(
  accountId: string,
  userId: string,
  options: CreateEventOptions
): Promise<{ event: EventSummary; fromEmail: string } | { error: string } | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return { error: 'Failed to get valid access token' }
  }

  const result = await createEvent(tokens.accessToken, options, tokens.refreshToken)

  if ('error' in result) {
    return { error: result.error }
  }

  return { event: result.event, fromEmail: tokens.googleEmail }
}

export async function getUpcomingEventsForAccount(
  accountId: string,
  userId: string,
  days: number = 7,
  maxResults: number = 20
): Promise<EventSummary[]> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return []
  }

  return getUpcomingEvents(tokens.accessToken, tokens.refreshToken, days, maxResults)
}

export async function getTodaysEventsForAccount(
  accountId: string,
  userId: string
): Promise<EventSummary[]> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return []
  }

  return getTodaysEvents(tokens.accessToken, tokens.refreshToken)
}
