-- 0043_run_timing.down.sql — reverses 0043.
DELETE FROM assessment_client_events WHERE kind = 'BEGIN';
ALTER TABLE assessment_client_events DROP CONSTRAINT IF EXISTS assessment_client_events_kind_check;
ALTER TABLE assessment_client_events
  ADD CONSTRAINT assessment_client_events_kind_check CHECK (kind IN ('START', 'MESSAGE', 'ARTIFACT', 'FINISH'));
DROP TABLE IF EXISTS assessment_run_timing;
