import { createClient } from '@/lib/supabase/server'
import { processPendingFiles, getFileStats } from '@/services/drive/indexer'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/drive/process - Process pending files (assign zones, check protection)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse options from body
    const body = await request.json().catch(() => ({}))
    const batchSize = body.batchSize || 100

    // Process pending files
    const result = await processPendingFiles(supabase, user.id, batchSize)

    // Log the processing action
    await supabase
      .from('drive_audit_log')
      .insert({
        user_id: user.id,
        action: 'PROCESS_FILES',
        action_params: {
          total: result.total,
          success: result.success,
          errors: result.errors,
        },
        triggered_by: 'user',
      } as never)

    return NextResponse.json({
      success: true,
      processed: result.total,
      indexed: result.success,
      errors: result.errors,
    })
  } catch (error) {
    console.error('Drive process error:', error)
    return NextResponse.json(
      { error: 'Failed to process files' },
      { status: 500 }
    )
  }
}

// GET /api/drive/process - Get processing stats
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stats = await getFileStats(supabase, user.id)

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Drive stats error:', error)
    return NextResponse.json(
      { error: 'Failed to get processing stats' },
      { status: 500 }
    )
  }
}
