-- 0019_accommodations_retention.sql — charter MASTER-2026-08-04 Phase 3 part 2
-- (§13 accommodations, §15 fairness-research framework, §16 retention).
--
--   * v1_accommodations — candidate accommodation requests (v1/PII plane, PG
--     twin of the JSON-store bucket). The needs text may reference disability:
--     visible ONLY to accommodations:read admins; NEVER buyer-reachable;
--     erased with the session.
--   * candidate_demographics — §15 FRAMEWORK ONLY. Separated storage, keyed by
--     the pseudonymous candidate_id, consent-scoped, withdrawal-capable.
--     NOTHING writes this table (CI-enforced) until PRISM_DEMOGRAPHICS is
--     approved (HA-005 counsel + HA-012 ethics) — the write path lands in the
--     same commit as that evidence.
--   * legal_holds — §16: a hold suspends BOTH retention enforcement AND
--     candidate erasure for the referenced session/candidate/entity.
--   * retention_overrides — §16 contract-level overrides (validated: entity,
--     contract reference, days, written basis). Enforcement uses the LONGEST
--     applicable period (never deletes what a contract requires kept).
--   * retention_runs — §16 receipts: every dry-run and enforcement pass.
--   * data_retention_rules.provisional — provisional defaults are labelled
--     pending counsel (HA-003) and must never be presented as approved.

CREATE TABLE IF NOT EXISTS v1_accommodations (
  session_id    TEXT PRIMARY KEY,
  needs         TEXT NOT NULL DEFAULT '',
  modes         JSONB,                  -- {textOnly, noCamera, reducedProctoring}
  status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','denied')),
  material      BOOLEAN NOT NULL DEFAULT FALSE,  -- materially changes score interpretation (admin judgement)
  decision_note TEXT NOT NULL DEFAULT '',
  decided_by    UUID,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS candidate_demographics (
  candidate_id    TEXT PRIMARY KEY,      -- pseudonymous; never user_id/email
  attributes      JSONB,
  consent_version TEXT,
  withdrawn_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_holds (
  hold_id        UUID PRIMARY KEY,
  scope          TEXT NOT NULL CHECK (scope IN ('session','candidate','entity')),
  reference      TEXT NOT NULL,          -- session id / candidate id / entity name
  reason         TEXT NOT NULL,
  placed_by      UUID NOT NULL,
  released_at    TIMESTAMPTZ,
  release_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_holds_active ON legal_holds (scope, reference) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS retention_overrides (
  override_id    UUID PRIMARY KEY,
  entity         TEXT NOT NULL,
  contract_ref   TEXT NOT NULL,
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  basis          TEXT NOT NULL,
  recorded_by    UUID NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retention_overrides_entity ON retention_overrides (entity);

CREATE TABLE IF NOT EXISTS retention_runs (
  run_id     UUID PRIMARY KEY,
  entity     TEXT NOT NULL,
  mode       TEXT NOT NULL CHECK (mode IN ('dry_run','enforce')),
  cutoff     TIMESTAMPTZ NOT NULL,
  matched    INTEGER NOT NULL DEFAULT 0,
  deleted    INTEGER NOT NULL DEFAULT 0,
  receipt    JSONB,
  ran_by     UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retention_runs_entity ON retention_runs (entity, created_at);

ALTER TABLE data_retention_rules ADD COLUMN IF NOT EXISTS provisional BOOLEAN NOT NULL DEFAULT TRUE;
