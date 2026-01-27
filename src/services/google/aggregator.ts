/**
 * Google Services Aggregator
 *
 * Aggregates data from all connected Google accounts:
 * - Merged emails from all Gmail accounts
 * - Combined unread counts
 * - Photos from all accounts
 * - Drive files from all accounts
 */

import { getAllAccounts } from '@/lib/google/token-manager'

// ============================================
// Important Email Configuration
// ============================================

// Trusted domains - emails from these domains are always considered important
const TRUSTED_DOMAINS = [
  'stripe.com',
  'framer.com',
  'garyboyer.com',
  'jvklaw.com',
  'djwindowsdoors.com',
  'noctworks.com', // Your own domain
]

// Trusted senders - specific email addresses that are always important
const TRUSTED_SENDERS = [
  'luveggs2@gmail.com',
  'kurkhill@jvklaw.com',
  'jnfse1123@gmail.com',
  'todd.djwindowsdoors@gmail.com',
  'david@djwindowsdoors.com',
  't300025hao@gmail.com',
  'gary@garyboyer.com',
]

// Build Gmail query for important emails
function buildImportanceQuery(): string {
  // Start with Gmail's importance filter OR primary category
  // This catches emails Gmail thinks are important based on your behavior
  const parts = ['(is:important OR category:primary)']

  // Add trusted domains - emails from these are always shown
  const domainFilters = TRUSTED_DOMAINS.map(d => `from:@${d}`).join(' OR ')
  if (domainFilters) {
    parts.push(`(${domainFilters})`)
  }

  // Add trusted senders
  const senderFilters = TRUSTED_SENDERS.map(s => `from:${s}`).join(' OR ')
  if (senderFilters) {
    parts.push(`(${senderFilters})`)
  }

  // Combine with OR - show if ANY condition matches
  return parts.join(' OR ')
}
import {
  listEmailsForAccount,
  getUnreadCountForAccount,
  searchEmailsForAccount,
  type EmailWithAccount,
} from '@/lib/google/gmail'
import {
  getRecentPhotosForAccount,
  getPhotosSummaryForAccount,
  type PhotoWithAccount,
  type PhotosSummaryWithAccount,
} from '@/lib/google/photos'
import {
  listFilesForAccount,
  searchFilesForAccount,
  fullTextSearchForAccount,
  type DriveFileWithAccount,
} from '@/lib/google/drive'

// ============================================
// Email Aggregation
// ============================================

export interface AggregatedEmails {
  emails: EmailWithAccount[]
  totalCount: number
  accountBreakdown: { accountId: string; accountLabel: string; count: number }[]
}

/**
 * Get emails from all connected accounts, merged by date
 * Filters for important emails using Gmail's importance + trusted senders whitelist
 */
export async function getAggregatedEmails(
  userId: string,
  options: {
    maxResults?: number
    query?: string
    includeAll?: boolean // Set to true to include all emails (no filtering)
  } = {}
): Promise<AggregatedEmails> {
  const accounts = await getAllAccounts(userId)
  const { maxResults = 20, query, includeAll = false } = options

  // Build importance filter using Gmail's is:important + trusted domains/senders
  const importanceFilter = includeAll ? '' : buildImportanceQuery()
  const finalQuery = query
    ? (includeAll ? query : `(${importanceFilter}) ${query}`)
    : (includeAll ? undefined : importanceFilter)

  const allEmails: EmailWithAccount[] = []
  const accountBreakdown: { accountId: string; accountLabel: string; count: number }[] = []

  // Fetch from all accounts in parallel
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const { emails } = await listEmailsForAccount(account.id, userId, {
          maxResults: Math.ceil(maxResults / accounts.length) + 5, // Get a bit more to ensure good merge
          query: finalQuery,
        })
        return { account, emails }
      } catch (error) {
        console.error(`Failed to fetch emails for account ${account.google_email}:`, error)
        return { account, emails: [] }
      }
    })
  )

  // Collect all emails and track per-account counts
  for (const result of results) {
    allEmails.push(...result.emails)
    accountBreakdown.push({
      accountId: result.account.id,
      accountLabel: result.account.account_label,
      count: result.emails.length,
    })
  }

  // Sort by date descending
  allEmails.sort((a, b) => {
    const dateA = new Date(a.date).getTime()
    const dateB = new Date(b.date).getTime()
    return dateB - dateA
  })

  // Limit to maxResults
  const emails = allEmails.slice(0, maxResults)

  return {
    emails,
    totalCount: allEmails.length,
    accountBreakdown,
  }
}

export interface AggregatedUnreadCount {
  total: number
  byAccount: { accountId: string; accountLabel: string; googleEmail: string; count: number }[]
}

/**
 * Get total unread count across all accounts
 * Only counts important emails by default (is:important OR category:primary OR trusted senders)
 */
