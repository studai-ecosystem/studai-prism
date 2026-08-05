-- Rollback for 0017_assessment_invites.sql. (Added in Phase 6: the down-file
-- gap was invisible until CI gained a Postgres service and first exercised
-- migrateDown; 0020's down runs before this one, removing its columns.)
DROP TABLE IF EXISTS invite_redemptions;
DROP TABLE IF EXISTS assessment_invites;
