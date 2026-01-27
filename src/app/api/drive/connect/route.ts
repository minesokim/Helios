import { createClient } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/google/oauth'
import { NextResponse } from 'next/server'

// GET /api/drive/connect - Start Google OAuth flow
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Generate state parameter with user ID for security
    const state = Buffer.from(JSON.stringify({
      userId: user.id,
      timestamp: Date.now(),
    })).toString('base64')

    // Generate Google OAuth URL
    const authUrl = getAuthUrl(state)

    return NextResponse.json({ url: authUrl })
  } catch (error) {
    console.error('Drive connect error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Google Drive connection' },
      { status: 500 }
    )
  }
}
