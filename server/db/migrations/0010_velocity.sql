-- Track 1.1 — final per-dimension theta (+ SE) per completed assessment.
-- The measurement points for growth curves. JSONB shape:
--   { overall: {theta, se}, dimensions: {criticalThinking: {theta, se}, ...},
--     source: 'ledger' | 'panel' }
-- 'ledger' = executive EvidenceLedger posterior; 'panel' = derived from the
-- judge panel's per-dimension medians + dispersion (see server/psychometrics/GROWTH.md).
ALTER TABLE assessment_timeline ADD COLUMN IF NOT EXISTS final_theta JSONB;
