import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  createProject,
  getAllProjects,
  type ProjectStatus,
} from '@/services/organization/projects'

// GET /api/projects - List all projects
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const status = searchParams.get('status') as ProjectStatus | null
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const includeStats = searchParams.get('includeStats') === 'true'

    const projects = await getAllProjects(user.id, {
      status: status || undefined,
      search: search || undefined,
      limit,
      offset,
      includeStats,
    })

    return NextResponse.json({ projects, count: projects.length })
  } catch (error) {
    console.error('[Projects] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, keywords, baseFolderPath, status, startDate, endDate, tags } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const project = await createProject(user.id, {
      name,
      description: description || null,
      keywords: keywords || [],
      base_folder_path: baseFolderPath || null,
      status: status || 'active',
      start_date: startDate || null,
      end_date: endDate || null,
      tags: tags || [],
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    console.error('[Projects] Create error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create project' },
      { status: 500 }
    )
  }
}
