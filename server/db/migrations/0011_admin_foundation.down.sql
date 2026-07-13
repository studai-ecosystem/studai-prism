-- Rollback for 0011_admin_foundation. Safe: drops only the admin-plane tables
-- introduced by the up migration; touches no candidate or scientific data.

DROP TABLE IF EXISTS admin_incidents;
DROP TABLE IF EXISTS admin_exports;
DROP TABLE IF EXISTS admin_saved_views;
DROP TABLE IF EXISTS admin_notifications;
DROP TABLE IF EXISTS admin_notes;
DROP TABLE IF EXISTS admin_approvals;
DROP TRIGGER IF EXISTS trg_admin_audit_immutable ON admin_audit_events;
DROP FUNCTION IF EXISTS admin_audit_events_immutable();
DROP TABLE IF EXISTS admin_audit_events;
DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS admin_mfa_methods;
DROP TABLE IF EXISTS admin_user_roles;
DROP TABLE IF EXISTS admin_role_permissions;
DROP TABLE IF EXISTS admin_permissions;
DROP TABLE IF EXISTS admin_roles;
DROP TABLE IF EXISTS admin_users;
