// AI-powered document classification service
import Anthropic from '@anthropic-ai/sdk'
import { getFileContent } from '@/lib/google/drive'
import type { ZoneName } from './zones'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Classification result from AI
export interface ClassificationResult {
  zone: ZoneName
  confidence: number
  documentType: string
  summary: string
  entities: {
    people?: string[]
    companies?: string[]
    dates?: string[]
    amounts?: string[]
    topics?: string[]
  }
  suggestedName?: string
  reasoning: string
}

// File info for classification
export interface FileToClassify {
  id: string
  name: string
  mimeType: string | null
  fullPath: string | null
  driveFileId: string
  textPreview?: string | null
}

// Extract text content from a Google Drive file
export async function extractFileContent(
  accessToken: string,
  driveFileId: string,
  mimeType: string | null,
  maxChars: number = 10000
): Promise<string | null> {
  try {
    // Skip unsupported types
    if (!mimeType) return null

    // Skip binary files we can't read
    const unsupportedTypes = [
      'image/', 'video/', 'audio/',
      'application/zip', 'application/x-rar',
      'application/octet-stream',
    ]

    for (const type of unsupportedTypes) {
      if (mimeType.startsWith(type) || mimeType === type) {
        return null
      }
    }

    const content = await getFileContent(accessToken, driveFileId, mimeType)

    if (!content) return null

    // Truncate to max chars
    if (content.length > maxChars) {
      return content.substring(0, maxChars) + '\n... [truncated]'
    }

    return content
  } catch (error) {
    console.error('Error extracting file content:', error)
    return null
  }
}

// Classify a document using Claude
export async function classifyDocument(
  file: FileToClassify,
  fileContent: string | null
): Promise<ClassificationResult> {
  const prompt = buildClassificationPrompt(file, fileContent)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseClassificationResponse(text)
  } catch (error) {
    console.error('Error classifying document:', error)
    // Return default classification on error
    return {
      zone: 'UNSORTED',
      confidence: 0.3,
      documentType: 'unknown',
      summary: 'Classification failed',
      entities: {},
      reasoning: 'Error during classification',
    }
  }
}

// Build the classification prompt
function buildClassificationPrompt(file: FileToClassify, content: string | null): string {
  const contentSection = content
    ? `\n\nFILE CONTENT (first ~10000 chars):\n\`\`\`\n${content}\n\`\`\``
    : '\n\n(File content could not be extracted - classify based on name and path only)'

  return `You are a document classifier for a personal file organization system. Analyze this file and classify it.

FILE INFO:
- Name: ${file.name}
- Path: ${file.fullPath || 'Unknown'}
- Type: ${file.mimeType || 'Unknown'}
${contentSection}

AVAILABLE ZONES (pick ONE):
- BUSINESS: Invoices, receipts, contracts, tax documents, financial statements, business correspondence, legal documents, company documents
- CLIENTS: Client work, deliverables, client communications, project files for specific clients
- PROJECTS: Work projects, portfolios, campaigns, non-client project work
- MUSIC: Music files, worship songs, lyrics, chord sheets, set lists, hymns, church/ministry content
- DESIGN: Mockups, wireframes, UI/UX designs, graphics, logos, branding materials, creative assets
- PHOTOGRAPHY: Photos, camera RAW files, edited images, photoshoots, portrait/landscape photography
- PERSONAL: Personal documents, family photos, medical records, personal notes, journals, gaming content (Minecraft, etc)
- CODE: Source code, programming files, development projects, technical documentation
- CONFIG: Configuration files, settings, system files (usually auto-detected)
- UNSORTED: Cannot determine, needs manual review

SPECIAL RULES:
- Gaming content (Minecraft, Steam, etc) goes to PERSONAL zone, not a separate gaming zone
- For Minecraft files, suggest subfolder: Personal/Gaming/Minecraft

Respond in this exact JSON format:
{
  "zone": "ZONE_NAME",
  "confidence": 0.0 to 1.0,
  "documentType": "specific type like 'invoice', 'contract', 'song lyrics', 'mockup', etc",
  "summary": "one sentence describing the document",
  "entities": {
    "people": ["names found"],
    "companies": ["company names"],
    "dates": ["relevant dates"],
    "amounts": ["dollar amounts"],
    "topics": ["key topics"]
  },
  "suggestedName": "better filename if current name is unclear (optional)",
  "reasoning": "brief explanation of why you chose this zone"
}

Be decisive. If it looks like business/financial content, classify as BUSINESS. If it's creative work for a client, use CLIENTS. Music/worship content goes to MUSIC. Design work goes to DESIGN.`
}

// Parse the AI response
function parseClassificationResponse(text: string): ClassificationResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = text
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }

    const parsed = JSON.parse(jsonStr.trim())

    // Validate zone
    const validZones: ZoneName[] = [
      'BUSINESS', 'CLIENTS', 'PROJECTS', 'MUSIC', 'DESIGN',
      'PHOTOGRAPHY', 'PERSONAL', 'CODE', 'CONFIG', 'UNSORTED'
    ]

    const zone = validZones.includes(parsed.zone) ? parsed.zone : 'UNSORTED'

    return {
      zone,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      documentType: parsed.documentType || 'unknown',
      summary: parsed.summary || '',
      entities: parsed.entities || {},
      suggestedName: parsed.suggestedName,
      reasoning: parsed.reasoning || '',
    }
  } catch (error) {
    console.error('Error parsing classification response:', error, text)
    return {
      zone: 'UNSORTED',
      confidence: 0.3,
      documentType: 'unknown',
      summary: 'Failed to parse classification',
      entities: {},
      reasoning: 'Parse error',
    }
  }
}

// Batch classify multiple files
export async function classifyFiles(
  accessToken: string,
  files: FileToClassify[],
  onProgress?: (completed: number, total: number, current: FileToClassify) => void
): Promise<Map<string, ClassificationResult>> {
  const results = new Map<string, ClassificationResult>()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    if (onProgress) {
      onProgress(i, files.length, file)
    }

    // Extract content
    const content = await extractFileContent(
      accessToken,
      file.driveFileId,
      file.mimeType
    )

    // Classify
    const result = await classifyDocument(file, content)
    results.set(file.id, result)

    // Small delay to avoid rate limiting
    if (i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  return results
}
