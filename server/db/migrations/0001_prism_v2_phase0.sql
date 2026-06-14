-- Prism v2 (MASA-2) — Phase 0 telemetry & item logging schema.
-- Tables follow docs/PRISM_v2_System_Spec.md Part C exactly. Additive only:
-- no v1 table is touched. The only departures from the spec are pragmatic,
-- clearly-commented bridge columns (scenario_key) that map the app's existing
-- string scenario ids onto the UUID-keyed item model — required because v1
-- scenarios are identified by slugs ("group-project"), not UUIDs.

-- Items: every scenario and probe-template is an item.
CREATE TABLE IF NOT EXISTS items (
  item_id          UUID PRIMARY KEY,
  scenario_id      UUID NOT NULL,
  scenario_key     TEXT,                  -- bridge: v1 scenario slug (e.g. 'group-project')
  kind             TEXT CHECK (kind IN ('scenario','probe')),
  dimension        TEXT,                  -- primary dimension probed (null for scenario items)
  facet            TEXT,                  -- cost | risk | first-step | people | metric | tradeoff | <dimension>
  tier_label       TEXT,                  -- legacy difficulty tier, kept for bootstrap
  difficulty_b     NUMERIC,               -- IRT difficulty (null until calibrated)
  discrimination_a NUMERIC,
  severity         NUMERIC,               -- scenario severity (Rasch facet)
  status           TEXT CHECK (status IN ('provisional','calibrated','retired')),
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_scenario_key ON items (scenario_key);

-- One row per candidate response to a probe.
CREATE TABLE IF NOT EXISTS item_responses (
  response_id      UUID PRIMARY KEY,
  session_id       UUID NOT NULL,
  item_id          UUID REFERENCES items,
  exchange_no      INT,
  candidate_text   TEXT,
  latency_ms       INT,
  asr_confidence   NUMERIC,
  micro_levels     JSONB,                 -- {dimension: 0-4|NA} from the live micro-rater (null in Phase 0)
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_item_responses_session ON item_responses (session_id);
CREATE INDEX IF NOT EXISTS idx_item_responses_item ON item_responses (item_id);

CREATE TABLE IF NOT EXISTS judge_votes (
  vote_id          UUID PRIMARY KEY,
  response_id      UUID REFERENCES item_responses,
  judge_model      TEXT,                  -- model id + version (drift tracking)
  vote_no          INT,                   -- 1..k
  levels           JSONB,                 -- {dimension: 0-4|NA}
  stability_flag   TEXT,                  -- ok | paraphrase_unstable | swap_unstable
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_judge_votes_response ON judge_votes (response_id);

CREATE TABLE IF NOT EXISTS behavioral_features (
  session_id       UUID PRIMARY KEY,
  features         JSONB,                 -- full feature vector
  channelb_scores  JSONB,                 -- {dimension: score} (shadow until trained)
  model_version    TEXT
);

CREATE TABLE IF NOT EXISTS ability_estimates (
  session_id       UUID,
  exchange_no      INT,
  theta_mean       NUMERIC,
  theta_var        NUMERIC,
  coverage         JSONB,                 -- {dimension: 0-1}
  PRIMARY KEY (session_id, exchange_no)
);

CREATE TABLE IF NOT EXISTS human_ratings (   -- the gold anchor set
  rating_id        UUID PRIMARY KEY,
  session_id       UUID,
  rater_id         TEXT,
  dimension        TEXT,
  score            INT,
  rubric_version   TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calibration_runs (
  run_id           UUID PRIMARY KEY,
  run_type         TEXT,                  -- irt | rasch | conformal | channelB_train
  inputs_summary   JSONB,
  outputs          JSONB,                 -- item params, severities, CI tables, model metrics
  frozen           BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id               BIGSERIAL PRIMARY KEY,
  session_id       UUID,
  event_type       TEXT,                  -- probe_selected | judge_disagreement | human_review | ...
  payload          JSONB,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_session ON audit_log (session_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log (event_type);
