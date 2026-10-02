-- 0040_candidate_actions_jobs.down.sql — reverses 0040.
DROP TRIGGER IF EXISTS assessment_candidate_actions_payload_immutable ON assessment_candidate_actions;
DROP FUNCTION IF EXISTS assessment_candidate_actions_guard();
DROP TABLE IF EXISTS assessment_erasure_markers;
DROP TABLE IF EXISTS assessment_jobs;
DROP TABLE IF EXISTS assessment_candidate_actions;
