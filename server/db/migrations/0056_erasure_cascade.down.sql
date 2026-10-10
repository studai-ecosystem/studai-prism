-- 0056_erasure_cascade.down.sql — reverses 0056: drops the erasure ledger and
-- restores the original append-only triggers (no erasure path; every UPDATE
-- rejected again).
DROP TRIGGER IF EXISTS privacy_erasure_steps_no_delete ON privacy_erasure_steps;
DROP TRIGGER IF EXISTS privacy_erasure_runs_no_delete ON privacy_erasure_runs;
DROP TABLE IF EXISTS privacy_erasure_steps;
DROP INDEX IF EXISTS privacy_erasure_runs_subject_idx;
DROP INDEX IF EXISTS privacy_erasure_runs_open_uniq;
DROP TABLE IF EXISTS privacy_erasure_runs;

DROP TRIGGER IF EXISTS trg_admin_audit_immutable ON admin_audit_events;
CREATE TRIGGER trg_admin_audit_immutable
  BEFORE UPDATE OR DELETE ON admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION admin_audit_events_immutable();

DROP TRIGGER IF EXISTS student_report_versions_append_only ON student_report_versions;
CREATE TRIGGER student_report_versions_append_only
  BEFORE UPDATE ON student_report_versions
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

DROP TRIGGER IF EXISTS report_review_decisions_append_only ON report_review_decisions;
CREATE TRIGGER report_review_decisions_append_only
  BEFORE UPDATE OR DELETE ON report_review_decisions
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

DROP TRIGGER IF EXISTS assessment_form_equivalence_decisions_append_only ON assessment_form_equivalence_decisions;
CREATE TRIGGER assessment_form_equivalence_decisions_append_only
  BEFORE UPDATE OR DELETE ON assessment_form_equivalence_decisions
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

DROP TRIGGER IF EXISTS invoice_exports_append_only ON invoice_exports;
CREATE TRIGGER invoice_exports_append_only
  BEFORE UPDATE OR DELETE ON invoice_exports
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

DROP TRIGGER IF EXISTS organization_audit_events_append_only ON organization_audit_events;
CREATE TRIGGER organization_audit_events_append_only
  BEFORE UPDATE OR DELETE ON organization_audit_events
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

DROP TRIGGER IF EXISTS data_access_audit_events_append_only ON data_access_audit_events;
CREATE TRIGGER data_access_audit_events_append_only
  BEFORE UPDATE OR DELETE ON data_access_audit_events
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

DROP TRIGGER IF EXISTS entitlement_consumptions_append_only ON entitlement_consumptions;
CREATE TRIGGER entitlement_consumptions_append_only
  BEFORE UPDATE OR DELETE ON entitlement_consumptions
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();

DROP FUNCTION IF EXISTS prism_erasure_guard();
DROP FUNCTION IF EXISTS prism_is_erasure_value(JSONB);
