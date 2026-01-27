-- JIM AI - API USAGE & BUDGET TRACKING
-- Tracks all API costs, enforces budgets, prevents abuse

-- ============================================
-- API USAGE LOG
-- ============================================
create table public.api_usage (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- API identification
  api_provider text not null, -- 'claude', 'openai', 'elevenlabs', 'google_drive', 'teller'
  api_endpoint text not null, -- specific endpoint used
  model text, -- e.g., 'claude-3-haiku', 'text-embedding-3-small'

  -- Usage metrics
  input_tokens integer default 0,
  output_tokens integer default 0,
  audio_seconds numeric(10,2) default 0, -- for TTS/STT
  api_calls integer default 1, -- for rate-limited APIs

  -- Cost tracking
  cost_usd numeric(10,6) not null default 0,

  -- Request metadata
  request_type text, -- 'chat', 'categorization', 'embedding', 'tts', 'sync'
  success boolean default true,
  error_message text,

  -- Timestamps
  created_at timestamptz default now() not null
);

-- Indexes for efficient querying
create index api_usage_user_created_idx on public.api_usage(user_id, created_at desc);
create index api_usage_user_provider_idx on public.api_usage(user_id, api_provider, created_at desc);
create index api_usage_created_idx on public.api_usage(created_at desc);

-- RLS
alter table public.api_usage enable row level security;
create policy "Users can view own usage" on public.api_usage for select using (auth.uid() = user_id);
create policy "System can insert usage" on public.api_usage for insert with check (true);

-- ============================================
-- BUDGET SETTINGS
-- ============================================
create table public.budget_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,

  -- Monthly budget
  monthly_budget_usd numeric(10,2) default 50.00,

  -- Soft limit (warning threshold)
  soft_limit_percent integer default 80, -- warn at 80% usage

  -- Hard limit behavior
  hard_limit_enabled boolean default false, -- if true, block API calls at 100%

  -- Daily abuse prevention
  daily_limit_usd numeric(10,2) default 10.00, -- max spend per day
  max_requests_per_minute integer default 20, -- rate limiting
  max_requests_per_hour integer default 200,

  -- Per-provider limits (optional overrides)
  provider_limits jsonb default '{}', -- e.g., {"claude": 30, "elevenlabs": 10}

  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS
alter table public.budget_settings enable row level security;
create policy "Users can view own budget" on public.budget_settings for select using (auth.uid() = user_id);
create policy "Users can update own budget" on public.budget_settings for update using (auth.uid() = user_id);
create policy "Users can insert own budget" on public.budget_settings for insert with check (auth.uid() = user_id);

-- ============================================
-- RATE LIMIT TRACKING
-- ============================================
create table public.rate_limits (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Time window
  window_start timestamptz not null,
  window_type text not null, -- 'minute', 'hour', 'day'

  -- Counts
  request_count integer default 0,
  total_cost_usd numeric(10,6) default 0,

  -- Composite unique constraint
  unique(user_id, window_start, window_type)
);

-- Index for fast lookups
create index rate_limits_lookup_idx on public.rate_limits(user_id, window_type, window_start desc);

