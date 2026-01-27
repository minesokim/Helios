-- Project Intelligence & Briefing System
-- Tracks projects, blockers, contacts, and generates contextual briefings

-- ============================================
-- CONTACTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  company TEXT,
  responsiveness TEXT CHECK (responsiveness IN ('poor', 'average', 'good')) DEFAULT 'average',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_contacts_user ON contacts(user_id);
CREATE INDEX idx_contacts_name ON contacts(user_id, name);
CREATE INDEX idx_contacts_email ON contacts(user_id, email);

-- ============================================
-- PROJECTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client TEXT,
  client_contact_id UUID REFERENCES contacts(id),
  description TEXT,
  status TEXT CHECK (status IN ('active', 'blocked', 'waiting', 'completed', 'on_hold')) DEFAULT 'active',
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  related_emails TEXT[] DEFAULT '{}',  -- Gmail thread IDs
  related_files TEXT[] DEFAULT '{}',   -- Google Drive file IDs
  notes TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(user_id, status);
CREATE INDEX idx_projects_client ON projects(user_id, client);

-- ============================================
-- BLOCKERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('external_approval', 'waiting_on_person', 'waiting_on_client', 'technical', 'dependency')) NOT NULL,
  description TEXT NOT NULL,
  waiting_since TIMESTAMPTZ DEFAULT NOW(),
  person TEXT,
  person_contact_id UUID REFERENCES contacts(id),
  person_notes TEXT,
  follow_up_attempts INTEGER DEFAULT 0,
  last_follow_up TIMESTAMPTZ,
  missing_items TEXT[] DEFAULT '{}',
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blockers_project ON blockers(project_id);
CREATE INDEX idx_blockers_user ON blockers(user_id);
CREATE INDEX idx_blockers_resolved ON blockers(user_id, resolved);

-- ============================================
-- WATCH TRIGGERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS watch_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocker_id UUID NOT NULL REFERENCES blockers(id) ON DELETE CASCADE,
  source TEXT CHECK (source IN ('email', 'file', 'calendar')) NOT NULL,
  from_contains TEXT,
  subject_contains TEXT,
  keywords TEXT[] DEFAULT '{}',
  on_trigger TEXT CHECK (on_trigger IN ('notify', 'draft_email', 'mark_resolved')) DEFAULT 'notify',
  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  trigger_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watch_triggers_blocker ON watch_triggers(blocker_id);
CREATE INDEX idx_watch_triggers_user ON watch_triggers(user_id, triggered);

-- ============================================
-- BRIEFING HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS briefing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  briefing_type TEXT CHECK (briefing_type IN ('morning', 'project', 'urgent', 'custom')) NOT NULL,
  project_id UUID REFERENCES projects(id),
  content TEXT NOT NULL,
  items_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_briefing_history_user ON briefing_history(user_id, created_at DESC);

