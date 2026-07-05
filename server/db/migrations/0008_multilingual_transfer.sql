-- Track 4 — multilingual equity + transferability study support.
--
-- 4.1/4.2: assessment_timeline.language records each session's assessment
-- language ('en' | 'hi-en' | 'hi' | 'ta') — the group variable for the
-- multilingual DIF study. Non-English scoring stays provisional/uncalibrated
-- until that study reports.
ALTER TABLE assessment_timeline ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- 4.3: external human-rated live-exercise scores for the SAME candidates
-- (transferability / sim-to-reality study, docs/studies/TRANSFER_PROTOCOL.md).
-- Entered by partner-college raters via the gated admin flow. Append-only:
-- corrections are new rows with supersedes set — never edits.
CREATE TABLE IF NOT EXISTS external_ratings (
  rating_id     UUID PRIMARY KEY,
  session_id    UUID NOT NULL,
  source_org    TEXT NOT NULL,            -- partner college / employer id (no rater PII)
  exercise_type TEXT NOT NULL,            -- e.g. 'group_discussion', 'live_case', 'internship_review'
  rater_role    TEXT,                     -- e.g. 'faculty', 'ta', 'employer' (role, never a name)
  score         NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  notes         TEXT,
  rated_at      DATE,
  supersedes    UUID REFERENCES external_ratings,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_external_ratings_session ON external_ratings (session_id);

CREATE OR REPLACE FUNCTION external_ratings_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'external_ratings are append-only (supersede with a new row)';
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_external_ratings_no_update ON external_ratings;
CREATE TRIGGER trg_external_ratings_no_update
  BEFORE UPDATE ON external_ratings
  FOR EACH ROW EXECUTE FUNCTION external_ratings_no_update();
