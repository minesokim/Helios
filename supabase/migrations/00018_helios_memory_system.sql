-- PROJECT HELIOS - MEMORY OPERATING SYSTEM
-- Six-layer memory architecture with temporal validity, contradiction tracking,
-- multi-channel retrieval, and full lifecycle management.
-- Builds on existing pgvector extension from 00001_initial_schema.sql

-- ============================================
-- HELIOS: INTERACTION EVENTS
-- Normalized record of every meaningful agent-user-tool exchange
-- ============================================
create table public.helios_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Event classification
  event_type text not null check (event_type in (
    'user_message', 'assistant_message', 'tool_call', 'tool_result',
    'system_event', 'external_data', 'user_action', 'feedback'
  )),

  -- Content
  content text not null,
  content_hash text not null, -- SHA-256 for dedup
  metadata jsonb default '{}' not null,

  -- Source tracking
  conversation_id uuid,
  session_id text,
  source_system text default 'chat', -- chat, voice, calendar, banking, drive, email

  -- Salience (computed at ingestion)
  salience_score float default 0.0 check (salience_score >= 0.0 and salience_score <= 1.0),
  novelty_score float default 0.0 check (novelty_score >= 0.0 and novelty_score <= 1.0),

  -- Processing state
  processed boolean default false,
  processed_at timestamptz,

  created_at timestamptz default now() not null
);

create index idx_helios_events_user_created on public.helios_events(user_id, created_at desc);
create index idx_helios_events_user_unprocessed on public.helios_events(user_id, processed) where processed = false;
create index idx_helios_events_conversation on public.helios_events(conversation_id) where conversation_id is not null;
create index idx_helios_events_content_hash on public.helios_events(content_hash);
create index idx_helios_events_session on public.helios_events(user_id, session_id) where session_id is not null;

alter table public.helios_events enable row level security;
create policy "Users can manage own events" on public.helios_events for all using (auth.uid() = user_id);

-- ============================================
-- HELIOS: CORE MEMORY TABLE
-- Canonical memory object with full lifecycle metadata
-- ============================================
create table public.helios_memories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Memory classification
  memory_class text not null check (memory_class in (
    'working', 'episodic', 'semantic', 'procedural', 'self_model', 'world_fact'
  )),

  -- Structured content
  subject text not null,         -- Entity or topic the memory is about
  predicate text not null,       -- Relation type or claim type
  object jsonb not null,         -- Structured payload or value
  content_text text not null,    -- Human-readable rendering for search

  -- Provenance
  source_event_ids uuid[] default '{}',
  source_description text,

  -- Temporal validity
  observed_at timestamptz not null default now(),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,          -- NULL means currently valid

  -- Scoring
  confidence float not null default 0.5 check (confidence >= 0.0 and confidence <= 1.0),
  importance float not null default 0.5 check (importance >= 0.0 and importance <= 1.0),
  recency_score float not null default 1.0 check (recency_score >= 0.0 and recency_score <= 1.0),
  access_count integer default 0,
  last_accessed_at timestamptz,

  -- Classification and safety
  sensitivity text not null default 'personal' check (sensitivity in (
    'public', 'personal', 'sensitive', 'restricted'
  )),
  scope text[] not null default '{user}' check (
    scope <@ array['user', 'session', 'task', 'team', 'world', 'agent']::text[]
  ),

  -- Lifecycle
  status text not null default 'active' check (status in (
    'active', 'superseded', 'deleted', 'decayed', 'disputed', 'archived'
  )),
  superseded_by uuid references public.helios_memories(id) on delete set null,
  decay_policy text default 'standard' check (decay_policy in (
    'none', 'standard', 'aggressive', 'session_only'
  )),

  -- Embedding (1536 dims for text-embedding-3-small)
  embedding vector(1536),

  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz -- soft delete
);

-- Primary query indexes
create index idx_helios_memories_user_class on public.helios_memories(user_id, memory_class) where deleted_at is null;
create index idx_helios_memories_user_status on public.helios_memories(user_id, status) where deleted_at is null;
create index idx_helios_memories_user_active on public.helios_memories(user_id, memory_class, importance desc)
  where status = 'active' and deleted_at is null;
