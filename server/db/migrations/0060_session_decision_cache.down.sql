-- Down: remove the PROD-READY Phase 6 decision cache. The cache holds derived
-- data only (recomputed on demand), so nothing is lost; analytics computes
-- every decision per request again, as before 0060.
DROP TRIGGER IF EXISTS session_decision_inputs_erasure ON assessment_erasure_markers;
DROP TRIGGER IF EXISTS session_decision_inputs_report_version ON student_report_versions;
DROP TRIGGER IF EXISTS session_decision_inputs_admin_state ON admin_session_states;
DROP TRIGGER IF EXISTS session_decision_inputs_report ON v1_reports;
DROP TRIGGER IF EXISTS session_decision_inputs_session_update ON v1_sessions;
DROP TRIGGER IF EXISTS session_decision_inputs_session ON v1_sessions;
DROP TRIGGER IF EXISTS session_decision_inputs_evidence ON behavioral_evidence_units;
DROP FUNCTION IF EXISTS prism_session_decision_inputs_changed();
DROP TABLE IF EXISTS session_decision_cache;
DROP TABLE IF EXISTS session_decision_inputs;
