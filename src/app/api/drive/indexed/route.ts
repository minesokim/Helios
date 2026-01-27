import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/drive/indexed - Get indexed files from database
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const zone = searchParams.get('zone')
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const accountId = searchParams.get('accountId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 5000)
    const offset = (page - 1) * limit

    // Get the primary account (first connected account) to associate legacy files
    let primaryAccountId: string | null = null
    if (accountId) {
      const { data: accounts } = await supabase
        .from('google_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)

      primaryAccountId = accounts?.[0]?.id || null
    }

    // Build query
    let query = supabase
      .from('drive_files')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('drive_modified_time', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply account filter
    // Legacy files (NULL google_account_id) are associated with the primary account
    if (accountId) {
      if (accountId === primaryAccountId) {
        // For primary account, include legacy files with NULL google_account_id
        query = query.or(`google_account_id.eq.${accountId},google_account_id.is.null`)
      } else {
        // For other accounts, only show their specific files
        query = query.eq('google_account_id', accountId)
      }
    }

    if (zone) {
      query = query.eq('zone', zone)
    }

    if (status) {
      query = query.eq('processing_status', status)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,full_path.ilike.%${search}%`)
    }

    const { data: files, error, count } = await query

    if (error) {
      console.error('Error fetching indexed files:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      files: files || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('Drive indexed files error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch indexed files' },
      { status: 500 }
    )
  }
}
