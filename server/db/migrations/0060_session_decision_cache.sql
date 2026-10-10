-- 0060_session_decision_cache.sql — PROD-READY Phase 6: materialised
-- per-session sufficiency decisions for campus analytics and growth outcomes.
-- Additive only. Nothing reads or writes the cache unless a human turns
-- PRISM_ANALYTICS_DECISION_CACHE on (and the v1 store is PostgreSQL); the
-- triggers below only keep a version counter.
--
--   * session_decision_cache holds DERIVED data: the decision entry the
--     analytics loader computes for one completed sponsored session (its
--     form, completion date and the sufficiency decision per capability), or
--     NULL when the session is not formal evidence (no report, held,
--     invalidated). It is keyed by session only (no account id, like the
--     evidence units it is derived from) and is deleted with the session by
--     the per-session erasure cascade.
--   * session_decision_inputs is a per-session version counter. Every write
--     that can change a decision bumps it in the writer's own transaction
--     (triggers): new or changed evidence units, the session's scenario /
--     form / completion, the issued report, an admin hold or invalidation, a
--     report version (publication or correction) and an erasure marker.
--   * A cached row is served only while its inputs_version equals the
--     current counter AND its fingerprint equals the running code's
--     fingerprint (sufficiency rules, level labels and thresholds, catalog and
--     loader source). The reader takes the version BEFORE it computes and the
--     write is conditional on it, so a concurrent change can never leave a
--     stale row that is served.

CREATE TABLE IF NOT EXISTS session_decision_inputs (
  session_id  TEXT PRIMARY KEY,
  version     BIGINT NOT NULL DEFAULT 1 CHECK (version >= 0),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_decision_cache (
  session_id      TEXT PRIMARY KEY,
  fingerprint     TEXT NOT NULL CHECK (length(fingerprint) BETWEEN 8 AND 128),
  inputs_version  BIGINT NOT NULL CHECK (inputs_version >= 0),
  entry           JSONB,
  -- The fields campus analytics reads (definition id, status and level band
  -- per capability), so an organization view does not transfer every
  -- evidence id; growth outcomes read the full entry.
  summary         JSONB,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prism_session_decision_inputs_changed() RETURNS trigger AS $$
DECLARE
  new_sid TEXT;
  old_sid TEXT;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN new_sid := NEW.session_id::text; END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN old_sid := OLD.session_id::text; END IF;
  IF new_sid IS NOT NULL THEN
    INSERT INTO session_decision_inputs (session_id, version) VALUES (new_sid, 1)
      ON CONFLICT (session_id) DO UPDATE SET version = session_decision_inputs.version + 1, changed_at = now();
  END IF;
  IF old_sid IS NOT NULL AND old_sid IS DISTINCT FROM new_sid THEN
    INSERT INTO session_decision_inputs (session_id, version) VALUES (old_sid, 1)
      ON CONFLICT (session_id) DO UPDATE SET version = session_decision_inputs.version + 1, changed_at = now();
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_decision_inputs_evidence ON behavioral_evidence_units;
CREATE TRIGGER session_decision_inputs_evidence
  AFTER INSERT OR UPDATE OR DELETE ON behavioral_evidence_units
  FOR EACH ROW EXECUTE FUNCTION prism_session_decision_inputs_changed();

-- v1_sessions is written on every engine turn; only a change to what an
-- entry reads (scenario, completion, recorded form) bumps the counter.
DROP TRIGGER IF EXISTS session_decision_inputs_session ON v1_sessions;
CREATE TRIGGER session_decision_inputs_session
  AFTER INSERT OR DELETE ON v1_sessions
  FOR EACH ROW EXECUTE FUNCTION prism_session_decision_inputs_changed();
DROP TRIGGER IF EXISTS session_decision_inputs_session_update ON v1_sessions;
CREATE TRIGGER session_decision_inputs_session_update
  AFTER UPDATE ON v1_sessions
  FOR EACH ROW
  WHEN (OLD.session_id IS DISTINCT FROM NEW.session_id OR OLD.scenario_id IS DISTINCT FROM NEW.scenario_id
        OR OLD.completed_at IS DISTINCT FROM NEW.completed_at OR OLD.assessment_form_id IS DISTINCT FROM NEW.assessment_form_id)
  EXECUTE FUNCTION prism_session_decision_inputs_changed();

DROP TRIGGER IF EXISTS session_decision_inputs_report ON v1_reports;
CREATE TRIGGER session_decision_inputs_report
  AFTER INSERT OR UPDATE OR DELETE ON v1_reports
  FOR EACH ROW EXECUTE FUNCTION prism_session_decision_inputs_changed();

DROP TRIGGER IF EXISTS session_decision_inputs_admin_state ON admin_session_states;
CREATE TRIGGER session_decision_inputs_admin_state
  AFTER INSERT OR UPDATE OR DELETE ON admin_session_states
  FOR EACH ROW EXECUTE FUNCTION prism_session_decision_inputs_changed();

DROP TRIGGER IF EXISTS session_decision_inputs_report_version ON student_report_versions;
CREATE TRIGGER session_decision_inputs_report_version
  AFTER INSERT OR UPDATE OR DELETE ON student_report_versions
  FOR EACH ROW EXECUTE FUNCTION prism_session_decision_inputs_changed();

DROP TRIGGER IF EXISTS session_decision_inputs_erasure ON assessment_erasure_markers;
CREATE TRIGGER session_decision_inputs_erasure
  AFTER INSERT OR UPDATE OR DELETE ON assessment_erasure_markers
  FOR EACH ROW EXECUTE FUNCTION prism_session_decision_inputs_changed();
