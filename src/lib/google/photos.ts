/**
 * Google Photos API Integration
 *
 * Provides read-only access to user's Google Photos library
 * for context awareness in Jorkel.
 *
 * Supports multi-account via accountId parameter
 */

import { refreshAccessToken } from './oauth'
import { getValidAccessToken, type AccountTokens } from './token-manager'

const PHOTOS_API_URL = 'https://photoslibrary.googleapis.com/v1'

interface MediaItem {
  id: string
  description?: string
  productUrl: string
  baseUrl: string
  mimeType: string
  filename: string
  mediaMetadata: {
    creationTime: string
    width: string
    height: string
    photo?: {
      cameraMake?: string
      cameraModel?: string
      focalLength?: number
      apertureFNumber?: number
      isoEquivalent?: number
    }
    video?: {
      fps: number
      status: string
    }
  }
}

interface Album {
  id: string
  title: string
  productUrl: string
  mediaItemsCount?: string
  coverPhotoBaseUrl?: string
  coverPhotoMediaItemId?: string
}

interface PhotosSummary {
  totalPhotos: number
  totalAlbums: number
  recentPhotos: Array<{
    filename: string
    date: string
    description?: string
  }>
  albums: Array<{
    title: string
    itemCount: number
  }>
}

// Make authenticated request to Photos API
async function photosRequest<T>(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${PHOTOS_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google Photos API error: ${response.status} - ${error}`)
  }

  return response.json()
}

// Get recent media items
export async function getRecentPhotos(
  accessToken: string,
  refreshToken?: string,
  limit: number = 20
): Promise<MediaItem[]> {
  try {
    // Search for recent items (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const body = {
      pageSize: limit,
      filters: {
        dateFilter: {
          ranges: [{
            startDate: {
              year: thirtyDaysAgo.getFullYear(),
              month: thirtyDaysAgo.getMonth() + 1,
              day: thirtyDaysAgo.getDate(),
            },
            endDate: {
              year: new Date().getFullYear(),
              month: new Date().getMonth() + 1,
              day: new Date().getDate(),
            },
          }],
        },
      },
    }

    console.log('[Photos] Fetching recent photos from last 30 days...')
    const data = await photosRequest<{ mediaItems?: MediaItem[] }>(
      accessToken,
      '/mediaItems:search',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    )

    console.log('[Photos] Got', data.mediaItems?.length || 0, 'photos')
    return data.mediaItems || []
  } catch (error) {
    console.error('[Photos] Error fetching photos:', error)
    // Try refreshing the token
    if (refreshToken && String(error).includes('401')) {
      console.log('[Photos] Token expired, refreshing...')
      const newTokens = await refreshAccessToken(refreshToken)
      if (newTokens.access_token) {
        return getRecentPhotos(newTokens.access_token, undefined, limit)
      }
    }
    throw error
  }
}

// Get all albums
export async function getAlbums(
  accessToken: string,
  refreshToken?: string,
  limit: number = 50
): Promise<Album[]> {
  try {
    const data = await photosRequest<{ albums?: Album[] }>(
      accessToken,
      `/albums?pageSize=${limit}`
    )

    return data.albums || []
  } catch (error) {
    if (refreshToken && String(error).includes('401')) {
      const newTokens = await refreshAccessToken(refreshToken)
      if (newTokens.access_token) {
        return getAlbums(newTokens.access_token, undefined, limit)
      }
    }
    throw error
  }
}

// Get photos from a specific album
export async function getAlbumPhotos(
  accessToken: string,
  albumId: string,
  limit: number = 50
): Promise<MediaItem[]> {
  const body = {
    albumId,
    pageSize: limit,
  }

  const data = await photosRequest<{ mediaItems?: MediaItem[] }>(
    accessToken,
    '/mediaItems:search',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )

  return data.mediaItems || []
}

// Search photos by date range
export async function searchPhotosByDate(
  accessToken: string,
  startDate: Date,
  endDate: Date,
  limit: number = 50
): Promise<MediaItem[]> {
  const body = {
    pageSize: limit,
    filters: {
      dateFilter: {
        ranges: [{
          startDate: {
            year: startDate.getFullYear(),
            month: startDate.getMonth() + 1,
            day: startDate.getDate(),
          },
          endDate: {
            year: endDate.getFullYear(),
            month: endDate.getMonth() + 1,
            day: endDate.getDate(),
          },
        }],
      },
    },
  }

  const data = await photosRequest<{ mediaItems?: MediaItem[] }>(
    accessToken,
    '/mediaItems:search',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )

  return data.mediaItems || []
}

// Get a summary of the user's photo library for context
export async function getPhotosSummary(
  accessToken: string,
  refreshToken?: string
): Promise<PhotosSummary> {
  try {
    const [recentPhotos, albums] = await Promise.all([
      getRecentPhotos(accessToken, refreshToken, 10),
      getAlbums(accessToken, refreshToken, 20),
    ])

    return {
      totalPhotos: recentPhotos.length, // Approximate from recent
      totalAlbums: albums.length,
      recentPhotos: recentPhotos.map(p => ({
        filename: p.filename,
        date: p.mediaMetadata.creationTime,
        description: p.description,
      })),
      albums: albums.map(a => ({
        title: a.title,
        itemCount: parseInt(a.mediaItemsCount || '0', 10),
      })),
    }
  } catch (error) {
    console.error('Failed to get photos summary:', error)
    return {
      totalPhotos: 0,
      totalAlbums: 0,
      recentPhotos: [],
      albums: [],
    }
  }
}

// Format photos summary for AI context
export function formatPhotosSummaryForContext(summary: PhotosSummary): string {
  if (summary.totalAlbums === 0 && summary.recentPhotos.length === 0) {
    return ''
  }

  const sections: string[] = []

  if (summary.albums.length > 0) {
    const albumList = summary.albums
      .slice(0, 10)
      .map(a => `- ${a.title} (${a.itemCount} items)`)
      .join('\n')
    sections.push(`Albums:\n${albumList}`)
  }

  if (summary.recentPhotos.length > 0) {
    const photoList = summary.recentPhotos
      .slice(0, 5)
      .map(p => {
        const date = new Date(p.date).toLocaleDateString()
        return `- ${p.filename} (${date})${p.description ? `: ${p.description}` : ''}`
      })
      .join('\n')
    sections.push(`Recent photos:\n${photoList}`)
  }

  return `## Google Photos (${summary.totalAlbums} albums)\n${sections.join('\n\n')}`
}

// ============================================
// Multi-Account Wrapper Functions
// ============================================

// Export types for use in other modules
export type { MediaItem, Album, PhotosSummary }

export interface PhotoWithAccount {
  item: MediaItem
  accountId: string
  accountLabel: string
  googleEmail: string
}

export interface PhotosSummaryWithAccount extends PhotosSummary {
  accountId: string
  accountLabel: string
  googleEmail: string
}

/**
 * Get recent photos for a specific account by accountId
 */
export async function getRecentPhotosForAccount(
  accountId: string,
  userId: string,
  limit = 20
): Promise<PhotoWithAccount[]> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return []
  }

  const photos = await getRecentPhotos(tokens.accessToken, tokens.refreshToken, limit)

  return photos.map(item => ({
    item,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }))
}

/**
 * Get albums for a specific account by accountId
 */
export async function getAlbumsForAccount(
  accountId: string,
  userId: string,
  limit = 50
): Promise<{ albums: Album[]; accountLabel: string } | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return null
  }

  const albums = await getAlbums(tokens.accessToken, tokens.refreshToken, limit)

  return { albums, accountLabel: tokens.accountLabel }
}

/**
 * Get photos from a specific album for a specific account
 */
export async function getAlbumPhotosForAccount(
  accountId: string,
  userId: string,
  albumId: string,
  limit = 50
): Promise<PhotoWithAccount[]> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return []
  }

  const photos = await getAlbumPhotos(tokens.accessToken, albumId, limit)

  return photos.map(item => ({
    item,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }))
}

/**
 * Get photos summary for a specific account by accountId
 */
export async function getPhotosSummaryForAccount(
  accountId: string,
  userId: string
): Promise<PhotosSummaryWithAccount | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return null
  }

  const summary = await getPhotosSummary(tokens.accessToken, tokens.refreshToken)

  return {
    ...summary,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }
}
