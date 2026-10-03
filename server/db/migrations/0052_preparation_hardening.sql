-- 0052_preparation_hardening.sql — P7 gap closure (CH-34, CH-35).
-- Additive, reversible. Still PERSONAL / PREPARATION / SELF_REPORT only; no
-- foreign key reaches any formal table.
--   * preparation_attempts: learner-chosen title, rehearsal observations
--     (quotes verified against the learner's own lines) and the application
--     suggestion (editable, dismissable, in-app reminder opt-in).
--   * preparation_turns: AI_ASSISTANT actor for sample sentences the learner
--     asks for, kept apart from AI_PARTICIPANT replies and CANDIDATE lines.
--   * application_checkins: "what next" and an update timestamp so a
--     check-in can be edited.
ALTER TABLE preparation_attempts ADD COLUMN IF NOT EXISTS title TEXT CHECK (title IS NULL OR char_length(title) <= 120);
ALTER TABLE preparation_attempts ADD COLUMN IF NOT EXISTS observations_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE preparation_attempts ADD COLUMN IF NOT EXISTS application_json JSONB;

ALTER TABLE preparation_turns DROP CONSTRAINT IF EXISTS preparation_turns_actor_check;
ALTER TABLE preparation_turns ADD CONSTRAINT preparation_turns_actor_check CHECK (actor IN ('CANDIDATE', 'AI_PARTICIPANT', 'AI_ASSISTANT', 'SYSTEM'));

ALTER TABLE application_checkins ADD COLUMN IF NOT EXISTS next_step TEXT CHECK (next_step IS NULL OR char_length(next_step) <= 2000);
ALTER TABLE application_checkins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