create index idx_helios_memories_subject on public.helios_memories(user_id, subject) where deleted_at is null;
create index idx_helios_memories_temporal on public.helios_memories(user_id, valid_from, valid_to)
  where status = 'active' and deleted_at is null;
create index idx_helios_memories_importance on public.helios_memories(user_id, importance desc, recency_score desc)
  where status = 'active' and deleted_at is null;

-- Full-text search index
create index idx_helios_memories_fts on public.helios_memories
  using gin (to_tsvector('english', content_text))
  where status = 'active' and deleted_at is null;

-- Vector similarity index (HNSW for better recall than IVFFlat)
create index idx_helios_memories_vector on public.helios_memories
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null and status = 'active' and deleted_at is null;

alter table public.helios_memories enable row level security;
create policy "Users can manage own memories" on public.helios_memories for all using (auth.uid() = user_id);

-- ============================================
-- HELIOS: CONTRADICTION EDGES
-- Explicit links between contradicting memories
-- ============================================
create table public.helios_contradictions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  memory_a_id uuid references public.helios_memories(id) on delete cascade not null,
  memory_b_id uuid references public.helios_memories(id) on delete cascade not null,

  -- Contradiction details
  contradiction_type text not null check (contradiction_type in (
    'direct',       -- A and B directly contradict
    'temporal',     -- A was true before, B is true now
    'partial',      -- A and B partially overlap with conflict
    'implication'   -- A implies something that conflicts with B
  )),
  description text,
  resolution text check (resolution in (
    'unresolved', 'a_wins', 'b_wins', 'merged', 'both_valid_in_context'
  )) default 'unresolved',
  resolved_at timestamptz,
  confidence float default 0.5,

  created_at timestamptz default now() not null,

  -- Prevent duplicate contradiction edges
  constraint unique_contradiction unique (memory_a_id, memory_b_id),
  -- Prevent self-contradiction
  constraint no_self_contradiction check (memory_a_id != memory_b_id)
);

create index idx_helios_contradictions_user on public.helios_contradictions(user_id);
create index idx_helios_contradictions_memory_a on public.helios_contradictions(memory_a_id);
create index idx_helios_contradictions_memory_b on public.helios_contradictions(memory_b_id);
create index idx_helios_contradictions_unresolved on public.helios_contradictions(user_id, resolution)
  where resolution = 'unresolved';

alter table public.helios_contradictions enable row level security;
create policy "Users can manage own contradictions" on public.helios_contradictions for all using (auth.uid() = user_id);

-- ============================================
-- HELIOS: ENTITY GRAPH
-- Entities and relationships for world-model graph
-- ============================================
create table public.helios_entities (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Entity identity
  entity_type text not null check (entity_type in (
    'person', 'organization', 'project', 'product', 'location',
    'concept', 'event', 'tool', 'skill', 'preference', 'goal'
  )),
  canonical_name text not null,
  aliases text[] default '{}',
  description text,
  properties jsonb default '{}' not null,

  -- Embedding for entity search
  embedding vector(1536),

  -- Lifecycle
  confidence float default 0.5,
  status text default 'active' check (status in ('active', 'merged', 'deleted')),
  merged_into uuid references public.helios_entities(id) on delete set null,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,

  -- Unique entity per user per canonical name
  constraint unique_entity_per_user unique (user_id, entity_type, canonical_name)
);

create index idx_helios_entities_user_type on public.helios_entities(user_id, entity_type) where deleted_at is null;
create index idx_helios_entities_name on public.helios_entities(user_id, canonical_name) where deleted_at is null;
create index idx_helios_entities_fts on public.helios_entities
  using gin (to_tsvector('english', coalesce(canonical_name, '') || ' ' || coalesce(description, '')))
  where status = 'active' and deleted_at is null;
create index idx_helios_entities_vector on public.helios_entities
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null and status = 'active' and deleted_at is null;

