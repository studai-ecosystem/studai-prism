-- 0044_opportunity_ledger.down.sql — reverses 0044.
DROP INDEX IF EXISTS assessment_opportunities_state_idx;
DROP TABLE IF EXISTS assessment_opportunities;
