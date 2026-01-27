import { createClient } from '@/lib/supabase/server'
import { getAggregatedPhotos } from '@/services/google/aggregator'
import { getAllAccounts } from '@/lib/google/token-manager'
import { NextResponse } from 'next/server'

// GET /api/photos/recent - Get recent photos from all accounts
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch accounts list for the widget
    const accounts = await getAllAccounts(user.id)
    console.log('[Photos API] Found accounts:', accounts.map(a => ({ email: a.google_email, scopes: a.scopes })))

    const accountsList = accounts.map(a => ({
      accountId: a.id,
      accountLabel: a.account_label,
    }))

    if (accounts.length === 0) {
      console.log('[Photos API] No accounts connected')
      return NextResponse.json({ photos: [], accounts: [], debug: 'No accounts connected' })
    }

    // Fetch aggregated photos from all accounts
    console.log('[Photos API] Fetching photos...')
    const photoResult = await getAggregatedPhotos(user.id, 30)
    console.log('[Photos API] Got photos:', photoResult.totalCount, 'breakdown:', photoResult.accountBreakdown)

    // Transform photos for the widget with safety checks
    const photos = photoResult.photos
      .filter(photo => photo.item && photo.item.baseUrl) // Filter out invalid items
      .map(photo => ({
        id: photo.item.id,
        filename: photo.item.filename || 'Unknown',
        baseUrl: photo.item.baseUrl,
        productUrl: photo.item.productUrl,
        creationTime: photo.item.mediaMetadata?.creationTime || new Date().toISOString(),
        accountId: photo.accountId,
        accountLabel: photo.accountLabel,
        googleEmail: photo.googleEmail,
      }))

    return NextResponse.json({
      photos,
      accounts: accountsList,
      debug: {
        accountCount: accounts.length,
        photosFound: photoResult.totalCount,
        breakdown: photoResult.accountBreakdown,
        scopes: accounts.map(a => ({ email: a.google_email, scopes: a.scopes })),
      },
    })
  } catch (error) {
    console.error('Photos fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch photos' },
      { status: 500 }
    )
  }
}
