-- Client Expenses & Scheduled Tasks
-- For tracking client P&L and future reminders

-- ============================================
-- CLIENT EXPENSES TABLE
-- ============================================
-- Tracks individual expenses per client for P&L calculation

CREATE TABLE IF NOT EXISTS client_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Expense details
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category TEXT CHECK (category IN (
    'software', 'subscription', 'contractor', 'advertising',
    'hosting', 'tools', 'travel', 'other'
  )) DEFAULT 'other',

  -- Timing
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_frequency TEXT CHECK (recurring_frequency IN ('monthly', 'quarterly', 'yearly')),

  -- Optional details
  vendor TEXT,
  receipt_url TEXT,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_client_expenses_user ON client_expenses(user_id);
CREATE INDEX idx_client_expenses_client ON client_expenses(client_id);
CREATE INDEX idx_client_expenses_date ON client_expenses(user_id, expense_date);
CREATE INDEX idx_client_expenses_category ON client_expenses(user_id, category);

-- ============================================
-- SCHEDULED TASKS TABLE
-- ============================================
-- For reminders, future tasks, and recurring actions

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Task details
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  reminder_at TIMESTAMPTZ,  -- When to remind (can be before scheduled_for)

  -- Recurrence
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_pattern TEXT CHECK (recurring_pattern IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  recurring_end_date DATE,

  -- Linking to other entities
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  blocker_id UUID REFERENCES blockers(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Status
  status TEXT CHECK (status IN ('pending', 'completed', 'cancelled', 'snoozed')) DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,

  -- AI context
  auto_created BOOLEAN DEFAULT FALSE,  -- True if Jorkel created it
  creation_context TEXT,  -- Why was this task created

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_tasks_user ON scheduled_tasks(user_id);
CREATE INDEX idx_scheduled_tasks_scheduled ON scheduled_tasks(user_id, scheduled_for);
CREATE INDEX idx_scheduled_tasks_status ON scheduled_tasks(user_id, status);
CREATE INDEX idx_scheduled_tasks_project ON scheduled_tasks(project_id);
CREATE INDEX idx_scheduled_tasks_reminder ON scheduled_tasks(user_id, reminder_at)
  WHERE status = 'pending' AND reminder_at IS NOT NULL;

-- ============================================
-- CLIENT REVENUE TABLE (for detailed income tracking)
-- ============================================
-- Tracks individual revenue entries per client

CREATE TABLE IF NOT EXISTS client_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Revenue details
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category TEXT CHECK (category IN (
    'retainer', 'project', 'hourly', 'bonus', 'reimbursement', 'other'
  )) DEFAULT 'project',

  -- Timing
  revenue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  paid BOOLEAN DEFAULT FALSE,
  paid_at DATE,

  -- Optional details
  hours_worked DECIMAL(6,2),
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_client_revenue_user ON client_revenue(user_id);
CREATE INDEX idx_client_revenue_client ON client_revenue(client_id);
CREATE INDEX idx_client_revenue_date ON client_revenue(user_id, revenue_date);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE client_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own client expenses" ON client_expenses
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own scheduled tasks" ON scheduled_tasks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own client revenue" ON client_revenue
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Calculate client P&L
CREATE OR REPLACE FUNCTION get_client_pl(p_user_id UUID, p_client_id UUID, p_months INTEGER DEFAULT 12)
RETURNS TABLE (
  total_revenue DECIMAL(12,2),
  total_expenses DECIMAL(12,2),
  net_profit DECIMAL(12,2),
  profit_margin DECIMAL(5,2)
) AS $$
DECLARE
  v_start_date DATE;
  v_revenue DECIMAL(12,2);
  v_expenses DECIMAL(12,2);
BEGIN
  v_start_date := CURRENT_DATE - (p_months * INTERVAL '1 month');

  -- Calculate total revenue
  SELECT COALESCE(SUM(amount), 0) INTO v_revenue
  FROM client_revenue
  WHERE user_id = p_user_id
    AND client_id = p_client_id
    AND revenue_date >= v_start_date
    AND deleted_at IS NULL;

  -- Calculate total expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_expenses
  FROM client_expenses
  WHERE user_id = p_user_id
    AND client_id = p_client_id
    AND expense_date >= v_start_date
    AND deleted_at IS NULL;

  RETURN QUERY SELECT
    v_revenue AS total_revenue,
    v_expenses AS total_expenses,
    (v_revenue - v_expenses) AS net_profit,
    CASE WHEN v_revenue > 0
      THEN ROUND(((v_revenue - v_expenses) / v_revenue * 100)::DECIMAL, 2)
      ELSE 0
    END AS profit_margin;
END;
$$ LANGUAGE plpgsql;

-- Get upcoming tasks for briefing
CREATE OR REPLACE FUNCTION get_upcoming_tasks(p_user_id UUID, p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  task_id UUID,
  title TEXT,
  description TEXT,
  priority INTEGER,
  scheduled_for TIMESTAMPTZ,
  project_name TEXT,
  client_name TEXT,
  days_until INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    st.id AS task_id,
    st.title,
    st.description,
    st.priority,
    st.scheduled_for,
    p.name AS project_name,
    c.name AS client_name,
    EXTRACT(DAY FROM st.scheduled_for - NOW())::INTEGER AS days_until
  FROM scheduled_tasks st
  LEFT JOIN projects p ON st.project_id = p.id
  LEFT JOIN clients c ON st.client_id = c.id
  WHERE st.user_id = p_user_id
    AND st.status = 'pending'
    AND st.scheduled_for <= NOW() + (p_days * INTERVAL '1 day')
  ORDER BY st.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql;

-- Update client totals trigger
CREATE OR REPLACE FUNCTION update_client_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the client's total_revenue and total_expenses
  UPDATE clients
  SET
    total_revenue = (
      SELECT COALESCE(SUM(amount), 0)
      FROM client_revenue
      WHERE client_id = COALESCE(NEW.client_id, OLD.client_id)
        AND deleted_at IS NULL
    ),
    total_expenses = (
      SELECT COALESCE(SUM(amount), 0)
      FROM client_expenses
      WHERE client_id = COALESCE(NEW.client_id, OLD.client_id)
        AND deleted_at IS NULL
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.client_id, OLD.client_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update client totals
CREATE TRIGGER trigger_update_client_revenue_totals
  AFTER INSERT OR UPDATE OR DELETE ON client_revenue
  FOR EACH ROW EXECUTE FUNCTION update_client_totals();

CREATE TRIGGER trigger_update_client_expense_totals
  AFTER INSERT OR UPDATE OR DELETE ON client_expenses
  FOR EACH ROW EXECUTE FUNCTION update_client_totals();
