-- ============================================
-- CLIENT SUGGESTIONS (AI-detected potential clients)
-- ============================================

create table public.client_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Suggested client info
  suggested_name text not null,
  suggested_company text,
  suggested_email text,
  suggested_type text default 'unknown', -- 'company', 'individual', 'unknown'

  -- Detection metadata
  source text not null, -- 'email', 'document', 'invoice', 'conversation', 'calendar'
  source_id text, -- email thread ID, doc ID, etc.
  confidence numeric(3,2) default 0.5, -- 0.0 to 1.0
  evidence jsonb, -- { emails: [...], documents: [...], mentions: [...] }

  -- Status
  status text default 'pending', -- 'pending', 'approved', 'rejected', 'merged'
  reviewed_at timestamptz,
  merged_into_client_id uuid references public.clients(id),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(user_id, suggested_email)
);

-- Indexes
create index idx_suggestions_user_status on public.client_suggestions(user_id, status);
create index idx_suggestions_user_created on public.client_suggestions(user_id, created_at desc);

-- RLS
alter table public.client_suggestions enable row level security;
create policy "Users manage own suggestions" on public.client_suggestions for all using (auth.uid() = user_id);

-- Trigger for updated_at
create trigger update_client_suggestions_updated_at
  before update on public.client_suggestions
  for each row
  execute function update_updated_at();

-- ============================================
-- UPDATE CLIENTS TABLE
-- Add new columns for enhanced tracking
-- ============================================

-- Type of client (company or individual)
alter table public.clients add column if not exists type text default 'company';

-- Multiple email addresses support
alter table public.clients add column if not exists emails text[];

-- Source of client creation
alter table public.clients add column if not exists source text default 'manual'; -- 'manual', 'ai_suggested'

-- Add comment for documentation
comment on column public.clients.type is 'Type of client: company or individual';
comment on column public.clients.emails is 'Array of email addresses associated with this client';
comment on column public.clients.source is 'How the client was created: manual or ai_suggested';

comment on table public.client_suggestions is 'AI-detected potential clients from emails, documents, conversations, and calendar events';
