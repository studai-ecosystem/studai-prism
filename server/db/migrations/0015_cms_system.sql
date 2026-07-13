-- 0015_cms_system.sql — Control Centre Phase 5: CMS, feature-flag registry,
-- model registry, background-job records.
--
--   * CMS: database-backed blog/careers/applications with full version
--     history. Seeded once from server/data/content.json (boot-seed,
--     idempotent). PUBLIC reads keep serving the JSON file until
--     PRISM_CMS_DB=true (ship-dark cut-over, same pattern as the prompt
--     registry) — shapes stay byte-identical either way.
--   * feature_flags / feature_flag_changes: a REGISTRY + CHANGE-REQUEST
--     workflow. THE ONE LAW HOLDS: nothing here flips a PRISM_* variable at
--     runtime (CI-enforced) — approved requests are applied BY AN OPERATOR
--     as env actions, then verified against the live environment.
--   * model_registry: operator-maintained metadata about AI deployments
--     (costs, fallbacks, workloads). Never API keys.
--   * system_jobs: durable records for admin-plane background operations.
--     There is deliberately NO queue runtime yet — the table exists so the
--     job monitor has a real substrate when one lands.

CREATE TABLE IF NOT EXISTS content_posts (
  post_id       UUID PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  date_label    TEXT NOT NULL DEFAULT '',     -- display date ("May 2026"), matches content.json
  summary       TEXT NOT NULL DEFAULT '',     -- public field name: "desc"
  body          TEXT NOT NULL DEFAULT '',
  author        TEXT NOT NULL DEFAULT '',
  tags          JSONB,
  seo           JSONB,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','published','scheduled','archived')),
  scheduled_for TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_post_versions (
  version_id  UUID PRIMARY KEY,
  post_id     UUID NOT NULL REFERENCES content_posts(post_id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  snapshot    JSONB NOT NULL,
  change_note TEXT,
  changed_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, version)
);

CREATE TABLE IF NOT EXISTS content_jobs (
  job_id      UUID PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,           -- public field name: "id"
  title       TEXT NOT NULL,
  location    TEXT NOT NULL DEFAULT '',
  job_type    TEXT NOT NULL DEFAULT '',       -- public field name: "type"
  stack       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','open','closed','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_applications (
  application_id UUID PRIMARY KEY,
  job_slug       TEXT NOT NULL,
  job_title      TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  message        TEXT NOT NULL DEFAULT '',
  resume_url     TEXT,
  status         TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','reviewing','interviewing','rejected','hired','withdrawn')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications (job_slug, created_at);

CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key    TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  owner       TEXT NOT NULL DEFAULT '',
  risk        TEXT NOT NULL DEFAULT 'medium' CHECK (risk IN ('low','medium','high')),
  data_gate   TEXT,                            -- human-readable gate (flip-check enforces the real one)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_flag_changes (
  change_id       UUID PRIMARY KEY,
  flag_key        TEXT NOT NULL REFERENCES feature_flags(flag_key) ON DELETE CASCADE,
  environment     TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
  requested_state TEXT NOT NULL CHECK (requested_state IN ('on','off')),
  reason          TEXT NOT NULL,
  requested_by    UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested','approved','rejected','cancelled','applied_by_operator')),
  decided_by      UUID,
  decided_reason  TEXT,
  applied_note    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Dual control on flag changes, database-enforced like admin_approvals.
  CONSTRAINT chk_flag_change_dual CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
CREATE INDEX IF NOT EXISTS idx_flag_changes_flag ON feature_flag_changes (flag_key, created_at);

CREATE TABLE IF NOT EXISTS model_registry (
  model_id          UUID PRIMARY KEY,
  provider          TEXT NOT NULL,
  deployment        TEXT NOT NULL,
  purpose           TEXT NOT NULL DEFAULT '',
  cost_per_mtok_in  NUMERIC,
  cost_per_mtok_out NUMERIC,
  fallback          TEXT,
  allowed_workloads JSONB,
  released_at       DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, deployment)
);

CREATE TABLE IF NOT EXISTS system_jobs (
  job_id          UUID PRIMARY KEY,
  kind            TEXT NOT NULL,
  entity_id       TEXT,
  state           TEXT NOT NULL DEFAULT 'queued'
                  CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  idempotency_key TEXT UNIQUE,
  detail          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_jobs_state ON system_jobs (state, created_at);