alter table public.helios_entities enable row level security;
create policy "Users can manage own entities" on public.helios_entities for all using (auth.uid() = user_id);

-- ============================================
-- HELIOS: ENTITY EDGES (RELATIONSHIPS)
-- Temporal relationships between entities
-- ============================================
create table public.helios_edges (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Relationship endpoints
  source_entity_id uuid references public.helios_entities(id) on delete cascade not null,
  target_entity_id uuid references public.helios_entities(id) on delete cascade not null,

  -- Relationship metadata
  relation_type text not null, -- 'works_at', 'manages', 'depends_on', 'prefers', etc.
  properties jsonb default '{}' not null,
  weight float default 1.0 check (weight >= 0.0 and weight <= 1.0),

  -- Temporal validity
  valid_from timestamptz default now() not null,
  valid_to timestamptz, -- NULL means currently valid

  -- Provenance
  source_memory_ids uuid[] default '{}',
  confidence float default 0.5,

  -- Lifecycle
  status text default 'active' check (status in ('active', 'superseded', 'deleted')),

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  -- Prevent exact duplicate edges
  constraint unique_edge unique (source_entity_id, target_entity_id, relation_type, valid_from)
);

create index idx_helios_edges_user on public.helios_edges(user_id) where status = 'active';
create index idx_helios_edges_source on public.helios_edges(source_entity_id, relation_type) where status = 'active';
create index idx_helios_edges_target on public.helios_edges(target_entity_id, relation_type) where status = 'active';
create index idx_helios_edges_temporal on public.helios_edges(user_id, valid_from, valid_to) where status = 'active';

alter table public.helios_edges enable row level security;
create policy "Users can manage own edges" on public.helios_edges for all using (auth.uid() = user_id);

-- ============================================
-- HELIOS: PINNED MEMORY BLOCKS
-- Always-in-context memory (identity, role, critical prefs, goals)
-- ============================================
create table public.helios_pinned_blocks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Block identity
  block_type text not null check (block_type in (
    'identity', 'persona', 'user_profile', 'current_goals',
    'active_tasks', 'critical_preferences', 'constraints', 'custom'
  )),
  label text not null, -- Human-readable label
  content text not null, -- The actual content injected into context
  priority integer not null default 50 check (priority >= 0 and priority <= 100),

  -- Size management
  char_limit integer default 2000,

  -- Lifecycle
  is_active boolean default true,
  last_refreshed_at timestamptz default now(),

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  -- One block per type per user (for system blocks)
  constraint unique_system_block unique (user_id, block_type)
    -- custom blocks can have multiple
);

create index idx_helios_pinned_user_active on public.helios_pinned_blocks(user_id, priority desc) where is_active = true;

alter table public.helios_pinned_blocks enable row level security;
create policy "Users can manage own pinned blocks" on public.helios_pinned_blocks for all using (auth.uid() = user_id);

-- ============================================
-- HELIOS: MEMORY MUTATIONS LOG
-- Audit trail for all memory operations
-- ============================================
create table public.helios_mutations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- What was mutated
  memory_id uuid, -- references helios_memories, but nullable for delete events
  entity_id uuid,
  edge_id uuid,

  -- Mutation details
  operation text not null check (operation in (
    'add', 'update', 'merge', 'supersede', 'delete', 'decay',
    'pin', 'unpin', 'archive', 'restore', 'compiler_consolidate',
    'compiler_abstract', 'compiler_decay', 'resolve_contradiction'
  )),
  reason text,
  details jsonb default '{}' not null,

  -- Before/after snapshots for reversibility
  before_state jsonb,
  after_state jsonb,

  -- Source
  triggered_by text default 'system' check (triggered_by in (
    'system', 'user', 'write_engine', 'compiler', 'decay_job', 'api'
  )),
  source_event_id uuid,

  created_at timestamptz default now() not null
);

create index idx_helios_mutations_user on public.helios_mutations(user_id, created_at desc);
create index idx_helios_mutations_memory on public.helios_mutations(memory_id) where memory_id is not null;
create index idx_helios_mutations_operation on public.helios_mutations(user_id, operation, created_at desc);

