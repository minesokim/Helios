import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete Google OAuth tokens
    const { error: tokenError } = await supabase
      .from('google_oauth_tokens')
      .delete()
      .eq('user_id', user.id)

    if (tokenError) {
      console.error('Error deleting Google tokens:', tokenError)
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
    }

    // Optionally clear indexed documents from Google Drive
    const { error: docsError } = await supabase
      .from('documents')
      .delete()
      .eq('user_id', user.id)
      .eq('source', 'google_drive')

    if (docsError) {
      console.error('Error clearing Drive documents:', docsError)
      // Continue anyway, tokens are deleted
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Disconnect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
