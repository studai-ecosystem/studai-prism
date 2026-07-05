# Study 1 — Executive Steering vs Lite Director: Evidence Density (Vantage replication A)

**Study key:** `steering_ab` · **Status:** preregistered · **Registry:** `studies` table

## Hypothesis

Executive-steered conversations (`PRISM_V2_EXECUTIVE` engine) elicit a higher rate of scoreable skill evidence per turn than lite-director conversations, replicating the steering result published for Google Vantage.

## Design

- Randomized A/B at session start. Arm chosen deterministically from SHA-256(study_id, session_id) — auditable, non-flippable; recorded immutably in `study_sessions` (DB trigger forbids UPDATE).
- Arms: `executive` (full Executive Engine for that session) vs `lite` (production lite director).
- Enabled by `PRISM_STUDY_STEERING_AB=true`; assignment overrides the global executive flag for the assigned session only.

## Sample

Real (non-synthetic) pilot sessions. Target: ≥ 60 sessions per arm before first analysis. Synthetic sessions (`is_synthetic=true`: dummy/dev entitlements) are excluded by default from every metric query.

## Preregistered metric

1. Mean non-NA micro-rater level rate per turn per arm (from `item_responses.micro_levels`).
2. Fraction of sessions with ≥ 1 scoreable (non-NA) turn per dimension, per arm.

Computed by `computeSteeringEvidenceDensity` (`analysis_version: steering-density-v1`); written append-only to `study_results`.

## Exclusions

- Synthetic sessions (default).
- Sessions with < 3 candidate turns (abandoned).

## Analysis & stopping

- Two-proportion / Mann-Whitney comparison at first N target; no peeking-based stopping.
- A result, once computed on final data, is immutable — corrections issue a superseding result with full history.

## Caveat

The lite arm's `micro_levels` require the micro-rater to run in observation mode for both arms (rater on, steering off in lite). If micro-levels are unavailable in the lite arm, the fallback metric is the deterministic behavioral-signal density (`extractTurnFeatures`), stated explicitly in the result detail.
