ALTER TABLE student_report_versions DROP COLUMN IF EXISTS publication_note;
ALTER TABLE evidence_rating_items DROP COLUMN IF EXISTS source_method_json;
ALTER TABLE assessment_client_events DROP CONSTRAINT IF EXISTS assessment_client_events_kind_check;
ALTER TABLE assessment_client_events
  ADD CONSTRAINT assessment_client_events_kind_check
  CHECK (kind IN ('START', 'BEGIN', 'MESSAGE', 'ARTIFACT', 'FINISH')) NOT VALID;