-- ============================================
-- FOLLOW UP HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS follow_up_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocker_id UUID NOT NULL REFERENCES blockers(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  method TEXT CHECK (method IN ('email', 'call', 'text', 'in_person', 'other')) DEFAULT 'email',
  notes TEXT,
  email_thread_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_follow_up_history_blocker ON follow_up_history(blocker_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_history ENABLE ROW LEVEL SECURITY;

-- Contacts policies
CREATE POLICY "Users can manage own contacts" ON contacts
  FOR ALL USING (auth.uid() = user_id);

-- Projects policies
CREATE POLICY "Users can manage own projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

-- Blockers policies
CREATE POLICY "Users can manage own blockers" ON blockers
  FOR ALL USING (auth.uid() = user_id);

-- Watch triggers policies
CREATE POLICY "Users can manage own watch triggers" ON watch_triggers
  FOR ALL USING (auth.uid() = user_id);

-- Briefing history policies
CREATE POLICY "Users can manage own briefing history" ON briefing_history
  FOR ALL USING (auth.uid() = user_id);

-- Follow up history policies
CREATE POLICY "Users can manage own follow up history" ON follow_up_history
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Calculate days waiting for a blocker
CREATE OR REPLACE FUNCTION days_waiting(blocker blockers)
RETURNS INTEGER AS $$
BEGIN
  RETURN EXTRACT(DAY FROM NOW() - blocker.waiting_since)::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Calculate priority score for actionable items
CREATE OR REPLACE FUNCTION calculate_blocker_priority(
  p_waiting_since TIMESTAMPTZ,
  p_follow_up_attempts INTEGER,
  p_last_follow_up TIMESTAMPTZ,
  p_responsiveness TEXT,
  p_client TEXT,
  p_has_missing_items BOOLEAN
)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 5;
  days_waiting INTEGER;
  days_since_followup INTEGER;
BEGIN
  days_waiting := EXTRACT(DAY FROM NOW() - p_waiting_since)::INTEGER;

  IF p_last_follow_up IS NOT NULL THEN
    days_since_followup := EXTRACT(DAY FROM NOW() - p_last_follow_up)::INTEGER;
  ELSE
    days_since_followup := days_waiting;
  END IF;

  -- Waiting time bonuses
  IF days_waiting > 14 THEN
    score := score + 3;
  ELSIF days_waiting > 7 THEN
    score := score + 2;
  END IF;

  -- Poor responsiveness + no recent follow-up
  IF p_responsiveness = 'poor' AND days_since_followup > 5 THEN
    score := score + 2;
  END IF;

  -- High-stakes client (Mary)
  IF LOWER(p_client) = 'mary' THEN
    score := score + 2;
  END IF;

  -- Has missing items listed
  IF p_has_missing_items THEN
    score := score + 1;
  END IF;

  -- Cap at 10
  RETURN LEAST(score, 10);
END;
$$ LANGUAGE plpgsql;

-- Get urgent blockers for briefing
CREATE OR REPLACE FUNCTION get_urgent_blockers(p_user_id UUID, p_min_priority INTEGER DEFAULT 7)
RETURNS TABLE (
  blocker_id UUID,
  project_id UUID,
  project_name TEXT,
  client TEXT,
  blocker_type TEXT,
  description TEXT,
  person TEXT,
  person_notes TEXT,
  days_waiting INTEGER,
  follow_up_attempts INTEGER,
  days_since_follow_up INTEGER,
  missing_items TEXT[],
  priority INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS blocker_id,
    p.id AS project_id,
    p.name AS project_name,
    p.client,
    b.type AS blocker_type,
    b.description,
    b.person,
    b.person_notes,
    EXTRACT(DAY FROM NOW() - b.waiting_since)::INTEGER AS days_waiting,
    b.follow_up_attempts,
    CASE
      WHEN b.last_follow_up IS NOT NULL
      THEN EXTRACT(DAY FROM NOW() - b.last_follow_up)::INTEGER
      ELSE EXTRACT(DAY FROM NOW() - b.waiting_since)::INTEGER
    END AS days_since_follow_up,
    b.missing_items,
    calculate_blocker_priority(
      b.waiting_since,
      b.follow_up_attempts,
      b.last_follow_up,
      COALESCE(c.responsiveness, 'average'),
      p.client,
      array_length(b.missing_items, 1) > 0
    ) AS priority
  FROM blockers b
  JOIN projects p ON b.project_id = p.id
  LEFT JOIN contacts c ON b.person_contact_id = c.id
  WHERE b.user_id = p_user_id
    AND b.resolved = FALSE
    AND p.status IN ('active', 'blocked', 'waiting')
  HAVING calculate_blocker_priority(
    b.waiting_since,
    b.follow_up_attempts,
    b.last_follow_up,
    COALESCE(c.responsiveness, 'average'),
    p.client,
    array_length(b.missing_items, 1) > 0
  ) >= p_min_priority
  ORDER BY priority DESC, days_waiting DESC;
END;
$$ LANGUAGE plpgsql;
