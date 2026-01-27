import { ToolDefinition } from '../types'
import { getAllAccounts } from '@/lib/google/token-manager'
import {
  createEventForAccount,
  getUpcomingEventsForAccount,
  getTodaysEventsForAccount,
} from '@/lib/google/calendar'

export const calendarTools: ToolDefinition[] = [
  {
    name: 'get_todays_events',
    description: "Get David's calendar events for today. Use when he asks about today's schedule, meetings, or what's on his calendar.",
    input_schema: {
      type: 'object' as const,
      properties: {
        account: {
          type: 'string',
          enum: ['personal', 'work', 'all'],
          description: 'Which calendar to check. Use "all" to see events from both accounts.',
        },
      },
      required: [],
    },
    handler: async (params, context) => {
      const accounts = await getAllAccounts(context.userId)
      if (accounts.length === 0) {
        return 'No Google account connected. Please connect Google Calendar in Settings first.'
      }

      const accountPref = (params.account as string)?.toLowerCase() || 'all'
      const allEvents: any[] = []

      for (const account of accounts) {
        // Filter by account preference
        if (accountPref !== 'all') {
          const isWork = account.account_label.toLowerCase().includes('work') || account.google_email.includes('noctworks')
          if (accountPref === 'work' && !isWork) continue
          if (accountPref === 'personal' && isWork) continue
        }

        const events = await getTodaysEventsForAccount(account.id, context.userId)
        allEvents.push(...events.map(e => ({
          ...e,
          account: account.account_label,
        })))
      }

      if (allEvents.length === 0) {
        return 'No events scheduled for today.'
      }

      // Sort by start time
      allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

      const eventList = allEvents.map(e => {
        const time = e.isAllDay
          ? 'All day'
          : new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        let line = `${time} - ${e.title}`
        if (e.location) line += ` at ${e.location}`
        if (accounts.length > 1) line += ` [${e.account}]`
        return line
      }).join('\n')

      return `Today's schedule (${allEvents.length} events):\n\n${eventList}`
    },
  },
  {
    name: 'get_upcoming_events',
    description: "Get David's upcoming calendar events for the next few days. Use when he asks about his schedule this week or upcoming meetings.",
    input_schema: {
      type: 'object' as const,
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look ahead (default 7)',
        },
        account: {
          type: 'string',
          enum: ['personal', 'work', 'all'],
          description: 'Which calendar to check.',
        },
      },
      required: [],
    },
    handler: async (params, context) => {
      const accounts = await getAllAccounts(context.userId)
      if (accounts.length === 0) {
        return 'No Google account connected. Please connect Google Calendar in Settings first.'
      }

      const days = (params.days as number) || 7
      const accountPref = (params.account as string)?.toLowerCase() || 'all'
      const allEvents: any[] = []

      for (const account of accounts) {
        if (accountPref !== 'all') {
          const isWork = account.account_label.toLowerCase().includes('work') || account.google_email.includes('noctworks')
          if (accountPref === 'work' && !isWork) continue
          if (accountPref === 'personal' && isWork) continue
        }

        const events = await getUpcomingEventsForAccount(account.id, context.userId, days, 20)
        allEvents.push(...events.map(e => ({
          ...e,
          account: account.account_label,
        })))
      }

      if (allEvents.length === 0) {
        return `No events scheduled for the next ${days} days.`
      }

      // Sort by start time
      allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

      const eventList = allEvents.map(e => {
        const date = new Date(e.start)
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        const time = e.isAllDay
          ? 'All day'
          : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        let line = `${dateStr} ${time} - ${e.title}`
        if (e.location) line += ` at ${e.location}`
        if (accounts.length > 1) line += ` [${e.account}]`
        return line
      }).join('\n')

      return `Upcoming events (next ${days} days, ${allEvents.length} events):\n\n${eventList}`
    },
  },
  {
    name: 'create_calendar_event',
    description: "Create a new calendar event for David. Use when he asks to schedule, add, or create a meeting or event. Always confirm the details before creating.",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Event title/name',
        },
        date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD format',
        },
        startTime: {
          type: 'string',
          description: 'Start time in HH:MM format (24-hour)',
        },
        endTime: {
          type: 'string',
          description: 'End time in HH:MM format (24-hour). If not provided, defaults to 1 hour after start.',
        },
        description: {
          type: 'string',
          description: 'Event description or notes',
        },
        location: {
          type: 'string',
          description: 'Event location (address or video call link)',
        },
        attendees: {
          type: 'string',
          description: 'Comma-separated email addresses of attendees',
        },
        account: {
          type: 'string',
          enum: ['personal', 'work', 'primary'],
          description: 'Which Google calendar to add the event to. Use "work" for business meetings.',
        },
      },
      required: ['title', 'date', 'startTime'],
    },
    handler: async (params, context) => {
      const accounts = await getAllAccounts(context.userId)
      if (accounts.length === 0) {
        return 'No Google account connected. Please connect Google Calendar in Settings first.'
      }

      // Select the appropriate account
      let selectedAccount = accounts[0]
      const accountPref = (params.account as string)?.toLowerCase()

      if (accountPref && accounts.length > 1) {
        const workAccount = accounts.find(a =>
          a.account_label.toLowerCase().includes('work') ||
          a.google_email.includes('noctworks')
        )
        const personalAccount = accounts.find(a =>
          a.account_label.toLowerCase().includes('personal') ||
          a.google_email.includes('gmail.com')
        )

        if (accountPref === 'work' && workAccount) {
          selectedAccount = workAccount
        } else if (accountPref === 'personal' && personalAccount) {
          selectedAccount = personalAccount
        }
      }

      // Parse date and time
      const dateStr = params.date as string
      const startTimeStr = params.startTime as string
      const endTimeStr = params.endTime as string

      const [year, month, day] = dateStr.split('-').map(Number)
      const [startHour, startMin] = startTimeStr.split(':').map(Number)

      const start = new Date(year, month - 1, day, startHour, startMin)

      let end: Date
      if (endTimeStr) {
        const [endHour, endMin] = endTimeStr.split(':').map(Number)
        end = new Date(year, month - 1, day, endHour, endMin)
      } else {
        // Default to 1 hour
        end = new Date(start.getTime() + 60 * 60 * 1000)
      }

      // Parse attendees
      const attendees = params.attendees
        ? (params.attendees as string).split(',').map(e => e.trim()).filter(e => e.includes('@'))
        : undefined

      const result = await createEventForAccount(selectedAccount.id, context.userId, {
        title: params.title as string,
        start,
        end,
        description: params.description as string | undefined,
        location: params.location as string | undefined,
        attendees,
      })

      if (!result || 'error' in result) {
        const errorMsg = result && 'error' in result ? result.error : 'Unknown error'
        return `Failed to create calendar event: ${errorMsg}. You may need to reconnect your Google account with calendar permissions.`
      }

      const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      const dateDisplay = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

      let response = `Event created on ${selectedAccount.google_email}!\n\n`
      response += `"${result.event.title}"\n`
      response += `${dateDisplay} at ${timeStr}\n`
      if (result.event.location) response += `Location: ${result.event.location}\n`
      if (attendees && attendees.length > 0) response += `Attendees: ${attendees.join(', ')}\n`
      if (result.event.htmlLink) response += `\nView: ${result.event.htmlLink}`

      return response
    },
  },
]
