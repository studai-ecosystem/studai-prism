-- 0059_job_queue.sql — PROD-READY Phase 5: PostgreSQL-backed background job
-- queue (no Redis). Additive only; nothing writes to it unless a human turns
-- PRISM_JOB_WORKER on.
--
--   * One row per unit of background work. Workers claim due rows with
--     `FOR UPDATE SKIP LOCKED`, so several replicas never take the same row.
--   * A claim is a lease: locked_by (worker id), lease_token (fresh per
--     claim, fences late writes from a worker whose lease expired) and
--     locked_until. A crashed worker's lease expires and the row is recovered.
--   * Failed attempts are retried with exponential backoff and jitter
--     (status FAILED, run_at in the future); after max_attempts the row is
--     DEAD (dead letter) until an operator retries or cancels it (audited).
--   * dedupe_key is unique per kind: a recurring scan per time bucket, one
--     reminder per recipient per assignment window, one invite email per
--     invite. Enqueueing the same (kind, dedupe_key) twice is a no-op.
--   * payload holds references only (ids), never emails or free text; the
--     handlers re-read current state. subject_user_id names the account a job
--     concerns (if any) so account erasure can remove its jobs.
--   * last_error is sanitised (error code + scrubbed message, no addresses).

CREATE TABLE IF NOT EXISTS jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_.]{2,79}$'),
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  subject_user_id  TEXT,
  dedupe_key       TEXT CHECK (dedupe_key IS NULL OR char_length(dedupe_key) BETWEEN 1 AND 300),
  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED')),
  run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts         INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts     INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 50),
  last_error       TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 300),
  locked_by        TEXT,
  lease_token      UUID,
  locked_until     TIMESTAMPTZ,
  result           JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  CONSTRAINT jobs_dedupe_per_kind UNIQUE (kind, dedupe_key),
  CONSTRAINT jobs_running_has_lease
    CHECK (status <> 'RUNNING' OR (locked_by IS NOT NULL AND lease_token IS NOT NULL AND locked_until IS NOT NULL)),
  CONSTRAINT jobs_idle_has_no_lease
    CHECK (status = 'RUNNING' OR (locked_by IS NULL AND lease_token IS NULL AND locked_until IS NULL))
);

-- Claim path: due rows in run order.
CREATE INDEX IF NOT EXISTS jobs_due_idx ON jobs (run_at, created_at) WHERE status IN ('PENDING', 'FAILED');
-- Lease recovery path.
CREATE INDEX IF NOT EXISTS jobs_lease_idx ON jobs (locked_until) WHERE status = 'RUNNING';
-- Admin view (by status, newest first) and housekeeping.
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status, updated_at DESC);
-- Account erasure.
CREATE INDEX IF NOT EXISTS jobs_subject_idx ON jobs (subject_user_id) WHERE subject_user_id IS NOT NULL;
