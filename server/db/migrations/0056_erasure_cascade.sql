-- 0056_erasure_cascade.sql — PROD-READY Phase 2 (SECURITY_REVIEW S8).
-- Account erasure must reach every campus-era row. Append-only ledgers and
-- audit trails keep their events, so erasure PSEUDONYMISES them instead of
-- deleting (RETENTION_POLICY_v1). Their triggers rejected every UPDATE; this
-- migration replaces those triggers with one narrowly scoped guard:
--
--   * An UPDATE passes only when ALL of these hold:
--       - the transaction set `SET LOCAL prism.erasure = 'on'` (only the
--         erasure cascade does: server/domain/privacy/erasureCascade.js);
--       - every changed column is in the trigger's whitelist (per table);
--       - every new value is an erasure value: NULL, a string starting with
--         'erased', or a JSON object carrying "erased": true.
--   * DELETE stays rejected wherever it was rejected before; ordinary UPDATEs
--     (no flag, another column or a real value) are rejected exactly as
--     before, with the same message.
--
-- It also adds the erasure ledger: one row per erasure run (keyed by a
-- one-way subject reference, never the account id or email) and one row per
-- completed step, so an operator can prove that a run finished. A RUNNING or
-- FAILED run holds its session work list so a rerun can resume; the list is
-- cleared when the run completes. Ledger rows are never deleted.

