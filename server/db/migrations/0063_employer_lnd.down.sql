-- Down: remove the PROD-READY Phase 9 employer guards and consent types. The
-- employer workspace is dark (PRISM_EMPLOYER_LND off), so no employer consent
-- record exists unless a human enabled it. If one does, the restored CHECK
-- below fails and the rollback stops: employee consent records are evidence
-- and are never deleted by a schema rollback.
DROP TRIGGER IF EXISTS organizations_employer_type_immutable ON organizations;
DROP FUNCTION IF EXISTS prism_organization_employer_type_immutable();
DROP TRIGGER IF EXISTS assessment_session_scopes_employer_visibility ON assessment_session_scopes;
DROP FUNCTION IF EXISTS prism_employer_session_visibility();
ALTER TABLE consent_records DROP CONSTRAINT IF EXISTS consent_records_consent_type_check;
ALTER TABLE consent_records ADD CONSTRAINT consent_records_consent_type_check
  CHECK (consent_type IN ('CAMPUS_SPONSORSHIP_DISCLOSURE', 'CAMPUS_ASSESSMENT_DISCLOSURE', 'SHARE_GRANT'));
