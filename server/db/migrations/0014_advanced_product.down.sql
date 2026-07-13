-- Rollback for 0014_advanced_product. Safe: only the admin console writes
-- archived_at; the candidate/simulation planes never read it.

ALTER TABLE teams DROP COLUMN IF EXISTS archived_at;
