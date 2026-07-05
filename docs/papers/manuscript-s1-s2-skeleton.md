# Replicating and Extending LLM-Steered Skill Assessment on an Indian Cohort

**Manuscript skeleton — Phase 3 Stage 4.2.** Methods sections draft from the preregistered protocols
(describable today). Every results section is **[PENDING — Stage 2]** and renders from the study
registry when computed. Humans finalize; target venue selection is a human call (assessment/
measurement venue over ML venue). Preprint on submission.

## Abstract

[PENDING — written last, from computed results only.]

## 1. Introduction

- Conversational assessment as a measurement primitive (Vantage's published validation).
- The replication gap: no published replication on a non-US cohort; no published multilingual
  or adversarial extension.
- Contributions: (a) preregistered replication of steering efficacy (S1) and human–LLM agreement
  (S2) on an Indian college cohort; (b) extensions: cross-family judge voting with position-swap
  debiasing, conformal score intervals, conversational assessment in Hindi/Tamil/Hinglish
  (provisional, DIF-gated); (c) an open adversarial-robustness benchmark protocol.

## 2. Methods

### 2.1 Instrument

30-minute multi-avatar scenario conversation; 8-scenario frozen bank (3 foundational / 3
intermediate / 2 advanced); five dimensions (critical thinking 25%, communication 25%,
collaboration 20%, problem solving 20%, AI & digital fluency 10%); versioned prompts; server-side
clamp/recompute; signed evidence bundles (Ed25519) per completed assessment.

### 2.2 Study 1 — steering efficacy (preregistered)

Randomized A/B at session start, deterministic SHA-256 arm assignment recorded immutably
(UPDATE-blocked). Arms: Executive engine (Bayesian θ ledger, thin-dimension probe selection)
vs lite director. Preregistered metric: mean non-NA micro-level rate per turn per arm; fraction
of sessions with ≥1 scoreable turn per dimension. Target ≥60 real sessions/arm. Exclusions:
synthetic sessions, <3 candidate turns.

### 2.3 Study 2 — human–LLM agreement (preregistered)

Double-rating of blinded transcripts (no AI scores visible) by qualified human raters (IRR gate:
quadratically-weighted κ ≥ 0.6 on reference transcripts). Preregistered metric: κ_HH (human-human)
vs κ_HL (panel-modal vs human) per dimension; non-inferiority margin 0.05, stated in advance.
Target ≥100 double-rated sessions.

### 2.4 Scoring system

Panel-of-judges median voting with persona/temperature/position-swap variation; minimum-3-judges
floor with reliability downgrade; micro-rater per-turn levels; conformal intervals (provisional
±6 until coverage validates at 90% on held-out pairs).

### 2.5 Ethics & data protection

Affirmative versioned consent (8 scopes); pseudonymous research tables; right-to-erasure cascade
(verified zero-orphan); synthetic-data flagging with unconditional exclusion from analyses;
detection signals advisory-only (human review, never auto-fail).

## 3. Results

### 3.1 S1 — steering efficacy: **[PENDING — Stage 2; renders from `study_results` steering_ab]**

### 3.2 S2 — agreement: **[PENDING — Stage 2; renders from `study_results` human_llm_agreement]**

### 3.3 Calibration: **[PENDING — first frozen IRT/Rasch/conformal runs]**

## 4. What these results do and do not support

[PENDING — mandatory section; mirrors each results memo's "does NOT support" list verbatim.]

## 5. Limitations

Single-country cohort; college-age population; non-English scoring provisional pending DIF (S6);
sim-to-real transfer unstudied here (S5 separate); LLM judge drift managed by anchored-deployment
gating, not eliminated.

## 6. Reproducibility

Preregistered protocols in-repo (`docs/studies/`); analysis code versioned (`analysis_version`
on every result); append-only registry; auditor export available to reviewers; evidence-bundle
schema frozen and public.
