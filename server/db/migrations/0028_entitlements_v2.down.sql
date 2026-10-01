-- 0028_entitlements_v2.down.sql — reverses 0028 exactly.
DROP TRIGGER IF EXISTS entitlement_consumptions_append_only ON entitlement_consumptions;
DROP INDEX IF EXISTS entitlement_consumptions_org_idx;
DROP INDEX IF EXISTS entitlement_consumptions_entitlement_idx;
DROP TABLE IF EXISTS entitlement_consumptions;
DROP INDEX IF EXISTS entitlements_user_idx;
DROP INDEX IF EXISTS entitlements_org_idx;
DROP TABLE IF EXISTS entitlements;
DROP FUNCTION IF EXISTS campus_reject_mutation();
