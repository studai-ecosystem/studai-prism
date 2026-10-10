-- PROD-READY Phase 1S (audit 2026-10-10, SECURITY_REVIEW addendum N2):
-- a provider payment id is redeemed at most once.
--
-- POST /api/payment/verify minted a new session and a new paid entitlement on
-- every call with the same valid {order, payment, signature}: v1_payments is
-- keyed on session_id and payment_id has no uniqueness. A UNIQUE index on
-- v1_payments.payment_id cannot be added safely, because a production table
-- may already hold such duplicates (the index build would fail and block the
-- release). Redemptions therefore get their own table with the provider
-- payment id as PRIMARY KEY; the store inserts here and creates the
-- entitlement in the same transaction, so a repeat or concurrent verify
-- returns the session of the first redemption.
--
-- Erasure (store eraseSession) DETACHES a row instead of deleting it:
-- session_id and user_id become NULL and the payment stays redeemed, so a
-- replay after erasure cannot mint a fresh session. payment_id / order_id are
-- the provider's transaction references (financial record), not candidate
-- profile data.
CREATE TABLE IF NOT EXISTS v1_payment_redemptions (
  payment_id   TEXT PRIMARY KEY,
  order_id     TEXT,
  session_id   TEXT,
  user_id      TEXT,
  redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_v1_payment_redemptions_session ON v1_payment_redemptions (session_id);
CREATE INDEX IF NOT EXISTS idx_v1_payment_redemptions_user ON v1_payment_redemptions (user_id);

-- Backfill: the EARLIEST entitlement per payment id becomes its redemption.
-- Duplicates already in v1_payments are left as they are (they are history;
-- an operator can review them with the query in the Phase 1S P-row); only new
-- verifies are made single-use.
INSERT INTO v1_payment_redemptions (payment_id, order_id, session_id, user_id, redeemed_at)
SELECT DISTINCT ON (payment_id) payment_id, order_id, session_id, user_id, COALESCE(created_at, now())
FROM v1_payments
WHERE payment_id IS NOT NULL AND payment_id <> ''
ORDER BY payment_id, created_at ASC NULLS LAST, session_id ASC
ON CONFLICT (payment_id) DO NOTHING;
