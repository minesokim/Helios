/**
 * Cron job to auto-renew Drive watch channels
 * Called every 12 hours by Vercel Cron
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setupDriveWatch, stopDriveWatch } from '@/lib/google/drive'
import { refreshAccessToken } from '@/lib/google/oauth'

// Use service role for cron jobs (no user session)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Get webhook URL
function getWebhookUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (baseUrl) {
    const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`
    return `${url}/api/drive/webhook`
  }
  return 'https://localhost:3000/api/drive/webhook'
}

export async function GET(request: NextRequest) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Cron] Starting drive watch renewal...')

  try {
    // Get all watch channels expiring in the next 14 hours
    const expirationThreshold = new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString()

    const { data: channels, error } = await supabase
      .from('drive_watch_channels')
      .select('*')
      .lt('expires_at', expirationThreshold)

    if (error) {
      console.error('[Cron] Error fetching channels:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!channels || channels.length === 0) {
      console.log('[Cron] No channels need renewal')
      return NextResponse.json({ message: 'No channels to renew', renewed: 0 })
    }

    console.log(`[Cron] Found ${channels.length} channels to renew`)

    let renewed = 0
    let failed = 0

    for (const channel of channels) {
      try {
        // Get user's OAuth token
        const { data: tokenData } = await supabase
          .from('google_oauth_tokens')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', channel.user_id)
          .single()

        if (!tokenData) {
          console.log(`[Cron] No token for user ${channel.user_id}`)
          failed++
          continue
        }

        // Refresh token if needed
        let accessToken = tokenData.access_token
        if (new Date(tokenData.expires_at) <= new Date()) {
          const newCredentials = await refreshAccessToken(tokenData.refresh_token)
          if (!newCredentials.access_token) {
            console.log(`[Cron] Token refresh failed for user ${channel.user_id}`)
            failed++
            continue
          }
          accessToken = newCredentials.access_token

          // Update token in database
          await supabase
            .from('google_oauth_tokens')
            .update({
              access_token: newCredentials.access_token,
              expires_at: new Date(newCredentials.expiry_date || Date.now() + 3600000).toISOString(),
            })
            .eq('user_id', channel.user_id)
        }

        // Stop old channel
        await stopDriveWatch(accessToken, channel.channel_id, channel.resource_id)

        // Create new channel
        const webhookUrl = getWebhookUrl()
        const newChannel = await setupDriveWatch(accessToken, webhookUrl)

        if (!newChannel) {
          console.log(`[Cron] Failed to create new channel for user ${channel.user_id}`)
          failed++
          continue
        }

        // Update database
        await supabase
          .from('drive_watch_channels')
          .update({
            channel_id: newChannel.id,
            resource_id: newChannel.resourceId,
            expires_at: newChannel.expiration,
          })
          .eq('id', channel.id)

        // Log renewal
        await supabase.from('drive_audit_log').insert({
          user_id: channel.user_id,
          action: 'WATCH_AUTO_RENEWED',
          action_params: {
            old_channel_id: channel.channel_id,
            new_channel_id: newChannel.id,
            expires_at: newChannel.expiration,
          },
          triggered_by: 'cron',
        })

        renewed++
        console.log(`[Cron] Renewed channel for user ${channel.user_id}`)
      } catch (err) {
        console.error(`[Cron] Error renewing channel for user ${channel.user_id}:`, err)
        failed++
      }
    }

    console.log(`[Cron] Renewal complete. Renewed: ${renewed}, Failed: ${failed}`)

    return NextResponse.json({
      message: 'Drive watch renewal complete',
      renewed,
      failed,
      total: channels.length,
    })
  } catch (error) {
    console.error('[Cron] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
