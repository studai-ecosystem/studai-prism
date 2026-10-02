-- 0045_report_reviews.down.sql — reverses 0045.
DROP INDEX IF EXISTS report_review_requests_session_idx;
DROP TABLE IF EXISTS report_review_requests;
