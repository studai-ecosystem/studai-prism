-- 0048_product_grants.down.sql — reverses 0048 (commerce grants + intent columns + usage tags).
ALTER TABLE ai_usage_events DROP COLUMN IF EXISTS tags_json;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS response_mode;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS intention;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS segment;
DROP TABLE IF EXISTS product_grants;
