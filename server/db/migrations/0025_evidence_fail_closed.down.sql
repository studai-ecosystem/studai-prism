-- 0025_evidence_fail_closed.down.sql — reverses 0025 exactly.
-- Rows written under 0025 with NULL judgement fields block the NOT NULL
-- restore on purpose: rollback must never invent values for them.

DROP INDEX IF EXISTS idx_evidence_status;

ALTER TABLE behavioral_evidence_units
  DROP CONSTRAINT IF EXISTS human_review_status_values,
  DROP CONSTRAINT IF EXISTS evidence_level_needs_provenance,
  DROP CONSTRAINT IF EXISTS evidence_insufficient_has_no_level,
  DROP CONSTRAINT IF EXISTS evidence_status_required,
  DROP CONSTRAINT IF EXISTS evidence_status_values;

ALTER TABLE behavioral_evidence_units
  DROP COLUMN IF EXISTS legacy_row,
  DROP COLUMN IF EXISTS evidence_status,
  DROP COLUMN IF EXISTS assessment_form_id,
  DROP COLUMN IF EXISTS provenance_json,
  DROP COLUMN IF EXISTS human_review_status,
  DROP COLUMN IF EXISTS judge_agreement_json,
  DROP COLUMN IF EXISTS candidate_action_json,
  DROP COLUMN IF EXISTS behavior_anchor_id,
  DROP COLUMN IF EXISTS source_type;

ALTER TABLE behavioral_evidence_units
  ALTER COLUMN source_turn SET NOT NULL,
  ALTER COLUMN blueprint_id SET NOT NULL,
  ALTER COLUMN capability_layer SET DEFAULT 'LAYER_2_ROLE_SPECIFIC',
  ALTER COLUMN capability_layer SET NOT NULL,
  ALTER COLUMN provenance SET DEFAULT '{}'::jsonb,
  ALTER COLUMN provenance SET NOT NULL,
  ALTER COLUMN candidate_action SET DEFAULT '{}'::jsonb,
  ALTER COLUMN candidate_action SET NOT NULL,
  ALTER COLUMN judge_agreement SET DEFAULT '{}'::jsonb,
  ALTER COLUMN judge_agreement SET NOT NULL,
  ALTER COLUMN observable_behavior SET NOT NULL,
  ALTER COLUMN rubric_label SET NOT NULL,
  ALTER COLUMN rubric_level SET NOT NULL,
  ALTER COLUMN confidence_status SET NOT NULL,
  ALTER COLUMN confidence_status SET DEFAULT 'VERIFIED_CONSENSUS'; -- campus-allow SQL_DEFAULT_VERIFIED: exact reversal to the 0024 schema (rollback only)
