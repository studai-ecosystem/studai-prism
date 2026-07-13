-- 0011_admin_foundation.sql — Super Admin & Product Control Centre, Phase 1.
--
-- Database-backed administrator identities, MFA, sessions, RBAC join tables,
-- immutable admin audit trail, dual-approval ledger, notes, saved views,
-- notifications, export ledger and incident records.
--
-- Design notes:
--   * TABLES ONLY. The role/permission CATALOGUE is seeded idempotently from
--     server/lib/adminRbac.js at boot (same pattern as the studies registry
--     boot-seed) so code and data cannot drift.
--   * admin_audit_events is append-only: UPDATE and DELETE are blocked by
--     trigger, same enforcement style as study_results / credentials.
--   * admin_approvals carries a CHECK that the decider differs from the
--     requester — dual control is enforced by the database, not just the app.
--   * No PII beyond the administrator's own work identity (email, name).
--     Candidate data stays in its existing stores.

-- ── Administrator identities ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  admin_id             UUID PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,          -- stored lowercase
  name                 TEXT NOT NULL DEFAULT '',
  password_hash        TEXT NOT NULL,
  state                TEXT NOT NULL DEFAULT 'invited'
                       CHECK (state IN ('invited','active','suspended','locked','deactivated')),
  is_break_glass       BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_count   INTEGER NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  password_changed_at  TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  last_login_ip        TEXT,
  invited_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RBAC catalogue (rows seeded from lib/adminRbac.js) ──────────────────────
CREATE TABLE IF NOT EXISTS admin_roles (
  role_id     UUID PRIMARY KEY,
  role_key    TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  permission_key TEXT PRIMARY KEY,
  description    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id        UUID NOT NULL REFERENCES admin_roles(role_id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES admin_permissions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
  admin_id   UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES admin_roles(role_id) ON DELETE CASCADE,
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, role_id)
);

-- ── MFA methods (TOTP; secret encrypted at rest, never stored raw) ──────────
CREATE TABLE IF NOT EXISTS admin_mfa_methods (
  method_id        UUID PRIMARY KEY,
  admin_id         UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'totp' CHECK (kind IN ('totp')),
  secret_encrypted TEXT NOT NULL,
  label            TEXT NOT NULL DEFAULT 'Authenticator app',
  confirmed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_admin ON admin_mfa_methods (admin_id);

-- ── Refresh sessions (rotating; only the SHA-256 hash of the token stored) ──
CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id         UUID PRIMARY KEY,
  admin_id           UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  refresh_hash       TEXT NOT NULL UNIQUE,
  csrf_token         TEXT NOT NULL,
  ip                 TEXT,
  user_agent         TEXT,
  is_break_glass     BOOLEAN NOT NULL DEFAULT FALSE,
  break_glass_reason TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ,
  revoke_reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions (admin_id, created_at);

-- ── Immutable admin audit trail ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_events (
  event_id    BIGSERIAL PRIMARY KEY,
  admin_id    UUID,
  admin_email TEXT,
  roles       JSONB,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  before      JSONB,
  after       JSONB,
  reason      TEXT,
  approval_id UUID,
  ip          TEXT,
  user_agent  TEXT,
  request_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin  ON admin_audit_events (admin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON admin_audit_events (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_events (action, created_at);

CREATE OR REPLACE FUNCTION admin_audit_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_events are immutable (append-only audit trail)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_audit_immutable ON admin_audit_events;
CREATE TRIGGER trg_admin_audit_immutable
  BEFORE UPDATE OR DELETE ON admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION admin_audit_events_immutable();

-- ── Dual-approval ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_approvals (
  approval_id      UUID PRIMARY KEY,
  action           TEXT NOT NULL,
  entity_type      TEXT,
  entity_id        TEXT,
  payload          JSONB,
  risk             TEXT NOT NULL DEFAULT 'high' CHECK (risk IN ('low','medium','high')),
  requested_by     UUID NOT NULL REFERENCES admin_users(admin_id),
  requested_reason TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','expired','executed')),
  decided_by       UUID REFERENCES admin_users(admin_id),
  decided_reason   TEXT,
  decided_at       TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL,
  executed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Dual control enforced by the database: the decider can never be the requester.
  CONSTRAINT chk_admin_approvals_dual CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
CREATE INDEX IF NOT EXISTS idx_admin_approvals_status ON admin_approvals (status, created_at);

-- ── Internal notes (never attached to scientific evidence tables) ───────────
CREATE TABLE IF NOT EXISTS admin_notes (
  note_id     UUID PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  author_id   UUID NOT NULL REFERENCES admin_users(admin_id),
  category    TEXT NOT NULL DEFAULT 'general',
  visibility  TEXT NOT NULL DEFAULT 'admins' CHECK (visibility IN ('admins','role_restricted')),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_notes_entity ON admin_notes (entity_type, entity_id, created_at);

-- ── Notifications, saved views, export ledger, incidents ────────────────────
CREATE TABLE IF NOT EXISTS admin_notifications (
  notification_id UUID PRIMARY KEY,
  admin_id        UUID REFERENCES admin_users(admin_id) ON DELETE CASCADE, -- NULL = broadcast
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  link            TEXT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin ON admin_notifications (admin_id, created_at);

CREATE TABLE IF NOT EXISTS admin_saved_views (
  view_id    UUID PRIMARY KEY,
  admin_id   UUID NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
  page       TEXT NOT NULL,
  name       TEXT NOT NULL,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admin_id, page, name)
);

CREATE TABLE IF NOT EXISTS admin_exports (
  export_id   UUID PRIMARY KEY,
  admin_id    UUID NOT NULL REFERENCES admin_users(admin_id),
  entity_type TEXT NOT NULL,
  filters     JSONB,
  row_count   INTEGER,
  purpose     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_incidents (
  incident_id UUID PRIMARY KEY,
  kind        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title       TEXT NOT NULL,
  detail      JSONB,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  opened_by   UUID,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
