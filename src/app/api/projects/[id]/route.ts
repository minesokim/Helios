import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  getProject,
  updateProject,
  deleteProject,
  getProjectFiles,
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
} from '@/services/organization/projects'

// GET /api/projects/[id] - Get a single project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const includeFiles = request.nextUrl.searchParams.get('includeFiles') === 'true'
    const includeMembers = request.nextUrl.searchParams.get('includeMembers') === 'true'

    const project = await getProject(user.id, id, includeMembers)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    let files = null
    if (includeFiles) {
      files = await getProjectFiles(user.id, id)
    }

    return NextResponse.json({ project, files })
  } catch (error) {
    console.error('[Projects] Get error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch project' },
      { status: 500 }
    )
  }
}

// PATCH /api/projects/[id] - Update a project
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // Convert camelCase to snake_case for database
    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.keywords !== undefined) updates.keywords = body.keywords
    if (body.baseFolderPath !== undefined) updates.base_folder_path = body.baseFolderPath
    if (body.status !== undefined) updates.status = body.status
    if (body.startDate !== undefined) updates.start_date = body.startDate
    if (body.endDate !== undefined) updates.end_date = body.endDate
    if (body.tags !== undefined) updates.tags = body.tags
    if (body.autoOrganize !== undefined) updates.auto_organize = body.autoOrganize

    const project = await updateProject(user.id, id, updates)

    return NextResponse.json({ project })
  } catch (error) {
    console.error('[Projects] Update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update project' },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id] - Delete a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    await deleteProject(user.id, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Projects] Delete error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete project' },
      { status: 500 }
    )
  }
}
