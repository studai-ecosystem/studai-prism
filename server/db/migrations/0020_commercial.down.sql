-- Rollback for 0020_commercial.sql.
DROP TABLE IF EXISTS ai_usage_events;
ALTER TABLE assessment_invites DROP COLUMN IF EXISTS renewal_of;
ALTER TABLE assessment_invites DROP COLUMN IF EXISTS plan;
ALTER TABLE assessment_invites DROP COLUMN IF EXISTS institution;
