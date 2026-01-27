-- Migration: Conversation Embeddings
-- Enables semantic search over AI conversation history

-- Create conversation embeddings table
create table if not exists public.conversation_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid,

  -- The text that was embedded
  chunk_text text not null,
  chunk_index int default 0,

  -- Embedding vector (1536 dims for text-embedding-3-small)
  embedding vector(1536) not null,

  -- Metadata for filtering/display
  role text, -- 'user' or 'assistant'
  created_at timestamptz default now()
);

-- Indexes for efficient querying
create index if not exists idx_conv_embeddings_user
  on conversation_embeddings(user_id);

create index if not exists idx_conv_embeddings_conversation
  on conversation_embeddings(conversation_id);

-- Vector similarity index (IVFFLAT for speed)
create index if not exists idx_conv_embeddings_vector
  on conversation_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RLS policies
alter table conversation_embeddings enable row level security;

create policy "Users can view own conversation embeddings"
  on conversation_embeddings for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversation embeddings"
  on conversation_embeddings for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own conversation embeddings"
  on conversation_embeddings for delete
  using (auth.uid() = user_id);

-- Search function for conversation embeddings
create or replace function search_conversations(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 10,
  p_user_id uuid default null
)
returns table (
  conversation_id uuid,
  chunk_text text,
  role text,
  similarity float,
  created_at timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    ce.conversation_id,
    ce.chunk_text,
    ce.role,
    1 - (ce.embedding <=> query_embedding) as similarity,
    ce.created_at
  from conversation_embeddings ce
  where
    ce.user_id = p_user_id
    and 1 - (ce.embedding <=> query_embedding) > match_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Grant permissions
grant execute on function search_conversations to authenticated;
