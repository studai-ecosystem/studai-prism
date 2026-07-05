# Study 2 — Human–LLM vs Human–Human Rater Agreement (Vantage replication B)

**Study key:** `human_llm_agreement` · **Status:** preregistered

## Hypothesis

Quadratically-weighted Cohen's κ between the judge panel and qualified human raters is not lower than κ between pairs of qualified human raters, per dimension.

## Design

- Double-rating: every eligible real session's blinded transcript (`session_transcripts` — turns only, no AI scores) is rated by 2 qualified human raters on the 0–4 rubric (`judge_turn.v1` anchors) via the rater workbench.
- Rater qualification (IRR gate): weighted κ ≥ 0.6 against reference levels on all training transcripts (`rater_training_refs`); unqualified ratings are excluded automatically at the API.
- **Human decision required before onboarding:** the rubric owner must review/approve the training-reference levels seeded in `lib/studies.js` (`TRAINING_REFS`).
- Blinding: raters never see AI scores, other raters' ratings, or candidate identity.

## Sample

Target ≥ 100 double-rated real sessions (the same corpus gates conformal calibration and Channel B training).

## Preregistered metric

- κ_HH: weighted κ between the two human raters, per dimension, across shared sessions.
- κ_HL: weighted κ between panel modal levels (`judge_votes`) and each human rater, per dimension.
- Success criterion: κ_HL ≥ κ_HH − 0.05 per dimension (non-inferiority margin stated in advance).

## Exclusions

Synthetic sessions; sessions where a rater flagged the transcript unusable; ratings from raters below the IRR gate.

## Analysis

Computed by a versioned analysis job; results append-only in `study_results`. Human-human pairwise κ is monitorable live at `GET /api/studies/irr`.
