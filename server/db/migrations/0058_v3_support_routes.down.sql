-- Down: remove the PROD-READY Phase 4 support-route storage. Never run on a
-- database holding real data (ROLLOUT_PLAN §1): pre-start accommodation
-- requests would be lost. Decided accommodations already copied into
-- v1_accommodations stay there.
DROP TABLE IF EXISTS assessment_accommodation_requests;
DROP INDEX IF EXISTS report_review_requests_one_human_review;
ALTER TABLE report_review_requests DROP COLUMN IF EXISTS request_kind;
