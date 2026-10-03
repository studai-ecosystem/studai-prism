-- 0051_report_review_decisions.down.sql — reverses 0051.
DROP TRIGGER IF EXISTS report_review_decisions_append_only ON report_review_decisions;
DROP INDEX IF EXISTS report_review_decisions_review_idx;
DROP TABLE IF EXISTS report_review_decisions;