CREATE OR REPLACE FUNCTION prism_is_erasure_value(v JSONB) RETURNS BOOLEAN AS $$
  SELECT v IS NULL
      OR jsonb_typeof(v) = 'null'
      OR (jsonb_typeof(v) = 'string' AND (v #>> '{}') LIKE 'erased%')
      OR (jsonb_typeof(v) = 'object' AND v ->> 'erased' = 'true');
$$ LANGUAGE sql IMMUTABLE;

-- TG_ARGV[0] = the table's original rejection message; TG_ARGV[1..] = the
-- columns erasure may pseudonymise.
CREATE OR REPLACE FUNCTION prism_erasure_guard() RETURNS trigger AS $$
DECLARE
  allowed TEXT[] := CASE WHEN TG_NARGS > 1 THEN TG_ARGV[1:TG_NARGS - 1] ELSE ARRAY[]::TEXT[] END;
  old_row JSONB;
  new_row JSONB;
  col TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(current_setting('prism.erasure', true), '') = 'on' AND cardinality(allowed) > 0 THEN
    old_row := to_jsonb(OLD);
    new_row := to_jsonb(NEW);
    IF (old_row - allowed) = (new_row - allowed) THEN
      FOREACH col IN ARRAY allowed LOOP
        IF (new_row -> col) IS DISTINCT FROM (old_row -> col) AND NOT prism_is_erasure_value(new_row -> col) THEN
          RAISE EXCEPTION '%', TG_ARGV[0];
        END IF;
      END LOOP;
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '%', TG_ARGV[0];
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entitlement_consumptions_append_only ON entitlement_consumptions;
CREATE TRIGGER entitlement_consumptions_append_only
  BEFORE UPDATE OR DELETE ON entitlement_consumptions
  FOR EACH ROW EXECUTE FUNCTION prism_erasure_guard('entitlement_consumptions is append-only', 'user_id', 'idempotency_key');

DROP TRIGGER IF EXISTS data_access_audit_events_append_only ON data_access_audit_events;
CREATE TRIGGER data_access_audit_events_append_only
  BEFORE UPDATE OR DELETE ON data_access_audit_events
  FOR EACH ROW EXECUTE FUNCTION prism_erasure_guard('data_access_audit_events is append-only', 'actor_user_id', 'subject_user_id', 'resource_id');

DROP TRIGGER IF EXISTS organization_audit_events_append_only ON organization_audit_events;
CREATE TRIGGER organization_audit_events_append_only
  BEFORE UPDATE OR DELETE ON organization_audit_events
  FOR EACH ROW EXECUTE FUNCTION prism_erasure_guard('organization_audit_events is append-only', 'actor_user_id', 'target_id');

DROP TRIGGER IF EXISTS invoice_exports_append_only ON invoice_exports;
CREATE TRIGGER invoice_exports_append_only
  BEFORE UPDATE OR DELETE ON invoice_exports
  FOR EACH ROW EXECUTE FUNCTION prism_erasure_guard('invoice_exports is append-only', 'created_by');

DROP TRIGGER IF EXISTS assessment_form_equivalence_decisions_append_only ON assessment_form_equivalence_decisions;
CREATE TRIGGER assessment_form_equivalence_decisions_append_only
  BEFORE UPDATE OR DELETE ON assessment_form_equivalence_decisions
  FOR EACH ROW EXECUTE FUNCTION prism_erasure_guard('assessment_form_equivalence_decisions is append-only', 'decided_by');

DROP TRIGGER IF EXISTS report_review_decisions_append_only ON report_review_decisions;
CREATE TRIGGER report_review_decisions_append_only
  BEFORE UPDATE OR DELETE ON report_review_decisions
  FOR EACH ROW EXECUTE FUNCTION prism_erasure_guard('report_review_decisions is append-only', 'reviewer_id', 'reason');

-- UPDATE only, as before: DELETE of a version stays possible for erasure.
DROP TRIGGER IF EXISTS student_report_versions_append_only ON student_report_versions;
CREATE TRIGGER student_report_versions_append_only
  BEFORE UPDATE ON student_report_versions
  FOR EACH ROW EXECUTE FUNCTION prism_erasure_guard('student_report_versions is append-only', 'report_json', 'content_hash', 'evidence_set_hash', 'publication_note');

DROP TRIGGER IF EXISTS trg_admin_audit_immutable ON admin_audit_events;
CREATE TRIGGER trg_admin_audit_immutable
  BEFORE UPDATE OR DELETE ON admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION prism_erasure_guard('admin_audit_events are immutable (append-only audit trail)', 'entity_id', 'before', 'after');

CREATE TABLE IF NOT EXISTS privacy_erasure_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_ref          TEXT NOT NULL CHECK (subject_ref ~ '^[0-9a-f]{64}$'),
  initiated_by         TEXT NOT NULL CHECK (initiated_by IN ('SELF_SERVICE', 'ADMIN_REQUEST', 'OPERATOR')),
  scope                TEXT NOT NULL CHECK (scope IN ('DATA', 'ACCOUNT')),
  status               TEXT NOT NULL CHECK (status IN ('RUNNING', 'FAILED', 'COMPLETED')),
  pending_session_ids  TEXT[],
  session_count        INTEGER NOT NULL DEFAULT 0 CHECK (session_count >= 0),
  attempts             INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  last_error           TEXT,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  CHECK (status <> 'COMPLETED' OR (completed_at IS NOT NULL AND pending_session_ids IS NULL))
);
-- At most one open (RUNNING/FAILED) run per subject: a rerun resumes it.
CREATE UNIQUE INDEX IF NOT EXISTS privacy_erasure_runs_open_uniq ON privacy_erasure_runs (subject_ref) WHERE status <> 'COMPLETED';
CREATE INDEX IF NOT EXISTS privacy_erasure_runs_subject_idx ON privacy_erasure_runs (subject_ref, started_at DESC);

CREATE TABLE IF NOT EXISTS privacy_erasure_steps (
  run_id      UUID NOT NULL REFERENCES privacy_erasure_runs(id) ON DELETE RESTRICT,
  step        TEXT NOT NULL CHECK (step ~ '^[a-z_]+(:[0-9a-f]{16})?$'),
  status      TEXT NOT NULL CHECK (status IN ('DONE', 'FAILED')),
  row_count   INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, step)
);

-- The ledger is the proof of erasure: rows are never deleted.
CREATE TRIGGER privacy_erasure_runs_no_delete
  BEFORE DELETE ON privacy_erasure_runs
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();
CREATE TRIGGER privacy_erasure_steps_no_delete
  BEFORE DELETE ON privacy_erasure_steps
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();
