-- Rollback for 0019_accommodations_retention.sql.

ALTER TABLE data_retention_rules DROP COLUMN IF EXISTS provisional;
DROP TABLE IF EXISTS retention_runs;
DROP TABLE IF EXISTS retention_overrides;
DROP TABLE IF EXISTS legal_holds;
DROP TABLE IF EXISTS candidate_demographics;
DROP TABLE IF EXISTS v1_accommodations;
