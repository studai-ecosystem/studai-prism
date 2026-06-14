-- Prism v2 (MASA-2) — Phase 3 calibration support. Additive only.
-- Adds candidate demographics needed by the DIF audit (dif_audit.py). These
-- are bias-monitoring strata only; they never enter a candidate's score.
-- Populating this table is gated behind PRISM_V2_EQUATING on the Node side.

CREATE TABLE IF NOT EXISTS candidate_demographics (
  session_id       UUID PRIMARY KEY,
  gender           TEXT,
  language_medium  TEXT,                  -- e.g. english | regional
  college_tier     TEXT,                  -- e.g. tier1 | tier2 | tier3
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Mark which calibration run is currently applied by the app (at most one per
-- run_type). The Node app reads the applied+frozen run only.
ALTER TABLE calibration_runs
  ADD COLUMN IF NOT EXISTS applied BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_calibration_runs_type ON calibration_runs (run_type, frozen, applied);
