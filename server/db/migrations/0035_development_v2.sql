-- 0035_development_v2.sql — Prism Campus Phase 8 (C8.01; spec §16, §26, §30.9).
-- Development Engine V2: governed practice missions (immutable published
-- versions), mission attempts, a PRACTICE evidence ledger that is physically
-- separate from formal evidence (behavioral_evidence_units is never touched
-- and no view joins the two), development plans derived from formal report
-- priorities, and campus interventions with their memberships. The legacy
-- 0024 `development_missions` / `candidate_mission_attempts` tables stay as
-- they are (legacy immutability, K81). User ids are TEXT (K4); status columns
-- have no defaults (set by services).

CREATE TABLE IF NOT EXISTS mission_definitions (
  id                    TEXT PRIMARY KEY CHECK (id ~ '^[A-Z0-9][A-Z0-9-]{2,63}$'),
  target_capability_id  TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A published version never changes; it can only be retired. New content is a
-- new version number.
CREATE TABLE IF NOT EXISTS mission_versions (
  mission_id      TEXT NOT NULL REFERENCES mission_definitions(id) ON DELETE RESTRICT,
  version         INTEGER NOT NULL CHECK (version >= 1),
  status          TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  schema_version  TEXT NOT NULL,
  content         JSONB NOT NULL,
  content_hash    TEXT NOT NULL,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, version),
  CHECK (status = 'DRAFT' OR published_at IS NOT NULL)
);

CREATE OR REPLACE FUNCTION mission_version_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'published mission versions cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' THEN
    IF NEW.content IS DISTINCT FROM OLD.content OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.schema_version IS DISTINCT FROM OLD.schema_version OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.mission_id IS DISTINCT FROM OLD.mission_id OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'published mission versions are immutable';
    END IF;
    IF NOT (OLD.status = 'PUBLISHED' AND NEW.status IN ('PUBLISHED', 'RETIRED')) AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'a retired mission version cannot be republished';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mission_versions_immutable
  BEFORE UPDATE OR DELETE ON mission_versions
  FOR EACH ROW EXECUTE FUNCTION mission_version_guard();

CREATE TABLE IF NOT EXISTS interventions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  target_capability_id   TEXT NOT NULL,
  cohort_id              UUID NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT,
  starts_on              DATE NOT NULL,
  ends_on                DATE NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  mission_ids            TEXT[] NOT NULL CHECK (cardinality(mission_ids) BETWEEN 1 AND 10),
  reassessment_planned   BOOLEAN NOT NULL,
  created_by             TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS interventions_org_idx ON interventions (organization_id);

CREATE TABLE IF NOT EXISTS intervention_memberships (
  intervention_id  UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (intervention_id, user_id)
);
CREATE INDEX IF NOT EXISTS intervention_memberships_user_idx ON intervention_memberships (user_id);

-- Phase 7 left this link without a target table.
ALTER TABLE campus_program_interventions
  ADD CONSTRAINT campus_program_interventions_intervention_fk
  FOREIGN KEY (intervention_id) REFERENCES interventions(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS mission_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  mission_id        TEXT NOT NULL,
  mission_version   INTEGER NOT NULL,
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  intervention_id   UUID REFERENCES interventions(id) ON DELETE SET NULL,
  status            TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'EVALUATED', 'EVALUATION_UNAVAILABLE')),
  work              JSONB NOT NULL,
  version           INTEGER NOT NULL CHECK (version >= 1),
  hints_used        INTEGER NOT NULL CHECK (hints_used >= 0),
  idempotency_key   TEXT NOT NULL,
  evaluation        JSONB,
  submitted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (mission_id, mission_version) REFERENCES mission_versions(mission_id, version) ON DELETE RESTRICT,
  UNIQUE (user_id, idempotency_key),
  CHECK (intervention_id IS NULL OR organization_id IS NOT NULL),
  CHECK (status = 'IN_PROGRESS' OR (submitted_at IS NOT NULL AND evaluation IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mission_attempts_user_idx ON mission_attempts (user_id, mission_id);
CREATE INDEX IF NOT EXISTS mission_attempts_intervention_idx ON mission_attempts (intervention_id);

-- Practice evidence: only criteria the pipeline actually verified, one row per
-- attempt and criterion. Never read by formal evidence, sufficiency or report
-- code. Rows never change; DELETE stays possible for erasure.
CREATE TABLE IF NOT EXISTS practice_evidence_units (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id       UUID NOT NULL REFERENCES mission_attempts(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  mission_id       TEXT NOT NULL,
  mission_version  INTEGER NOT NULL,
  capability_id    TEXT NOT NULL,
  behavior_id      TEXT NOT NULL,
  criterion_id     TEXT NOT NULL,
  source_type      TEXT NOT NULL CHECK (source_type = 'MISSION_PRACTICE'),
  check_type       TEXT NOT NULL CHECK (check_type IN ('DETERMINISTIC', 'EVALUATOR', 'BOTH')),
  excerpt          TEXT,
  provenance       JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, criterion_id)
);
CREATE INDEX IF NOT EXISTS practice_evidence_units_user_idx ON practice_evidence_units (user_id);

CREATE TRIGGER practice_evidence_units_append_only
  BEFORE UPDATE ON practice_evidence_units
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

-- One plan per source report (the newest formal session with priorities).
CREATE TABLE IF NOT EXISTS development_plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT NOT NULL,
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source_session_id  TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUPERSEDED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_session_id)
);

CREATE TABLE IF NOT EXISTS development_plan_items (
  plan_id        UUID NOT NULL REFERENCES development_plans(id) ON DELETE CASCADE,
  capability_id  TEXT NOT NULL,
  position       INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  PRIMARY KEY (plan_id, capability_id),
  UNIQUE (plan_id, position)
);
