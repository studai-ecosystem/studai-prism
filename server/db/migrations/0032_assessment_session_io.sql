-- 0032_assessment_session_io.sql — Prism Campus Phase 5 (C5.01; spec §12.2, §39.3).
-- Idempotent client events (a replayed message/start returns the original
-- response instead of running the engine twice) and versioned artifact writes
-- (If-Match; a stale write is a 409 with the server snapshot).

CREATE TABLE IF NOT EXISTS assessment_client_events (
  session_id       TEXT NOT NULL,
  client_event_id  TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('START', 'MESSAGE', 'ARTIFACT', 'FINISH')),
  response_json    JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, client_event_id)
);

CREATE TABLE IF NOT EXISTS assessment_artifact_versions (
  session_id    TEXT NOT NULL,
  artifact_id   TEXT NOT NULL,
  version       INTEGER NOT NULL CHECK (version >= 1),
  content_json  JSONB NOT NULL,
  saved_by      TEXT NOT NULL,
  saved_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, artifact_id, version)
);

-- Rows never change once written (UPDATE is rejected). DELETE stays possible
-- because responses can contain the candidate's own words and the rendered
-- conversation: session erasure and retention must be able to remove them.
CREATE TRIGGER assessment_client_events_append_only
  BEFORE UPDATE ON assessment_client_events
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

CREATE TRIGGER assessment_artifact_versions_append_only
  BEFORE UPDATE ON assessment_artifact_versions
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();
