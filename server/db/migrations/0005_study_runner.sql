-- Prism "Beyond Vantage" Track 6 — the Study Runner.
--
-- The corpus of completed studies IS the company: this schema makes running
-- validation studies cheap and makes their results tamper-evident.
--   T6.1 studies            — pre-registered study registry
--   T6.2 study_sessions     — immutable random-arm assignment (UPDATE blocked;
--                             DELETE allowed only for the erasure cascade)
--   T6.3 raters + training  — human-rating workbench with an IRR gate
--   T6.4 study_results      — append-only preregistered metrics (supersede,
--                             never mutate; enforced by trigger)
--   session_transcripts     — blinded rating material (candidate + avatar
--                             turns), pseudonymous, telemetry-gated, covered
--                             by the erasure cascade.

CREATE TABLE IF NOT EXISTS studies (
  study_id             UUID PRIMARY KEY,
  study_key            TEXT UNIQUE NOT NULL,   -- stable handle, e.g. 'steering_ab'
  title                TEXT NOT NULL,
  hypothesis           TEXT NOT NULL,
  preregistered_metric TEXT NOT NULL,
  protocol_doc         TEXT NOT NULL,          -- repo path of the protocol document
  cohort_tags          JSONB,
  status               TEXT NOT NULL DEFAULT 'preregistered'
                       CHECK (status IN ('preregistered','active','complete','abandoned')),
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_sessions (
  study_id     UUID NOT NULL REFERENCES studies,
  session_id   UUID NOT NULL,
  arm          TEXT,
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (study_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_study_sessions_session ON study_sessions (session_id);

CREATE TABLE IF NOT EXISTS study_results (
  result_id        UUID PRIMARY KEY,
  study_id         UUID NOT NULL REFERENCES studies,
  metric_name      TEXT NOT NULL,
  value            NUMERIC,
  detail           JSONB,
  n                INT,
  analysis_version TEXT,
  superseded_by    UUID,                        -- newer result_id; the ONLY mutable column, write-once
  computed_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_study_results_study ON study_results (study_id, computed_at);

-- Raters carry NO PII: an operator-chosen handle and a token hash only.
CREATE TABLE IF NOT EXISTS raters (
  rater_id       UUID PRIMARY KEY,
  handle         TEXT UNIQUE NOT NULL,
  token_hash     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'training'
                 CHECK (status IN ('training','qualified','suspended')),
  training_kappa NUMERIC,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rater_training_refs (
  ref_id           UUID PRIMARY KEY,
  transcript       JSONB NOT NULL,       -- blinded training transcript (authored)
  reference_levels JSONB NOT NULL,       -- {dimension: 0-4} gold answer
  rubric_version   TEXT DEFAULT 'v1',
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rater_training_answers (
  answer_id  UUID PRIMARY KEY,
  rater_id   UUID NOT NULL REFERENCES raters,
  ref_id     UUID NOT NULL REFERENCES rater_training_refs,
  levels     JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (rater_id, ref_id)
);

-- Blinded rating material: the full conversation (candidate + avatar turns),
-- WITHOUT any AI scores. Pseudonymous (session-keyed). Erasure-cascaded.
CREATE TABLE IF NOT EXISTS session_transcripts (
  session_id   UUID PRIMARY KEY,
  turns        JSONB NOT NULL,           -- [{speaker:'candidate'|'avatar', name, text}]
  scenario_key TEXT,
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── Immutability guards ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION study_sessions_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'study_sessions assignments are immutable (audit T6.2)';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_study_sessions_no_update ON study_sessions;
CREATE TRIGGER trg_study_sessions_no_update
  BEFORE UPDATE ON study_sessions
  FOR EACH ROW EXECUTE FUNCTION study_sessions_no_update();

CREATE OR REPLACE FUNCTION study_results_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'study_results are append-only (supersede, never delete)';
  END IF;
  -- The only permitted change: setting superseded_by exactly once.
  IF NEW.superseded_by IS NOT NULL AND OLD.superseded_by IS NULL
     AND NEW.result_id = OLD.result_id
     AND NEW.study_id = OLD.study_id
     AND NEW.metric_name = OLD.metric_name
     AND NEW.value IS NOT DISTINCT FROM OLD.value
     AND NEW.detail::text IS NOT DISTINCT FROM OLD.detail::text
     AND NEW.n IS NOT DISTINCT FROM OLD.n
     AND NEW.analysis_version IS NOT DISTINCT FROM OLD.analysis_version
     AND NEW.computed_at = OLD.computed_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'study_results are append-only (supersede, never mutate)';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_study_results_guard_upd ON study_results;
CREATE TRIGGER trg_study_results_guard_upd
  BEFORE UPDATE OR DELETE ON study_results
  FOR EACH ROW EXECUTE FUNCTION study_results_guard();
