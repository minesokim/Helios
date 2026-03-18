// Project HELIOS - Memory CRUD API
// GET: Browse/search memories, POST: Ingest new memory, DELETE: Remove memory

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHelios } from '@/lib/helios'
import type { MemoryClass, MemoryStatus, BundleTurnType } from '@/lib/helios'

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
    const action = searchParams.get('action') || 'browse'

    const helios = getHelios()

    switch (action) {
      case 'browse': {
        const page = parseInt(searchParams.get('page') || '1')
        const pageSize = parseInt(searchParams.get('pageSize') || '50')
        const memoryClass = searchParams.get('memoryClass') as MemoryClass | null
        const status = searchParams.get('status') as MemoryStatus | null

        const result = await helios.browseMemories(user.id, {
          page,
          pageSize,
          memoryClass: memoryClass || undefined,
          status: status || undefined,
        })

        return NextResponse.json(result)
      }

      case 'search': {
        const query = searchParams.get('q')
        if (!query) {
          return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 })
        }

        const turnType = (searchParams.get('turnType') as BundleTurnType) || 'answering'
        const bundle = await helios.getMemoryBundle(user.id, query, turnType)

        return NextResponse.json({
          memories: bundle.retrieved_memories.map((c) => ({
            ...c.memory,
            channel: c.channel,
            score: c.composite_score,
          })),
          pinned_blocks: bundle.pinned_blocks,
          assembled_text: bundle.assembled_text,
          total_tokens: bundle.total_token_estimate,
        })
      }

      case 'get': {
        const memoryId = searchParams.get('id')
        if (!memoryId) {
          return NextResponse.json({ error: 'Memory ID required' }, { status: 400 })
        }

        const memory = await helios.getMemory(memoryId)
        if (!memory || memory.user_id !== user.id) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        return NextResponse.json({ data: memory })
      }

      case 'history': {
        const memoryId = searchParams.get('memoryId') || undefined
        const limit = parseInt(searchParams.get('limit') || '50')
        const history = await helios.getMutationHistory(user.id, memoryId, limit)
        return NextResponse.json({ data: history })
      }

      case 'count': {
        const count = await helios.getMemoryCount(user.id)
        return NextResponse.json({ count })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('HELIOS API GET error:', error)
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
      case 'process_message': {
        const { message, conversationId, sessionId, recentContext } = body
        if (!message?.trim()) {
          return NextResponse.json({ error: 'Message is required' }, { status: 400 })
        }

        const result = await helios.processMessage(user.id, message, {
          conversationId,
          sessionId,
          recentContext,
        })

        return NextResponse.json({
          event_id: result.event?.id || null,
          memory_id: result.memory?.id || null,
          write_action: result.decision?.action || null,
          salience_score: result.salience?.salience_score || null,
        })
      }

      case 'process_turn': {
        const { userMessage, assistantResponse, conversationId, sessionId, recentContext } = body
        if (!userMessage?.trim() || !assistantResponse?.trim()) {
          return NextResponse.json(
            { error: 'Both userMessage and assistantResponse are required' },
            { status: 400 }
          )
        }

        const result = await helios.processConversationTurn(
          user.id,
          userMessage,
          assistantResponse,
          { conversationId, sessionId, recentContext }
        )

        return NextResponse.json({
          user: {
            memory_id: result.userResult.memory?.id || null,
            action: result.userResult.decision?.action || null,
          },
          assistant: {
            memory_id: result.assistantResult.memory?.id || null,
            action: result.assistantResult.decision?.action || null,
          },
        })
      }

      case 'ingest_external': {
        const { sourceSystem, content, metadata } = body
        if (!sourceSystem?.trim() || !content?.trim()) {
          return NextResponse.json(
            { error: 'sourceSystem and content are required' },
            { status: 400 }
          )
        }

        const result = await helios.ingestExternalData(user.id, sourceSystem, content, metadata)

        return NextResponse.json({
          memory_id: result.memory?.id || null,
          action: result.decision?.action || null,
        })
      }

      case 'process_backlog': {
        const limit = body.limit || 50
        const result = await helios.processBacklog(user.id, limit)
        return NextResponse.json(result)
      }

      case 'adjust': {
        const { memoryId, confidence, importance } = body
        if (!memoryId) {
          return NextResponse.json({ error: 'memoryId is required' }, { status: 400 })
        }

        const updated = await helios.adjustMemory(user.id, memoryId, {
          confidence,
          importance,
        })

        if (!updated) {
          return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
        }

        return NextResponse.json({ data: updated })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('HELIOS API POST error:', error)
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
    const memoryId = searchParams.get('id')

    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID required' }, { status: 400 })
    }

    const helios = getHelios()
    const success = await helios.deleteMemory(user.id, memoryId)

    if (!success) {
      return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('HELIOS API DELETE error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
