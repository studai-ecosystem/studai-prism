-- 0046_practice_allowance.down.sql
ALTER TABLE practice_evidence_units DROP CONSTRAINT IF EXISTS practice_evidence_units_check_type_check;
ALTER TABLE practice_evidence_units
  ADD CONSTRAINT practice_evidence_units_check_type_check CHECK (check_type IN ('DETERMINISTIC', 'EVALUATOR', 'BOTH'));
ALTER TABLE mission_attempts DROP COLUMN IF EXISTS stimulus_json, DROP COLUMN IF EXISTS assistance_json;
DROP TABLE IF EXISTS practice_allowances;
