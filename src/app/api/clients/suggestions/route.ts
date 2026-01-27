/**
 * Client Suggestions API
 *
 * GET - List pending suggestions
 * PATCH - Approve or reject a suggestion
 * DELETE - Remove a suggestion
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  getPendingSuggestions,
  approveSuggestion,
  rejectSuggestion,
  mergeSuggestion,
} from '@/services/clients/suggestion-detector'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const suggestions = await getPendingSuggestions(user.id)

    return NextResponse.json({
      suggestions,
      count: suggestions.length,
    })
  } catch (error) {
    console.error('Get suggestions error:', error)
    return NextResponse.json(
      { error: 'Failed to get suggestions' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { suggestionId, action, overrides, targetClientId } = body

    if (!suggestionId || !action) {
      return NextResponse.json(
        { error: 'Missing suggestionId or action' },
        { status: 400 }
      )
    }

    switch (action) {
      case 'approve': {
        const result = await approveSuggestion(user.id, suggestionId, overrides)
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 400 })
        }
        return NextResponse.json({
          success: true,
          client: result.client,
        })
      }

      case 'reject': {
        const result = await rejectSuggestion(user.id, suggestionId)
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }

      case 'merge': {
        if (!targetClientId) {
          return NextResponse.json(
            { error: 'Missing targetClientId for merge' },
            { status: 400 }
          )
        }
        const result = await mergeSuggestion(user.id, suggestionId, targetClientId)
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 400 })
        }
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: approve, reject, or merge' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Update suggestion error:', error)
    return NextResponse.json(
      { error: 'Failed to update suggestion' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const suggestionId = searchParams.get('id')

    if (!suggestionId) {
      return NextResponse.json(
        { error: 'Missing suggestion ID' },
        { status: 400 }
      )
    }

    // Permanently delete the suggestion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('client_suggestions')
      .delete()
      .eq('id', suggestionId)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete suggestion error:', error)
    return NextResponse.json(
      { error: 'Failed to delete suggestion' },
      { status: 500 }
    )
  }
}
