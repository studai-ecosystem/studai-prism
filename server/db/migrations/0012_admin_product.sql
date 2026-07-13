-- 0012_admin_product.sql — Control Centre Phase 2: core product administration.
--
-- Admin-plane OVERLAY tables. The candidate stores (JSON files or v1_*) remain
-- the canonical product records; these tables carry administrative workflow
-- state keyed by the store's TEXT session ids. The admin console requires a
-- configured database regardless of which candidate store is active, so the
-- overlay is always available to it.
--
--   * admin_session_states   — review hold / invalidation / calibration exclusion
--   * admin_dispute_workflow — the expanded 9-state dispute machine (§10);
--                              v1_disputes keeps the candidate's statement and a
--                              coarse 3-state status for compatibility
--   * report_versions        — every issued report version, append-only history;
--                              supersession NEVER overwrites silently
--   * report_admin_states    — delivery hold/release
--   * integrity_reviews      — human reviewer decisions on proctoring events
--                              (events themselves stay append-only in the store)
--
-- Also: candidate account controls (suspend + token revocation) need two
-- columns on the PG user store twin. The JSON twin carries the same fields as
-- plain object keys. Additive, default-preserving — v1 behavior unchanged
-- until an administrator acts.

ALTER TABLE v1_users ADD COLUMN IF NOT EXISTS account_state TEXT NOT NULL DEFAULT 'active';
ALTER TABLE v1_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS admin_session_states (
  session_id                TEXT PRIMARY KEY,
  review_state              TEXT CHECK (review_state IN ('held','released')),
  review_reason             TEXT,
  invalid                   BOOLEAN NOT NULL DEFAULT FALSE,
  invalid_reason            TEXT,
  excluded_from_calibration BOOLEAN NOT NULL DEFAULT FALSE,
  exclusion_reason          TEXT,
  updated_by                UUID,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_dispute_workflow (
  session_id  TEXT PRIMARY KEY,
  state       TEXT NOT NULL DEFAULT 'open'
              CHECK (state IN ('open','assigned','evidence_gathering','human_review',
                               'awaiting_candidate','decision_proposed','resolved',
                               'rejected','reopened')),
  assigned_to UUID,
  decision    TEXT,
  decided_by  UUID,
  decided_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_versions (
  version_id UUID PRIMARY KEY,
  session_id TEXT NOT NULL,
  version    INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('initial','superseded_snapshot','correction')),
  report     JSONB NOT NULL,
  reason     TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, version)
);
CREATE INDEX IF NOT EXISTS idx_report_versions_session ON report_versions (session_id, version);

CREATE TABLE IF NOT EXISTS report_admin_states (
  session_id    TEXT PRIMARY KEY,
  delivery_hold BOOLEAN NOT NULL DEFAULT FALSE,
  hold_reason   TEXT,
  updated_by    UUID,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrity_reviews (
  review_id   UUID PRIMARY KEY,
  session_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  event_at    TEXT NOT NULL,   -- ISO timestamp string as recorded by the store
  decision    TEXT NOT NULL CHECK (decision IN ('false_positive','confirmed','escalated')),
  note        TEXT,
  reviewed_by UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, event_type, event_at)
);
CREATE INDEX IF NOT EXISTS idx_integrity_reviews_session ON integrity_reviews (session_id);
