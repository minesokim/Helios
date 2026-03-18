// Project HELIOS - Pinned Blocks API
// Manage always-in-context memory blocks (identity, goals, preferences, etc.)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHelios } from '@/lib/helios'
import type { BlockType } from '@/lib/helios'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const helios = getHelios()
    const blocks = await helios.getPinnedBlocks(user.id)

    return NextResponse.json({ data: blocks })
  } catch (error) {
    console.error('HELIOS Blocks GET error:', error)
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
    const { blockType, label, content, priority } = body

    if (!blockType?.trim() || !label?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: 'blockType, label, and content are required' },
        { status: 400 }
      )
    }

    const helios = getHelios()
    const block = await helios.setPinnedBlock(
      user.id,
      blockType as BlockType,
      label,
      content,
      priority
    )

    if (!block) {
      return NextResponse.json({ error: 'Failed to create block' }, { status: 500 })
    }

    return NextResponse.json({ data: block }, { status: 201 })
  } catch (error) {
    console.error('HELIOS Blocks POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
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
    const blockId = searchParams.get('id')

    if (!blockId) {
      return NextResponse.json({ error: 'Block ID required' }, { status: 400 })
    }

    const helios = getHelios()
    const success = await helios.removePinnedBlock(user.id, blockId)

    if (!success) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('HELIOS Blocks DELETE error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
