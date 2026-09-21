DROP INDEX IF EXISTS idx_v1_payments_user_id;
ALTER TABLE v1_payments DROP COLUMN IF EXISTS user_email;
ALTER TABLE v1_payments DROP COLUMN IF EXISTS user_id;
