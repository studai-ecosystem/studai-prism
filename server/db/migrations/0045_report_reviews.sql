-- 0045_report_reviews.sql — P5.7 report interpretation review requests (CH-29).
-- A learner asks for a person to review a published report version. The
-- request is a scoped case with its own state; the published version it
-- references is never rewritten (a correction is a new version). Additive; no
-- PII beyond the requesting user id and the learner's own reason text.
CREATE TABLE IF NOT EXISTS report_review_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,
  version     INTEGER NOT NULL CHECK (version >= 1),
  user_id     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'INTERPRETATION'
              CHECK (category IN ('TRANSCRIPTION', 'ATTRIBUTION', 'SCENARIO_FACT', 'INTERPRETATION', 'OTHER')),
  moment_id   TEXT,
  reason      TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000),
  state       TEXT NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'RESOLVED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_review_requests_version_fk
    FOREIGN KEY (session_id, version) REFERENCES student_report_versions (session_id, version)
);
CREATE INDEX IF NOT EXISTS report_review_requests_session_idx ON report_review_requests (session_id, created_at DESC);
