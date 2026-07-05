-- Rollback for 0004_longitudinal_spine.
DROP TABLE IF EXISTS assessment_timeline;
DROP INDEX IF EXISTS idx_v1_users_candidate;
ALTER TABLE v1_users DROP COLUMN IF EXISTS candidate_id;
