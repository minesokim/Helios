import { createClient } from '@/lib/supabase/server'
import { getAllAccounts, updateAccountLabel, disconnectAccount } from '@/lib/google/token-manager'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/google/accounts - List all connected Google accounts
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accounts = await getAllAccounts(user.id)

    // Return accounts without sensitive token data
    const safeAccounts = accounts.map(account => ({
      id: account.id,
      google_email: account.google_email,
      account_label: account.account_label,
      is_active: account.is_active,
      last_sync_at: account.last_sync_at,
      sync_error: account.sync_error,
      created_at: account.created_at,
    }))

    return NextResponse.json({ accounts: safeAccounts })
  } catch (error) {
    console.error('Error fetching Google accounts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    )
  }
}

// PATCH /api/google/accounts - Update account label
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { accountId, label } = body

    if (!accountId || !label) {
      return NextResponse.json(
        { error: 'Missing accountId or label' },
        { status: 400 }
      )
    }

    const success = await updateAccountLabel(accountId, user.id, label)

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update account label' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating account label:', error)
    return NextResponse.json(
      { error: 'Failed to update account' },
      { status: 500 }
    )
  }
}

// DELETE /api/google/accounts - Disconnect a Google account
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')

    if (!accountId) {
      return NextResponse.json(
        { error: 'Missing accountId' },
        { status: 400 }
      )
    }

    const success = await disconnectAccount(accountId, user.id)

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to disconnect account' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting account:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect account' },
      { status: 500 }
    )
  }
}
