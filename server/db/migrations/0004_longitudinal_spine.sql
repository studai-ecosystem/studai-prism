-- Prism "Beyond Vantage" Track 0 — longitudinal identity & assessment timeline.
--
-- Privacy split (T0.1): candidate_id is the PSEUDONYMOUS spine used by all
-- research/calibration tables. The candidate_id ↔ person mapping lives ONLY in
-- the v1 identity store (v1_users / users.json), which is where PII already
-- resides with its own access path. No research table may ever carry
-- user_id, email, name or any other PII column (enforced by
-- server/test/track0.test.js static schema check).

-- Identity: pair every account with a durable pseudonymous candidate id.
ALTER TABLE v1_users ADD COLUMN IF NOT EXISTS candidate_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_v1_users_candidate ON v1_users (candidate_id);
-- Backfill legacy accounts so every existing session's owner has a candidate_id.
UPDATE v1_users SET candidate_id = gen_random_uuid() WHERE candidate_id IS NULL;

-- Timeline (T0.2): one row per COMPLETED assessment. The raw material for
-- growth curves (Track 1) and for answering "were these two scores produced
-- under the same conditions?" — scale/calibration/consent/flags all stamped.
CREATE TABLE IF NOT EXISTS assessment_timeline (
  timeline_id        UUID PRIMARY KEY,
  candidate_id       UUID,               -- pseudonymous; null for anonymous dev sessions
  session_id         UUID NOT NULL UNIQUE,
  attempt_no         INT,                -- 1-based per candidate at write time
  scenario_key       TEXT,               -- which equated form was used (T0.3)
  scale_version      TEXT,               -- reporting scale at test time
  calibration_run_id TEXT,               -- frozen calibration applied (null until equating ships)
  consent_version    TEXT,               -- exact consent wording accepted
  flags_active       JSONB,              -- PRISM_* feature flags at test time
  is_synthetic       BOOLEAN NOT NULL DEFAULT FALSE, -- RULE 3: dev/dummy/test sessions never enter calibration
  completed_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timeline_candidate ON assessment_timeline (candidate_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_timeline_session ON assessment_timeline (session_id);
