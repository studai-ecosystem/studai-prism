# Study 6 — Multilingual Fairness (DIF Across Language Groups)

**Study key:** `multilingual_dif` · **Status:** preregistered · **Blocked on Track 4 language engineering + human language selection.**

## Hypothesis

Item difficulty does not differ materially across language groups (English / Hinglish / two Indian languages — **languages to be fixed by human decision before data collection**) after matching on ability.

## Design

- Candidates self-select assessment language; language + per-turn ASR confidence recorded with every session.
- All non-English scoring is marked provisional/uncalibrated in every artifact until this study reports (rubric translation ≠ rubric equivalence).
- DIF analysis uses the existing calibration machinery (Mantel-Haenszel + logistic DIF) with language as the group variable.

## Sample

Target ≥ 150 real sessions per language group.

## Preregistered metric

- Per-item DIF flags across language groups (MH χ², logistic-regression uniform + non-uniform DIF at documented thresholds).
- Primary outcome: fraction of active items flagged; items flagged are routed to review/retirement, and the artifact is published (this is also the NYC LL144-style fairness evidence for regulated hiring markets).

## Exclusions

Synthetic sessions; sessions with mean ASR confidence < 0.5 (transcription quality confound).

## Demographic data rule

Any demographic field beyond language requires market-specific legal approval; fields are optional and default-off in code until that approval exists.
