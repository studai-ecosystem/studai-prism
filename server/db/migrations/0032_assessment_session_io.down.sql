-- 0032_assessment_session_io.down.sql — reverses 0032.
DROP TRIGGER IF EXISTS assessment_artifact_versions_append_only ON assessment_artifact_versions;
DROP TRIGGER IF EXISTS assessment_client_events_append_only ON assessment_client_events;
DROP TABLE IF EXISTS assessment_artifact_versions;
DROP TABLE IF EXISTS assessment_client_events;
