-- Migration: Intelligent File Organization
-- Adds people, projects, and file associations for smart organization

-- ============================================================================
-- PEOPLE TABLE
-- Stores contacts, clients, vendors, collaborators for file association
-- ============================================================================
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,

  -- Relationship type
  relationship TEXT NOT NULL DEFAULT 'contact', -- client, vendor, collaborator, personal, contact

  -- Name variations for matching (e.g., "Mary", "Mary Cramer", "M. Cramer")
  name_aliases TEXT[] DEFAULT '{}',

  -- Context and notes
  notes TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Index for searching people by name
CREATE INDEX idx_people_user_id ON people(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_people_name ON people(user_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_people_relationship ON people(user_id, relationship) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own people"
  ON people FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- PROJECTS TABLE
-- Stores projects for file association and organization
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  description TEXT,

  -- Keywords for matching files
  keywords TEXT[] DEFAULT '{}',

  -- Folder structure
  base_folder_path TEXT, -- e.g., "Business/Projects/Jane AI"

  -- Status
  status TEXT DEFAULT 'active', -- active, completed, archived, on_hold

  -- Related people (project members, clients, etc.)
  -- Will also use file_associations for explicit links

  -- Organization preferences
  auto_organize BOOLEAN DEFAULT true,

  -- Timestamps
  start_date DATE,
  end_date DATE,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_projects_user_id ON projects(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_status ON projects(user_id, status) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own projects"
  ON projects FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- PROJECT MEMBERS (Many-to-Many: Projects <-> People)
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,

  role TEXT DEFAULT 'member', -- owner, member, client, vendor

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project_id, person_id)
);

-- Indexes
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_person ON project_members(person_id);

-- RLS
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own project members"
  ON project_members FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- FILE ASSOCIATIONS (Links drive_files to people and projects)
-- ============================================================================
CREATE TABLE IF NOT EXISTS file_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drive_file_id UUID NOT NULL REFERENCES drive_files(id) ON DELETE CASCADE,

  -- Association type (only one of these will be set)
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- How the association was determined
  association_type TEXT NOT NULL, -- detected (AI), manual, path_based
  confidence REAL, -- AI confidence score

  -- Additional context
  context TEXT, -- Why this association was made

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure at least one of person_id or project_id is set
  CONSTRAINT file_associations_has_target
    CHECK (person_id IS NOT NULL OR project_id IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_file_associations_file ON file_associations(drive_file_id);
CREATE INDEX idx_file_associations_person ON file_associations(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX idx_file_associations_project ON file_associations(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_file_associations_user ON file_associations(user_id);

-- RLS
ALTER TABLE file_associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own file associations"
  ON file_associations FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- ADD COLUMNS TO DRIVE_FILES FOR INTELLIGENT ORGANIZATION
-- ============================================================================
ALTER TABLE drive_files
ADD COLUMN IF NOT EXISTS detected_people TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS detected_projects TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS suggested_path TEXT,
ADD COLUMN IF NOT EXISTS organization_confidence REAL,
ADD COLUMN IF NOT EXISTS organization_status TEXT DEFAULT 'pending'; -- pending, suggested, organized, manual

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get all files associated with a person
CREATE OR REPLACE FUNCTION get_person_files(p_person_id UUID)
RETURNS TABLE (
  file_id UUID,
  name TEXT,
  full_path TEXT,
  association_type TEXT,
  confidence REAL,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    df.id,
    df.name,
    df.full_path,
    fa.association_type,
    fa.confidence,
    fa.created_at
  FROM drive_files df
  JOIN file_associations fa ON fa.drive_file_id = df.id
  WHERE fa.person_id = p_person_id
  ORDER BY fa.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all files associated with a project
CREATE OR REPLACE FUNCTION get_project_files(p_project_id UUID)
RETURNS TABLE (
  file_id UUID,
  name TEXT,
  full_path TEXT,
  association_type TEXT,
  confidence REAL,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    df.id,
    df.name,
    df.full_path,
    fa.association_type,
    fa.confidence,
    fa.created_at
  FROM drive_files df
  JOIN file_associations fa ON fa.drive_file_id = df.id
  WHERE fa.project_id = p_project_id
  ORDER BY fa.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search people by name (includes aliases)
CREATE OR REPLACE FUNCTION search_people(
  p_user_id UUID,
  p_query TEXT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  company TEXT,
  relationship TEXT,
  match_score REAL
) AS $$
DECLARE
  search_terms TEXT[];
  term TEXT;
BEGIN
  -- Normalize query
  search_terms := string_to_array(lower(p_query), ' ');

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.email,
    p.company,
    p.relationship,
    -- Calculate match score
    CASE
      WHEN lower(p.name) = lower(p_query) THEN 1.0
      WHEN lower(p.name) LIKE lower(p_query) || '%' THEN 0.9
      WHEN lower(p_query) = ANY(SELECT lower(unnest(p.name_aliases))) THEN 0.95
      WHEN lower(p.name) LIKE '%' || lower(p_query) || '%' THEN 0.7
      ELSE 0.5
    END::REAL as match_score
  FROM people p
  WHERE p.user_id = p_user_id
    AND p.deleted_at IS NULL
    AND (
      lower(p.name) LIKE '%' || lower(p_query) || '%'
      OR lower(p_query) = ANY(SELECT lower(unnest(p.name_aliases)))
      OR lower(p.company) LIKE '%' || lower(p_query) || '%'
    )
  ORDER BY match_score DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER people_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
