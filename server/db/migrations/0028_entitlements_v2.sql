-- 0028_entitlements_v2.sql — Prism Campus Phase 3 (C3.03; spec §30.7, §31; contract §6).
-- `entitlements` is the source of truth for who may start what; legacy
-- paid/invite/coupon records are read through an adapter and never copied or
-- mutated. `entitlement_consumptions` is an append-only ledger (trigger).
-- No price columns (K5).

CREATE TABLE IF NOT EXISTS entitlements (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   TEXT,
  organization_id           UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source_type               TEXT NOT NULL CHECK (source_type IN ('PERSONAL_PURCHASE', 'INSTITUTION_SPONSORSHIP', 'PROMO', 'ADMIN_GRANT', 'PARTNER_GRANT')),
  source_reference_id       TEXT,
  product_code              TEXT NOT NULL,
  assessment_definition_id  TEXT,
  quantity                  INTEGER NOT NULL CHECK (quantity >= 0),
  consumed_quantity         INTEGER NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
  valid_from                TIMESTAMPTZ NOT NULL,
  valid_until               TIMESTAMPTZ,
  status                    TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'EXHAUSTED', 'EXPIRED', 'REVOKED')),
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (consumed_quantity <= quantity),
  -- Institution sponsorship is always organization-scoped; personal sources are user-scoped.
  CHECK (source_type <> 'INSTITUTION_SPONSORSHIP' OR organization_id IS NOT NULL),
  CHECK (source_type = 'INSTITUTION_SPONSORSHIP' OR source_type = 'PARTNER_GRANT' OR user_id IS NOT NULL),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX IF NOT EXISTS entitlements_org_idx ON entitlements (organization_id);
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements (user_id);

CREATE TABLE IF NOT EXISTS entitlement_consumptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id   UUID NOT NULL REFERENCES entitlements(id) ON DELETE RESTRICT,
  user_id          TEXT NOT NULL,
  organization_id  UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  session_id       TEXT,
  event            TEXT NOT NULL CHECK (event IN ('RESERVED', 'CONSUMED', 'RELEASED')),
  idempotency_key  TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entitlement_consumptions_entitlement_idx ON entitlement_consumptions (entitlement_id);
CREATE INDEX IF NOT EXISTS entitlement_consumptions_org_idx ON entitlement_consumptions (organization_id);

CREATE OR REPLACE FUNCTION campus_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entitlement_consumptions_append_only
  BEFORE UPDATE OR DELETE ON entitlement_consumptions
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();
