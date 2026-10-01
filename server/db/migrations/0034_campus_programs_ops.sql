-- 0034_campus_programs_ops.sql — Prism Campus Phase 7 (C7.01; spec §19–§25, §37, §43).
-- Campus operations: programs (+ cohort / assignment / intervention links),
-- CSV student imports (job + validated rows), resumable onboarding progress,
-- in-app notifications and the organization audit trail. User ids are TEXT
-- (K4); status columns have no defaults (set by services).

CREATE TABLE IF NOT EXISTS campus_programs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  description         TEXT,
  status              TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED')),
  starts_on           DATE,
  ends_on             DATE,
  reporting_policy    JSONB NOT NULL,
  sponsorship_scope   JSONB NOT NULL,
  created_by          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS campus_programs_org_idx ON campus_programs (organization_id);

CREATE TABLE IF NOT EXISTS campus_program_cohorts (
  program_id  UUID NOT NULL REFERENCES campus_programs(id) ON DELETE CASCADE,
  cohort_id   UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, cohort_id)
);

CREATE TABLE IF NOT EXISTS campus_program_assignments (
  program_id     UUID NOT NULL REFERENCES campus_programs(id) ON DELETE CASCADE,
  assignment_id  TEXT NOT NULL REFERENCES assessment_assignments(id) ON DELETE CASCADE,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, assignment_id)
);

-- Interventions arrive with Development V2 (Phase 8); the FK is added then.
CREATE TABLE IF NOT EXISTS campus_program_interventions (
  program_id       UUID NOT NULL REFERENCES campus_programs(id) ON DELETE CASCADE,
  intervention_id  UUID NOT NULL,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, intervention_id)
);

CREATE TABLE IF NOT EXISTS student_import_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by      TEXT NOT NULL,
  file_name        TEXT,
  status           TEXT NOT NULL CHECK (status IN ('PREVIEW', 'COMMITTED', 'CANCELLED')),
  totals           JSONB NOT NULL,
  commit_key       TEXT,
  committed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'COMMITTED' OR committed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS student_import_jobs_org_idx ON student_import_jobs (organization_id);

CREATE TABLE IF NOT EXISTS student_import_rows (
  job_id      UUID NOT NULL REFERENCES student_import_jobs(id) ON DELETE CASCADE,
  row_number  INTEGER NOT NULL CHECK (row_number >= 1),
  raw         JSONB NOT NULL,
  normalized  JSONB,
  errors      JSONB NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('INVITE', 'ALREADY_MEMBER', 'ERROR')),
  outcome     TEXT CHECK (outcome IS NULL OR outcome IN ('INVITED', 'SKIPPED', 'FAILED')),
  PRIMARY KEY (job_id, row_number)
);

CREATE TABLE IF NOT EXISTS org_onboarding_progress (
  organization_id  UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  completed_steps  TEXT[] NOT NULL,
  data             JSONB NOT NULL,
  updated_by       TEXT NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('ASSIGNMENT_LAUNCHED', 'IMPORT_COMPLETE', 'COMPLETION_THRESHOLD', 'ROLE_CHANGED')),
  payload          JSONB NOT NULL,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- Organization decision trail (who changed what). Append-only: rows never
-- change or disappear through the application.
CREATE TABLE IF NOT EXISTS organization_audit_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id    TEXT NOT NULL,
  action           TEXT NOT NULL,
  target_type      TEXT NOT NULL,
  target_id        TEXT,
  details          JSONB NOT NULL,
  request_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_audit_events_org_idx ON organization_audit_events (organization_id, created_at DESC);

CREATE TRIGGER organization_audit_events_append_only
  BEFORE UPDATE OR DELETE ON organization_audit_events
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();
