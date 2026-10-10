-- Down: remove the PROD-READY Phase 8 demo-organization marker and guards.
-- Never run on a database that holds a demo organization next to real ones:
-- without the marker the synthetic rows can no longer be told apart. Demo
-- organizations live in a separate demo database (server/db/seedDemoOrg.js);
-- drop that database instead of rolling this back.
DROP VIEW IF EXISTS demo_session_ids;
DROP TRIGGER IF EXISTS assessment_assignment_students_demo_isolation ON assessment_assignment_students;
DROP TRIGGER IF EXISTS cohort_members_demo_isolation ON cohort_members;
DROP TRIGGER IF EXISTS organization_memberships_demo_isolation ON organization_memberships;
DROP FUNCTION IF EXISTS prism_demo_isolation_roster();
DROP FUNCTION IF EXISTS prism_demo_isolation_cohort_member();
DROP FUNCTION IF EXISTS prism_demo_isolation_membership();
DROP FUNCTION IF EXISTS prism_demo_isolation_check(TEXT, UUID);
DROP TRIGGER IF EXISTS demo_accounts_org_is_demo ON demo_accounts;
DROP FUNCTION IF EXISTS prism_demo_account_org_is_demo();
DROP TABLE IF EXISTS demo_accounts;
DROP TRIGGER IF EXISTS organizations_demo_immutable ON organizations;
DROP FUNCTION IF EXISTS prism_organization_demo_immutable();
ALTER TABLE organizations DROP COLUMN IF EXISTS is_demo;
