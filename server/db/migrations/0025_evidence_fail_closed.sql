-- 0025_evidence_fail_closed.sql — Prism Campus C2.01 (spec §30.8, §33.1).
-- Evidence units become strict + nullable: nothing about a judgement is ever
-- defaulted. Missing provenance / candidate action → evidence_status
-- INSUFFICIENT_EVIDENCE with rubric_level NULL (enforced by CHECKs below).
-- Pre-existing rows are only FLAGGED as legacy (legacy_row = true); their
-- stored values are never rewritten (legacy immutability, K7).

ALTER TABLE behavioral_evidence_units
  ALTER COLUMN confidence_status DROP DEFAULT,
  ALTER COLUMN confidence_status DROP NOT NULL,
  ALTER COLUMN rubric_level DROP NOT NULL,
  ALTER COLUMN rubric_label DROP NOT NULL,
  ALTER COLUMN observable_behavior DROP NOT NULL,
  ALTER COLUMN judge_agreement DROP DEFAULT,
  ALTER COLUMN judge_agreement DROP NOT NULL,
  ALTER COLUMN candidate_action DROP DEFAULT,
  ALTER COLUMN candidate_action DROP NOT NULL,
  ALTER COLUMN provenance DROP DEFAULT,
  ALTER COLUMN provenance DROP NOT NULL,
  ALTER COLUMN capability_layer DROP DEFAULT,
  ALTER COLUMN capability_layer DROP NOT NULL,
  ALTER COLUMN blueprint_id DROP NOT NULL,
  ALTER COLUMN source_turn DROP NOT NULL;

ALTER TABLE behavioral_evidence_units
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS behavior_anchor_id TEXT,
  ADD COLUMN IF NOT EXISTS candidate_action_json JSONB,
  ADD COLUMN IF NOT EXISTS judge_agreement_json JSONB,
  ADD COLUMN IF NOT EXISTS human_review_status TEXT,
  ADD COLUMN IF NOT EXISTS provenance_json JSONB,
  ADD COLUMN IF NOT EXISTS assessment_form_id TEXT,
  ADD COLUMN IF NOT EXISTS evidence_status TEXT,
  ADD COLUMN IF NOT EXISTS legacy_row BOOLEAN NOT NULL DEFAULT false;

-- Flag, never rewrite, everything written before this migration.
UPDATE behavioral_evidence_units SET legacy_row = true;

ALTER TABLE behavioral_evidence_units
  ADD CONSTRAINT evidence_status_values CHECK (
    evidence_status IS NULL
    OR evidence_status IN ('INSUFFICIENT_EVIDENCE', 'PROVISIONAL', 'SUFFICIENT', 'HUMAN_REVIEW_REQUIRED')
  ),
  -- New rows must carry an explicit status; only legacy rows may lack one.
  ADD CONSTRAINT evidence_status_required CHECK (legacy_row OR evidence_status IS NOT NULL),
  -- Insufficient evidence never carries a rubric level or label.
  ADD CONSTRAINT evidence_insufficient_has_no_level CHECK (
    evidence_status IS DISTINCT FROM 'INSUFFICIENT_EVIDENCE'
    OR (rubric_level IS NULL AND rubric_label IS NULL)
  ),
  -- A non-legacy judged level needs provenance and the observed action.
  ADD CONSTRAINT evidence_level_needs_provenance CHECK (
    legacy_row OR rubric_level IS NULL
    OR (provenance_json IS NOT NULL AND candidate_action_json IS NOT NULL)
  ),
  ADD CONSTRAINT human_review_status_values CHECK (
    human_review_status IS NULL
    OR human_review_status IN ('NOT_REQUIRED', 'REQUIRED', 'IN_REVIEW', 'COMPLETED')
  );

CREATE INDEX IF NOT EXISTS idx_evidence_status ON behavioral_evidence_units (session_id, evidence_status);
