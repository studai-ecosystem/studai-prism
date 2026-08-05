-- 0020_commercial.sql — charter §22 (B2B pilot packaging) + §23 (contribution margin).
--
-- ai_usage_events: per-call AI usage/cost capture extending the existing
-- ai_usage log line (services/ai/costTracker.js) into a queryable plane.
-- Pseudonymous: session_id only, never user/name/email. estimated_cost_usd is
-- NULL when the model has no configured rate — UNKNOWN is represented as NULL
-- and must never be rendered as zero (§23). Session-keyed rows join the
-- erasure cascade (telemetry.js + privacyPlanner.js, lockstep-tested).
--
-- assessment_invites gains cohort-plan metadata (§22): sponsoring institution,
-- plan JSONB ({cohortPlanned, reviewAllowancePct, term, notes}) and a renewal
-- pointer. NO price fields: pricing is provisional and unpublished (HA-015) —
-- quotes live in documents, not the database.

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id                 BIGSERIAL PRIMARY KEY,
  session_id         TEXT,                        -- NULL = unattributed platform usage
  task               TEXT NOT NULL,
  provider           TEXT NOT NULL DEFAULT 'aws-bedrock',
  model_id           TEXT NOT NULL,
  fallback           BOOLEAN NOT NULL DEFAULT FALSE,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms         INTEGER,
  estimated_cost_usd NUMERIC,                     -- NULL = rate unknown (never zero)
  at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_session ON ai_usage_events (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_at ON ai_usage_events (at);

ALTER TABLE assessment_invites ADD COLUMN IF NOT EXISTS institution TEXT NOT NULL DEFAULT '';
ALTER TABLE assessment_invites ADD COLUMN IF NOT EXISTS plan JSONB;
ALTER TABLE assessment_invites ADD COLUMN IF NOT EXISTS renewal_of UUID REFERENCES assessment_invites(invite_id);
