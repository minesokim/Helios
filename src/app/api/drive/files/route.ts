import { createClient } from '@/lib/supabase/server'
import { listFiles } from '@/lib/google/drive'
import { refreshAccessToken } from '@/lib/google/oauth'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'

type GoogleOAuthToken = Database['public']['Tables']['google_oauth_tokens']['Row']

// Helper to get valid access token
async function getValidAccessToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  const tokenData = data as GoogleOAuthToken | null

  if (error || !tokenData) {
    return null
  }

  // Check if token is expired
  const expiresAt = new Date(tokenData.expires_at)
  const now = new Date()

  if (expiresAt <= now) {
    // Refresh the token
    try {
      const newCredentials = await refreshAccessToken(tokenData.refresh_token)

      if (!newCredentials.access_token) {
        return null
      }

      const newExpiresAt = newCredentials.expiry_date
        ? new Date(newCredentials.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString()

      // Update token in database
      await supabase
        .from('google_oauth_tokens')
        .update({
          access_token: newCredentials.access_token,
          expires_at: newExpiresAt,
        } as never)
        .eq('user_id', userId)

      return newCredentials.access_token
    } catch (refreshError) {
      console.error('Token refresh failed:', refreshError)
      return null
    }
  }

  return tokenData.access_token
}

// GET /api/drive/files - List files from Google Drive
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, user.id)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google Drive not connected', code: 'NOT_CONNECTED' },
        { status: 401 }
      )
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('folderId') || undefined
    const pageToken = searchParams.get('pageToken') || undefined
    const pageSize = parseInt(searchParams.get('pageSize') || '50')

    // Fetch files from Google Drive
    const result = await listFiles(accessToken, {
      folderId,
      pageToken,
      pageSize,
    })

    return NextResponse.json({
      files: result.files,
      nextPageToken: result.nextPageToken,
    })
  } catch (error) {
    console.error('Drive files error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch files from Google Drive' },
      { status: 500 }
    )
  }
}
