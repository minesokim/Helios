import { createClient } from '@/lib/supabase/server'
import { createEventForAccount } from '@/lib/google/calendar'
import { getAllAccounts } from '@/lib/google/token-manager'
import { NextResponse } from 'next/server'

// GET /api/calendar/test-create - Test creating a calendar event
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
    if (accounts.length === 0) {
      return NextResponse.json({ error: 'No Google accounts connected' })
    }

    // Use first account
    const account = accounts[0]

    // Create a test event 1 hour from now
    const start = new Date(Date.now() + 60 * 60 * 1000)
    const end = new Date(start.getTime() + 30 * 60 * 1000)

    const result = await createEventForAccount(account.id, user.id, {
      title: 'Test Event from Jim AI',
      start,
      end,
      description: 'This is a test event created by Jim AI',
    })

    if (!result || 'error' in result) {
      return NextResponse.json({
        success: false,
        error: result && 'error' in result ? result.error : 'Unknown error',
        account: account.google_email,
        hasCalendarScope: account.scopes?.includes('https://www.googleapis.com/auth/calendar.events'),
      })
    }

    return NextResponse.json({
      success: true,
      event: result.event,
      fromEmail: result.fromEmail,
    })
  } catch (error) {
    console.error('Test create error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
