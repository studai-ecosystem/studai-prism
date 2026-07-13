-- Rollback for 0012_admin_product. Drops only the admin overlay tables and the
-- two additive v1_users columns (both default-preserving; column drop is safe:
-- v1 code never reads them unless an administrator set them).

DROP TABLE IF EXISTS integrity_reviews;
DROP TABLE IF EXISTS report_admin_states;
DROP TABLE IF EXISTS report_versions;
DROP TABLE IF EXISTS admin_dispute_workflow;
DROP TABLE IF EXISTS admin_session_states;
ALTER TABLE v1_users DROP COLUMN IF EXISTS token_version;
ALTER TABLE v1_users DROP COLUMN IF EXISTS account_state;
