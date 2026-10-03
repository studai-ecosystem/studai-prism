-- 0053_intent_display_and_research.sql — P8.2 minimal intent onboarding, part 2.
-- display_name: an optional, display-only label the learner may choose for
-- their own screens. It is never read by scoring, evaluation, judging or
-- report generation (static test: no scoring module imports preferences).
-- research_permission: a SEPARATE, explicit choice (never bundled with the
-- intent step's submit). NULL = not asked; TRUE/FALSE with the time of the
-- choice. Nothing in this phase reads it for research use; it is recorded so
-- the choice is auditable when a research manifest exists (P9/P10 gate).
-- Additive and reversible.
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 40);
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS research_permission BOOLEAN;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS research_permission_at TIMESTAMPTZ;

-- P8.7 — campus assignments record how participation was shaped. Stored in
-- the existing reminder_policy JSONB (keys: enabled, daysBeforeDue,
-- participation, incentive); no new table. This comment documents the shape
-- for the schema reader; nothing to alter.
