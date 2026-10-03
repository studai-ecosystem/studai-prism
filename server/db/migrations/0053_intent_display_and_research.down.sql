-- 0053_intent_display_and_research.down.sql — reverses 0053.
ALTER TABLE user_preferences DROP COLUMN IF EXISTS research_permission_at;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS research_permission;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS display_name;
