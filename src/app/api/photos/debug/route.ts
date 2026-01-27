import { createClient } from '@/lib/supabase/server'
import { getRecentPhotos, getAlbums } from '@/lib/google/photos'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'
import { NextResponse } from 'next/server'

// GET /api/photos/debug - Debug photos integration
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
    const debug: any[] = []

    for (const account of accounts) {
      const accountDebug: any = {
        email: account.google_email,
        label: account.account_label,
        hasPhotosScope: account.scopes?.includes('https://www.googleapis.com/auth/photoslibrary.readonly'),
      }

      try {
        const tokens = await getValidAccessToken(account.id, user.id)
        if (!tokens) {
          accountDebug.tokenError = 'Failed to get valid access token'
          debug.push(accountDebug)
          continue
        }

        accountDebug.tokenValid = true

        // Try to fetch recent photos
        try {
          const recentPhotos = await getRecentPhotos(tokens.accessToken, tokens.refreshToken, 5)
          accountDebug.recentPhotoCount = recentPhotos.length
          accountDebug.recentPhotos = recentPhotos.slice(0, 2).map(p => ({
            filename: p.filename,
            creationTime: p.mediaMetadata?.creationTime,
          }))
        } catch (photoError: any) {
          accountDebug.photoError = photoError.message
        }

        // Try to fetch albums
        try {
          const albums = await getAlbums(tokens.accessToken, tokens.refreshToken, 5)
          accountDebug.albumCount = albums.length
          accountDebug.albums = albums.slice(0, 3).map(a => ({
            title: a.title,
            itemCount: a.mediaItemsCount,
          }))
        } catch (albumError: any) {
          accountDebug.albumError = albumError.message
        }

      } catch (error: any) {
        accountDebug.error = error.message
      }

      debug.push(accountDebug)
    }

    return NextResponse.json({
      userId: user.id,
      accountCount: accounts.length,
      accounts: debug,
    })
  } catch (error) {
    console.error('Photos debug error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
