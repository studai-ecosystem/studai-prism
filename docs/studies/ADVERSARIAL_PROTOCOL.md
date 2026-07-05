# Study 4 — LLM-Assisted Cheating: Detection Evasion Rate

**Study key:** `adversarial_evasion` · **Status:** preregistered · **DO NOT RUN before human review of this protocol and consent design.**

## Hypothesis

Candidates instructed to relay answers from an external LLM are distinguishable from honest candidates using behavioral timing features, at a usable operating point.

## Design

- Recruited participants, two arms with explicit informed consent:
  - **Honest arm:** complete the assessment normally.
  - **Assisted arm:** explicitly instructed to use an LLM in a second window as much as possible without being obvious.
- Labels (`honest`/`assisted`) are ground truth by construction; stored with the study link, never inferred.
- Features: Track 3.1 behavioral signals (response-latency distribution, typing cadence / speech-onset delay, mid-turn revisions, latency-vs-complexity residuals). Audio is never persisted.
- Classifier: trained on a train split, evaluated on held-out sessions. No real-candidate data is ever labeled by the classifier during this study.

## Preregistered metric

- **Evasion rate at 5% false-positive rate** on held-out labeled sessions (primary, published on the Technical Manual as "current evasion rate: X%").
- ROC-AUC (secondary).

## Ethics & consent

- Participants are paid testers, not real candidates; their sessions are `is_synthetic=true` for all calibration purposes and linked to this study only.
- Detection output in production is ADVISORY ONLY: routes a session to human review; never auto-fails a candidate; credential schema records "reviewed by human," never "cheater."

## Publication

Evasion rate + methodology published as the open adversarial benchmark; standing invitation to red-teamers under a responsible-disclosure policy.
