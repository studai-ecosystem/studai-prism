-- 0027_campus_memberships_workspaces.sql — Prism Campus Phase 3 (C3.02, C3.10; spec §29, §30.3–§30.4, §37.2).
-- Roles are the spec §29 set; scope limits (Assigned/Department) live in
-- `scope` jsonb + department_id. Org invites store only a token HASH.

CREATE TABLE IF NOT EXISTS organization_memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('ORG_OWNER', 'PLACEMENT_DIRECTOR', 'PLACEMENT_OFFICER', 'DEPARTMENT_COORDINATOR', 'FACULTY_MENTOR', 'STUDENT', 'PRISM_REVIEWER', 'STUDAI_ADMIN')),
  status           TEXT NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED')),
  department_id    UUID REFERENCES academic_departments(id) ON DELETE SET NULL,
  scope            JSONB NOT NULL DEFAULT '{}'::jsonb,
  invited_by       TEXT,
  joined_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS organization_memberships_org_idx ON organization_memberships (organization_id);
CREATE INDEX IF NOT EXISTS organization_memberships_user_idx ON organization_memberships (user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL CHECK (type IN ('PERSONAL', 'CAMPUS_STUDENT', 'CAMPUS_ADMIN', 'EMPLOYER')),
  owner_user_id    TEXT,
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, owner_user_id, organization_id),
  CHECK (type = 'PERSONAL' OR organization_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS workspaces_org_idx ON workspaces (organization_id);
CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON workspaces (owner_user_id);
-- NULL organization_id is distinct in the table-level UNIQUE, so PERSONAL rows
-- (if ever persisted; K18 keeps them virtual) need their own guard.
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_personal_owner_uniq ON workspaces (owner_user_id) WHERE type = 'PERSONAL';

CREATE TABLE IF NOT EXISTS organization_invites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('ORG_OWNER', 'PLACEMENT_DIRECTOR', 'PLACEMENT_OFFICER', 'DEPARTMENT_COORDINATOR', 'FACULTY_MENTOR', 'STUDENT')),
  cohort_id        UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  department_id    UUID REFERENCES academic_departments(id) ON DELETE SET NULL,
  token_hash       TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED')),
  invited_by       TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  accepted_by      TEXT,
  accepted_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_invites_org_idx ON organization_invites (organization_id);
