/**
 * Google Drive API Integration
 *
 * Provides read-only access to user's Google Drive files.
 * Supports multi-account via accountId parameter
 */

import { google, drive_v3 } from 'googleapis'
import { createAuthenticatedClient } from './oauth'
import { getValidAccessToken, type AccountTokens } from './token-manager'

export type DriveFile = drive_v3.Schema$File
export type DriveFileList = drive_v3.Schema$FileList

// File fields to request from Drive API
const FILE_FIELDS = [
  'id',
  'name',
  'mimeType',
  'size',
  'createdTime',
  'modifiedTime',
  'parents',
  'webViewLink',
  'iconLink',
  'thumbnailLink',
  'md5Checksum',
  'trashed',
  'starred',
  'shared',
].join(',')

// Create Drive client
export function createDriveClient(accessToken: string, refreshToken?: string) {
  const auth = createAuthenticatedClient(accessToken, refreshToken)
  return google.drive({ version: 'v3', auth })
}

// List all files (paginated)
export async function listFiles(
  accessToken: string,
  options: {
    pageToken?: string
    pageSize?: number
    query?: string
    orderBy?: string
    folderId?: string
    includeTrash?: boolean
  } = {}
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const drive = createDriveClient(accessToken)

  const {
    pageToken,
    pageSize = 100,
    query,
    orderBy = 'modifiedTime desc',
    folderId,
    includeTrash = false,
  } = options

  // Build query
  let q = ''
  if (folderId) {
    q = `'${folderId}' in parents`
  }
  if (!includeTrash) {
    q = q ? `${q} and trashed = false` : 'trashed = false'
  }
  if (query) {
    q = q ? `${q} and ${query}` : query
  }

  const response = await drive.files.list({
    pageSize,
    pageToken,
    orderBy,
    q: q || undefined,
    fields: `nextPageToken, files(${FILE_FIELDS})`,
    spaces: 'drive',
  })

  return {
    files: response.data.files || [],
    nextPageToken: response.data.nextPageToken || undefined,
  }
}

// Get all files recursively (handles pagination)
export async function getAllFiles(
  accessToken: string,
  options: {
    query?: string
    folderId?: string
    onProgress?: (count: number) => void
  } = {}
): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const result = await listFiles(accessToken, {
      ...options,
      pageToken,
      pageSize: 1000,
    })

    allFiles.push(...result.files)
    pageToken = result.nextPageToken

    if (options.onProgress) {
      options.onProgress(allFiles.length)
    }
  } while (pageToken)

  return allFiles
}

// Get a single file by ID
export async function getFile(
  accessToken: string,
  fileId: string
): Promise<DriveFile | null> {
  const drive = createDriveClient(accessToken)

  try {
    const response = await drive.files.get({
      fileId,
      fields: FILE_FIELDS,
    })
    return response.data
  } catch (error) {
    console.error('Error getting file:', error)
    return null
  }
}

// Get file content (for text-based files)
export async function getFileContent(
  accessToken: string,
  fileId: string,
  mimeType?: string
): Promise<string | null> {
  const drive = createDriveClient(accessToken)

  try {
    // For Google Docs, Sheets, Slides - export as text
    if (mimeType?.startsWith('application/vnd.google-apps.')) {
      let exportMimeType = 'text/plain'

      if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        exportMimeType = 'text/csv'
      } else if (mimeType === 'application/vnd.google-apps.presentation') {
        exportMimeType = 'text/plain'
      }

      const response = await drive.files.export({
        fileId,
        mimeType: exportMimeType,
      })

      return response.data as string
    }

    // For regular files, download content
    const response = await drive.files.get({
      fileId,
      alt: 'media',
    }, {
      responseType: 'text',
    })

    return response.data as string
  } catch (error) {
    console.error('Error getting file content:', error)
    return null
  }
}

// Get file binary content (for PDFs, images)
export async function getFileBinary(
  accessToken: string,
  fileId: string
): Promise<Buffer | null> {
  const drive = createDriveClient(accessToken)

  try {
    const response = await drive.files.get({
      fileId,
      alt: 'media',
    }, {
      responseType: 'arraybuffer',
    })

    return Buffer.from(response.data as ArrayBuffer)
  } catch (error) {
    console.error('Error getting file binary:', error)
    return null
  }
}

