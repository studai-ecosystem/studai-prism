-- 0041_report_publication.down.sql — reverses 0041.
ALTER TABLE student_report_versions DROP COLUMN IF EXISTS prior_version;
ALTER TABLE student_report_versions DROP COLUMN IF EXISTS reason;
ALTER TABLE student_report_versions DROP COLUMN IF EXISTS issued_at;
ALTER TABLE student_report_versions DROP COLUMN IF EXISTS evidence_set_hash;
