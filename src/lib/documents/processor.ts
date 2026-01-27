import { getJsonResponse, MODELS } from '@/lib/ai/claude'

// pdf-parse doesn't have proper ESM exports, use dynamic import
async function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  return pdfParse(buffer)
}

interface ProcessResult {
  text: string | null
  documentType: string | null
  confidence: number | null
  metadata: Record<string, unknown>
}

export async function processDocument(
  fileData: Blob,
  fileType: string,
  fileName: string
): Promise<ProcessResult> {
  let text: string | null = null

  // Extract text based on file type
  if (fileType === 'text' || fileType === 'csv') {
    text = await fileData.text()
  } else if (fileType === 'pdf') {
    // Extract text from PDF using pdf-parse
    try {
      const buffer = Buffer.from(await fileData.arrayBuffer())
      const pdfData = await parsePdf(buffer)
      text = pdfData.text
    } catch (e) {
      console.error('PDF extraction failed:', e)
      text = null
    }
  } else if (fileType === 'image') {
    // Images require OCR - mark as pending
    text = null
  }

  // If we have text, classify the document
  let documentType: string | null = null
  let confidence: number | null = null
  let metadata: Record<string, unknown> = {}

  if (text && text.length > 50) {
    const classification = await classifyDocument(text, fileName)
    documentType = classification.type
    confidence = classification.confidence
    metadata = classification.metadata
  } else {
    // Guess type from filename for files without text
    documentType = guessTypeFromFilename(fileName)
    confidence = 0.5
  }

  return {
    text,
    documentType,
    confidence,
    metadata,
  }
}

function guessTypeFromFilename(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.includes('invoice') || lower.includes('inv')) return 'invoice'
  if (lower.includes('receipt') || lower.includes('rcpt')) return 'receipt'
  if (lower.includes('contract') || lower.includes('agreement')) return 'contract'
  if (lower.includes('statement') || lower.includes('stmt')) return 'bank_statement'
  if (lower.includes('w9') || lower.includes('1099') || lower.includes('tax')) return 'tax_form'
  if (lower.includes('proposal') || lower.includes('quote')) return 'proposal'
  return 'other'
}

interface Classification {
  type: string
  confidence: number
  metadata: Record<string, unknown>
}

async function classifyDocument(
  text: string,
  fileName: string
): Promise<Classification> {
  const sampleText = text.slice(0, 3000) // Limit context for cost

  const prompt = `Analyze this document and classify it. Return JSON only.

Document filename: ${fileName}
Document text (first 3000 chars):
${sampleText}

Document Types to choose from:
- contract: Legal agreements, terms of service, NDAs
- invoice: Bills, invoices with amounts due
- receipt: Proof of payment, receipts
- proposal: Business proposals, quotes
- tax_form: W-9, 1099, tax documents
- bank_statement: Bank or credit card statements
- insurance: Insurance policies or claims
- report: Reports, analytics, summaries
- correspondence: Letters, emails
- other: Anything else

Return format:
{
  "type": "invoice",
  "confidence": 0.92,
  "metadata": {
    "vendor": "Company Name (if found)",
    "amount": 123.45 (if found),
    "date": "2024-01-15" (if found),
    "parties": ["Party 1", "Party 2"] (if applicable)
  }
}

Only include metadata fields that you can extract with confidence.`

  try {
    const result = await getJsonResponse<Classification>(prompt, {
      model: MODELS.HAIKU,
      system: 'You are a document classification assistant. Return only valid JSON.',
    })
    return result
  } catch (error) {
    console.error('Classification error:', error)
    return {
      type: 'other',
      confidence: 0,
      metadata: {},
    }
  }
}
