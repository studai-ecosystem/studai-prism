-- 0016_privacy_governance.sql — Control Centre Phase 6: privacy & governance.
--
--   * privacy_requests: the data-subject request workflow (access, export,
--     correction, erasure, restriction, sharing revocation). Erasure runs
--     dry-run first (plan stored), needs dual approval to execute, and leaves
--     a receipt. The request row itself is the audit artifact of the request.
--   * data_retention_rules: DOCUMENTED retention policy per entity. Rows are
--     seeded with retention_days = NULL ("not set — requires an explicit
--     operator decision"); nothing auto-deletes on a timer — enforcement
--     remains a deliberate, audited action.

CREATE TABLE IF NOT EXISTS privacy_requests (
  request_id        UUID PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN
                    ('access','export','correction','erasure','restriction','sharing_revocation')),
  scope             TEXT NOT NULL DEFAULT 'candidate' CHECK (scope IN ('candidate','session')),
  candidate_user_id TEXT,
  candidate_email   TEXT,
  session_id        TEXT,
  details           TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'received' CHECK (status IN
                    ('received','verifying','dry_run','awaiting_approval','executing','completed','rejected')),
  dry_run_plan      JSONB,
  receipt           JSONB,
  opened_by         UUID NOT NULL,
  approval_id       UUID,
  decided_reason    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_requests (status, created_at);

CREATE TABLE IF NOT EXISTS data_retention_rules (
  rule_id        UUID PRIMARY KEY,
  entity         TEXT NOT NULL UNIQUE,
  retention_days INTEGER,           -- NULL = not decided yet (shown as such)
  basis          TEXT NOT NULL DEFAULT '',
  updated_by     UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
