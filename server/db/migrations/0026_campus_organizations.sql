-- 0026_campus_organizations.sql — Prism Campus Phase 3 (C3.01; spec §30.1–§30.2).
-- Append-only history: once committed this file is never edited; fix forward.
-- User ids are TEXT (no FK to users, K4). Every org-scoped table carries
-- organization_id + index. Status columns have no defaults (set by services).

CREATE TABLE IF NOT EXISTS organizations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  organization_type  TEXT NOT NULL CHECK (organization_type IN ('UNIVERSITY', 'COLLEGE', 'TRAINING_PROVIDER', 'EMPLOYER', 'OTHER')),
  status             TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  country            TEXT,
  timezone           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campuses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campuses_org_idx ON campuses (organization_id);

CREATE TABLE IF NOT EXISTS academic_departments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campus_id        UUID REFERENCES campuses(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  code             TEXT,
  status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS academic_departments_org_idx ON academic_departments (organization_id);

CREATE TABLE IF NOT EXISTS academic_programs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id    UUID REFERENCES academic_departments(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  degree_level     TEXT,
  duration_years   INTEGER CHECK (duration_years IS NULL OR duration_years BETWEEN 1 AND 10),
  status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS academic_programs_org_idx ON academic_programs (organization_id);

CREATE TABLE IF NOT EXISTS academic_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  program_id       UUID REFERENCES academic_programs(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  start_year       INTEGER,
  end_year         INTEGER,
  status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_year IS NULL OR end_year IS NULL OR end_year >= start_year)
);
CREATE INDEX IF NOT EXISTS academic_batches_org_idx ON academic_batches (organization_id);

CREATE TABLE IF NOT EXISTS cohorts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campus_id            UUID REFERENCES campuses(id) ON DELETE SET NULL,
  department_id        UUID REFERENCES academic_departments(id) ON DELETE SET NULL,
  academic_program_id  UUID REFERENCES academic_programs(id) ON DELETE SET NULL,
  batch_id             UUID REFERENCES academic_batches(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  semester             TEXT,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  owner_user_id        TEXT,
  status               TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cohorts_org_idx ON cohorts (organization_id);
CREATE INDEX IF NOT EXISTS cohorts_department_idx ON cohorts (department_id);

CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id  UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REMOVED')),
  added_by   TEXT,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, user_id)
);
CREATE INDEX IF NOT EXISTS cohort_members_user_idx ON cohort_members (user_id);
