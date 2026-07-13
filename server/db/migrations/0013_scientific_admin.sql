-- 0013_scientific_admin.sql — Control Centre Phase 3: scientific administration.
--
--   * Prompt Registry: prompt_definitions + prompt_versions. Runtime prompt
--     loading STAYS file-based (server/prompts, audit C15) unless
--     PRISM_ADMIN_PROMPT_REGISTRY=true primes the engine cache from the DB at
--     boot. The registry is seeded FROM the files (source='file_import',
--     status='production') so the workflow starts from the deployed truth.
--     Production versions are never edited in place — new version rows only.
--
--   * Calibration lifecycle columns: freezing and applying become attributable,
--     reviewable, dual-approved actions (who/when/why + rejected + supersession
--     pointer). Additive — the Python calibration jobs keep INSERTing rows
--     without these columns. scoring/equating.js already keys on
--     frozen = true AND applied = true, so "apply" has real scoring effect.
--
--   * Training-reference lifecycle: draft → active → retired. Existing rows
--     default to 'active' (behavior preserved); the rater training flow serves
--     ONLY active references.

CREATE TABLE IF NOT EXISTS prompt_definitions (
  prompt_id  UUID PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,          -- e.g. 'avatar_system'
  purpose    TEXT NOT NULL DEFAULT '',
  engine     TEXT NOT NULL DEFAULT '',      -- avatar | judge | micro_rater | director | teamfit | ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  version_id   UUID PRIMARY KEY,
  prompt_id    UUID NOT NULL REFERENCES prompt_definitions(prompt_id) ON DELETE CASCADE,
  version      TEXT NOT NULL,               -- 'v1', 'v2', ...
  language     TEXT NOT NULL DEFAULT 'en',
  kind         TEXT NOT NULL DEFAULT 'md' CHECK (kind IN ('md','json')),
  template     TEXT NOT NULL,
  variables    JSONB,                       -- extracted {{PLACEHOLDER}} names
  model        TEXT,
  temperature  NUMERIC,
  token_limit  INTEGER,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','testing','approved','production','deprecated','rolled_back')),
  source       TEXT NOT NULL DEFAULT 'authored' CHECK (source IN ('file_import','authored')),
  content_hash TEXT,
  author       UUID,
  approved_by  UUID,
  approval_id  UUID,
  test_results JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prompt_id, version, language)
);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions (prompt_id, status);

ALTER TABLE calibration_runs ADD COLUMN IF NOT EXISTS rejected      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE calibration_runs ADD COLUMN IF NOT EXISTS review_note   TEXT;
ALTER TABLE calibration_runs ADD COLUMN IF NOT EXISTS reviewed_by   UUID;
ALTER TABLE calibration_runs ADD COLUMN IF NOT EXISTS frozen_at     TIMESTAMPTZ;
ALTER TABLE calibration_runs ADD COLUMN IF NOT EXISTS frozen_by     UUID;
ALTER TABLE calibration_runs ADD COLUMN IF NOT EXISTS applied_at    TIMESTAMPTZ;
ALTER TABLE calibration_runs ADD COLUMN IF NOT EXISTS applied_by    UUID;
ALTER TABLE calibration_runs ADD COLUMN IF NOT EXISTS superseded_by UUID;

ALTER TABLE rater_training_refs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('draft','active','retired'));
