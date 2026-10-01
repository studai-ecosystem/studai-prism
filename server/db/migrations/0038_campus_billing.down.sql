-- 0038_campus_billing.down.sql — reverses 0038_campus_billing.sql.
DROP VIEW IF EXISTS campus_usage_ledger;
DROP TRIGGER IF EXISTS invoice_exports_append_only ON invoice_exports;
DROP TABLE IF EXISTS invoice_exports;
DROP TABLE IF EXISTS campus_contract_pricing;
DROP TABLE IF EXISTS campus_contracts;
