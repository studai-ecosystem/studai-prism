-- Reverse of 0052_preparation_hardening.sql.
DELETE FROM preparation_turns WHERE actor = 'AI_ASSISTANT';
ALTER TABLE preparation_turns DROP CONSTRAINT IF EXISTS preparation_turns_actor_check;
ALTER TABLE preparation_turns ADD CONSTRAINT preparation_turns_actor_check CHECK (actor IN ('CANDIDATE', 'AI_PARTICIPANT', 'SYSTEM'));
ALTER TABLE application_checkins DROP COLUMN IF EXISTS updated_at;
ALTER TABLE application_checkins DROP COLUMN IF EXISTS next_step;
ALTER TABLE preparation_attempts DROP COLUMN IF EXISTS application_json;
ALTER TABLE preparation_attempts DROP COLUMN IF EXISTS observations_json;
ALTER TABLE preparation_attempts DROP COLUMN IF EXISTS title;