alter table public.helios_mutations enable row level security;
create policy "Users can view own mutations" on public.helios_mutations for select using (auth.uid() = user_id);
-- Only system can insert mutations (via service role)
create policy "System can insert mutations" on public.helios_mutations for insert with check (true);

-- ============================================
-- HELIOS: COMPILER STATE
-- Tracks memory compiler jobs and progress
-- ============================================
create table public.helios_compiler_state (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Job details
  job_type text not null check (job_type in (
    'consolidate_episodes', 'extract_procedures', 'decay_stale',
    'resolve_contradictions', 'health_check', 'full_compile'
  )),
  status text not null default 'pending' check (status in (
    'pending', 'running', 'completed', 'failed'
  )),

  -- Progress
  items_processed integer default 0,
  items_total integer default 0,
  details jsonb default '{}' not null,
  error_message text,

  -- Timing
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now() not null,

  -- Prevent concurrent same-type jobs per user
  constraint no_concurrent_jobs unique (user_id, job_type, status)
);

create index idx_helios_compiler_user on public.helios_compiler_state(user_id, created_at desc);

alter table public.helios_compiler_state enable row level security;
create policy "Users can view own compiler state" on public.helios_compiler_state for select using (auth.uid() = user_id);
create policy "System can manage compiler state" on public.helios_compiler_state for all with check (true);

-- ============================================
-- HELIOS: SEARCH FUNCTIONS
-- ============================================

-- Semantic vector search over memories
create or replace function helios_search_memories_vector(
  query_embedding vector(1536),
  p_user_id uuid,
  p_memory_classes text[] default null,
  p_min_confidence float default 0.0,
  p_match_threshold float default 0.65,
  p_limit int default 20
)
returns table (
  memory_id uuid,
  memory_class text,
  subject text,
  predicate text,
  object jsonb,
  content_text text,
  confidence float,
  importance float,
  recency_score float,
  valid_from timestamptz,
  valid_to timestamptz,
  status text,
  similarity float
)
language plpgsql security definer
as $$
begin
  return query
  select
    m.id as memory_id,
    m.memory_class,
    m.subject,
    m.predicate,
    m.object,
    m.content_text,
    m.confidence::float,
    m.importance::float,
    m.recency_score::float,
    m.valid_from,
    m.valid_to,
    m.status,
    (1 - (m.embedding <=> query_embedding))::float as similarity
  from public.helios_memories m
  where
    m.user_id = p_user_id
    and m.status = 'active'
    and m.deleted_at is null
    and m.embedding is not null
    and m.confidence >= p_min_confidence
    and (p_memory_classes is null or m.memory_class = any(p_memory_classes))
    and (1 - (m.embedding <=> query_embedding)) > p_match_threshold
  order by m.embedding <=> query_embedding
  limit p_limit;
end;
$$;

grant execute on function helios_search_memories_vector to authenticated;

-- Full-text (lexical) search over memories
create or replace function helios_search_memories_text(
  p_query text,
  p_user_id uuid,
  p_memory_classes text[] default null,
  p_min_confidence float default 0.0,
  p_limit int default 20
)
returns table (
  memory_id uuid,
  memory_class text,
  subject text,
  predicate text,
  object jsonb,
  content_text text,
  confidence float,
  importance float,
  recency_score float,
  valid_from timestamptz,
  valid_to timestamptz,
  status text,
  text_rank float
)
language plpgsql security definer
as $$
begin
  return query
  select
    m.id as memory_id,
    m.memory_class,
    m.subject,
    m.predicate,
    m.object,
    m.content_text,
    m.confidence::float,
    m.importance::float,
    m.recency_score::float,
    m.valid_from,
    m.valid_to,
    m.status,
    ts_rank_cd(
      to_tsvector('english', m.content_text),
      plainto_tsquery('english', p_query)
    )::float as text_rank
  from public.helios_memories m
  where
    m.user_id = p_user_id
    and m.status = 'active'
    and m.deleted_at is null
    and m.confidence >= p_min_confidence
    and (p_memory_classes is null or m.memory_class = any(p_memory_classes))
    and to_tsvector('english', m.content_text) @@ plainto_tsquery('english', p_query)
  order by text_rank desc
  limit p_limit;
