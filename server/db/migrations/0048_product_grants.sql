-- 0048_product_grants.sql — P8.4/P8.5 bounded offer grants (commerce plane).
-- One row per granted package: WHICH product/version, WHAT is included, the
-- selected missions, the activity window, HOW it was funded and the provider
-- references that make repeated/reordered payment callbacks idempotent
-- (purchase_ref and provider_event_key are UNIQUE). Additive; the existing
-- entitlements / entitlement_consumptions ledger is unchanged. Finance records:
-- retained under policy, not blanket cascade-deleted with session data.
CREATE TABLE IF NOT EXISTS product_grants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  product_code         TEXT NOT NULL CHECK (product_code IN ('FREE_FIRST_EXPERIENCE', 'PERSONAL_DEVELOPMENT_SPRINT', 'PROFESSIONAL_PREPARATION_PACK')),
  product_version      TEXT NOT NULL,
  included_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_mission_ids TEXT[] NOT NULL DEFAULT '{}',
  valid_from           TIMESTAMPTZ NOT NULL,
  valid_until          TIMESTAMPTZ,
  funding_source       TEXT NOT NULL CHECK (funding_source IN ('PAID', 'SPONSORED', 'DEV', 'INVITE')),
  purchase_ref         TEXT UNIQUE,
  provider_event_key   TEXT UNIQUE,
  policy_version       TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_grants_user_idx ON product_grants (user_id, created_at DESC);

-- P8.2 minimal intent onboarding: display-only preferences, never scoring input.
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS segment TEXT CHECK (segment IN ('STUDENT', 'EARLY_CAREER', 'OTHER'));
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS intention TEXT CHECK (intention IN ('UNDERSTAND', 'PRACTISE', 'PREPARE'));
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS response_mode TEXT CHECK (response_mode IN ('TEXT'));

-- P8.8 cost by run/mode/method/package: pseudonymous tags (run id hashed).
ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS tags_json JSONB NOT NULL DEFAULT '{}'::jsonb;
