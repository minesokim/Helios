// Project HELIOS - Entity Graph API
// Manage entities and relationships in the world-model graph

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHelios } from '@/lib/helios'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const entityTypes = searchParams.get('types')?.split(',').filter(Boolean)

    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 })
    }

    const helios = getHelios()
    const entities = await helios.searchEntities(user.id, query, entityTypes)

    return NextResponse.json({ data: entities })
  } catch (error) {
    console.error('HELIOS Entities GET error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    const helios = getHelios()

    switch (action) {
      case 'create_entity': {
        const { entityType, name, description, properties } = body
        if (!entityType?.trim() || !name?.trim()) {
          return NextResponse.json(
            { error: 'entityType and name are required' },
            { status: 400 }
          )
        }

        const entity = await helios.upsertEntity(
          user.id,
          entityType,
          name,
          description,
          properties
        )

        if (!entity) {
          return NextResponse.json({ error: 'Failed to create entity' }, { status: 500 })
        }

        return NextResponse.json({ data: entity }, { status: 201 })
      }

      case 'create_edge': {
        const { sourceEntityId, targetEntityId, relationType, confidence } = body
        if (!sourceEntityId || !targetEntityId || !relationType?.trim()) {
          return NextResponse.json(
            { error: 'sourceEntityId, targetEntityId, and relationType are required' },
            { status: 400 }
          )
        }

        const edge = await helios.createEdge(
          user.id,
          sourceEntityId,
          targetEntityId,
          relationType,
          confidence
        )

        if (!edge) {
          return NextResponse.json({ error: 'Failed to create edge' }, { status: 500 })
        }

        return NextResponse.json({ data: edge }, { status: 201 })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('HELIOS Entities POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
