/**
 * Import Claude chat history into Jorkel's database
 * Run with: npx tsx scripts/import-claude-history.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Load env vars
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface ClaudeMessage {
  uuid: string
  text: string
  content: Array<{ type: string; text?: string }>
  sender: 'human' | 'assistant'
  created_at: string
  updated_at: string
  attachments: unknown[]
  files: unknown[]
}

interface ClaudeConversation {
  uuid: string
  name: string
  summary: string
  created_at: string
  updated_at: string
  account: { uuid: string }
  chat_messages: ClaudeMessage[]
}

async function importClaudeHistory() {
  const dataDir = path.join(process.cwd(), 'data-2026-01-20-11-33-27-batch-0000')
  const conversationsPath = path.join(dataDir, 'conversations.json')

  if (!fs.existsSync(conversationsPath)) {
    console.error('conversations.json not found at:', conversationsPath)
    process.exit(1)
  }

  console.log('Loading conversations from:', conversationsPath)
  const conversations: ClaudeConversation[] = JSON.parse(
    fs.readFileSync(conversationsPath, 'utf-8')
  )

  console.log(`Found ${conversations.length} conversations`)

  // Get the user ID (David's account)
  const { data: users, error: userError } = await supabase
    .from('profiles')
    .select('id')
    .limit(1)

  if (userError || !users || users.length === 0) {
    console.error('Could not find user profile:', userError)
    process.exit(1)
  }

  const userId = users[0].id
  console.log('Importing for user:', userId)

  let importedConvs = 0
  let importedMsgs = 0
  let skippedConvs = 0

  for (const conv of conversations) {
    // Skip conversations with no messages
    if (!conv.chat_messages || conv.chat_messages.length === 0) {
      skippedConvs++
      continue
    }

    // Create conversation
    const { data: newConv, error: convError } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: userId,
        title: conv.name || conv.summary?.substring(0, 50) || 'Imported conversation',
        created_at: conv.created_at,
        updated_at: conv.updated_at,
      })
      .select('id')
      .single()

    if (convError) {
      console.error('Error creating conversation:', convError)
      continue
    }

    // Import messages
    const messages = conv.chat_messages.map((msg) => {
      // Extract text content
      let content = msg.text || ''
      if (!content && msg.content) {
        content = msg.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('\n')
      }

      return {
        conversation_id: newConv.id,
        user_id: userId,
        role: msg.sender === 'human' ? 'user' : 'assistant',
        content: content,
        created_at: msg.created_at,
        input_source: 'typed',
      }
    }).filter((m) => m.content.trim()) // Skip empty messages

    if (messages.length > 0) {
      const { error: msgError } = await supabase
        .from('ai_messages')
        .insert(messages)

      if (msgError) {
        console.error('Error inserting messages:', msgError)
      } else {
        importedMsgs += messages.length
      }
    }

    importedConvs++

    // Progress indicator
    if (importedConvs % 10 === 0) {
      console.log(`Progress: ${importedConvs}/${conversations.length} conversations`)
    }
  }

  console.log('\n--- Import Complete ---')
  console.log(`Imported: ${importedConvs} conversations, ${importedMsgs} messages`)
  console.log(`Skipped: ${skippedConvs} empty conversations`)
}

importClaudeHistory().catch(console.error)
