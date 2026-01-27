/**
 * Token Manager for Multi-Account Google Integration
 *
 * Manages multiple Google accounts per user:
 * - Get all connected accounts
 * - Auto-refresh expired tokens
 * - Connect/disconnect accounts
 */

import { createClient } from '@/lib/supabase/server'
import { refreshAccessToken } from './oauth'
import type { GoogleAccount as GoogleAccountDB } from '@/lib/supabase/database.types'

export interface GoogleAccount {
  id: string
  user_id: string
  google_email: string
  google_user_id: string | null
  account_label: string
  access_token: string
  refresh_token: string
  token_type: string
  expires_at: string
  scopes: string[] | null
  is_active: boolean
  last_sync_at: string | null
  sync_error: string | null
  created_at: string
  updated_at: string
}

export interface AccountTokens {
  accountId: string
  accessToken: string
  refreshToken: string
  googleEmail: string
  accountLabel: string
}

/**
 * Get all active Google accounts for a user
 */
export async function getAllAccounts(userId: string): Promise<GoogleAccount[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('google_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching Google accounts:', error)
    return []
  }

  return data || []
}

/**
 * Get a specific Google account by ID
 */
export async function getAccount(accountId: string, userId: string): Promise<GoogleAccount | null> {
  const supabase = await createClient() 
  const { data, error } = await supabase
    .from('google_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single()

  if (error) {
    console.error('Error fetching Google account:', error)
    return null
  }

  return data
}

/**
 * Get valid access token for an account, auto-refreshing if expired
 */
export async function getValidAccessToken(accountId: string, userId: string): Promise<AccountTokens | null> {
  const supabase = await createClient() 
  const { data: account, error } = await supabase
    .from('google_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (error || !account) {
    console.error('Error fetching Google account for token:', error)
    return null
  }

  // Check if token is expired (with 5-minute buffer)
  const expiresAt = new Date(account.expires_at)
  const now = new Date()
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

  if (expiresAt <= fiveMinutesFromNow) {
    // Token expired or about to expire, refresh it
    try {
      const newTokens = await refreshAccessToken(account.refresh_token)

      if (!newTokens.access_token) {
        // Mark account as having sync error
        await supabase
          .from('google_accounts')
          .update({
            sync_error: 'Token refresh failed - re-authentication required',
            is_active: false,
          })
          .eq('id', accountId)

        return null
      }

      // Update tokens in database
      const newExpiresAt = new Date(Date.now() + (newTokens.expiry_date || 3600 * 1000))

      await supabase
        .from('google_accounts')
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || account.refresh_token,
          expires_at: newExpiresAt.toISOString(),
          sync_error: null,
        })
        .eq('id', accountId)

      return {
        accountId: account.id,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || account.refresh_token,
        googleEmail: account.google_email,
        accountLabel: account.account_label,
      }
    } catch (e) {
      console.error('Error refreshing token:', e)

      // Mark account as having sync error
      await supabase
        .from('google_accounts')
        .update({
          sync_error: `Token refresh failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
        })
        .eq('id', accountId)

      return null
    }
  }

  // Token is still valid
  return {
    accountId: account.id,
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    googleEmail: account.google_email,
    accountLabel: account.account_label,
  }
}

/**
 * Get valid tokens for all active accounts
 */
export async function getAllValidTokens(userId: string): Promise<AccountTokens[]> {
  const accounts = await getAllAccounts(userId)
  const validTokens: AccountTokens[] = []

  for (const account of accounts) {
    const tokens = await getValidAccessToken(account.id, userId)
    if (tokens) {
      validTokens.push(tokens)
    }
  }

  return validTokens
}

/**
 * Disconnect a Google account
 */
export async function disconnectAccount(accountId: string, userId: string): Promise<boolean> {
  const supabase = await createClient() 
  // First, delete any associated Gmail watch channels
  await supabase
    .from('gmail_watch_channels')
    .delete()
    .eq('google_account_id', accountId)
    .eq('user_id', userId)

  // Then delete the account
  const { error } = await supabase
    .from('google_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', userId)

  if (error) {
    console.error('Error disconnecting Google account:', error)
    return false
  }

  return true
}

/**
 * Update account label
 */
export async function updateAccountLabel(
  accountId: string,
  userId: string,
  label: string
): Promise<boolean> {
  const supabase = await createClient() 
  const { error } = await supabase
    .from('google_accounts')
    .update({ account_label: label })
    .eq('id', accountId)
    .eq('user_id', userId)

  if (error) {
    console.error('Error updating account label:', error)
    return false
  }

  return true
}

/**
 * Update last sync time for an account
 */
export async function updateLastSync(accountId: string): Promise<void> {
  const supabase = await createClient() 
  await supabase
    .from('google_accounts')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_error: null,
    })
    .eq('id', accountId)
}

/**
 * Record a sync error for an account
 */
export async function recordSyncError(accountId: string, error: string): Promise<void> {
  const supabase = await createClient() 
  await supabase
    .from('google_accounts')
    .update({ sync_error: error })
    .eq('id', accountId)
}

/**
 * Check if a Google account is already connected for this user
 */
export async function isAccountConnected(userId: string, googleUserId: string): Promise<GoogleAccount | null> {
  const supabase = await createClient() 
  const { data, error } = await supabase
    .from('google_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('google_user_id', googleUserId)
    .single()

  if (error || !data) {
    return null
  }

  return data
}

/**
 * Create or update a Google account connection
 */
export async function upsertGoogleAccount(
  userId: string,
  googleUserId: string,
  googleEmail: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  scopes: string[],
  accountLabel?: string
): Promise<GoogleAccount | null> {
  const supabase = await createClient() 
  // Check if this Google account is already connected
  const existing = await isAccountConnected(userId, googleUserId)

  if (existing) {
    // Update existing account
    const { data, error } = await supabase
      .from('google_accounts')
      .update({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt.toISOString(),
        scopes,
        is_active: true,
        sync_error: null,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating Google account:', error)
      return null
    }

    return data
  }

  // Create new account
  const { data, error } = await supabase
    .from('google_accounts')
    .insert({
      user_id: userId,
      google_user_id: googleUserId,
      google_email: googleEmail,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
      scopes,
      account_label: accountLabel || 'Primary',
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating Google account:', error)
    return null
  }

  return data
}
