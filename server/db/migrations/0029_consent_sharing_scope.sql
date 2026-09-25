-- 0029_consent_sharing_scope.sql — Prism Campus Phase 3 (C3.04; spec §4.3, §30.11, §36).
-- Consent records, student-controlled share grants, the append-only data
-- access audit trail, and the sponsorship scope side table for sessions (a
-- session without a row is PERSONAL / OWNER_ONLY).
-- Depends on campus_reject_mutation() from 0028.

CREATE TABLE IF NOT EXISTS consent_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  consent_type     TEXT NOT NULL CHECK (consent_type IN ('CAMPUS_SPONSORSHIP_DISCLOSURE', 'CAMPUS_ASSESSMENT_DISCLOSURE', 'SHARE_GRANT')),
  copy_version     TEXT NOT NULL,
  granted_at       TIMESTAMPTZ NOT NULL,
  withdrawn_at     TIMESTAMPTZ,
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= granted_at)
);
CREATE INDEX IF NOT EXISTS consent_records_user_idx ON consent_records (user_id);
CREATE INDEX IF NOT EXISTS consent_records_org_idx ON consent_records (organization_id);

CREATE TABLE IF NOT EXISTS share_grants (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id              TEXT NOT NULL,
  recipient_type             TEXT NOT NULL CHECK (recipient_type IN ('ORGANIZATION', 'LINK')),
  recipient_organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash                 TEXT UNIQUE,
  expires_at                 TIMESTAMPTZ NOT NULL,
  revoked_at                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (recipient_type <> 'ORGANIZATION' OR recipient_organization_id IS NOT NULL),
  CHECK (recipient_type <> 'LINK' OR token_hash IS NOT NULL),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS share_grants_owner_idx ON share_grants (owner_user_id);
CREATE INDEX IF NOT EXISTS share_grants_org_idx ON share_grants (recipient_organization_id);

CREATE TABLE IF NOT EXISTS share_grant_resources (
  share_grant_id    UUID NOT NULL REFERENCES share_grants(id) ON DELETE CASCADE,
  resource_type     TEXT NOT NULL CHECK (resource_type IN ('ASSESSMENT_REPORT', 'CAPABILITY_PROFILE', 'EVIDENCE_ITEM')),
  resource_id       TEXT NOT NULL,
  disclosure_level  TEXT NOT NULL CHECK (disclosure_level IN ('SUMMARY', 'FULL')),
  PRIMARY KEY (share_grant_id, resource_type, resource_id)
);

CREATE TABLE IF NOT EXISTS data_access_audit_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id    TEXT NOT NULL,
  organization_id  UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  subject_user_id  TEXT,
  resource_type    TEXT NOT NULL,
  resource_id      TEXT,
  action           TEXT NOT NULL,
  purpose          TEXT,
  request_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_access_audit_events_org_idx ON data_access_audit_events (organization_id);
CREATE INDEX IF NOT EXISTS data_access_audit_events_subject_idx ON data_access_audit_events (subject_user_id);

CREATE TRIGGER data_access_audit_events_append_only
  BEFORE UPDATE OR DELETE ON data_access_audit_events
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

CREATE TABLE IF NOT EXISTS assessment_session_scopes (
  session_id               TEXT PRIMARY KEY,
  owner_user_id            TEXT NOT NULL,
  sponsor_type             TEXT NOT NULL CHECK (sponsor_type IN ('PERSONAL', 'INSTITUTION')),
  sponsor_organization_id  UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  workspace_id             TEXT NOT NULL,
  program_id               TEXT,
  cohort_id                UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  visibility_policy        TEXT NOT NULL CHECK (visibility_policy IN ('OWNER_ONLY', 'OWNER_AND_SPONSOR', 'OWNER_AND_SPONSOR_AGGREGATE_ONLY')),
  created_by               TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Personal sessions are private to the owner, always.
  CHECK (sponsor_type <> 'PERSONAL' OR (sponsor_organization_id IS NULL AND visibility_policy = 'OWNER_ONLY')),
  CHECK (sponsor_type <> 'INSTITUTION' OR sponsor_organization_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS assessment_session_scopes_org_idx ON assessment_session_scopes (sponsor_organization_id);
CREATE INDEX IF NOT EXISTS assessment_session_scopes_owner_idx ON assessment_session_scopes (owner_user_id);
