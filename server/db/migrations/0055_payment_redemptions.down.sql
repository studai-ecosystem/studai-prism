-- Down: drop the payment redemption ledger (PROD-READY Phase 1S). Entitlements
-- in v1_payments are untouched; /verify loses its single-use guarantee.
DROP TABLE IF EXISTS v1_payment_redemptions;
