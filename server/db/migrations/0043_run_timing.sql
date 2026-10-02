-- 0043_run_timing.sql — P3.8 one authoritative timing policy.
-- A run's preparation (allocation) is distinct from its timed start. The
-- timed start, answer deadline, submission-grace deadline, policy version and
-- approved adjustments are persisted once; a repeated or concurrent Begin
-- returns the original timestamps (one row per session, updated at most once
-- from "not begun" to "begun"). Additive: runs without a row keep the legacy
-- engine-derived timing exactly as before.
CREATE TABLE IF NOT EXISTS assessment_run_timing (
  session_id            TEXT PRIMARY KEY,
  allocated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  timed_started_at      TIMESTAMPTZ,
  answer_deadline_at    TIMESTAMPTZ,
  grace_deadline_at     TIMESTAMPTZ,
  policy_version        TEXT NOT NULL,
  policy_json           JSONB NOT NULL,
  begin_idempotency_key TEXT,
  version               INTEGER NOT NULL DEFAULT 1,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((timed_started_at IS NULL) = (answer_deadline_at IS NULL)),
  CHECK (answer_deadline_at IS NULL OR grace_deadline_at IS NULL OR grace_deadline_at >= answer_deadline_at)
);

-- The Begin transition is recorded as a client event ('begin') next to
-- 'start'; the inline CHECK from 0032 is widened to admit it.
ALTER TABLE assessment_client_events DROP CONSTRAINT IF EXISTS assessment_client_events_kind_check;
ALTER TABLE assessment_client_events
  ADD CONSTRAINT assessment_client_events_kind_check CHECK (kind IN ('START', 'BEGIN', 'MESSAGE', 'ARTIFACT', 'FINISH'));
