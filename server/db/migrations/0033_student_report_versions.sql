-- 0033_student_report_versions.sql — Prism Campus Phase 6 (C6.01; spec §14, §33.3).
-- Student Report V3 versions. Each distinct rendering of a session's report is
-- stored once as an immutable version (content hash), so what a student,
-- sponsor or share recipient saw can always be reproduced. Legacy V2 reports
-- are never touched. No status/level defaults: the builder decides everything.

CREATE TABLE IF NOT EXISTS student_report_versions (
  session_id       TEXT NOT NULL,
  version          INTEGER NOT NULL CHECK (version >= 1),
  content_hash     TEXT NOT NULL,
  builder_version  TEXT NOT NULL,
  report_json      JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, version),
  UNIQUE (session_id, content_hash)
);

-- Versions never change once written (UPDATE is rejected). DELETE stays
-- possible because a report contains the candidate's own words: session
-- erasure and retention must be able to remove it.
CREATE TRIGGER student_report_versions_append_only
  BEFORE UPDATE ON student_report_versions
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();
