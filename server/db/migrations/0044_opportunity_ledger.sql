-- 0044_opportunity_ledger.sql — P4.5 opportunity ledger (CH-17).
-- One row per planned opportunity of a Director-driven run: lifecycle state,
-- the actual rendered stimulus and its hash, and the accepted candidate
-- action ids attached to it. Additive; legacy runs have no rows. No PII.
CREATE TABLE IF NOT EXISTS assessment_opportunities (
  session_id      TEXT NOT NULL,
  opportunity_id  TEXT NOT NULL,
  group_id        TEXT,
  capability_id   TEXT NOT NULL,
  behaviour_ids   TEXT[] NOT NULL DEFAULT '{}',
  state           TEXT NOT NULL DEFAULT 'PLANNED'
                  CHECK (state IN ('PLANNED', 'PRESENTED', 'ACTION_RECEIVED', 'EVALUATION_PENDING', 'EVALUATED',
                                   'DELIVERY_FAILED', 'NOT_ACCESSIBLE', 'SKIPPED_BY_POLICY', 'EXPIRED', 'REVIEW_REQUIRED')),
  presented_at    TIMESTAMPTZ,
  render_hash     TEXT,
  stimulus_json   JSONB,
  action_ids      TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, opportunity_id)
);
CREATE INDEX IF NOT EXISTS assessment_opportunities_state_idx ON assessment_opportunities (session_id, state);
