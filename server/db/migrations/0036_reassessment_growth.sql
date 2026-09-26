-- 0036_reassessment_growth.sql — Prism Campus Phase 9 (C9.01; spec §17, §30.10).
-- Reassessment and growth: an equivalence registry of assessment form pairs
-- (a growth comparison is allowed ONLY across an APPROVED pair; every pair
-- starts PENDING and only a human psychometric decision changes it, HA-C004),
-- an append-only history of those decisions, campus reassessment cycles
-- (a baseline assignment and the reassessment assignment created for it),
-- and capability growth snapshots written only for approved comparable pairs.
-- User ids are TEXT (K4); status columns have no defaults (set by services).

-- One row per unordered pair of forms (stored with form_a_id <= form_b_id; a
-- form paired with itself is a re-administration and also needs approval).
CREATE TABLE IF NOT EXISTS assessment_form_equivalence (
  form_a_id     TEXT NOT NULL REFERENCES assessment_forms(id) ON DELETE RESTRICT,
  form_b_id     TEXT NOT NULL REFERENCES assessment_forms(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  evidence_ref  TEXT,
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (form_a_id, form_b_id),
  CHECK (form_a_id <= form_b_id),
  -- A decision always names who made it, when, and the evidence behind it.
  CHECK ((status = 'PENDING') = (decided_by IS NULL AND decided_at IS NULL)),
  CHECK (status = 'PENDING' OR (evidence_ref IS NOT NULL AND length(evidence_ref) >= 3))
);

-- Every decision ever made on a pair (never updated or deleted).
CREATE TABLE IF NOT EXISTS assessment_form_equivalence_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_a_id     TEXT NOT NULL,
  form_b_id     TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('APPROVED', 'REJECTED')),
  evidence_ref  TEXT NOT NULL CHECK (length(evidence_ref) >= 3),
  reason        TEXT NOT NULL CHECK (length(reason) >= 10),
  decided_by    TEXT NOT NULL,
  approval_id   TEXT,
  decided_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (form_a_id, form_b_id) REFERENCES assessment_form_equivalence(form_a_id, form_b_id) ON DELETE RESTRICT,
  CHECK (status <> 'APPROVED' OR approval_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS assessment_form_equivalence_decisions_pair_idx ON assessment_form_equivalence_decisions (form_a_id, form_b_id);
CREATE TRIGGER assessment_form_equivalence_decisions_append_only
  BEFORE UPDATE OR DELETE ON assessment_form_equivalence_decisions
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

CREATE TABLE IF NOT EXISTS reassessment_cycles (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  program_id                  UUID REFERENCES campus_programs(id) ON DELETE SET NULL,
  intervention_id             UUID REFERENCES interventions(id) ON DELETE SET NULL,
  baseline_assignment_id      TEXT NOT NULL REFERENCES assessment_assignments(id) ON DELETE RESTRICT,
  reassessment_assignment_id  TEXT NOT NULL UNIQUE REFERENCES assessment_assignments(id) ON DELETE RESTRICT,
  window_start                TIMESTAMPTZ NOT NULL,
  window_end                  TIMESTAMPTZ NOT NULL,
  status                      TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELLED')),
  created_by                  TEXT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (window_end > window_start),
  CHECK (baseline_assignment_id <> reassessment_assignment_id)
);
CREATE INDEX IF NOT EXISTS reassessment_cycles_org_idx ON reassessment_cycles (organization_id);

-- A snapshot exists only for an APPROVED form pair where both sessions had
-- SUFFICIENT evidence for the capability. The change is a level-label change;
-- uncertainty is stored only when a validated method produced it.
CREATE TABLE IF NOT EXISTS capability_growth_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  TEXT NOT NULL,
  organization_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
  capability_id            TEXT NOT NULL,
  baseline_session_id      TEXT NOT NULL,
  reassessment_session_id  TEXT NOT NULL,
  form_a_id                TEXT NOT NULL,
  form_b_id                TEXT NOT NULL,
  from_band                TEXT NOT NULL,
  to_band                  TEXT NOT NULL,
  direction                TEXT NOT NULL CHECK (direction IN ('HIGHER', 'SAME', 'LOWER')),
  uncertainty              JSONB,
  rules_version            TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (form_a_id, form_b_id) REFERENCES assessment_form_equivalence(form_a_id, form_b_id) ON DELETE RESTRICT,
  UNIQUE (user_id, capability_id, baseline_session_id, reassessment_session_id),
  CHECK (baseline_session_id <> reassessment_session_id)
);
CREATE INDEX IF NOT EXISTS capability_growth_snapshots_user_idx ON capability_growth_snapshots (user_id);
-- Snapshots are a record of what was shown; they are never edited (DELETE
-- stays possible for erasure).
CREATE OR REPLACE FUNCTION growth_snapshot_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'growth snapshots are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER capability_growth_snapshots_immutable
  BEFORE UPDATE ON capability_growth_snapshots
  FOR EACH ROW EXECUTE FUNCTION growth_snapshot_no_update();
