# Prism Growth Model — v1 (Track 1)

Code: [server/lib/velocity.js](../lib/velocity.js) (live surface, flag `PRISM_VELOCITY`) and
[calibration/jobs/growth_curve.py](../../calibration/jobs/growth_curve.py) (cohort job). **This document and those two
files must change together.**

## Measurement points (T1.1)

Each completed assessment writes `assessment_timeline.final_theta`:

- **Scale:** the 0–4 behavioral level scale (dimension score ÷ 25).
- **Executive sessions** (`source: 'ledger'`): overall θ = EvidenceLedger posterior mean; SE = √(posterior variance), floored.
- **v1 panel sessions** (`source: 'panel'`): per-dimension θ = panel median score ÷ 25; SE = the panel's per-dimension
  vote dispersion (`reliability.perDimensionBand` ÷ 25).
- **SE floor = 0.25** level units (a unanimous 5-judge panel is not infinite precision); **SE default = 0.6** when no
  dispersion information exists.

## Growth model (T1.2)

Per dimension and overall, a **measurement-error-weighted linear growth curve**:

θᵢ = α + β·attemptᵢ + εᵢ, fitted by weighted least squares with wᵢ = 1/SEᵢ².

Outputs per candidate: slope β (levels per attempt), SE(β) = √(1/Σwᵢ(xᵢ−x̄w)²), intercept, n.

**Assumptions (v1, deliberately simple):** linear growth over the observed window; independent measurement errors;
known error variances (the SEs above); no cohort shrinkage. A hierarchical model may supersede this after the
test–retest study reports; the version stamp is `growth-v1`.

## Honesty rules the UI/API enforce (T1.3) — exact thresholds

| Points | Behaviour |
| --- | --- |
| 1 | Scores only. No trend language of any kind. Never extrapolate. |
| 2 | Both scores shown + literal message "Trend available after your next assessment." |
| ≥3 | Growth stated **only when** \|β\| > **1.96**·SE(β) (two-sided 95%). Otherwise: "within measurement uncertainty." |

**Growth percentiles** require cohort **N ≥ 20** candidates with ≥3 non-synthetic points each (`growth_curve.py`);
until then the field is absent, never approximated.

## Equating dependency (T1.4)

Scores are comparable **only** on the same `scale_version`, or via an equating transform on record (none exist yet —
the first frozen equating run creates one). Mixed scales render `not_comparable`: the points are shown separately and
no trend is computed. This is a hard guard in `trendDecision()`, not a UI style choice.

## Synthetic data (RULE 3)

A candidate always sees their own points (including trial/`is_synthetic` attempts, which are labeled). Cohort
statistics — growth percentiles, the test–retest study, any calibration — **exclude** `is_synthetic = true` rows
unconditionally.

## Test–retest dependency (T1.5)

The track's validity claim boots from the preregistered `test_retest` study
([docs/studies/TEST_RETEST_PROTOCOL.md](../../docs/studies/TEST_RETEST_PROTOCOL.md)): enrolment via the admin plane
tags sessions `study='test_retest'` (baseline/retest arms); form assignment reuses the Track 0.3 never-same-scenario
rule. Velocity stays dark (`PRISM_VELOCITY` off) until that study has real data.
