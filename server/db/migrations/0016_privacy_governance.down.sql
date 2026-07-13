-- Rollback for 0016_privacy_governance. Completed erasures leave their
-- receipts in admin_audit_events (immutable) even if this table drops.

DROP TABLE IF EXISTS data_retention_rules;
DROP TABLE IF EXISTS privacy_requests;
