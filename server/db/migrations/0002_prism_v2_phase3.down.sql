-- Down: Prism v2 Phase 3 calibration support.
ALTER TABLE calibration_runs DROP COLUMN IF EXISTS applied;
DROP INDEX IF EXISTS idx_calibration_runs_type;
DROP TABLE IF EXISTS candidate_demographics;
