import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  getPerson,
  updatePerson,
  deletePerson,
  getPersonFiles,
} from '@/services/organization/people'

// GET /api/people/[id] - Get a single person
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

    const person = await getPerson(user.id, id)

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    let files = null
    if (includeFiles) {
      files = await getPersonFiles(user.id, id)
    }

    return NextResponse.json({ person, files })
  } catch (error) {
    console.error('[People] Get error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch person' },
      { status: 500 }
    )
  }
}

// PATCH /api/people/[id] - Update a person
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

    const person = await updatePerson(user.id, id, body)

    return NextResponse.json({ person })
  } catch (error) {
    console.error('[People] Update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update person' },
      { status: 500 }
    )
  }
}

// DELETE /api/people/[id] - Delete a person
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

    await deletePerson(user.id, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[People] Delete error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete person' },
      { status: 500 }
    )
  }
}
