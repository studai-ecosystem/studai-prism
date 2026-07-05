-- Rollback for 0005_study_runner.
DROP TRIGGER IF EXISTS trg_study_results_guard_upd ON study_results;
DROP FUNCTION IF EXISTS study_results_guard();
DROP TRIGGER IF EXISTS trg_study_sessions_no_update ON study_sessions;
DROP FUNCTION IF EXISTS study_sessions_no_update();
DROP TABLE IF EXISTS session_transcripts;
DROP TABLE IF EXISTS rater_training_answers;
DROP TABLE IF EXISTS rater_training_refs;
DROP TABLE IF EXISTS raters;
DROP TABLE IF EXISTS study_results;
DROP TABLE IF EXISTS study_sessions;
DROP TABLE IF EXISTS studies;
