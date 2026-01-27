import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, getGoogleUserInfo, GOOGLE_SCOPES } from '@/lib/google/oauth'
import { upsertGoogleAccount } from '@/lib/google/token-manager'
import { NextRequest, NextResponse } from 'next/server'
import type { ConnectState } from '../../google/connect/route'

// GET /api/drive/callback - Handle Google OAuth callback (backwards compatible with existing Google Cloud config)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Default redirect
    let redirectTo = '/dashboard/settings'

    // Parse state to get redirect URL
    let stateData: ConnectState | null = null
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString())
        if (stateData?.redirectTo) {
          redirectTo = stateData.redirectTo
        }
      } catch {
        console.error('Invalid state parameter')
      }
    }

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error)
      return NextResponse.redirect(
        new URL(`${redirectTo}?error=oauth_denied`, request.url)
      )
    }

    if (!code) {
      return NextResponse.redirect(
        new URL(`${redirectTo}?error=no_code`, request.url)
      )
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.redirect(
        new URL('/auth/login?error=unauthorized', request.url)
      )
    }

    // Verify state matches current user
    if (stateData && stateData.userId !== user.id) {
      return NextResponse.redirect(
        new URL(`${redirectTo}?error=state_mismatch`, request.url)
      )
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(`${redirectTo}?error=no_tokens`, request.url)
      )
    }

    // Get user info from Google to identify the account
    let googleUserInfo: { id?: string | null; email?: string | null }
    try {
      googleUserInfo = await getGoogleUserInfo(tokens.access_token)
    } catch (e) {
      console.error('Error getting Google user info:', e)
      return NextResponse.redirect(
        new URL(`${redirectTo}?error=userinfo_failed`, request.url)
      )
    }

    if (!googleUserInfo.id || !googleUserInfo.email) {
      return NextResponse.redirect(
        new URL(`${redirectTo}?error=invalid_userinfo`, request.url)
      )
    }

    // Calculate expiration time
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000)

    // Determine account label based on email domain
    let accountLabel = 'Primary'
    const emailDomain = googleUserInfo.email.split('@')[1]?.toLowerCase()
    if (emailDomain && emailDomain !== 'gmail.com' && emailDomain !== 'googlemail.com') {
      accountLabel = 'Work'
    }

    // If reconnecting, keep the existing label
    if (stateData?.intent === 'reconnect' && stateData.existingAccountId) {
      const { data: existingAccount } = await supabase
        .from('google_accounts')
        .select('account_label')
        .eq('id', stateData.existingAccountId)
        .single()

      if (existingAccount?.account_label) {
        accountLabel = existingAccount.account_label
      }
    }

    // Upsert the Google account
    const account = await upsertGoogleAccount(
      user.id,
      googleUserInfo.id,
      googleUserInfo.email,
      tokens.access_token,
      tokens.refresh_token,
      expiresAt,
      GOOGLE_SCOPES,
      accountLabel
    )

    if (!account) {
      return NextResponse.redirect(
        new URL(`${redirectTo}?error=account_storage`, request.url)
      )
    }

    // Also update the legacy google_oauth_tokens table for backwards compatibility
    // This ensures existing code that reads from google_oauth_tokens still works
    try {
      await supabase
        .from('google_oauth_tokens')
        .upsert({
          user_id: user.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type || 'Bearer',
          expires_at: expiresAt.toISOString(),
          scopes: GOOGLE_SCOPES,
        }, {
          onConflict: 'user_id',
        })
    } catch (e) {
      // Legacy table may not exist or may have different schema - that's okay
      console.log('Legacy token table update skipped:', e)
    }

    // Redirect with success
    const successParam = stateData?.intent === 'reconnect' ? 'reconnected' : 'connected'
    return NextResponse.redirect(
      new URL(`${redirectTo}?${successParam}=true&account=${account.google_email}`, request.url)
    )
  } catch (error) {
    console.error('Google callback error:', error)
    return NextResponse.redirect(
      new URL('/dashboard/settings?error=callback_failed', request.url)
    )
  }
}
