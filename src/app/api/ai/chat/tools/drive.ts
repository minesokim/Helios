import { ToolDefinition } from '../types'
import { searchDriveContent, semanticSearchDocuments } from '@/services/ai/context'
import { getAllAccounts, getValidAccessToken } from '@/lib/google/token-manager'
import { searchFiles, getFileContent } from '@/lib/google/drive'

export const driveTools: ToolDefinition[] = [
  {
    name: 'find_files',
    description: "Find files in David's Google Drive by filename. Searches across all connected accounts (personal and work). Use when he asks to find a specific file by name.",
    input_schema: {
      type: 'object' as const,
      properties: {
        filename: {
          type: 'string',
          description: 'Filename or part of filename to search for',
        },
        account: {
          type: 'string',
          enum: ['personal', 'work', 'all'],
          description: 'Which Drive to search. Default is "all" to search both.',
        },
      },
      required: ['filename'],
    },
    handler: async (params, context) => {
      const accounts = await getAllAccounts(context.userId)
      if (accounts.length === 0) {
        return 'No Google account connected. Please connect Google Drive in Settings first.'
      }

      const accountPref = (params.account as string)?.toLowerCase() || 'all'
      const allFiles: any[] = []

      for (const account of accounts) {
        // Filter by account preference
        if (accountPref !== 'all') {
          const isWork = account.account_label.toLowerCase().includes('work') || account.google_email.includes('noctworks')
          if (accountPref === 'work' && !isWork) continue
          if (accountPref === 'personal' && isWork) continue
        }

        try {
          const tokens = await getValidAccessToken(account.id, context.userId)
          if (!tokens) continue

          const files = await searchFiles(tokens.accessToken, params.filename as string)
          allFiles.push(...files.map(f => ({
            ...f,
            accountLabel: account.account_label,
            googleEmail: account.google_email,
          })))
        } catch (e) {
          console.error(`File search failed for ${account.google_email}:`, e)
        }
      }

      if (allFiles.length === 0) {
        return `No files found matching "${params.filename}" in Drive.`
      }

      // Sort by modified time
      allFiles.sort((a, b) => {
        const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
        const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
        return timeB - timeA
      })

      const fileList = allFiles.slice(0, 15).map(f => {
        const modified = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ''
        const account = accounts.length > 1 ? ` [${f.accountLabel}]` : ''
        return `- ${f.name}${account}\n  Modified: ${modified}\n  Link: ${f.webViewLink}`
      }).join('\n\n')

      // Include DRIVE_LINK marker for the first/best match so UI can show quick link
      const topFile = allFiles[0]
      const driveLinkMarker = topFile.webViewLink ? `\n\nDRIVE_LINK:${topFile.webViewLink}|${topFile.name}` : ''

      return `Found ${allFiles.length} files matching "${params.filename}":\n\n${fileList}${driveLinkMarker}`
    },
  },
  {
    name: 'search_drive',
    description: "Search INSIDE David's Google Drive files (Google Docs, Sheets, Slides, PDFs). This searches the actual content of files, not just filenames. Searches across all connected accounts. Use when he asks to find something mentioned in his documents.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search terms to find inside documents',
        },
      },
      required: ['query'],
    },
    handler: async (params, context) => {
      const driveResults = await searchDriveContent(context.userId, params.query as string)
      if (!driveResults || driveResults.length === 0) {
        return 'No documents found containing that text. Make sure Google Drive is connected.'
      }
      const driveList = driveResults.map((f: any) => {
        const account = f.accountLabel ? ` [${f.accountLabel}]` : ''
        const snippet = f.snippet ? `\n  Preview: "${f.snippet.substring(0, 200)}..."` : ''
        return `- ${f.name}${account} (${f.mimeType})${snippet}\n  Link: ${f.webViewLink}`
      }).join('\n\n')

      // Include DRIVE_LINK marker for the first/best match so UI can show quick link
      const topResult = driveResults[0] as any
      const driveLinkMarker = topResult?.webViewLink ? `\n\nDRIVE_LINK:${topResult.webViewLink}|${topResult.name}` : ''

      return `Found ${driveResults.length} documents containing "${params.query}":\n\n${driveList}${driveLinkMarker}`
    },
  },
  {
    name: 'read_drive_file',
    description: "Read the contents of a specific Google Drive file. Use when David asks to see what's inside a specific document. Works with Google Docs, Sheets, Slides, and text files.",
    input_schema: {
      type: 'object' as const,
      properties: {
        fileId: {
          type: 'string',
          description: 'The Google Drive file ID (from search results)',
        },
        accountEmail: {
          type: 'string',
          description: 'The Google account email the file belongs to (from search results)',
        },
      },
      required: ['fileId'],
    },
    handler: async (params, context) => {
      const accounts = await getAllAccounts(context.userId)
      if (accounts.length === 0) {
        return 'No Google account connected.'
      }

      // Find the right account
      let targetAccount = accounts[0]
      if (params.accountEmail) {
        const found = accounts.find(a => a.google_email === params.accountEmail)
        if (found) targetAccount = found
      }

      const tokens = await getValidAccessToken(targetAccount.id, context.userId)
      if (!tokens) {
        return 'Unable to access Drive. Please reconnect your Google account.'
      }

      const content = await getFileContent(tokens.accessToken, params.fileId as string)
      if (!content) {
        return 'Unable to read file content. The file may not be a text-based document.'
      }

      // Truncate if too long
      const maxLength = 8000
      if (content.length > maxLength) {
        return `File content (truncated to ${maxLength} chars):\n\n${content.substring(0, maxLength)}...\n\n[Content truncated - file is ${content.length} characters total]`
      }

      return `File content:\n\n${content}`
    },
  },
  {
    name: 'search_documents',
    description: "Semantic search through David's uploaded documents (PDFs, text files). Use when he asks about content INSIDE documents, contracts, invoices, or any uploaded files. This searches the actual text content using AI similarity matching.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query describing what to find in documents',
        },
      },
      required: ['query'],
    },
    handler: async (params, context) => {
      const docs = await semanticSearchDocuments(context.userId, params.query as string)
      if (!docs || docs.length === 0) {
        return 'No matching content found in documents. Note: Only uploaded documents with extracted text are searchable.'
      }
      const docResults = docs.slice(0, 5).map((d: { document?: { file_name?: string }; chunk_text: string; similarity: number }) => {
        const fileName = d.document?.file_name || 'Unknown document'
        const preview = d.chunk_text.substring(0, 300).replace(/\n/g, ' ')
        return `From "${fileName}" (${(d.similarity * 100).toFixed(0)}% match):\n"${preview}..."`
      }).join('\n\n')
      return `Found ${docs.length} relevant passages:\n\n${docResults}`
    },
  },
]