-- RLS
alter table public.rate_limits enable row level security;
create policy "Users can view own rate limits" on public.rate_limits for select using (auth.uid() = user_id);
create policy "System can manage rate limits" on public.rate_limits for all with check (true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Get current month usage for a user
create or replace function get_monthly_usage(p_user_id uuid)
returns table (
  total_cost numeric,
  provider_breakdown jsonb,
  request_count bigint
) language plpgsql security definer as $$
begin
  return query
  select
    coalesce(sum(cost_usd), 0) as total_cost,
    coalesce(
      jsonb_object_agg(api_provider, provider_cost),
      '{}'::jsonb
    ) as provider_breakdown,
    coalesce(sum(api_calls)::bigint, 0) as request_count
  from (
    select
      api_provider,
      sum(cost_usd) as provider_cost,
      sum(api_calls) as api_calls
    from public.api_usage
    where user_id = p_user_id
      and created_at >= date_trunc('month', now())
      and created_at < date_trunc('month', now()) + interval '1 month'
    group by api_provider
  ) sub;
end;
$$;

-- Get daily usage for a user
create or replace function get_daily_usage(p_user_id uuid)
returns table (
  total_cost numeric,
  request_count bigint
) language plpgsql security definer as $$
begin
  return query
  select
    coalesce(sum(cost_usd), 0) as total_cost,
    coalesce(sum(api_calls)::bigint, 0) as request_count
  from public.api_usage
  where user_id = p_user_id
    and created_at >= date_trunc('day', now())
    and created_at < date_trunc('day', now()) + interval '1 day';
end;
$$;

-- Check if user can make API request (rate limiting + budget check)
create or replace function check_api_allowance(
  p_user_id uuid,
  p_estimated_cost numeric default 0.001
)
returns table (
  allowed boolean,
  reason text,
  current_usage numeric,
  budget_limit numeric,
  usage_percent numeric
) language plpgsql security definer as $$
declare
  v_settings record;
  v_monthly_usage numeric;
  v_daily_usage numeric;
  v_minute_count integer;
  v_hour_count integer;
begin
  -- Get user's budget settings
  select * into v_settings
  from public.budget_settings
  where user_id = p_user_id;

  -- If no settings, use defaults
  if v_settings is null then
    v_settings := row(
      null, p_user_id, 50.00, 80, false, 10.00, 20, 200, '{}'::jsonb, now(), now()
    );
  end if;

  -- Get current monthly usage
  select coalesce(sum(cost_usd), 0) into v_monthly_usage
  from public.api_usage
  where user_id = p_user_id
    and created_at >= date_trunc('month', now());

  -- Get current daily usage
  select coalesce(sum(cost_usd), 0) into v_daily_usage
  from public.api_usage
  where user_id = p_user_id
    and created_at >= date_trunc('day', now());

  -- Get minute request count
  select coalesce(request_count, 0) into v_minute_count
  from public.rate_limits
  where user_id = p_user_id
    and window_type = 'minute'
    and window_start = date_trunc('minute', now());

  -- Get hour request count
  select coalesce(request_count, 0) into v_hour_count
  from public.rate_limits
  where user_id = p_user_id
    and window_type = 'hour'
    and window_start = date_trunc('hour', now());

  -- Check rate limits
  if v_minute_count >= v_settings.max_requests_per_minute then
    return query select
      false,
      'Rate limit exceeded (per minute)',
      v_monthly_usage,
      v_settings.monthly_budget_usd,
      (v_monthly_usage / v_settings.monthly_budget_usd * 100)::numeric;
    return;
  end if;

  if v_hour_count >= v_settings.max_requests_per_hour then
    return query select
      false,
      'Rate limit exceeded (per hour)',
      v_monthly_usage,
      v_settings.monthly_budget_usd,
      (v_monthly_usage / v_settings.monthly_budget_usd * 100)::numeric;
    return;
  end if;

  -- Check daily limit
  if v_daily_usage + p_estimated_cost > v_settings.daily_limit_usd then
    return query select
      false,
      'Daily spending limit reached',
      v_monthly_usage,
      v_settings.monthly_budget_usd,
      (v_monthly_usage / v_settings.monthly_budget_usd * 100)::numeric;
    return;
  end if;

  -- Check monthly budget (hard limit)
  if v_settings.hard_limit_enabled and v_monthly_usage + p_estimated_cost > v_settings.monthly_budget_usd then
    return query select
      false,
      'Monthly budget exceeded',
      v_monthly_usage,
      v_settings.monthly_budget_usd,
      (v_monthly_usage / v_settings.monthly_budget_usd * 100)::numeric;
    return;
  end if;

  -- All checks passed
  return query select
    true,
    null::text,
    v_monthly_usage,
    v_settings.monthly_budget_usd,
    (v_monthly_usage / v_settings.monthly_budget_usd * 100)::numeric;
end;
$$;

-- Increment rate limit counter
create or replace function increment_rate_limit(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  -- Minute window
  insert into public.rate_limits (user_id, window_start, window_type, request_count)
  values (p_user_id, date_trunc('minute', now()), 'minute', 1)
  on conflict (user_id, window_start, window_type)
  do update set request_count = rate_limits.request_count + 1;

  -- Hour window
  insert into public.rate_limits (user_id, window_start, window_type, request_count)
  values (p_user_id, date_trunc('hour', now()), 'hour', 1)
  on conflict (user_id, window_start, window_type)
  do update set request_count = rate_limits.request_count + 1;
end;
$$;

-- Clean up old rate limit records (run periodically)
create or replace function cleanup_rate_limits()
returns void language plpgsql security definer as $$
begin
  delete from public.rate_limits
  where window_start < now() - interval '2 days';
end;
$$;
