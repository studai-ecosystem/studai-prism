# Prism v2 (MASA-2) build rules

- This is a psychometric assessment system. Server is the source of truth:
  every score is clamped 0–100 and recomputed server-side; the browser never
  calls AI; scoring is idempotent per session.
- NEVER add scoring of facial expression, voice prosody, tone or emotion.
  Voice is speech-to-text input only. ASR confidence may down-weight a turn,
  never directly change a score.
- Every score-affecting decision must write an audit_log row.
- All judge/director prompts live in /server/prompts as versioned files; no
  inline prompt strings in route handlers.
- All new tables per /docs/PRISM_v2_System_Spec.md Part C. Use migrations.
- Feature flags: every v2 behavior ships behind a flag (PRISM_V2_*) defaulting
  off; v1 behavior must remain reproducible.
- Tests required for: theta update math, clamp/recompute, adaptive stop rule,
  reconciliation thresholds, idempotency.

## Execution constraints (non-negotiable)

- **Start Phase 0 telemetry before anything else.** Every Cohort 01 assessment
  from July 1 is calibration data that cannot be recovered retroactively. No
  v2 behavior ships before telemetry + item logging is live.
- **Freeze the scenario bank at ≤ 8 scenarios until the first IRT calibration
  run succeeds.** Do not generate new scenarios; per-item response count must
  accumulate or nothing can be calibrated.
- New AI-generated scenarios enter as `status='provisional'` (severity = tier
  average) and only become certified-eligible after a frozen calibration run.

## Phase order (commit per phase, never mix phases in one branch)

- Phase 0 — telemetry & item logging (zero behavior change), flag
  `PRISM_V2_TELEMETRY`.
- Phase 1 — Executive Engine + Entry Estimator, flag `PRISM_V2_EXECUTIVE`
  (ship for the July 1 cohort).
- Phase 2 — Dual-Channel Scorer + conformal CI, flag `PRISM_V2_DUAL_SCORER`
  (shadow mode; publish nothing until panel-vs-human agreement ≥ human-vs-human).
- Phase 3 — Python calibration jobs + equating + DIF dashboard, flag
  `PRISM_V2_EQUATING` (after ≥ ~300 sessions).
