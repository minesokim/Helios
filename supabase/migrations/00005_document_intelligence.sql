-- JIM AI - DOCUMENT INTELLIGENCE MODULE
-- Supabase Migration: Document Intelligence Schema
-- This module provides intelligence layer on top of Google Drive

-- ============================================
-- DRIVE FILES (indexed files from Google Drive)
-- ============================================
create table public.drive_files (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Google Drive identifiers
  drive_file_id text not null,
  drive_parent_folder_id text,

  -- File info
  name text not null,
  original_name text,
  mime_type text,
  extension text,
  size_bytes bigint,

  -- Timestamps from Drive
  drive_created_time timestamptz,
  drive_modified_time timestamptz,

  -- Our processing timestamps
  indexed_at timestamptz default now(),
  last_processed_at timestamptz,

  -- Location
  full_path text,
  zone text,

  -- Content (extracted text, summaries)
  extracted_text text,
  text_preview text,
  content_hash text,

  -- AI Analysis
  document_type text,
  confidence_score float,
  entities jsonb default '{}',
  summary text,
  suggested_name text,
  suggested_folder text,

  -- Status flags
  is_protected boolean default false,
  is_duplicate boolean default false,
  duplicate_of uuid references public.drive_files(id),

  -- Processing status
  processing_status text default 'pending',
  processing_error text,

  -- Actions
  pending_actions jsonb default '[]',
  action_history jsonb default '[]',

  -- Vector reference
  vector_id text,

  -- Meta
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  -- Unique constraint per user and drive file
  unique(user_id, drive_file_id)
);

-- Indexes
create index idx_drive_files_user on public.drive_files(user_id);
create index idx_drive_files_drive_id on public.drive_files(drive_file_id);
create index idx_drive_files_zone on public.drive_files(zone);
create index idx_drive_files_status on public.drive_files(processing_status);
create index idx_drive_files_path on public.drive_files(full_path);
create index idx_drive_files_hash on public.drive_files(content_hash);
create index idx_drive_files_type on public.drive_files(document_type);

-- RLS
alter table public.drive_files enable row level security;
create policy "Users manage own drive files" on public.drive_files
  for all using (auth.uid() = user_id);