end;
$$;

grant execute on function helios_search_memories_text to authenticated;

-- Temporal search: memories valid at a specific time
create or replace function helios_search_memories_temporal(
  p_user_id uuid,
  p_point_in_time timestamptz default now(),
  p_memory_classes text[] default null,
  p_subject text default null,
  p_limit int default 50
)
returns table (
  memory_id uuid,
  memory_class text,
  subject text,
  predicate text,
  object jsonb,
  content_text text,
  confidence float,
  importance float,
  valid_from timestamptz,
  valid_to timestamptz
)
language plpgsql security definer
as $$
begin
  return query
  select
    m.id as memory_id,
    m.memory_class,
    m.subject,
    m.predicate,
    m.object,
    m.content_text,
    m.confidence::float,
    m.importance::float,
    m.valid_from,
    m.valid_to
  from public.helios_memories m
  where
    m.user_id = p_user_id
    and m.status = 'active'
    and m.deleted_at is null
    and m.valid_from <= p_point_in_time
    and (m.valid_to is null or m.valid_to > p_point_in_time)
    and (p_memory_classes is null or m.memory_class = any(p_memory_classes))
    and (p_subject is null or m.subject ilike '%' || p_subject || '%')
  order by m.importance desc, m.confidence desc
  limit p_limit;
end;
$$;

grant execute on function helios_search_memories_temporal to authenticated;

-- Graph traversal: get entity neighborhood
create or replace function helios_get_entity_neighborhood(
  p_entity_id uuid,
  p_user_id uuid,
  p_max_depth int default 2,
  p_limit int default 50
)
returns table (
  entity_id uuid,
  entity_type text,
  canonical_name text,
  description text,
  relation_type text,
  relation_direction text,
  related_entity_id uuid,
  related_entity_name text,
  edge_confidence float,
  edge_valid_from timestamptz,
  edge_valid_to timestamptz,
  depth int
)
language plpgsql security definer
as $$
begin
  return query
  with recursive neighborhood as (
    -- Seed: direct connections
    select
      e.source_entity_id as from_id,
      e.target_entity_id as to_id,
      e.relation_type as rel_type,
      'outgoing'::text as direction,
      e.confidence as edge_conf,
      e.valid_from as vf,
      e.valid_to as vt,
      1 as d
    from public.helios_edges e
    where e.source_entity_id = p_entity_id
      and e.user_id = p_user_id
      and e.status = 'active'

    union all

    select
      e.target_entity_id as from_id,
      e.source_entity_id as to_id,
      e.relation_type as rel_type,
      'incoming'::text as direction,
      e.confidence as edge_conf,
      e.valid_from as vf,
      e.valid_to as vt,
      1 as d
    from public.helios_edges e
    where e.target_entity_id = p_entity_id
      and e.user_id = p_user_id
      and e.status = 'active'

    union all

    -- Recurse for deeper hops
    select
      e.source_entity_id,
      e.target_entity_id,
      e.relation_type,
      'outgoing'::text,
      e.confidence,
      e.valid_from,
      e.valid_to,
      n.d + 1
    from neighborhood n
    join public.helios_edges e on e.source_entity_id = n.to_id
    where n.d < p_max_depth
      and e.user_id = p_user_id
      and e.status = 'active'
  )
  select
    ent_from.id as entity_id,
    ent_from.entity_type,
    ent_from.canonical_name,
    ent_from.description,
    n.rel_type as relation_type,
    n.direction as relation_direction,
    ent_to.id as related_entity_id,
    ent_to.canonical_name as related_entity_name,
    n.edge_conf::float as edge_confidence,
    n.vf as edge_valid_from,
    n.vt as edge_valid_to,
    n.d as depth
  from neighborhood n
  join public.helios_entities ent_from on ent_from.id = n.from_id
  join public.helios_entities ent_to on ent_to.id = n.to_id
  where ent_from.status = 'active' and ent_to.status = 'active'
  order by n.d, n.edge_conf desc
  limit p_limit;
