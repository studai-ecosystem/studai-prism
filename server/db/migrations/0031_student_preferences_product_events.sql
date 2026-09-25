-- 0031_student_preferences_product_events.sql — Prism Campus Phase 4 (C4.11, C4.13; spec §46).
-- Account-level accessibility preferences (identity plane) and pseudonymous
-- product telemetry. product_events never holds a user id, email, name,
-- transcript or answer text: actor_hash is a keyed hash, props are allow-listed
-- ids/enums/timestamps (server/domain/telemetry/events.js).

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id         TEXT PRIMARY KEY,
  reduced_motion  BOOLEAN NOT NULL,
  larger_text     BOOLEAN NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS product_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event            TEXT NOT NULL,
  actor_hash       TEXT,
  workspace_type   TEXT CHECK (workspace_type IS NULL OR workspace_type IN ('PERSONAL', 'CAMPUS_STUDENT', 'CAMPUS_ADMIN', 'EMPLOYER')),
  organization_id  UUID REFERENCES organizations(id) ON DELETE SET NULL,
  props            JSONB NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_events_event_idx ON product_events (event, occurred_at);
CREATE INDEX IF NOT EXISTS product_events_org_idx ON product_events (organization_id);