// Get folder structure (for building file tree)
export async function getFolderStructure(
  accessToken: string,
  rootFolderId?: string
): Promise<Map<string, DriveFile>> {
  const drive = createDriveClient(accessToken)
  const folders = new Map<string, DriveFile>()

  // Get all folders
  let pageToken: string | undefined

  do {
    const response = await drive.files.list({
      pageSize: 1000,
      pageToken,
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: `nextPageToken, files(${FILE_FIELDS})`,
      spaces: 'drive',
    })

    for (const folder of response.data.files || []) {
      if (folder.id) {
        folders.set(folder.id, folder)
      }
    }

    pageToken = response.data.nextPageToken || undefined
  } while (pageToken)

  return folders
}

// Build full path for a file
export function buildFilePath(
  file: DriveFile,
  folders: Map<string, DriveFile>
): string {
  const pathParts: string[] = [file.name || 'Unknown']
  let currentParentId = file.parents?.[0]

  while (currentParentId) {
    const parentFolder = folders.get(currentParentId)
    if (parentFolder && parentFolder.name) {
      pathParts.unshift(parentFolder.name)
      currentParentId = parentFolder.parents?.[0]
    } else {
      break
    }
  }

  return '/' + pathParts.join('/')
}

// Get files in a specific folder
export async function getFilesInFolder(
  accessToken: string,
  folderId: string
): Promise<DriveFile[]> {
  return getAllFiles(accessToken, { folderId })
}

// Search files by filename
export async function searchFiles(
  accessToken: string,
  searchTerm: string
): Promise<DriveFile[]> {
  const query = `name contains '${searchTerm.replace(/'/g, "\\'")}'`
  return getAllFiles(accessToken, { query })
}

// Full-text content search (searches INSIDE documents)
// Works for Google Docs, Sheets, Slides, PDFs, and text files
export async function fullTextSearch(
  accessToken: string,
  searchTerm: string,
  options: {
    maxResults?: number
    mimeTypes?: string[]
  } = {}
): Promise<DriveFile[]> {
  const drive = createDriveClient(accessToken)
  const { maxResults = 20, mimeTypes } = options

  // Build query with fullText search
  let query = `fullText contains '${searchTerm.replace(/'/g, "\\'")}' and trashed = false`

  // Optionally filter by mime types
  if (mimeTypes && mimeTypes.length > 0) {
    const mimeFilter = mimeTypes.map(m => `mimeType = '${m}'`).join(' or ')
    query = `${query} and (${mimeFilter})`
  }

  try {
    const response = await drive.files.list({
      pageSize: maxResults,
      q: query,
      fields: `files(${FILE_FIELDS})`,
      spaces: 'drive',
    })

    return response.data.files || []
  } catch (error) {
    console.error('Full-text search error:', error)
    return []
  }
}

// Get text snippet from file for search results
export async function getFileSnippet(
  accessToken: string,
  fileId: string,
  searchTerm: string,
  mimeType?: string
): Promise<string | null> {
  try {
    const content = await getFileContent(accessToken, fileId, mimeType)
    if (!content) return null

    // Find the search term and return surrounding context
    const lowerContent = content.toLowerCase()
    const lowerTerm = searchTerm.toLowerCase()
    const index = lowerContent.indexOf(lowerTerm)

    if (index === -1) {
      // Term not found in plain export, return first 300 chars
      return content.substring(0, 300)
    }

    // Return 150 chars before and after the match
    const start = Math.max(0, index - 150)
    const end = Math.min(content.length, index + searchTerm.length + 150)
    let snippet = content.substring(start, end)

    if (start > 0) snippet = '...' + snippet
    if (end < content.length) snippet = snippet + '...'

    return snippet
  } catch (e) {
    console.error('Error getting file snippet:', e)
    return null
  }
}

// Get about info (storage quota, user info)
export async function getAboutInfo(accessToken: string) {
  const drive = createDriveClient(accessToken)

  const response = await drive.about.get({
    fields: 'user, storageQuota',
  })

  return response.data
}

// ============================================
// DRIVE WATCH (WEBHOOKS) - Real-time file changes
// ============================================

export interface WatchChannel {
  id: string
  resourceId: string
  resourceUri?: string
  expiration: string
}

/**
 * Set up a watch channel to receive push notifications for Drive changes
 * Note: Webhook URL must be HTTPS with a valid SSL certificate
 */