end;
$$;

grant execute on function helios_get_entity_neighborhood to authenticated;

-- Memory health diagnostics
create or replace function helios_memory_health(p_user_id uuid)
returns jsonb
language plpgsql security definer
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_memories', (select count(*) from helios_memories where user_id = p_user_id and deleted_at is null),
    'active_memories', (select count(*) from helios_memories where user_id = p_user_id and status = 'active' and deleted_at is null),
    'superseded_memories', (select count(*) from helios_memories where user_id = p_user_id and status = 'superseded' and deleted_at is null),
    'decayed_memories', (select count(*) from helios_memories where user_id = p_user_id and status = 'decayed' and deleted_at is null),
    'disputed_memories', (select count(*) from helios_memories where user_id = p_user_id and status = 'disputed' and deleted_at is null),
    'unresolved_contradictions', (select count(*) from helios_contradictions where user_id = p_user_id and resolution = 'unresolved'),
    'total_entities', (select count(*) from helios_entities where user_id = p_user_id and status = 'active' and deleted_at is null),
    'total_edges', (select count(*) from helios_edges where user_id = p_user_id and status = 'active'),
    'pinned_blocks', (select count(*) from helios_pinned_blocks where user_id = p_user_id and is_active = true),
    'memories_by_class', (
      select jsonb_object_agg(memory_class, cnt) from (
        select memory_class, count(*) as cnt
        from helios_memories
        where user_id = p_user_id and status = 'active' and deleted_at is null
        group by memory_class
      ) sub
    ),
    'avg_confidence', (select round(avg(confidence)::numeric, 3) from helios_memories where user_id = p_user_id and status = 'active' and deleted_at is null),
    'low_confidence_count', (select count(*) from helios_memories where user_id = p_user_id and status = 'active' and deleted_at is null and confidence < 0.3),
    'stale_memory_count', (
      select count(*) from helios_memories
      where user_id = p_user_id and status = 'active' and deleted_at is null
      and updated_at < now() - interval '30 days'
      and decay_policy != 'none'
    ),
    'total_events', (select count(*) from helios_events where user_id = p_user_id),
    'unprocessed_events', (select count(*) from helios_events where user_id = p_user_id and processed = false)
  ) into result;

  return result;
end;
$$;

grant execute on function helios_memory_health to authenticated;

-- Batch update recency scores (called by decay job)
create or replace function helios_decay_recency_scores(
  p_user_id uuid,
  p_decay_factor float default 0.995,
  p_min_recency float default 0.01
)
returns integer
language plpgsql security definer
as $$
declare
  affected integer;
begin
  update public.helios_memories
  set
    recency_score = greatest(recency_score * p_decay_factor, p_min_recency),
    updated_at = now()
  where
    user_id = p_user_id
    and status = 'active'
    and deleted_at is null
    and decay_policy in ('standard', 'aggressive')
    and recency_score > p_min_recency;

  get diagnostics affected = row_count;

  -- Auto-decay memories that dropped below threshold
  update public.helios_memories
  set
    status = 'decayed',
    updated_at = now()
  where
    user_id = p_user_id
    and status = 'active'
    and deleted_at is null
    and decay_policy = 'aggressive'
    and recency_score <= p_min_recency
    and importance < 0.3;

  return affected;
end;
$$;

grant execute on function helios_decay_recency_scores to authenticated;

-- Increment access count when memory is retrieved
create or replace function helios_touch_memories(p_memory_ids uuid[])
returns void
language plpgsql security definer
as $$
begin
  update public.helios_memories
  set
    access_count = access_count + 1,
    last_accessed_at = now(),
    recency_score = least(recency_score + 0.1, 1.0)
  where id = any(p_memory_ids);
end;
$$;

grant execute on function helios_touch_memories to authenticated;
