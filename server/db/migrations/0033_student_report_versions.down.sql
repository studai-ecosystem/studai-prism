-- 0033_student_report_versions.down.sql
DROP TRIGGER IF EXISTS student_report_versions_append_only ON student_report_versions;
DROP TABLE IF EXISTS student_report_versions;
