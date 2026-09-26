-- 0035_development_v2.down.sql
DROP TABLE IF EXISTS development_plan_items;
DROP TABLE IF EXISTS development_plans;
DROP TRIGGER IF EXISTS practice_evidence_units_append_only ON practice_evidence_units;
DROP TABLE IF EXISTS practice_evidence_units;
DROP TABLE IF EXISTS mission_attempts;
ALTER TABLE campus_program_interventions DROP CONSTRAINT IF EXISTS campus_program_interventions_intervention_fk;
DROP TABLE IF EXISTS intervention_memberships;
DROP TABLE IF EXISTS interventions;
DROP TRIGGER IF EXISTS mission_versions_immutable ON mission_versions;
DROP TABLE IF EXISTS mission_versions;
DROP FUNCTION IF EXISTS mission_version_guard();
DROP TABLE IF EXISTS mission_definitions;
