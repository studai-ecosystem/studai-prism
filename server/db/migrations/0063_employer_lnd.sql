-- 0063_employer_lnd.sql — PROD-READY Phase 9: employer development-use (L&D)
-- workspace on the campus machinery (dark behind PRISM_EMPLOYER_LND).
-- No new table and no new personal-data column; reversed by the .down.sql.
--
--   * consent_records.consent_type gains the two employer consent types, so
--     an employee's acknowledgement of the EMPLOYER disclosure (joining, and
--     before each sponsored assessment) is recorded as what it was, never as
--     a campus disclosure. The rows are erased with the account exactly like
--     every other consent record (personalDataRegistry: consent_records).
--   * An employer can never read an individual result through sponsorship:
--     a sponsored session of an EMPLOYER organization must carry the
--     visibility OWNER_ONLY or OWNER_AND_SPONSOR_AGGREGATE_ONLY. Individual
--     reports reach an employer only through the employee's own share grant.
--     Enforced by trigger, so no code path or direct SQL write can widen it.
--   * organizations.organization_type cannot change to or from EMPLOYER after
--     creation (a college's sponsored sessions must not become employer
--     sessions, or the other way round).

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'consent_records'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%consent_type%'
  LOOP
    EXECUTE format('ALTER TABLE consent_records DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE consent_records ADD CONSTRAINT consent_records_consent_type_check
  CHECK (consent_type IN (
    'CAMPUS_SPONSORSHIP_DISCLOSURE', 'CAMPUS_ASSESSMENT_DISCLOSURE', 'SHARE_GRANT',
    'EMPLOYER_DEVELOPMENT_DISCLOSURE', 'EMPLOYER_ASSESSMENT_DISCLOSURE'
  ));

CREATE OR REPLACE FUNCTION prism_employer_session_visibility() RETURNS trigger AS $$
BEGIN
  IF NEW.sponsor_organization_id IS NOT NULL
     AND NEW.visibility_policy NOT IN ('OWNER_ONLY', 'OWNER_AND_SPONSOR_AGGREGATE_ONLY')
     AND EXISTS (SELECT 1 FROM organizations WHERE id = NEW.sponsor_organization_id AND organization_type = 'EMPLOYER') THEN
    RAISE EXCEPTION 'PRISM_EMPLOYER_VISIBILITY: an employer sees individual results only through the employee''s own share (session %)', NEW.session_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assessment_session_scopes_employer_visibility ON assessment_session_scopes;
CREATE TRIGGER assessment_session_scopes_employer_visibility
  BEFORE INSERT OR UPDATE ON assessment_session_scopes
  FOR EACH ROW EXECUTE FUNCTION prism_employer_session_visibility();

CREATE OR REPLACE FUNCTION prism_organization_employer_type_immutable() RETURNS trigger AS $$
BEGIN
  IF (OLD.organization_type = 'EMPLOYER') IS DISTINCT FROM (NEW.organization_type = 'EMPLOYER') THEN
    RAISE EXCEPTION 'PRISM_EMPLOYER_TYPE: organization % cannot change to or from EMPLOYER after creation', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizations_employer_type_immutable ON organizations;
CREATE TRIGGER organizations_employer_type_immutable
  BEFORE UPDATE OF organization_type ON organizations
  FOR EACH ROW EXECUTE FUNCTION prism_organization_employer_type_immutable();
