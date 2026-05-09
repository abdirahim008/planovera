-- ══════════════════════════════════════════════════════════
-- ProBuild — Supabase Schema
-- Run this in your Supabase SQL Editor to set up the database
-- ══════════════════════════════════════════════════════════
--
-- NOTE:
-- ProBuild now shares authentication, profiles, drawings, and project records
-- with the root workspace schema at ../../supabase/schema.sql.
-- Use that root schema as the canonical setup for new environments.
-- This file is retained only as legacy reference from the standalone ProBuild app.

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('construction', 'non-construction')),
  role TEXT NOT NULL CHECK (role IN ('contractor', 'supervision', 'employer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_number TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS consultant_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_title TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_amount TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_logo_data_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_display_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS issuer_display_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS issuer_address TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS header_tagline TEXT;

-- BOQ Sheets (each project can have multiple sheets)
CREATE TABLE IF NOT EXISTS boq_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Sheet 1',
  sort_order INTEGER DEFAULT 0,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payment Certificates
CREATE TABLE IF NOT EXISTS payment_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('interim', 'final')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Work Plan Activities
CREATE TABLE IF NOT EXISTS work_plan_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  duration TEXT DEFAULT '',
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'delayed')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- BOQ Library (admin-maintained templates)
CREATE TABLE IF NOT EXISTS boq_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  sheets JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Simple Items (for non-construction projects)
CREATE TABLE IF NOT EXISTS simple_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  sn TEXT DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  unit TEXT DEFAULT '',
  qty TEXT DEFAULT '',
  rate TEXT DEFAULT '',
  amount TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

-- ══════════════════════════════════════════════════════════
-- Indexes for performance
-- ══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_boq_sheets_project ON boq_sheets(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_certs_project ON payment_certificates(project_id);
CREATE INDEX IF NOT EXISTS idx_activities_project ON work_plan_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_simple_items_project ON simple_items(project_id);

-- ══════════════════════════════════════════════════════════
-- Row-level security policies (enable RLS on each table)
-- ══════════════════════════════════════════════════════════

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_plan_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE simple_items ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own projects
CREATE POLICY "Users manage own projects"
  ON projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Cascading policies for project-linked tables
CREATE POLICY "Users manage own BOQ sheets"
  ON boq_sheets FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own certificates"
  ON payment_certificates FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own activities"
  ON work_plan_activities FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own items"
  ON simple_items FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- BOQ Library is readable by all authenticated users, writable by admins
-- (you can customize the admin check based on your setup)
ALTER TABLE boq_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read library"
  ON boq_library FOR SELECT
  USING (true);

CREATE POLICY "Admins manage library"
  ON boq_library FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
  ))
  WITH CHECK (auth.uid() IN (
    SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
  ));
