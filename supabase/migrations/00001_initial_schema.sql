-- JIM AI - DATABASE SCHEMA
-- Supabase Migration: Initial Schema
-- Multi-tenant ready for future Jane AI deployment

-- ============================================
-- EXTENSIONS
-- ============================================
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ============================================
-- USERS (extends Supabase auth.users)
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  timezone text default 'America/Los_Angeles',
  preferences jsonb default '{}',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- ============================================
-- BANK ACCOUNTS
-- ============================================
create table public.bank_accounts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Teller fields
  teller_account_id text unique,
  teller_enrollment_id text,
  teller_access_token text, -- encrypted in practice

  -- Account info
  institution_name text not null,
  institution_logo_url text,
  account_name text not null,
  account_type text not null, -- checking, savings, credit
  account_subtype text,
  account_number_last4 text,

  -- Balance (cached, updated on sync)
  current_balance numeric(12,2),
  available_balance numeric(12,2),
  balance_updated_at timestamptz,

  -- Sync status
  last_sync_at timestamptz,
  sync_status text default 'pending', -- pending, syncing, success, error
  sync_error text,

  -- Meta
  is_active boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- Indexes
create index idx_bank_accounts_user on public.bank_accounts(user_id);
create index idx_bank_accounts_teller on public.bank_accounts(teller_account_id);

-- RLS
alter table public.bank_accounts enable row level security;
create policy "Users can manage own accounts" on public.bank_accounts for all using (auth.uid() = user_id);

-- ============================================
-- TRANSACTION CATEGORIES
-- ============================================
create table public.transaction_categories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade, -- null = system default

  name text not null,
  slug text not null,
  icon text,
  color text,
  parent_id uuid references public.transaction_categories(id),

  -- Tax mapping
  schedule_c_category text, -- maps to IRS Schedule C line items
  is_deductible boolean default false,

  -- Meta
  is_system boolean default false, -- system categories cannot be deleted
  sort_order int default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,

  unique(user_id, slug)
);

-- RLS
alter table public.transaction_categories enable row level security;
create policy "Users see own and system categories" on public.transaction_categories
  for select using (user_id is null or auth.uid() = user_id);
create policy "Users manage own categories" on public.transaction_categories
  for all using (auth.uid() = user_id);

-- ============================================
-- TRANSACTIONS
-- ============================================
create table public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  bank_account_id uuid references public.bank_accounts(id) on delete cascade not null,

  -- Teller fields
  teller_transaction_id text unique,

  -- Transaction data
  date date not null,
  description text not null,
  merchant_name text,
  amount numeric(12,2) not null, -- positive = income, negative = expense
  currency text default 'USD',

  -- Categorization
  category_id uuid references public.transaction_categories(id),
  category_confidence numeric(3,2), -- AI confidence 0.00 to 1.00
  category_source text, -- 'ai', 'user', 'rule'

  -- Status
  status text default 'posted', -- pending, posted
  type text, -- debit, credit, transfer

  -- User additions
  notes text,
  tags text[],
  is_reviewed boolean default false,
  is_hidden boolean default false,

  -- Meta
  raw_data jsonb, -- original Teller response
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- Indexes
create index idx_transactions_user on public.transactions(user_id);
create index idx_transactions_account on public.transactions(bank_account_id);
create index idx_transactions_date on public.transactions(date desc);
create index idx_transactions_category on public.transactions(category_id);
create index idx_transactions_search on public.transactions using gin(to_tsvector('english', description || ' ' || coalesce(merchant_name, '')));

-- RLS
alter table public.transactions enable row level security;
create policy "Users manage own transactions" on public.transactions for all using (auth.uid() = user_id);

-- ============================================
-- SUBSCRIPTIONS (detected recurring charges)
-- ============================================
create table public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Detection
  merchant_name text not null,
  normalized_name text, -- cleaned up name for matching

  -- Subscription details
  amount numeric(12,2) not null,
  frequency text not null, -- weekly, monthly, quarterly, yearly
  billing_day int, -- day of month or week

  -- Status
  status text default 'active', -- active, cancelled, paused
  first_seen_at date not null,
  last_charged_at date,
  next_expected_at date,

  -- Category
  category_id uuid references public.transaction_categories(id),

  -- User additions
  notes text,
  is_essential boolean default false,
  cancellation_url text,

  -- Meta
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- Indexes
create index idx_subscriptions_user on public.subscriptions(user_id);
create index idx_subscriptions_merchant on public.subscriptions(normalized_name);