-- ============================================
-- DRIVE FILE EMBEDDINGS (for semantic search)
-- ============================================
create table public.drive_file_embeddings (
  id uuid default uuid_generate_v4() primary key,
  drive_file_id uuid references public.drive_files(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Chunk info
  chunk_index int not null,
  chunk_text text not null,

  -- Embedding vector (1536 dimensions for OpenAI)
  embedding vector(1536),

  -- Meta
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_drive_embeddings_file on public.drive_file_embeddings(drive_file_id);
create index idx_drive_embeddings_user on public.drive_file_embeddings(user_id);
create index idx_drive_embeddings_vector on public.drive_file_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS
alter table public.drive_file_embeddings enable row level security;
create policy "Users search own drive embeddings" on public.drive_file_embeddings
  for select using (auth.uid() = user_id);

-- ============================================
-- ZONES (organization zones)
-- ============================================
create table public.zones (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade,

  -- Zone info
  name text not null,
  display_name text,
  icon text,
  color text,

  -- Behavior settings
  apply_naming_convention boolean default false,
  auto_organize text default 'NO',
  duplicate_merge text default 'ALERT_ONLY',
  confidence_threshold_auto float default 0.95,
  confidence_threshold_suggest float default 0.80,

  -- Meta
  is_system boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  unique(user_id, name)
);

-- RLS
alter table public.zones enable row level security;
create policy "Users see own and system zones" on public.zones
  for select using (user_id is null or auth.uid() = user_id);
create policy "Users manage own zones" on public.zones
  for all using (auth.uid() = user_id);

-- ============================================
-- ZONE FOLDER MAPPINGS
-- ============================================
create table public.zone_folder_mappings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  zone_id uuid references public.zones(id) on delete cascade not null,

  -- Folder info
  folder_path text not null,
  folder_drive_id text,
  is_recursive boolean default true,
  priority int default 0,

  -- Meta
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_zone_mappings_user on public.zone_folder_mappings(user_id);
create index idx_zone_mappings_zone on public.zone_folder_mappings(zone_id);

-- RLS
alter table public.zone_folder_mappings enable row level security;
create policy "Users manage own zone mappings" on public.zone_folder_mappings
  for all using (auth.uid() = user_id);

-- ============================================
-- GMAIL FILTER RULES
-- ============================================
create table public.gmail_filter_rules (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Rule definition
  rule_type text not null,
  match_type text not null,
  match_value text not null,
  action text default 'ASK',

  -- Destination (for IMPORT action)
  destination_zone text,
  destination_folder text,

  -- Priority and status
  priority int default 0,
  is_active boolean default true,

  -- Meta
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index idx_gmail_rules_user on public.gmail_filter_rules(user_id);
create index idx_gmail_rules_priority on public.gmail_filter_rules(priority desc);

-- RLS
alter table public.gmail_filter_rules enable row level security;
create policy "Users manage own gmail rules" on public.gmail_filter_rules
  for all using (auth.uid() = user_id);

-- ============================================
-- PENDING ACTIONS
-- ============================================
create table public.drive_pending_actions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  drive_file_id uuid references public.drive_files(id) on delete cascade not null,

  -- Action details
  action_type text not null,
  action_params jsonb not null default '{}',
  confidence float,

  -- Status
  status text default 'pending',
  requires_approval boolean default true,
  auto_revert_at timestamptz,

  -- Resolution
  resolved_at timestamptz,
  resolved_by text,

  -- Meta
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_pending_actions_user on public.drive_pending_actions(user_id);
create index idx_pending_actions_file on public.drive_pending_actions(drive_file_id);
create index idx_pending_actions_status on public.drive_pending_actions(status);

-- RLS
alter table public.drive_pending_actions enable row level security;
create policy "Users manage own pending actions" on public.drive_pending_actions
  for all using (auth.uid() = user_id);

-- ============================================
-- AUDIT LOG
-- ============================================
create table public.drive_audit_log (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  drive_file_id uuid references public.drive_files(id) on delete set null,

  -- Action details
  action text not null,
  action_params jsonb,
  before_state jsonb,
  after_state jsonb,
  confidence float,

  -- Source
  triggered_by text,

  -- Meta
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_audit_user on public.drive_audit_log(user_id);
create index idx_audit_file on public.drive_audit_log(drive_file_id);
create index idx_audit_time on public.drive_audit_log(created_at desc);
create index idx_audit_action on public.drive_audit_log(action);

-- RLS
alter table public.drive_audit_log enable row level security;
create policy "Users view own audit log" on public.drive_audit_log
  for select using (auth.uid() = user_id);

-- ============================================
-- GOOGLE OAUTH TOKENS
-- ============================================
create table public.google_oauth_tokens (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,

  -- Tokens (encrypted in practice)
  access_token text not null,
  refresh_token text not null,
  token_type text default 'Bearer',

  -- Expiration
  expires_at timestamptz not null,

  -- Scopes granted
  scopes text[] not null,

  -- Meta
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS
alter table public.google_oauth_tokens enable row level security;
create policy "Users manage own oauth tokens" on public.google_oauth_tokens
  for all using (auth.uid() = user_id);

-- ============================================
-- USER PREFERENCES (document intelligence specific)
-- ============================================
create table public.drive_user_preferences (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,

  -- Sync settings
  auto_sync_enabled boolean default true,
  sync_interval_minutes int default 30,
  last_full_sync_at timestamptz,

  -- Notification preferences
  notify_on_auto_action boolean default true,
  notify_on_duplicates boolean default true,
  notify_on_suggestions boolean default true,

  -- Default behaviors
  default_confidence_threshold float default 0.85,

  -- Meta
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS
alter table public.drive_user_preferences enable row level security;
create policy "Users manage own drive preferences" on public.drive_user_preferences
  for all using (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamps
create trigger update_drive_files_updated_at
  before update on public.drive_files
  for each row execute function update_updated_at();

create trigger update_zones_updated_at
  before update on public.zones
  for each row execute function update_updated_at();

create trigger update_gmail_rules_updated_at
  before update on public.gmail_filter_rules
  for each row execute function update_updated_at();

create trigger update_google_oauth_updated_at
  before update on public.google_oauth_tokens
  for each row execute function update_updated_at();

create trigger update_drive_prefs_updated_at
  before update on public.drive_user_preferences
  for each row execute function update_updated_at();

-- ============================================
-- FUNCTIONS
-- ============================================

-- Search drive files by vector similarity
create or replace function search_drive_files(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 10,
  p_user_id uuid default auth.uid()
)
returns table (
  drive_file_id uuid,
  chunk_text text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    dfe.drive_file_id,
    dfe.chunk_text,
    1 - (dfe.embedding <=> query_embedding) as similarity
  from drive_file_embeddings dfe
  where dfe.user_id = p_user_id
    and 1 - (dfe.embedding <=> query_embedding) > match_threshold
  order by dfe.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ============================================
-- SEED DEFAULT ZONES
-- ============================================
insert into public.zones (name, display_name, icon, color, apply_naming_convention, auto_organize, duplicate_merge, is_system) values
  ('CLIENTS', 'Clients', 'Users', '#6366f1', true, 'YES', 'YES_WITH_APPROVAL', true),
  ('BUSINESS', 'Business', 'Briefcase', '#22c55e', true, 'YES', 'YES_WITH_APPROVAL', true),
  ('PROJECTS', 'Projects', 'Rocket', '#f59e0b', true, 'YES', 'YES_WITH_APPROVAL', true),
  ('CODE', 'Code', 'Code', '#ef4444', false, 'NO', 'ALERT_ONLY', true),
  ('CONFIG', 'Config', 'Settings', '#64748b', false, 'NO', 'NO', true),
  ('PERSONAL', 'Personal', 'User', '#8b5cf6', false, 'NO', 'ALERT_ONLY', true),
  ('UNSORTED', 'Unsorted', 'Inbox', '#f97316', false, 'SUGGEST_ONLY', 'YES_WITH_APPROVAL', true);