export async function getAggregatedUnreadCount(
  userId: string,
  options: { includeAll?: boolean } = {}
): Promise<AggregatedUnreadCount> {
  const accounts = await getAllAccounts(userId)
  const { includeAll = false } = options

  // Use same importance filter as email list for consistency
  const importanceQuery = includeAll ? undefined : buildImportanceQuery()

  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const result = await getUnreadCountForAccount(account.id, userId, {
          importantOnly: !includeAll,
          customQuery: importanceQuery,
        })
        return {
          accountId: account.id,
          accountLabel: account.account_label,
          googleEmail: account.google_email,
          count: result?.count || 0,
        }
      } catch (error) {
        console.error(`Failed to get unread count for ${account.google_email}:`, error)
        return {
          accountId: account.id,
          accountLabel: account.account_label,
          googleEmail: account.google_email,
          count: 0,
        }
      }
    })
  )

  const total = results.reduce((sum, r) => sum + r.count, 0)

  return {
    total,
    byAccount: results,
  }
}

/**
 * Search emails across all accounts
 */
export async function searchAggregatedEmails(
  userId: string,
  query: string,
  maxResults = 20
): Promise<AggregatedEmails> {
  const accounts = await getAllAccounts(userId)

  const allEmails: EmailWithAccount[] = []
  const accountBreakdown: { accountId: string; accountLabel: string; count: number }[] = []

  const results = await Promise.all(
    accounts.map(async (account) => {
      const emails = await searchEmailsForAccount(
        account.id,
        userId,
        query,
        Math.ceil(maxResults / accounts.length) + 5
      )
      return { account, emails }
    })
  )

  for (const result of results) {
    allEmails.push(...result.emails)
    accountBreakdown.push({
      accountId: result.account.id,
      accountLabel: result.account.account_label,
      count: result.emails.length,
    })
  }

  // Sort by date descending
  allEmails.sort((a, b) => {
    const dateA = new Date(a.date).getTime()
    const dateB = new Date(b.date).getTime()
    return dateB - dateA
  })

  return {
    emails: allEmails.slice(0, maxResults),
    totalCount: allEmails.length,
    accountBreakdown,
  }
}

// ============================================
// Photos Aggregation
// ============================================

export interface AggregatedPhotos {
  photos: PhotoWithAccount[]
  totalCount: number
  accountBreakdown: { accountId: string; accountLabel: string; count: number }[]
}

/**
 * Get recent photos from all accounts, merged by date
 */
export async function getAggregatedPhotos(
  userId: string,
  limit = 20
): Promise<AggregatedPhotos> {
  const accounts = await getAllAccounts(userId)

  const allPhotos: PhotoWithAccount[] = []
  const accountBreakdown: { accountId: string; accountLabel: string; count: number }[] = []

  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const photos = await getRecentPhotosForAccount(
          account.id,
          userId,
          Math.ceil(limit / accounts.length) + 5
        )
        return { account, photos }
      } catch (error) {
        console.error(`Failed to fetch photos for account ${account.google_email}:`, error)
        return { account, photos: [] }
      }
    })
  )

  for (const result of results) {
    allPhotos.push(...result.photos)
    accountBreakdown.push({
      accountId: result.account.id,
      accountLabel: result.account.account_label,
      count: result.photos.length,
    })
  }

  // Sort by creation time descending (with safety check)
  allPhotos.sort((a, b) => {
    const dateA = a.item.mediaMetadata?.creationTime
      ? new Date(a.item.mediaMetadata.creationTime).getTime()
      : 0
    const dateB = b.item.mediaMetadata?.creationTime
      ? new Date(b.item.mediaMetadata.creationTime).getTime()
      : 0
    return dateB - dateA
  })

  return {
    photos: allPhotos.slice(0, limit),
    totalCount: allPhotos.length,
    accountBreakdown,
  }
}

/**
 * Get photos summaries from all accounts
 */
export async function getAggregatedPhotosSummary(
  userId: string
): Promise<PhotosSummaryWithAccount[]> {
  const accounts = await getAllAccounts(userId)

  const results = await Promise.all(
    accounts.map(async (account) => {
      return getPhotosSummaryForAccount(account.id, userId)
    })
  )

  return results.filter((r): r is PhotosSummaryWithAccount => r !== null)
}

// ============================================
// Drive Aggregation
// ============================================

export interface AggregatedDriveFiles {
  files: DriveFileWithAccount[]
  totalCount: number
  accountBreakdown: { accountId: string; accountLabel: string; count: number }[]
}

/**
 * Get recent files from all Drive accounts
 */
export async function getAggregatedDriveFiles(
  userId: string,
  options: {
    pageSize?: number
    query?: string
    orderBy?: string
  } = {}
): Promise<AggregatedDriveFiles> {
  const accounts = await getAllAccounts(userId)
  const { pageSize = 20 } = options

  const allFiles: DriveFileWithAccount[] = []
  const accountBreakdown: { accountId: string; accountLabel: string; count: number }[] = []

  const results = await Promise.all(
    accounts.map(async (account) => {
      const { files } = await listFilesForAccount(account.id, userId, {
        ...options,
        pageSize: Math.ceil(pageSize / accounts.length) + 5,
      })
      return { account, files }
    })
  )

  for (const result of results) {
    allFiles.push(...result.files)
    accountBreakdown.push({
      accountId: result.account.id,
      accountLabel: result.account.account_label,
      count: result.files.length,
    })
  }

  // Sort by modified time descending
  allFiles.sort((a, b) => {
    const dateA = new Date(a.modifiedTime || 0).getTime()
    const dateB = new Date(b.modifiedTime || 0).getTime()
    return dateB - dateA
  })

  return {
    files: allFiles.slice(0, pageSize),
    totalCount: allFiles.length,
    accountBreakdown,
  }
}