export async function setupDriveWatch(
  accessToken: string,
  webhookUrl: string,
  channelId?: string
): Promise<WatchChannel | null> {
  const drive = createDriveClient(accessToken)

  // Generate unique channel ID if not provided
  const id = channelId || `jorkel-drive-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Watch expires in 24 hours (max allowed by Google)
  const expiration = Date.now() + 24 * 60 * 60 * 1000

  try {
    const response = await drive.changes.watch({
      pageToken: await getStartPageToken(accessToken),
      requestBody: {
        id,
        type: 'web_hook',
        address: webhookUrl,
        expiration: expiration.toString(),
      },
    })

    if (!response.data.resourceId) {
      console.error('Failed to set up Drive watch: no resourceId returned')
      return null
    }

    return {
      id: response.data.id || id,
      resourceId: response.data.resourceId,
      resourceUri: response.data.resourceUri || undefined,
      expiration: new Date(expiration).toISOString(),
    }
  } catch (error) {
    console.error('Error setting up Drive watch:', error)
    return null
  }
}

/**
 * Stop a watch channel (clean up)
 */
export async function stopDriveWatch(
  accessToken: string,
  channelId: string,
  resourceId: string
): Promise<boolean> {
  const drive = createDriveClient(accessToken)

  try {
    await drive.channels.stop({
      requestBody: {
        id: channelId,
        resourceId,
      },
    })
    return true
  } catch (error) {
    console.error('Error stopping Drive watch:', error)
    return false
  }
}

/**
 * Get the start page token for changes
 */
export async function getStartPageToken(accessToken: string): Promise<string> {
  const drive = createDriveClient(accessToken)

  const response = await drive.changes.getStartPageToken()
  return response.data.startPageToken || ''
}

/**
 * Get changes since the last page token
 */
export async function getChanges(
  accessToken: string,
  pageToken: string
): Promise<{
  changes: drive_v3.Schema$Change[]
  newPageToken: string
}> {
  const drive = createDriveClient(accessToken)

  const response = await drive.changes.list({
    pageToken,
    fields: 'nextPageToken, newStartPageToken, changes(fileId, removed, file(' + FILE_FIELDS + '))',
    includeRemoved: true,
    spaces: 'drive',
  })

  return {
    changes: response.data.changes || [],
    newPageToken: response.data.newStartPageToken || pageToken,
  }
}

// ============================================
// Multi-Account Wrapper Functions
// ============================================

export interface DriveFileWithAccount extends DriveFile {
  accountId: string
  accountLabel: string
  googleEmail: string
}

/**
 * List files for a specific account by accountId
 */
export async function listFilesForAccount(
  accountId: string,
  userId: string,
  options: {
    pageToken?: string
    pageSize?: number
    query?: string
    orderBy?: string
    folderId?: string
    includeTrash?: boolean
  } = {}
): Promise<{ files: DriveFileWithAccount[]; nextPageToken?: string; tokens: AccountTokens | null }> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return { files: [], tokens: null }
  }

  const result = await listFiles(tokens.accessToken, options)

  const filesWithAccount: DriveFileWithAccount[] = result.files.map(file => ({
    ...file,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }))

  return { files: filesWithAccount, nextPageToken: result.nextPageToken, tokens }
}

/**
 * Get all files for a specific account by accountId
 */
export async function getAllFilesForAccount(
  accountId: string,
  userId: string,
  options: {
    query?: string
    folderId?: string
    onProgress?: (count: number) => void
  } = {}
): Promise<DriveFileWithAccount[]> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return []
  }

  const files = await getAllFiles(tokens.accessToken, options)

  return files.map(file => ({
    ...file,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }))
}

/**
 * Get a single file for a specific account by accountId
 */
export async function getFileForAccount(
  accountId: string,
  userId: string,
  fileId: string
): Promise<DriveFileWithAccount | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return null
  }

  const file = await getFile(tokens.accessToken, fileId)
  if (!file) {
    return null
  }

  return {
    ...file,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }
}

/**
 * Get file content for a specific account by accountId
 */
export async function getFileContentForAccount(
  accountId: string,
  userId: string,
  fileId: string,
  mimeType?: string
): Promise<string | null> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return null
  }

  return getFileContent(tokens.accessToken, fileId, mimeType)
}

/**
 * Search files for a specific account by accountId
 */
export async function searchFilesForAccount(
  accountId: string,
  userId: string,
  searchTerm: string
): Promise<DriveFileWithAccount[]> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return []
  }

  const files = await searchFiles(tokens.accessToken, searchTerm)

  return files.map(file => ({
    ...file,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }))
}

/**
 * Full-text search files for a specific account by accountId
 */
export async function fullTextSearchForAccount(
  accountId: string,
  userId: string,
  searchTerm: string,
  options: {
    maxResults?: number
    mimeTypes?: string[]
  } = {}
): Promise<DriveFileWithAccount[]> {
  const tokens = await getValidAccessToken(accountId, userId)
  if (!tokens) {
    return []
  }

  const files = await fullTextSearch(tokens.accessToken, searchTerm, options)

  return files.map(file => ({
    ...file,
    accountId: tokens.accountId,
    accountLabel: tokens.accountLabel,
    googleEmail: tokens.googleEmail,
  }))
}
