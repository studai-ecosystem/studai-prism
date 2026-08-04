-- 0018_candidate_governance.sql — charter MASTER-2026-08-04 Phase 3
-- (§9 identity assurance, §11 appeals, §12 age gating).
--
--   * v1_users.age_declaration — the version-stamped 18+ declaration
--     ({ version, at, meta:{ip,userAgent} }). §12: an explicit, audited
--     confirmation, NOT a date of birth (none is collected).
--   * v1_disputes.resolution — the candidate-readable review outcome
--     ({ outcome, explanation, decidedAt }). §11: candidates receive a
--     readable explanation; private reviewer reasoning stays in admin notes.
--   * institution_verifications — §9 Level 2 evidence. An invite alone NEVER
--     proves identity: Level 2 requires this recorded verification event with
--     the responsible institutional authority named.

ALTER TABLE v1_users ADD COLUMN IF NOT EXISTS age_declaration JSONB;

ALTER TABLE v1_disputes ADD COLUMN IF NOT EXISTS resolution JSONB;

CREATE TABLE IF NOT EXISTS institution_verifications (
  verification_id UUID PRIMARY KEY,
  session_id      TEXT NOT NULL,        -- pseudonymous session key; no account/user id stored
  invite_id       UUID,
  authority       TEXT NOT NULL,          -- responsible institution + person/role
  method          TEXT NOT NULL,          -- e.g. 'roster_confirmation', 'placement_cell_attestation'
  note            TEXT NOT NULL DEFAULT '',
  recorded_by     UUID NOT NULL,          -- admin who recorded the event
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_verifications_session
  ON institution_verifications (session_id);
