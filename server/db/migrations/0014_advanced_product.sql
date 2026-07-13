-- 0014_advanced_product.sql — Control Centre Phase 4: credentials console,
-- practice replays, team simulation, research exports.
--
-- Single additive change: teams gain an archive timestamp (soft archive —
-- prompt §19/§28: teams are archived, never hard-deleted, and removing a
-- member never rewrites historical simulation records). Everything else in
-- Phase 4 rides existing tables: credentials (0006, immutability trigger),
-- practice_replays (0009), teamfit_sessions (0009), admin_exports/
-- admin_incidents (0011).

ALTER TABLE teams ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
