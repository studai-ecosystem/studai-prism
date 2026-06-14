-- Rollback for 0001_prism_v2_phase0. Drops only the v2 telemetry tables — the
-- v1 JSON store is untouched. Order respects foreign keys.
DROP TABLE IF EXISTS judge_votes;
DROP TABLE IF EXISTS item_responses;
DROP TABLE IF EXISTS behavioral_features;
DROP TABLE IF EXISTS ability_estimates;
DROP TABLE IF EXISTS human_ratings;
DROP TABLE IF EXISTS calibration_runs;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS items;
