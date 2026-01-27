-- JIM AI - CONVERSATION & MEMORY SYSTEM
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/niikfrlcdlsfsbozxsjv/sql/new

-- ============================================
-- CONVERSATIONS
-- ============================================
create table if not exists public.ai_conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index if not exists ai_conversations_user_idx on public.ai_conversations(user_id, updated_at desc);

-- RLS
alter table public.ai_conversations enable row level security;
drop policy if exists "Users can manage own conversations" on public.ai_conversations;
create policy "Users can manage own conversations" on public.ai_conversations for all using (auth.uid() = user_id);

-- ============================================
-- MESSAGES
-- ============================================
create table if not exists public.ai_messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.ai_conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now() not null,
  input_source text default 'typed' check (input_source in ('typed', 'voice'))
);

-- Indexes
create index if not exists ai_messages_conversation_idx on public.ai_messages(conversation_id, created_at);
create index if not exists ai_messages_user_idx on public.ai_messages(user_id, created_at desc);
create index if not exists ai_messages_input_source_idx on public.ai_messages(input_source);

-- RLS
alter table public.ai_messages enable row level security;
drop policy if exists "Users can manage own messages" on public.ai_messages;
create policy "Users can manage own messages" on public.ai_messages for all using (auth.uid() = user_id);

-- ============================================
-- USER MEMORIES
-- ============================================
create table if not exists public.ai_memories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  category text not null check (category in ('personal', 'preferences', 'work', 'communication', 'briefing', 'goals')),
  content text not null,
  importance integer default 5 check (importance >= 1 and importance <= 10),
  access_count integer default 0,
  last_accessed timestamptz,
  source_conversation uuid references public.ai_conversations(id) on delete set null,
  created_at timestamptz default now() not null
);

-- Indexes
create index if not exists ai_memories_user_category_idx on public.ai_memories(user_id, category);
create index if not exists ai_memories_user_importance_idx on public.ai_memories(user_id, importance desc);

-- RLS
alter table public.ai_memories enable row level security;
drop policy if exists "Users can manage own memories" on public.ai_memories;
create policy "Users can manage own memories" on public.ai_memories for all using (auth.uid() = user_id);

-- ============================================
-- BRIEFING PREFERENCES
-- ============================================
create table if not exists public.ai_briefing_prefs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  topic text not null,
  enabled boolean default true,
  priority integer default 5 check (priority >= 1 and priority <= 10),
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id, topic)
);

-- Indexes
create index if not exists ai_briefing_prefs_user_idx on public.ai_briefing_prefs(user_id, priority desc);

-- RLS
alter table public.ai_briefing_prefs enable row level security;
drop policy if exists "Users can manage own briefing prefs" on public.ai_briefing_prefs;
create policy "Users can manage own briefing prefs" on public.ai_briefing_prefs for all using (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================
create or replace function get_user_memories_formatted(p_user_id uuid)
returns text language plpgsql security definer as $$
declare
  result text := '';
  category_memories record;
begin
  for category_memories in (
    select category, array_agg(content order by importance desc, created_at desc) as memories
    from public.ai_memories
    where user_id = p_user_id
    group by category
  ) loop
    result := result || E'\n### ' || category_memories.category || E':\n';
    for i in 1..array_length(category_memories.memories, 1) loop
      result := result || '- ' || category_memories.memories[i] || E'\n';
    end loop;
  end loop;

  if result != '' then
    result := E'\n\n## What you know about the user:' || result;
  end if;

  return result;
end;
$$;

create or replace function get_briefing_topics(p_user_id uuid)
returns text[] language plpgsql security definer as $$
begin
  return array(
    select topic
    from public.ai_briefing_prefs
    where user_id = p_user_id and enabled = true
    order by priority desc
  );
end;
$$;
