-- 0047_preparation.sql — P7 private preparation (CH-34, CH-35).
-- A learner prepares privately for a real situation: a sanitized intent, an
-- untimed rehearsal with an AI participant, an action card, and optional
-- SELF_REPORT check-ins. Everything here is PERSONAL-workspace only and
-- PREPARATION / SELF_REPORT mode by constraint. No foreign key reaches any
-- formal evidence, session or report table: nothing here can raise a formal
-- capability, and no Campus reader touches these tables. Additive.
CREATE TABLE IF NOT EXISTS preparation_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  workspace_type  TEXT NOT NULL DEFAULT 'PERSONAL' CHECK (workspace_type = 'PERSONAL'),
  mode            TEXT NOT NULL DEFAULT 'PREPARATION' CHECK (mode = 'PREPARATION'),
  intent_json     JSONB NOT NULL,
  sanitized       BOOLEAN NOT NULL DEFAULT false,
  state           TEXT NOT NULL CHECK (state IN ('DRAFT', 'REHEARSING', 'COMPLETED', 'ABANDONED')),
  card_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS preparation_attempts_user_idx ON preparation_attempts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS preparation_turns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  UUID NOT NULL REFERENCES preparation_attempts (id) ON DELETE CASCADE,
  actor       TEXT NOT NULL CHECK (actor IN ('CANDIDATE', 'AI_PARTICIPANT', 'SYSTEM')),
  text        TEXT NOT NULL CHECK (char_length(text) <= 4000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS preparation_turns_attempt_idx ON preparation_turns (attempt_id, created_at);

CREATE TABLE IF NOT EXISTS action_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  UUID NOT NULL UNIQUE REFERENCES preparation_attempts (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  card_json   JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_checkins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'SELF_REPORT' CHECK (mode = 'SELF_REPORT'),
  source_type  TEXT NOT NULL CHECK (source_type IN ('PREPARATION', 'PRACTICE', 'REPORT')),
  source_id    TEXT,
  what_tried   TEXT NOT NULL CHECK (char_length(what_tried) BETWEEN 1 AND 2000),
  outcome      TEXT NOT NULL CHECK (char_length(outcome) BETWEEN 1 AND 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_checkins_user_idx ON application_checkins (user_id, created_at DESC);