/**
 * Search files across all Drive accounts
 */
export async function searchAggregatedDriveFiles(
  userId: string,
  searchTerm: string
): Promise<AggregatedDriveFiles> {
  const accounts = await getAllAccounts(userId)

  const allFiles: DriveFileWithAccount[] = []
  const accountBreakdown: { accountId: string; accountLabel: string; count: number }[] = []

  const results = await Promise.all(
    accounts.map(async (account) => {
      const files = await searchFilesForAccount(account.id, userId, searchTerm)
      return { account, files }
    })
  )

  for (const result of results) {
    allFiles.push(...result.files)
    accountBreakdown.push({
      accountId: result.account.id,
      accountLabel: result.account.account_label,
      count: result.files.length,
    })
  }

  // Sort by modified time descending
  allFiles.sort((a, b) => {
    const dateA = new Date(a.modifiedTime || 0).getTime()
    const dateB = new Date(b.modifiedTime || 0).getTime()
    return dateB - dateA
  })

  return {
    files: allFiles,
    totalCount: allFiles.length,
    accountBreakdown,
  }
}

/**
 * Full-text search across all Drive accounts
 */
export async function fullTextSearchAggregatedDrive(
  userId: string,
  searchTerm: string,
  options: {
    maxResults?: number
    mimeTypes?: string[]
  } = {}
): Promise<AggregatedDriveFiles> {
  const accounts = await getAllAccounts(userId)
  const { maxResults = 20, mimeTypes } = options

  const allFiles: DriveFileWithAccount[] = []
  const accountBreakdown: { accountId: string; accountLabel: string; count: number }[] = []

  const results = await Promise.all(
    accounts.map(async (account) => {
      const files = await fullTextSearchForAccount(account.id, userId, searchTerm, {
        maxResults: Math.ceil(maxResults / accounts.length) + 5,
        mimeTypes,
      })
      return { account, files }
    })
  )

  for (const result of results) {
    allFiles.push(...result.files)
    accountBreakdown.push({
      accountId: result.account.id,
      accountLabel: result.account.account_label,
      count: result.files.length,
    })
  }

  // Sort by modified time descending
  allFiles.sort((a, b) => {
    const dateA = new Date(a.modifiedTime || 0).getTime()
    const dateB = new Date(b.modifiedTime || 0).getTime()
    return dateB - dateA
  })

  return {
    files: allFiles.slice(0, maxResults),
    totalCount: allFiles.length,
    accountBreakdown,
  }
}

// ============================================
// Format for AI Context
// ============================================

/**
 * Format aggregated emails for AI context with account labels
 */
export function formatAggregatedEmailsForContext(
  result: AggregatedEmails,
  unreadResult: AggregatedUnreadCount
): string {
  if (result.emails.length === 0) {
    return ''
  }

  const accountInfo = unreadResult.byAccount
    .map(a => `${a.accountLabel} (${a.googleEmail}): ${a.count} unread`)
    .join(', ')

  const emailList = result.emails.slice(0, 15).map(e => {
    const date = new Date(e.date).toLocaleDateString()
    const unread = e.isUnread ? '[UNREAD] ' : ''
    const from = e.from.replace(/<[^>]+>/, '').trim()
    const label = `[${e.accountLabel}]`
    return `${label} ${unread}${date} - ${from}: ${e.subject}`
  }).join('\n')

  return `## Gmail (${unreadResult.total} unread total)
Accounts: ${accountInfo}

Recent emails:
${emailList}`
}

/**
 * Format aggregated photos for AI context
 */
export function formatAggregatedPhotosForContext(
  summaries: PhotosSummaryWithAccount[]
): string {
  if (summaries.length === 0) {
    return ''
  }

  const sections: string[] = []

  for (const summary of summaries) {
    if (summary.totalAlbums === 0 && summary.recentPhotos.length === 0) {
      continue
    }

    const albumList = summary.albums
      .slice(0, 5)
      .map(a => `- ${a.title} (${a.itemCount} items)`)
      .join('\n')

    const photoList = summary.recentPhotos
      .slice(0, 3)
      .map(p => {
        const date = new Date(p.date).toLocaleDateString()
        return `- ${p.filename} (${date})`
      })
      .join('\n')

    sections.push(`### ${summary.accountLabel} (${summary.googleEmail})
Albums: ${summary.totalAlbums}
${albumList ? `\n${albumList}` : ''}
${photoList ? `\nRecent:\n${photoList}` : ''}`)
  }

  if (sections.length === 0) {
    return ''
  }

  return `## Google Photos

${sections.join('\n\n')}`
}
