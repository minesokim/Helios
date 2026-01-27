/**
 * Google Drive Watch Management
 *
 * Endpoints to set up, check, and manage Drive push notifications.
 * Watch channels expire after 24 hours and must be renewed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  setupDriveWatch,
  stopDriveWatch,
  getStartPageToken,
} from '@/lib/google/drive'
import { refreshAccessToken } from '@/lib/google/oauth'
import type { Database } from '@/types/database'

type GoogleOAuthToken = Database['public']['Tables']['google_oauth_tokens']['Row']

// Helper to get valid access token
async function getValidAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  const tokenData = data as GoogleOAuthToken | null

  if (error || !tokenData) {
    return null
  }

  const expiresAt = new Date(tokenData.expires_at)
  const now = new Date()

  if (expiresAt <= now) {
    try {
      const newCredentials = await refreshAccessToken(tokenData.refresh_token)

      if (!newCredentials.access_token) {
        return null
      }

      const newExpiresAt = newCredentials.expiry_date
        ? new Date(newCredentials.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('google_oauth_tokens') as any)
        .update({
          access_token: newCredentials.access_token,
          expires_at: newExpiresAt,
        })
        .eq('user_id', userId)

      return newCredentials.access_token
    } catch {
      return null
    }
  }

  return tokenData.access_token
}

// Get the webhook URL based on environment
function getWebhookUrl(): string {
  // In production, use the actual domain
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (baseUrl) {
    const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`
    return `${url}/api/drive/webhook`
  }

  // Fallback for local development (won't work with Google, needs ngrok or similar)
  return 'https://localhost:3000/api/drive/webhook'
}

// POST /api/drive/watch - Set up a new watch channel
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(supabase, user.id)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google Drive not connected', code: 'NOT_CONNECTED' },
        { status: 401 }
      )
    }

    // Check for existing active watch channel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingChannel } = await (supabase.from('drive_watch_channels') as any)
      .select('*')
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (existingChannel) {
      return NextResponse.json({
        message: 'Watch channel already active',
        channel: {
          id: existingChannel.channel_id,
          expiresAt: existingChannel.expires_at,
        },
      })
    }

    // Get current page token before setting up watch
    const pageToken = await getStartPageToken(accessToken)

    // Set up new watch channel
    const webhookUrl = getWebhookUrl()
    console.log('[Drive Watch] Setting up watch with webhook:', webhookUrl)

    const channel = await setupDriveWatch(accessToken, webhookUrl)

    if (!channel) {
      return NextResponse.json(
        { error: 'Failed to set up watch channel' },
        { status: 500 }
      )
    }

    // Store the watch channel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('drive_watch_channels') as any).insert({
      user_id: user.id,
      channel_id: channel.id,
      resource_id: channel.resourceId,
      page_token: pageToken,
      expires_at: channel.expiration,
    })

    // Log the action
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('drive_audit_log') as any).insert({
      user_id: user.id,
      action: 'WATCH_SETUP',
      action_params: {
        channel_id: channel.id,
        expires_at: channel.expiration,
      },
      triggered_by: 'user',
    })

    return NextResponse.json({
      success: true,
      message: 'Watch channel created',
      channel: {
        id: channel.id,
        expiresAt: channel.expiration,
      },
    })
  } catch (error) {
    console.error('[Drive Watch] Error setting up watch:', error)
    return NextResponse.json(
      { error: 'Failed to set up watch' },
      { status: 500 }
    )
  }
}

// GET /api/drive/watch - Get watch status
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get active watch channel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channel } = await (supabase.from('drive_watch_channels') as any)
      .select('*')
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .single()

    if (!channel) {
      return NextResponse.json({
        active: false,
        message: 'No active watch channel',
      })
    }

    const expiresAt = new Date(channel.expires_at)
    const now = new Date()
    const expiresInHours = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))

    return NextResponse.json({
      active: true,
      channel: {
        id: channel.channel_id,
        expiresAt: channel.expires_at,
        expiresInHours,
      },
    })
  } catch (error) {
    console.error('[Drive Watch] Error getting status:', error)
    return NextResponse.json(
      { error: 'Failed to get watch status' },
      { status: 500 }
    )
  }
}

// DELETE /api/drive/watch - Stop watching
export async function DELETE() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(supabase, user.id)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google Drive not connected' },
        { status: 401 }
      )
    }

    // Get active watch channel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channel } = await (supabase.from('drive_watch_channels') as any)
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!channel) {
      return NextResponse.json({
        message: 'No active watch channel to stop',
      })
    }

    // Stop the watch channel with Google
    await stopDriveWatch(accessToken, channel.channel_id, channel.resource_id)

    // Delete from database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('drive_watch_channels') as any)
      .delete()
      .eq('id', channel.id)

    // Log the action
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('drive_audit_log') as any).insert({
      user_id: user.id,
      action: 'WATCH_STOPPED',
      action_params: {
        channel_id: channel.channel_id,
      },
      triggered_by: 'user',
    })

    return NextResponse.json({
      success: true,
      message: 'Watch channel stopped',
    })
  } catch (error) {
    console.error('[Drive Watch] Error stopping watch:', error)
    return NextResponse.json(
      { error: 'Failed to stop watch' },
      { status: 500 }
    )
  }
}

// PATCH /api/drive/watch - Renew watch channel (before expiration)
export async function PATCH() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(supabase, user.id)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google Drive not connected' },
        { status: 401 }
      )
    }

    // Get existing channel to stop it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingChannel } = await (supabase.from('drive_watch_channels') as any)
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (existingChannel) {
      // Stop old channel
      await stopDriveWatch(accessToken, existingChannel.channel_id, existingChannel.resource_id)

      // Delete old record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('drive_watch_channels') as any)
        .delete()
        .eq('id', existingChannel.id)
    }

    // Get current page token
    const pageToken = existingChannel?.page_token || await getStartPageToken(accessToken)

    // Set up new watch channel
    const webhookUrl = getWebhookUrl()
    const channel = await setupDriveWatch(accessToken, webhookUrl)

    if (!channel) {
      return NextResponse.json(
        { error: 'Failed to renew watch channel' },
        { status: 500 }
      )
    }

    // Store the new watch channel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('drive_watch_channels') as any).insert({
      user_id: user.id,
      channel_id: channel.id,
      resource_id: channel.resourceId,
      page_token: pageToken,
      expires_at: channel.expiration,
    })

    // Log the action
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('drive_audit_log') as any).insert({
      user_id: user.id,
      action: 'WATCH_RENEWED',
      action_params: {
        channel_id: channel.id,
        expires_at: channel.expiration,
      },
      triggered_by: 'user',
    })

    return NextResponse.json({
      success: true,
      message: 'Watch channel renewed',
      channel: {
        id: channel.id,
        expiresAt: channel.expiration,
      },
    })
  } catch (error) {
    console.error('[Drive Watch] Error renewing watch:', error)
    return NextResponse.json(
      { error: 'Failed to renew watch' },
      { status: 500 }
    )
  }
}
