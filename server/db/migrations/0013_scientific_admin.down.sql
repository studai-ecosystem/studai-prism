-- Rollback for 0013_scientific_admin. Drops only what the up added. The
-- calibration/training-ref column drops are safe: nothing outside the admin
-- console writes them, and the Python jobs never read them.

ALTER TABLE rater_training_refs DROP COLUMN IF EXISTS status;

ALTER TABLE calibration_runs DROP COLUMN IF EXISTS superseded_by;
ALTER TABLE calibration_runs DROP COLUMN IF EXISTS applied_by;
ALTER TABLE calibration_runs DROP COLUMN IF EXISTS applied_at;
ALTER TABLE calibration_runs DROP COLUMN IF EXISTS frozen_by;
ALTER TABLE calibration_runs DROP COLUMN IF EXISTS frozen_at;
ALTER TABLE calibration_runs DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE calibration_runs DROP COLUMN IF EXISTS review_note;
ALTER TABLE calibration_runs DROP COLUMN IF EXISTS rejected;

DROP TABLE IF EXISTS prompt_versions;
DROP TABLE IF EXISTS prompt_definitions;
