-- Add input_source column to ai_messages to track voice vs typed input
-- This helps display conversation history with visual indicators

alter table public.ai_messages add column if not exists input_source text default 'typed' check (input_source in ('typed', 'voice'));

-- Index for potential filtering by input source
create index if not exists ai_messages_input_source_idx on public.ai_messages(input_source);
