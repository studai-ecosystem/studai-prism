-- 0046_practice_allowance.sql — P6 practice allowance, assistance and replay stimulus.
-- Additive and reversible. No pricing or purchase flow lives here (P8): a
-- row only bounds how many practice attempts a user may start; when no row
-- exists the service treats practice as unlimited (today's behaviour).
CREATE TABLE IF NOT EXISTS practice_allowances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('BOUNDED')),
  total            INTEGER NOT NULL CHECK (total >= 0),
  used             INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  valid_until      TIMESTAMPTZ,
  source           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_allowances_user_idx ON practice_allowances (user_id, organization_id);

-- Assistance state of an attempt ({ mode: GUIDED|UNCOACHED, hintsUsed,
-- scaffoldRequested }) and, for "Try that moment again", the presented
-- stimulus text copied for teaching — never the learner's transcript.
ALTER TABLE mission_attempts
  ADD COLUMN IF NOT EXISTS assistance_json JSONB,
  ADD COLUMN IF NOT EXISTS stimulus_json JSONB;

-- MEANING (semantic equivalence) joins the practice check types.
ALTER TABLE practice_evidence_units DROP CONSTRAINT IF EXISTS practice_evidence_units_check_type_check;
ALTER TABLE practice_evidence_units
  ADD CONSTRAINT practice_evidence_units_check_type_check CHECK (check_type IN ('DETERMINISTIC', 'EVALUATOR', 'BOTH', 'MEANING'));
