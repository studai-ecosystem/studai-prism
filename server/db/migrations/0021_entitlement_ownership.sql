-- Bind assessment entitlements to the candidate account that created or
-- received them. This closes the legacy bearer-session-id authorization gap.
ALTER TABLE v1_payments ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE v1_payments ADD COLUMN IF NOT EXISTS user_email TEXT;
CREATE INDEX IF NOT EXISTS idx_v1_payments_user_id ON v1_payments(user_id);
