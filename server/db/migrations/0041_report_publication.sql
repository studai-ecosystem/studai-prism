-- 0041_report_publication.sql — P2.7 report publication metadata.
-- A Student Report V3 version issued from an evaluation run records the hash
-- of the evidence set it was built from, when it was issued, why a new
-- version exists and which version it supersedes. Additive and nullable:
-- legacy versions (0033) keep working unchanged. The append-only trigger from
-- 0033 still applies, so these fields are immutable once written.

ALTER TABLE student_report_versions ADD COLUMN IF NOT EXISTS evidence_set_hash TEXT;
ALTER TABLE student_report_versions ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;
ALTER TABLE student_report_versions ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE student_report_versions ADD COLUMN IF NOT EXISTS prior_version INTEGER;
