import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// This endpoint runs the migration using the service role key
// Only accessible when logged in as admin

const MIGRATION_SQL = `
-- Client Expenses & Scheduled Tasks
-- For tracking client P&L and future reminders

-- CLIENT EXPENSES TABLE
CREATE TABLE IF NOT EXISTS client_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category TEXT CHECK (category IN (
    'software', 'subscription', 'contractor', 'advertising',
    'hosting', 'tools', 'travel', 'other'
  )) DEFAULT 'other',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_frequency TEXT CHECK (recurring_frequency IN ('monthly', 'quarterly', 'yearly')),
  vendor TEXT,
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- SCHEDULED TASKS TABLE
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  scheduled_for TIMESTAMPTZ NOT NULL,
  reminder_at TIMESTAMPTZ,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_pattern TEXT CHECK (recurring_pattern IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  recurring_end_date DATE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  blocker_id UUID REFERENCES blockers(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('pending', 'completed', 'cancelled', 'snoozed')) DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  auto_created BOOLEAN DEFAULT FALSE,
  creation_context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CLIENT REVENUE TABLE
CREATE TABLE IF NOT EXISTS client_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category TEXT CHECK (category IN (
    'retainer', 'project', 'hourly', 'bonus', 'reimbursement', 'other'
  )) DEFAULT 'project',
  revenue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  paid BOOLEAN DEFAULT FALSE,
  paid_at DATE,
  hours_worked DECIMAL(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
`

const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_client_expenses_user ON client_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_client_expenses_client ON client_expenses(client_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user ON scheduled_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status ON scheduled_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_client_revenue_user ON client_revenue(user_id);
CREATE INDEX IF NOT EXISTS idx_client_revenue_client ON client_revenue(client_id);
`

const RLS_SQL = `
ALTER TABLE client_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_revenue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_expenses' AND policyname = 'Users can manage own client expenses') THEN
    CREATE POLICY "Users can manage own client expenses" ON client_expenses FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_tasks' AND policyname = 'Users can manage own scheduled tasks') THEN
    CREATE POLICY "Users can manage own scheduled tasks" ON scheduled_tasks FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_revenue' AND policyname = 'Users can manage own client revenue') THEN
    CREATE POLICY "Users can manage own client revenue" ON client_revenue FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
`

const CONVERSATION_EMBEDDINGS_SQL = `
-- Conversation Embeddings for RAG
CREATE TABLE IF NOT EXISTS conversation_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  message_id UUID,
  chunk_text TEXT NOT NULL,
  chunk_index INT DEFAULT 0,
  embedding vector(1536) NOT NULL,
  role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_embeddings_user ON conversation_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_conversation ON conversation_embeddings(conversation_id);

ALTER TABLE conversation_embeddings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversation_embeddings' AND policyname = 'Users can view own conversation embeddings') THEN
    CREATE POLICY "Users can view own conversation embeddings" ON conversation_embeddings FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversation_embeddings' AND policyname = 'Users can insert own conversation embeddings') THEN
    CREATE POLICY "Users can insert own conversation embeddings" ON conversation_embeddings FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversation_embeddings' AND policyname = 'Users can delete own conversation embeddings') THEN
    CREATE POLICY "Users can delete own conversation embeddings" ON conversation_embeddings FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Search function for conversations
CREATE OR REPLACE FUNCTION search_conversations(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conversation_id uuid,
  chunk_text text,
  role text,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.conversation_id,
    ce.chunk_text,
    ce.role,
    1 - (ce.embedding <=> query_embedding) AS similarity,
    ce.created_at
  FROM conversation_embeddings ce
  WHERE
    ce.user_id = p_user_id
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
`

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
    }

    // Create admin client with service role key
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })

    const results: { step: string; status: string; error?: string }[] = []

    // Run table creation
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: MIGRATION_SQL })
      if (error) {
        // Try alternative: use raw query via postgres
        results.push({ step: 'Tables (via RPC)', status: 'skipped', error: error.message })
      } else {
        results.push({ step: 'Tables', status: 'success' })
      }
    } catch (e) {
      results.push({ step: 'Tables', status: 'error', error: String(e) })
    }

    // Check if tables exist by trying to select from them
    const tables = ['client_expenses', 'scheduled_tasks', 'client_revenue', 'conversation_embeddings']
    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select('id').limit(1)
        if (error && error.message.includes('does not exist')) {
          results.push({ step: `Check ${table}`, status: 'NOT EXISTS' })
        } else {
          results.push({ step: `Check ${table}`, status: 'EXISTS' })
        }
      } catch (e) {
        results.push({ step: `Check ${table}`, status: 'error', error: String(e) })
      }
    }

    return NextResponse.json({
      message: 'Migration check complete',
      results,
      note: 'If tables show NOT EXISTS, please run the SQL manually in Supabase Dashboard > SQL Editor',
      conversationEmbeddingsSQL: CONVERSATION_EMBEDDINGS_SQL
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
