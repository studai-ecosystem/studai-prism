-- Rollback for 0015_cms_system. Drops only Phase 5 tables. Safe while
-- PRISM_CMS_DB is off (public content still reads the JSON file); if the CMS
-- cut-over already happened, export content back to content.json first.

DROP TABLE IF EXISTS system_jobs;
DROP TABLE IF EXISTS model_registry;
DROP TABLE IF EXISTS feature_flag_changes;
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS job_applications;
DROP TABLE IF EXISTS content_jobs;
DROP TABLE IF EXISTS content_post_versions;
DROP TABLE IF EXISTS content_posts;
