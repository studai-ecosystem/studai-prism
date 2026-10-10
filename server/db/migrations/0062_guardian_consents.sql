-- 0062_guardian_consents.sql — PROD-READY Phase 8: storage for the under-18
-- guardian-consent path (AGE_GATING_POLICY_v1 addendum 2026-10-10). The path
-- is dark behind PRISM_UNDER18_PATH (registered OFF) and its copy is DRAFT
-- pending HA-006 (under-18 decision) and HA-005 (DPDP counsel review).
-- Nothing writes this table while the flag is off.
--
-- Data minimisation: one row per request with the guardian's contact address
-- (the only guardian detail collected — no guardian name, relationship,
-- identity document or date of birth of anyone), the version of the consent
-- copy shown, a hash of the single-use link token (never the token) and the
-- verification state with its timestamps.
--
-- Erasure: deleted with the learner's account (erasure cascade, user step).
-- Retention: requests never verified (PENDING / DECLINED / EXPIRED) are
-- deleted 30 days after they ended (entity guardian_consents_unverified,
-- PROVISIONAL, HA-003); a VERIFIED or WITHDRAWN record is the consent record
-- of the account and goes with the account.

CREATE TABLE IF NOT EXISTS guardian_consents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  guardian_email    TEXT NOT NULL CHECK (char_length(guardian_email) BETWEEN 3 AND 320),
  copy_version      TEXT NOT NULL,
  token_hash        TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'VERIFIED', 'DECLINED', 'WITHDRAWN', 'EXPIRED')),
  verification      TEXT NOT NULL DEFAULT 'EMAIL_LINK' CHECK (verification IN ('EMAIL_LINK')),
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  decided_at        TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  CONSTRAINT guardian_consents_decision_shape
    CHECK (status IN ('PENDING', 'EXPIRED') OR decided_at IS NOT NULL),
  CONSTRAINT guardian_consents_withdrawal_shape
    CHECK (status <> 'WITHDRAWN' OR withdrawn_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS guardian_consents_user_idx ON guardian_consents (user_id, requested_at DESC);
-- At most one open request per learner.
CREATE UNIQUE INDEX IF NOT EXISTS guardian_consents_one_pending
  ON guardian_consents (user_id) WHERE status = 'PENDING';
