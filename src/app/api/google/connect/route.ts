import { createClient } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/google/oauth'
import { NextRequest, NextResponse } from 'next/server'

export interface ConnectState {
  userId: string
  timestamp: number
  intent: 'add_account' | 'reconnect'
  existingAccountId?: string
  redirectTo?: string
}

// GET /api/google/connect - Start Google OAuth flow for multi-account
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get optional parameters
    const intent = searchParams.get('intent') as 'add_account' | 'reconnect' || 'add_account'
    const existingAccountId = searchParams.get('accountId') || undefined
    const redirectTo = searchParams.get('redirectTo') || '/dashboard/settings'

    // Generate state parameter with user ID and intent
    const stateData: ConnectState = {
      userId: user.id,
      timestamp: Date.now(),
      intent,
      existingAccountId,
      redirectTo,
    }

    const state = Buffer.from(JSON.stringify(stateData)).toString('base64')

    // Generate Google OAuth URL with account selector prompt
    const authUrl = getAuthUrl(state)

    return NextResponse.json({ url: authUrl })
  } catch (error) {
    console.error('Google connect error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Google connection' },
      { status: 500 }
    )
  }
}