-- RLS
alter table public.subscriptions enable row level security;
create policy "Users manage own subscriptions" on public.subscriptions for all using (auth.uid() = user_id);

-- ============================================
-- DOCUMENTS
-- ============================================
create table public.documents (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- File info
  file_name text not null,
  file_type text not null, -- pdf, image, docx, etc
  file_size int not null,
  storage_path text not null, -- Supabase Storage path

  -- Processing
  extracted_text text,
  ocr_status text default 'pending', -- pending, processing, complete, failed
  ocr_error text,

  -- Categorization
  document_type text, -- contract, invoice, receipt, proposal, tax_form, etc
  document_type_confidence numeric(3,2),

  -- Metadata extracted by AI
  metadata jsonb default '{}', -- dates, amounts, parties, etc

  -- User additions
  title text,
  description text,
  tags text[],

  -- Linking
  linked_transaction_ids uuid[],
  linked_client_id uuid,

  -- Meta
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- Indexes
create index idx_documents_user on public.documents(user_id);
create index idx_documents_type on public.documents(document_type);
create index idx_documents_search on public.documents using gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(extracted_text, '')));

-- RLS
alter table public.documents enable row level security;
create policy "Users manage own documents" on public.documents for all using (auth.uid() = user_id);

-- ============================================
-- DOCUMENT EMBEDDINGS (for RAG search)
-- ============================================
create table public.document_embeddings (
  id uuid default uuid_generate_v4() primary key,
  document_id uuid references public.documents(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Chunk info
  chunk_index int not null,
  chunk_text text not null,

  -- Embedding
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension

  -- Meta
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_embeddings_document on public.document_embeddings(document_id);
create index idx_embeddings_user on public.document_embeddings(user_id);
create index idx_embeddings_vector on public.document_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS
alter table public.document_embeddings enable row level security;
create policy "Users search own embeddings" on public.document_embeddings for select using (auth.uid() = user_id);

-- ============================================
-- CLIENTS (for Noctworks tracking)
-- ============================================
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Client info
  name text not null,
  company text,
  email text,
  phone text,
  website text,

  -- Business details
  industry text,
  service_type text, -- web_design, marketing, ai_solutions, etc

  -- Financials
  monthly_retainer numeric(12,2),
  hourly_rate numeric(8,2),
  total_revenue numeric(12,2) default 0,
  total_expenses numeric(12,2) default 0,

  -- Status
  status text default 'active', -- lead, active, paused, completed, churned
  started_at date,
  ended_at date,

  -- User additions
  notes text,
  tags text[],

  -- Meta
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- Indexes
create index idx_clients_user on public.clients(user_id);
create index idx_clients_status on public.clients(status);

-- RLS
alter table public.clients enable row level security;
create policy "Users manage own clients" on public.clients for all using (auth.uid() = user_id);

-- ============================================
-- CLIENT TRANSACTIONS (links transactions to clients)
-- ============================================
create table public.client_transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete cascade not null,
  transaction_id uuid references public.transactions(id) on delete cascade not null,

  -- Attribution
  attribution_type text not null, -- revenue, expense
  attribution_percentage numeric(5,2) default 100, -- for split transactions
  attributed_amount numeric(12,2) not null,

  -- Notes
  notes text,

  -- Meta
  created_at timestamptz default now() not null,

  unique(client_id, transaction_id)
);

-- Indexes
create index idx_client_transactions_client on public.client_transactions(client_id);
create index idx_client_transactions_transaction on public.client_transactions(transaction_id);

-- RLS
alter table public.client_transactions enable row level security;
create policy "Users manage own client transactions" on public.client_transactions for all using (auth.uid() = user_id);

-- ============================================
-- TAX CATEGORIES (IRS Schedule C mapping)
-- ============================================
create table public.tax_categories (
  id uuid default uuid_generate_v4() primary key,

  -- IRS info
  schedule_c_line text not null, -- Line 8, Line 10, etc
  name text not null,
  description text,

  -- Examples for AI
  example_expenses text[],

  -- Meta
  tax_year int not null,
  created_at timestamptz default now() not null
);

-- ============================================
-- CHAT HISTORY (for voice and text conversations)
-- ============================================
create table public.chat_messages (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Message
  role text not null, -- user, assistant
  content text not null,

  -- Voice
  audio_url text, -- if voice message

  -- Context
  session_id uuid, -- group messages by session

  -- Meta
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_chat_user on public.chat_messages(user_id);
create index idx_chat_session on public.chat_messages(session_id);

-- RLS
alter table public.chat_messages enable row level security;
create policy "Users manage own chats" on public.chat_messages for all using (auth.uid() = user_id);

-- ============================================
-- BRIEFINGS (daily summaries)
-- ============================================
create table public.briefings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Briefing data
  date date not null,
  content jsonb not null, -- structured briefing data
  summary_text text, -- plain text summary

  -- Delivery
  is_read boolean default false,
  read_at timestamptz,

  -- Meta
  created_at timestamptz default now() not null,

  unique(user_id, date)
);

-- Indexes
create index idx_briefings_user_date on public.briefings(user_id, date desc);

-- RLS
alter table public.briefings enable row level security;
create policy "Users manage own briefings" on public.briefings for all using (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to all tables with updated_at
create trigger update_profiles_updated_at before update on public.profiles for each row execute function update_updated_at();
create trigger update_bank_accounts_updated_at before update on public.bank_accounts for each row execute function update_updated_at();
create trigger update_transactions_updated_at before update on public.transactions for each row execute function update_updated_at();
create trigger update_transaction_categories_updated_at before update on public.transaction_categories for each row execute function update_updated_at();
create trigger update_subscriptions_updated_at before update on public.subscriptions for each row execute function update_updated_at();
create trigger update_documents_updated_at before update on public.documents for each row execute function update_updated_at();
create trigger update_clients_updated_at before update on public.clients for each row execute function update_updated_at();

-- Function: Search documents by vector similarity
create or replace function search_documents(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 10,
  p_user_id uuid default auth.uid()
)
returns table (
  document_id uuid,
  chunk_text text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    de.document_id,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) as similarity
  from document_embeddings de
  where de.user_id = p_user_id
    and 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Function: Calculate client P and L
create or replace function calculate_client_pnl(p_client_id uuid)
returns table (
  total_revenue numeric,
  total_expenses numeric,
  net_profit numeric,
  profit_margin numeric
)
language plpgsql
as $$
begin
  return query
  select
    coalesce(sum(case when ct.attribution_type = 'revenue' then ct.attributed_amount else 0 end), 0) as total_revenue,
    coalesce(sum(case when ct.attribution_type = 'expense' then ct.attributed_amount else 0 end), 0) as total_expenses,
    coalesce(sum(case when ct.attribution_type = 'revenue' then ct.attributed_amount else -ct.attributed_amount end), 0) as net_profit,
    case
      when sum(case when ct.attribution_type = 'revenue' then ct.attributed_amount else 0 end) > 0
      then round(
        (sum(case when ct.attribution_type = 'revenue' then ct.attributed_amount else -ct.attributed_amount end) /
         sum(case when ct.attribution_type = 'revenue' then ct.attributed_amount else 0 end)) * 100, 2
      )
      else 0
    end as profit_margin
  from client_transactions ct
  where ct.client_id = p_client_id;
end;
$$;

-- ============================================
-- SEED DEFAULT CATEGORIES
-- ============================================
insert into public.transaction_categories (name, slug, icon, color, is_system, sort_order) values
  ('Income', 'income', 'dollar-sign', '#22c55e', true, 1),
  ('Salary', 'salary', 'banknote', '#22c55e', true, 2),
  ('Freelance', 'freelance', 'laptop', '#22c55e', true, 3),
  ('Investments', 'investments', 'trending-up', '#22c55e', true, 4),
  ('Software', 'software', 'monitor', '#3b82f6', true, 10),
  ('Subscriptions', 'subscriptions', 'repeat', '#3b82f6', true, 11),
  ('Advertising', 'advertising', 'megaphone', '#f59e0b', true, 12),
  ('Office', 'office', 'building', '#8b5cf6', true, 13),
  ('Travel', 'travel', 'plane', '#ec4899', true, 14),
  ('Meals', 'meals', 'utensils', '#f97316', true, 15),
  ('Utilities', 'utilities', 'lightbulb', '#6366f1', true, 16),
  ('Professional Services', 'professional-services', 'briefcase', '#14b8a6', true, 17),
  ('Equipment', 'equipment', 'wrench', '#64748b', true, 18),
  ('Insurance', 'insurance', 'shield', '#0ea5e9', true, 19),
  ('Taxes', 'taxes', 'file-text', '#ef4444', true, 20),
  ('Transfer', 'transfer', 'arrow-left-right', '#94a3b8', true, 90),
  ('Uncategorized', 'uncategorized', 'help-circle', '#94a3b8', true, 99);

-- Seed Schedule C tax categories
insert into public.tax_categories (schedule_c_line, name, description, example_expenses, tax_year) values
  ('line_8', 'Advertising', 'Advertising and marketing expenses', array['Google Ads', 'Facebook Ads', 'Business cards', 'Website hosting'], 2024),
  ('line_10', 'Car and Truck Expenses', 'Vehicle expenses for business use', array['Gas', 'Car maintenance', 'Mileage'], 2024),
  ('line_11', 'Commissions and Fees', 'Commissions paid and platform fees', array['Stripe fees', 'PayPal fees', 'Referral commissions'], 2024),
  ('line_13', 'Depreciation', 'Depreciation of business assets', array['Computer equipment', 'Office furniture'], 2024),
  ('line_14', 'Employee Benefit Programs', 'Benefits for employees', array['Health insurance', '401k contributions'], 2024),
  ('line_15', 'Insurance', 'Business insurance premiums', array['Liability insurance', 'E&O insurance'], 2024),
  ('line_16a', 'Interest on Mortgage', 'Mortgage interest on business property', array['Office mortgage interest'], 2024),
  ('line_16b', 'Interest Other', 'Other business interest', array['Business loan interest', 'Credit card interest'], 2024),
  ('line_17', 'Legal and Professional Services', 'Legal, accounting, and professional fees', array['Lawyer fees', 'Accountant fees', 'Consulting fees'], 2024),
  ('line_18', 'Office Expense', 'Office supplies and expenses', array['Printer ink', 'Paper', 'Office supplies'], 2024),
  ('line_19', 'Pension and Profit Sharing', 'Retirement plan contributions', array['SEP-IRA', 'Solo 401k'], 2024),
  ('line_20a', 'Rent on Vehicles and Equipment', 'Rented vehicles and equipment', array['Equipment rental', 'Vehicle lease'], 2024),
  ('line_20b', 'Rent on Other Business Property', 'Office or workspace rent', array['Office rent', 'Coworking space'], 2024),
  ('line_21', 'Repairs and Maintenance', 'Repairs to business property', array['Computer repair', 'Office repairs'], 2024),
  ('line_22', 'Supplies', 'Supplies used in business', array['Raw materials', 'Packaging'], 2024),
  ('line_23', 'Taxes and Licenses', 'Business taxes and licenses', array['Business license', 'State taxes'], 2024),
  ('line_24a', 'Travel', 'Business travel expenses', array['Flights', 'Hotels', 'Conference travel'], 2024),
  ('line_24b', 'Meals', 'Business meals (50 percent deductible)', array['Client meals', 'Business lunches'], 2024),
  ('line_25', 'Utilities', 'Business utilities', array['Internet', 'Phone', 'Electricity for office'], 2024),
  ('line_27a', 'Other Expenses', 'Other deductible expenses', array['Software subscriptions', 'Online tools', 'Education'], 2024);

-- ============================================
-- PROFILE CREATION TRIGGER
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
