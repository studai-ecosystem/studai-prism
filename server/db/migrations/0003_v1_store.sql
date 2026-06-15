-- Prism v1 store → PostgreSQL. Additive; mirrors the JSON buckets in
-- server/lib/store.js + db.js exactly so the Postgres-backed store is a drop-in
-- replacement (same function signatures, same record shapes). Gated on the Node
-- side by PRISM_PG_STORE=true; with it off the app uses the JSON files and v1
-- stays byte-identical.
--
-- session_id is TEXT (not UUID) because v1/legacy/dev session ids are not all
-- UUIDs — the JSON store keyed on arbitrary strings, so we preserve that.

-- Users (was users.json).
CREATE TABLE IF NOT EXISTS v1_users (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  name           TEXT DEFAULT '',
  college        TEXT DEFAULT '',
  year           TEXT DEFAULT '',
  password_hash  TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- One entitlement per assessment (was payments bucket).
CREATE TABLE IF NOT EXISTS v1_payments (
  session_id   TEXT PRIMARY KEY,
  payment_id   TEXT,
  order_id     TEXT,
  amount       INTEGER,
  mode         TEXT,                  -- 'paid' | 'dev'
  consumed     BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Live assessment session (was sessions bucket).
CREATE TABLE IF NOT EXISTS v1_sessions (
  session_id    TEXT PRIMARY KEY,
  scenario_id   TEXT,
  user_id       TEXT,
  user_email    TEXT,
  data          JSONB,                -- everything else (history, evidence, etc.)
  started_at    BIGINT,
  completed_at  BIGINT,
  updated_at    BIGINT
);
CREATE INDEX IF NOT EXISTS idx_v1_sessions_user ON v1_sessions (user_id);

-- Issued report (was reports bucket). overall is mirrored out for percentile.
CREATE TABLE IF NOT EXISTS v1_reports (
  session_id   TEXT PRIMARY KEY,
  user_id      TEXT,
  overall      NUMERIC,
  report       JSONB,                 -- full report object
  issued_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_v1_reports_user ON v1_reports (user_id);

-- Anti-cheat events (was events array).
CREATE TABLE IF NOT EXISTS v1_events (
  id           BIGSERIAL PRIMARY KEY,
  session_id   TEXT,
  type         TEXT,
  meta         JSONB,
  at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_v1_events_session ON v1_events (session_id);

-- Per-turn v1 item telemetry (was items array).
CREATE TABLE IF NOT EXISTS v1_items (
  id           BIGSERIAL PRIMARY KEY,
  session_id   TEXT,
  item         JSONB,
  at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_v1_items_session ON v1_items (session_id);

-- Pre-assessment calibration (was calibrations bucket).
CREATE TABLE IF NOT EXISTS v1_calibrations (
  session_id   TEXT PRIMARY KEY,
  data         JSONB,
  at           TIMESTAMPTZ DEFAULT now()
);

-- Consent records (was consents bucket).
CREATE TABLE IF NOT EXISTS v1_consents (
  session_id   TEXT PRIMARY KEY,
  scopes       JSONB,
  meta         JSONB,
  at           TIMESTAMPTZ DEFAULT now()
);

-- Score disputes (was disputes bucket).
CREATE TABLE IF NOT EXISTS v1_disputes (
  session_id   TEXT PRIMARY KEY,
  reason       TEXT,
  contact      TEXT,
  status       TEXT DEFAULT 'open',   -- open | in_review | resolved
  at           TIMESTAMPTZ DEFAULT now()
);

-- Identity verification RESULT only (was verifications bucket). No images,
-- only the last 4 Aadhaar digits — same privacy contract as the JSON store.
CREATE TABLE IF NOT EXISTS v1_verifications (
  session_id     TEXT PRIMARY KEY,
  data           JSONB,
  at             TIMESTAMPTZ DEFAULT now()
);

-- Phone-proctor pairing status (was deviceLinks bucket). No frames stored.
CREATE TABLE IF NOT EXISTS v1_device_links (
  pair_code        TEXT PRIMARY KEY,
  session_id       TEXT,
  status           TEXT DEFAULT 'pending',   -- pending | linked | disconnected
  phone_user_agent TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
