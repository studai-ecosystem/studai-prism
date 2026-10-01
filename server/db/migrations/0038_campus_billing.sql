-- 0038_campus_billing.sql — Prism Campus Phase 11 (C11.01; spec §31.2, §38).
-- Campus contracts are commercial configuration, never authorization: a
-- contract's activation mints one INSTITUTION_SPONSORSHIP entitlement (id =
-- contract id) and the append-only entitlement ledger remains the only source
-- of seats and usage. Direct B2C payments (v1_payments, ₹499) are untouched.
--
-- Prices: campus_contract_pricing columns exist but are all nullable and no
-- application path writes them (K5; values are a finance decision, HA-C006).
-- Invoice exports are an append-only record of what was exported.

CREATE TABLE IF NOT EXISTS campus_contracts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  status           TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED')),
  term_start       DATE NOT NULL,
  term_end         DATE NOT NULL,
  included_seats   INTEGER NOT NULL CHECK (included_seats BETWEEN 1 AND 100000),
  billable_event   TEXT NOT NULL CHECK (billable_event IN ('ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED', 'REPORT_GENERATED')),
  components       JSONB NOT NULL,
  entitlement_id   UUID REFERENCES entitlements(id) ON DELETE RESTRICT,
  created_by       TEXT NOT NULL,
  activated_by     TEXT,
  activated_at     TIMESTAMPTZ,
  ended_by         TEXT,
  ended_at         TIMESTAMPTZ,
  end_reason       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (term_end >= term_start),
  CHECK (status = 'DRAFT' OR status = 'CANCELLED' OR entitlement_id IS NOT NULL),
  CHECK ((activated_at IS NULL) = (activated_by IS NULL))
);
CREATE INDEX IF NOT EXISTS campus_contracts_org_idx ON campus_contracts (organization_id, created_at DESC);

-- Finance-only pricing. Every column is nullable and has no default; a price
-- is shown to an institution's billing roles only once approved_by and
-- approved_at are both set (by a human, outside the application).
CREATE TABLE IF NOT EXISTS campus_contract_pricing (
  contract_id          UUID PRIMARY KEY REFERENCES campus_contracts(id) ON DELETE RESTRICT,
  platform_fee         NUMERIC(14, 2),
  per_assessment_rate  NUMERIC(14, 2),
  reassessment_rate    NUMERIC(14, 2),
  currency             TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  approved_by          TEXT,
  approved_at          TIMESTAMPTZ,
  CHECK ((approved_at IS NULL) = (approved_by IS NULL))
);

CREATE TABLE IF NOT EXISTS invoice_exports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contract_id       UUID NOT NULL REFERENCES campus_contracts(id) ON DELETE RESTRICT,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  billable_event    TEXT NOT NULL CHECK (billable_event IN ('ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED', 'REPORT_GENERATED')),
  billable_count    INTEGER NOT NULL CHECK (billable_count >= 0),
  file_ref          TEXT,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS invoice_exports_org_idx ON invoice_exports (organization_id, created_at DESC);

CREATE TRIGGER invoice_exports_append_only
  BEFORE UPDATE OR DELETE ON invoice_exports
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

-- Usage ledger: every sponsored seat event, read straight from the
-- append-only entitlement ledger (no copy, so it can never drift).
CREATE OR REPLACE VIEW campus_usage_ledger AS
  SELECT c.id              AS consumption_id,
         e.organization_id AS organization_id,
         e.id              AS entitlement_id,
         e.source_reference_id AS source_reference_id,
         c.session_id      AS session_id,
         c.event           AS event,
         c.created_at      AS created_at
    FROM entitlement_consumptions c
    JOIN entitlements e ON e.id = c.entitlement_id
   WHERE e.source_type = 'INSTITUTION_SPONSORSHIP';
