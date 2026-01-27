import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
} from '@/services/organization/projects'

// GET /api/projects/[id]/members - Get project members
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
    const members = await getProjectMembers(id)

    return NextResponse.json({ members })
  } catch (error) {
    console.error('[Projects] Members error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch members' },
      { status: 500 }
    )
  }
}

// POST /api/projects/[id]/members - Add a member
export async function POST(
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
    const { personId, role } = body

    if (!personId) {
      return NextResponse.json({ error: 'personId is required' }, { status: 400 })
    }

    await addProjectMember(user.id, id, personId, role || 'member')

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('[Projects] Add member error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add member' },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id]/members - Remove a member
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
    const body = await request.json()
    const { personId } = body

    if (!personId) {
      return NextResponse.json({ error: 'personId is required' }, { status: 400 })
    }

    await removeProjectMember(id, personId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Projects] Remove member error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove member' },
      { status: 500 }
    )
  }
}
