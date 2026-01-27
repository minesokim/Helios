import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  createPerson,
  getAllPeople,
  searchPeople,
} from '@/services/organization/people'

// GET /api/people - List all people or search
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const relationship = searchParams.get('relationship') as 'client' | 'vendor' | 'collaborator' | 'personal' | 'contact' | null
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const includeStats = searchParams.get('includeStats') === 'true'

    // If search query, use search function
    if (search && search.length > 0) {
      const results = await searchPeople(user.id, search, limit)
      return NextResponse.json({ people: results, count: results.length })
    }

    // Otherwise list all
    const people = await getAllPeople(user.id, {
      relationship: relationship || undefined,
      limit,
      offset,
      includeStats,
    })

    return NextResponse.json({ people, count: people.length })
  } catch (error) {
    console.error('[People] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch people' },
      { status: 500 }
    )
  }
}

// POST /api/people - Create a new person
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, email, phone, company, relationship, notes, tags } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const person = await createPerson(user.id, {
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      relationship: relationship || 'contact',
      notes: notes || null,
      tags: tags || [],
    })

    return NextResponse.json({ person }, { status: 201 })
  } catch (error) {
    console.error('[People] Create error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create person' },
      { status: 500 }
    )
  }
}
