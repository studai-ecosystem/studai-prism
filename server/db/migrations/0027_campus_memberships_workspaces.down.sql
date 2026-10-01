-- 0027_campus_memberships_workspaces.down.sql — reverses 0027 exactly.
DROP INDEX IF EXISTS organization_invites_org_idx;
DROP TABLE IF EXISTS organization_invites;
DROP INDEX IF EXISTS workspaces_personal_owner_uniq;
DROP INDEX IF EXISTS workspaces_owner_idx;
DROP INDEX IF EXISTS workspaces_org_idx;
DROP TABLE IF EXISTS workspaces;
DROP INDEX IF EXISTS organization_memberships_user_idx;
DROP INDEX IF EXISTS organization_memberships_org_idx;
DROP TABLE IF EXISTS organization_memberships;
