-- 0040_candidate_actions_jobs.sql — P1.5/P1.6 durable acceptance foundation.
-- A candidate action (message / artifact save / finish) is accepted and
-- persisted BEFORE the engine runs, so a crash or receipt failure after the
-- engine effect can be recovered by replay/re-drive instead of a second,
-- unaccounted engine effect. Jobs carry a lease + fencing token so a stale
-- worker can never complete work it no longer owns. Erasure markers make a
-- late re-drive of an erased session fail closed.

CREATE TABLE IF NOT EXISTS assessment_candidate_actions (
  action_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       TEXT NOT NULL,
  client_event_id  TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('MESSAGE', 'ARTIFACT', 'FINISH')),
  actor_kind       TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK (actor_kind IN ('CANDIDATE')),
  payload_hash     TEXT NOT NULL,
  payload_json     JSONB NOT NULL,
  sequence         INTEGER NOT NULL,
  accepted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  state            TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK (state IN ('ACCEPTED', 'APPLIED', 'FAILED')),
  result_json      JSONB,
  schema_version   INTEGER NOT NULL DEFAULT 1,
  UNIQUE (session_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS assessment_candidate_actions_session_idx
  ON assessment_candidate_actions (session_id, sequence);

-- The accepted payload is immutable; only state/result may move.
CREATE OR REPLACE FUNCTION assessment_candidate_actions_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.action_id IS DISTINCT FROM OLD.action_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.client_event_id IS DISTINCT FROM OLD.client_event_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.actor_kind IS DISTINCT FROM OLD.actor_kind
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.payload_json IS DISTINCT FROM OLD.payload_json
     OR NEW.sequence IS DISTINCT FROM OLD.sequence
     OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'assessment_candidate_actions payload is immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_candidate_actions_payload_immutable
  BEFORE UPDATE ON assessment_candidate_actions
  FOR EACH ROW EXECUTE FUNCTION assessment_candidate_actions_guard();

CREATE TABLE IF NOT EXISTS assessment_jobs (
  job_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key           TEXT NOT NULL UNIQUE,
  session_id         TEXT,
  kind               TEXT NOT NULL,
  state              TEXT NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED', 'LEASED', 'DONE', 'FAILED')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  lease_expires_at   TIMESTAMPTZ,
  fencing_token      BIGINT NOT NULL DEFAULT 0,
  next_available_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  result_state       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_jobs_claim_idx
  ON assessment_jobs (kind, state, next_available_at);

CREATE TABLE IF NOT EXISTS assessment_erasure_markers (
  session_id  TEXT PRIMARY KEY,
  erased_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
