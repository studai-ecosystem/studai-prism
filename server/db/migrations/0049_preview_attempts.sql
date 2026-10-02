-- 0049_preview_attempts.sql — P8.3 free first experience (guest preview).
-- A guest's one short PRACTICE scene answer and its deterministic observation,
-- held under a hashed scoped token for one hour unless explicitly claimed by a
-- signed-in account (claimed_user_id). is_synthetic separates seeded
-- demonstrations from real preview use: synthetic rows never enter product or
-- research metrics. No foreign key reaches any formal evidence, session or
-- report table. Additive.
CREATE TABLE IF NOT EXISTS preview_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash       TEXT NOT NULL UNIQUE,
  payload_json     JSONB NOT NULL,
  is_synthetic     BOOLEAN NOT NULL DEFAULT false,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_user_id  TEXT,
  claimed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS preview_attempts_expiry_idx ON preview_attempts (expires_at) WHERE claimed_user_id IS NULL;
CREATE INDEX IF NOT EXISTS preview_attempts_claimed_idx ON preview_attempts (claimed_user_id) WHERE claimed_user_id IS NOT NULL;
