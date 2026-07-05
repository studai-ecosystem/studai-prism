# Study 3 — Test–Retest Reliability on Equated Forms

**Study key:** `test_retest` · **Status:** preregistered

## Hypothesis

Dimension scores on equated forms separated by the study window correlate at r ≥ 0.7, with no material mean shift beyond the practice-effect allowance.

## Design

- Consenting pilot candidates take a second assessment on a DIFFERENT scenario form (no-repeat assignment is enforced by `pickScenario` + Track 0.3) within a fixed window (14–28 days — short enough that true ability is stable, long enough to dampen memory effects).
- Both attempts stamped with `scale_version` in `assessment_timeline`; comparability requires same scale version or an equating transform on record.
- Session tag: `study_sessions` rows link both attempts to this study.

## Sample

Target ≥ 40 candidates with two completed attempts.

## Preregistered metric

- Pearson r per dimension between attempt-1 and attempt-2 scores.
- SEM per dimension; mean attempt-2 − attempt-1 shift (practice effect estimate).

## Exclusions

Synthetic sessions; attempts on non-equated scale versions; candidates with integrity flags on either attempt.

## Dual use

This study's data simultaneously boots the Skill Velocity growth model (Track 1) — test–retest r is its measurement-error input.
