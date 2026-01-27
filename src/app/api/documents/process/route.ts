import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { processDocument } from '@/lib/documents/processor'
import { generateEmbeddings } from '@/lib/documents/embeddings'
import type { Database } from '@/types/database'

type Document = Database['public']['Tables']['documents']['Row']

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { documentId } = await request.json()

  if (!documentId) {
    return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
  }

  // Get document
  const docResult = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', user.id)
    .single()

  const document = docResult.data as Document | null

  if (docResult.error || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Update status to processing
  await supabase
    .from('documents')
    .update({ ocr_status: 'processing' } as never)
    .eq('id', documentId)

  try {
    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path)

    if (downloadError || !fileData) {
      throw new Error('Failed to download file')
    }

    // Process document (extract text, categorize)
    const result = await processDocument(fileData, document.file_type, document.file_name)

    // Update document with extracted data
    await supabase
      .from('documents')
      .update({
        extracted_text: result.text,
        document_type: result.documentType,
        document_type_confidence: result.confidence,
        metadata: result.metadata,
        ocr_status: 'complete',
      } as never)
      .eq('id', documentId)

    // Generate embeddings for RAG search
    if (result.text && result.text.length > 0) {
      await generateEmbeddings(supabase, documentId, user.id, result.text)
    }

    return NextResponse.json({
      success: true,
      extractedText: result.text?.slice(0, 500),
      documentType: result.documentType,
      confidence: result.confidence,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed'

    await supabase
      .from('documents')
      .update({
        ocr_status: 'failed',
        ocr_error: message,
      } as never)
      .eq('id', documentId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
