-- 0061_demo_organizations.sql — PROD-READY Phase 8 (sales readiness): demo
-- organizations are marked in the data model and kept apart from real data.
-- Additive only; reversed by the .down.sql.
--
--   * organizations.is_demo — set only when the row is created (by
--     server/db/seedDemoOrg.js); it can never change afterwards, so a real
--     organization cannot become a demo one or the other way round.
--   * demo_accounts — the synthetic accounts the demo seed created (one row
--     per account, with the demo organization it belongs to). Holds no
--     personal data of a real person: every account in it is synthetic.
--   * Isolation guards: a demo account can only be a member, cohort member or
--     roster row of a demo organization, and a demo organization can only
--     hold demo accounts. Enforced by triggers, so neither the application
--     nor a direct SQL write can mix synthetic and real data.
--   * demo_session_ids — every session owned by a demo account. Calibration
--     jobs (calibration/jobs/_base.py) and the rating queue exclude these.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION prism_organization_demo_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'organizations.is_demo is set at creation and never changes (organization %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizations_demo_immutable ON organizations;
CREATE TRIGGER organizations_demo_immutable
  BEFORE UPDATE OF is_demo ON organizations
  FOR EACH ROW EXECUTE FUNCTION prism_organization_demo_immutable();

CREATE TABLE IF NOT EXISTS demo_accounts (
  user_id          TEXT PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demo_accounts_org_idx ON demo_accounts (organization_id);

-- A demo account may only be registered for a demo organization.
CREATE OR REPLACE FUNCTION prism_demo_account_org_is_demo() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = NEW.organization_id AND is_demo) THEN
    RAISE EXCEPTION 'PRISM_DEMO_ISOLATION: demo account % can only belong to a demo organization', NEW.user_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS demo_accounts_org_is_demo ON demo_accounts;
CREATE TRIGGER demo_accounts_org_is_demo
  BEFORE INSERT OR UPDATE ON demo_accounts
  FOR EACH ROW EXECUTE FUNCTION prism_demo_account_org_is_demo();

-- Shared check: the account and the organization must be both demo or both real.
CREATE OR REPLACE FUNCTION prism_demo_isolation_check(p_user_id TEXT, p_org_id UUID) RETURNS void AS $$
DECLARE
  org_demo BOOLEAN;
  user_demo BOOLEAN;
BEGIN
  IF p_user_id IS NULL OR p_org_id IS NULL THEN
    RETURN;
  END IF;
  SELECT is_demo INTO org_demo FROM organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN; -- the foreign key reports a missing organization
  END IF;
  user_demo := EXISTS (SELECT 1 FROM demo_accounts WHERE user_id = p_user_id);
  IF user_demo AND NOT org_demo THEN
    RAISE EXCEPTION 'PRISM_DEMO_ISOLATION: a synthetic demo account cannot join a real organization'
      USING ERRCODE = 'check_violation';
  END IF;
  IF org_demo AND NOT user_demo THEN
    RAISE EXCEPTION 'PRISM_DEMO_ISOLATION: a demo organization holds synthetic demo accounts only'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prism_demo_isolation_membership() RETURNS trigger AS $$
BEGIN
  PERFORM prism_demo_isolation_check(NEW.user_id, NEW.organization_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organization_memberships_demo_isolation ON organization_memberships;
CREATE TRIGGER organization_memberships_demo_isolation
  BEFORE INSERT OR UPDATE OF user_id, organization_id ON organization_memberships
  FOR EACH ROW EXECUTE FUNCTION prism_demo_isolation_membership();

CREATE OR REPLACE FUNCTION prism_demo_isolation_cohort_member() RETURNS trigger AS $$
BEGIN
  PERFORM prism_demo_isolation_check(NEW.user_id, (SELECT organization_id FROM cohorts WHERE id = NEW.cohort_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cohort_members_demo_isolation ON cohort_members;
CREATE TRIGGER cohort_members_demo_isolation
  BEFORE INSERT OR UPDATE OF user_id, cohort_id ON cohort_members
  FOR EACH ROW EXECUTE FUNCTION prism_demo_isolation_cohort_member();

CREATE OR REPLACE FUNCTION prism_demo_isolation_roster() RETURNS trigger AS $$
BEGIN
  PERFORM prism_demo_isolation_check(NEW.user_id, (SELECT organization_id FROM assessment_assignments WHERE id = NEW.assignment_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assessment_assignment_students_demo_isolation ON assessment_assignment_students;
CREATE TRIGGER assessment_assignment_students_demo_isolation
  BEFORE INSERT OR UPDATE OF user_id, assignment_id ON assessment_assignment_students
  FOR EACH ROW EXECUTE FUNCTION prism_demo_isolation_roster();

-- Sessions owned by demo accounts (excluded from calibration and rating).
CREATE OR REPLACE VIEW demo_session_ids AS
  SELECT s.session_id FROM v1_sessions s JOIN demo_accounts d ON d.user_id = s.user_id;
