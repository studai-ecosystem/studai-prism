-- 0034_campus_programs_ops.down.sql
DROP TRIGGER IF EXISTS organization_audit_events_append_only ON organization_audit_events;
DROP TABLE IF EXISTS organization_audit_events;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS org_onboarding_progress;
DROP TABLE IF EXISTS student_import_rows;
DROP TABLE IF EXISTS student_import_jobs;
DROP TABLE IF EXISTS campus_program_interventions;
DROP TABLE IF EXISTS campus_program_assignments;
DROP TABLE IF EXISTS campus_program_cohorts;
DROP TABLE IF EXISTS campus_programs;
