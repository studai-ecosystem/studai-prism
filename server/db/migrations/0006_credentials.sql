-- Prism "Beyond Vantage" Track 2 — glass-box credentials.
--
-- A credential is a SIGNED, immutable artifact: the canonical evidence bundle,
-- its hash, and the Ed25519 signature. Corrections NEVER mutate a signed row —
-- a new credential supersedes the old and both stay visible (chain).
-- The bundle is pseudonymous (candidate_id / session_id only; no name/email —
-- enforced by a runtime test on assembly, plus the static PII schema gate).

CREATE TABLE IF NOT EXISTS credentials (
  credential_id  UUID PRIMARY KEY,
  session_id     UUID NOT NULL,
  candidate_id   UUID,
  bundle         JSONB NOT NULL,          -- canonical evidence bundle (schema v1)
  bundle_hash    TEXT NOT NULL,           -- sha256 hex of canonical JSON
  signature      TEXT NOT NULL,           -- base64 Ed25519 over the hash bytes
  key_id         TEXT NOT NULL,           -- identifies the signing key (sha256 of public DER, first 16 hex)
  schema_version TEXT NOT NULL DEFAULT 'evidence-bundle-v1',
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','revoked','superseded')),
  revoked_reason TEXT,
  supersedes     UUID,                    -- older credential this one replaces
  superseded_by  UUID,                    -- newer credential replacing this one
  share_token_hash TEXT,                  -- candidate-held secret for full-disclosure view
  issued_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credentials_session ON credentials (session_id, issued_at);

-- Signed artifacts are immutable except for the lifecycle columns.
CREATE OR REPLACE FUNCTION credentials_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.credential_id = OLD.credential_id
     AND NEW.session_id = OLD.session_id
     AND NEW.bundle::text = OLD.bundle::text
     AND NEW.bundle_hash = OLD.bundle_hash
     AND NEW.signature = OLD.signature
     AND NEW.key_id = OLD.key_id
     AND NEW.schema_version = OLD.schema_version
     AND NEW.issued_at = OLD.issued_at THEN
    RETURN NEW; -- status / revoked_reason / superseded_by transitions only
  END IF;
  RAISE EXCEPTION 'credentials are immutable once signed (revoke or supersede instead)';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_credentials_guard ON credentials;
CREATE TRIGGER trg_credentials_guard
  BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION credentials_guard();
