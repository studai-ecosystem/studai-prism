-- 0030_assessment_assignments.down.sql — reverses 0030 (0022 columns removed, table kept).
DROP TABLE IF EXISTS assessment_assignment_students;
DROP TABLE IF EXISTS assessment_assignment_targets;
DROP TABLE IF EXISTS assessment_assignments;
DROP TABLE IF EXISTS assessment_forms;
ALTER TABLE assessment_definitions DROP COLUMN IF EXISTS integrity_modes;
ALTER TABLE assessment_definitions DROP COLUMN IF EXISTS not_measured;
ALTER TABLE assessment_definitions DROP COLUMN IF EXISTS measures;
ALTER TABLE assessment_definitions DROP COLUMN IF EXISTS description;
