-- Rollback for 0018_candidate_governance.sql.

DROP TABLE IF EXISTS institution_verifications;
ALTER TABLE v1_disputes DROP COLUMN IF EXISTS resolution;
ALTER TABLE v1_users DROP COLUMN IF EXISTS age_declaration;
