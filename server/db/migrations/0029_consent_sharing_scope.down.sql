-- 0029_consent_sharing_scope.down.sql — reverses 0029 exactly.
DROP INDEX IF EXISTS assessment_session_scopes_owner_idx;
DROP INDEX IF EXISTS assessment_session_scopes_org_idx;
DROP TABLE IF EXISTS assessment_session_scopes;
DROP TRIGGER IF EXISTS data_access_audit_events_append_only ON data_access_audit_events;
DROP INDEX IF EXISTS data_access_audit_events_subject_idx;
DROP INDEX IF EXISTS data_access_audit_events_org_idx;
DROP TABLE IF EXISTS data_access_audit_events;
DROP TABLE IF EXISTS share_grant_resources;
DROP INDEX IF EXISTS share_grants_org_idx;
DROP INDEX IF EXISTS share_grants_owner_idx;
DROP TABLE IF EXISTS share_grants;
DROP INDEX IF EXISTS consent_records_org_idx;
DROP INDEX IF EXISTS consent_records_user_idx;
DROP TABLE IF EXISTS consent_records;
