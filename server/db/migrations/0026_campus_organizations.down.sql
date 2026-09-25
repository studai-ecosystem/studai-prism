-- 0026_campus_organizations.down.sql — reverses 0026 exactly.
DROP INDEX IF EXISTS cohort_members_user_idx;
DROP TABLE IF EXISTS cohort_members;
DROP INDEX IF EXISTS cohorts_department_idx;
DROP INDEX IF EXISTS cohorts_org_idx;
DROP TABLE IF EXISTS cohorts;
DROP INDEX IF EXISTS academic_batches_org_idx;
DROP TABLE IF EXISTS academic_batches;
DROP INDEX IF EXISTS academic_programs_org_idx;
DROP TABLE IF EXISTS academic_programs;
DROP INDEX IF EXISTS academic_departments_org_idx;
DROP TABLE IF EXISTS academic_departments;
DROP INDEX IF EXISTS campuses_org_idx;
DROP TABLE IF EXISTS campuses;
DROP TABLE IF EXISTS organizations;
