-- 0030_assessment_assignments.sql — Prism Campus Phase 4 (C4.01; spec §10, §11, §30.6).
-- Assessment forms (one row per frozen scenario a definition may administer),
-- assignments (PERSONAL or INSTITUTION sponsored), assignment targets and the
-- per-student assignment state. Extends the 0022 catalog table instead of
-- creating a second definitions table (K51). Catalog rows are seeded by the
-- idempotent application seed (server/domain/assessments/catalog.js) from the
-- frozen scenario bank only — this migration inserts no content.
-- No status column has a default: every writer states its value explicitly.

ALTER TABLE assessment_definitions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE assessment_definitions ADD COLUMN IF NOT EXISTS measures JSONB;
ALTER TABLE assessment_definitions ADD COLUMN IF NOT EXISTS not_measured JSONB;
ALTER TABLE assessment_definitions ADD COLUMN IF NOT EXISTS integrity_modes TEXT[];

CREATE TABLE IF NOT EXISTS assessment_forms (
  id               TEXT PRIMARY KEY,
  definition_id    TEXT NOT NULL REFERENCES assessment_definitions(assessment_definition_id) ON DELETE RESTRICT,
  version          TEXT NOT NULL,
  scenario_id      TEXT NOT NULL,
  job_family_id    TEXT,
  capability_ids   TEXT[] NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('FROZEN', 'RETIRED')),
  frozen_at        TIMESTAMPTZ,
  UNIQUE (definition_id, scenario_id, version),
  CHECK (status <> 'FROZEN' OR frozen_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS assessment_forms_definition_idx ON assessment_forms (definition_id);

-- Personal assignment ids are deterministic (derived from the owner and the
-- entitlement or session they come from) so derivation is idempotent; the
-- personal_key uniqueness makes a concurrent double-insert a no-op.
CREATE TABLE IF NOT EXISTS assessment_assignments (
  id                     TEXT PRIMARY KEY,
  definition_id          TEXT NOT NULL REFERENCES assessment_definitions(assessment_definition_id) ON DELETE RESTRICT,
  form_policy            TEXT NOT NULL CHECK (form_policy IN ('SERVER_SELECTED', 'FIXED_FORM')),
  form_id                TEXT REFERENCES assessment_forms(id) ON DELETE RESTRICT,
  sponsor_type           TEXT NOT NULL CHECK (sponsor_type IN ('PERSONAL', 'INSTITUTION')),
  organization_id        UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  program_id             TEXT,
  personal_key           TEXT UNIQUE,
  window_start           TIMESTAMPTZ,
  window_end             TIMESTAMPTZ,
  integrity_policy       TEXT NOT NULL CHECK (integrity_policy IN ('STANDARD', 'PROCTORED')),
  accommodations_policy  JSONB NOT NULL,
  reminder_policy        JSONB NOT NULL,
  created_by             TEXT NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELLED')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sponsor_type <> 'PERSONAL' OR (organization_id IS NULL AND personal_key IS NOT NULL)),
  CHECK (sponsor_type <> 'INSTITUTION' OR (organization_id IS NOT NULL AND personal_key IS NULL)),
  CHECK (form_policy <> 'FIXED_FORM' OR form_id IS NOT NULL),
  CHECK (window_start IS NULL OR window_end IS NULL OR window_end > window_start)
);
CREATE INDEX IF NOT EXISTS assessment_assignments_org_idx ON assessment_assignments (organization_id);

CREATE TABLE IF NOT EXISTS assessment_assignment_targets (
  assignment_id  TEXT NOT NULL REFERENCES assessment_assignments(id) ON DELETE CASCADE,
  target_type    TEXT NOT NULL CHECK (target_type IN ('USER', 'COHORT', 'PROGRAM', 'ORGANIZATION')),
  target_id      TEXT NOT NULL,
  PRIMARY KEY (assignment_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS assessment_assignment_students (
  assignment_id      TEXT NOT NULL REFERENCES assessment_assignments(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'WITHDRAWN')),
  session_id         TEXT,
  consent_record_id  UUID REFERENCES consent_records(id) ON DELETE SET NULL,
  acknowledged_at    TIMESTAMPTZ,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id),
  CHECK (status NOT IN ('IN_PROGRESS', 'COMPLETED') OR session_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS assessment_assignment_students_user_idx ON assessment_assignment_students (user_id);
