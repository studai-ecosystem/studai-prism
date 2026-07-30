-- 0017_assessment_invites.sql — group assessment invite links.
--
-- An administrator creates a shareable link that lets up to max_uses signed-in
-- candidates start one assessment each inside a time window (college cohort
-- sessions). The raw link token is shown ONCE at creation; only its sha256
-- lands here. Redemptions mint mode='invite' entitlements — REAL candidates,
-- so the timeline does NOT mark them synthetic (unlike dummy/dev/admin_grant).

CREATE TABLE IF NOT EXISTS assessment_invites (
  invite_id   UUID PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL DEFAULT '',
  max_uses    INTEGER NOT NULL CHECK (max_uses >= 1 AND max_uses <= 100),
  used_count  INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID NOT NULL,
  revoked_at  TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_assessment_invites_active
  ON assessment_invites (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS invite_redemptions (
  redemption_id UUID PRIMARY KEY,
  invite_id     UUID NOT NULL REFERENCES assessment_invites(invite_id),
  user_id       TEXT NOT NULL,
  user_email    TEXT NOT NULL DEFAULT '',
  session_id    TEXT NOT NULL,
  redeemed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invite_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_invite_redemptions_invite ON invite_redemptions (invite_id);
