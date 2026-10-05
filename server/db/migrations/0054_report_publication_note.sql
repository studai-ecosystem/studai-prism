-- Specific correction/re-analysis reasons are immutable publication metadata,
-- rather than existing only in the operational audit stream.
ALTER TABLE student_report_versions ADD COLUMN IF NOT EXISTS publication_note TEXT;
ALTER TABLE evidence_rating_items ADD COLUMN IF NOT EXISTS source_method_json JSONB;
ALTER TABLE assessment_client_events DROP CONSTRAINT IF EXISTS assessment_client_events_kind_check;
ALTER TABLE assessment_client_events
  ADD CONSTRAINT assessment_client_events_kind_check
  CHECK (kind IN ('START', 'BEGIN', 'MESSAGE', 'ARTIFACT', 'FINISH', 'EVALUATION_ACCEPTED', 'PUBLICATION'));
