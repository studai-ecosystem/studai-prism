-- Track 3.1 — per-turn behavioral signals for relay detection research.
--
-- item_responses.behavior holds the CLAMPED summary of how a turn was
-- produced (latency, typing cadence, revision counts, speech-onset timing).
-- Summary statistics only: never keystroke logs, never audio, never prosody.
-- Collected under the research_calibration consent scope (v2026-07-05.1).

ALTER TABLE item_responses ADD COLUMN IF NOT EXISTS behavior JSONB;

COMMENT ON COLUMN item_responses.behavior IS
  'Track 3.1 interaction-pattern summary for this turn: {responseMs, modality, typing:{...}, voice:{speechOnsetMs,recordingMs,silenceGapCount}, promptWordCount, pressure:{kind,dimension}|null}. Derived timings only — no keystroke logs, no audio, no prosody (prohibited).';
