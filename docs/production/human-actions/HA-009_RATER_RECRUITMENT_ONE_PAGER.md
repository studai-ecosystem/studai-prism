# HA-009 — Rater recruitment one-pager

PROD-READY Phase 10. **DRAFT recruitment one-pager (register row HA-009).**
Based on [RATER_MANUAL_DRAFT_v1.md](../../studies/RATER_MANUAL_DRAFT_v1.md)
(itself DRAFT pending HA-008 and HA-011). It is for the founder / science lead
to adapt and send; pay, hours and contract terms are left blank on purpose.
Current state: **0 of the 4 raters** the S2 study floor requires
([POWER_ANALYSIS_FRAMEWORK_v1.md](../../studies/POWER_ANALYSIS_FRAMEWORK_v1.md)).

---

## Human raters for a workplace-capability assessment (part-time, remote)

**What Prism is.** StudAI Prism gives students and early-career people
feedback on workplace capabilities from a practice scenario. It is a
development tool. It is not an exam, a ranking or a hiring decision.

**What you would do.** Read anonymised assessment transcripts and rate each
capability independently on a 0–4 level rubric with written anchors, in a
web workbench. Your ratings are an independent human reference for research
(how well the automated judgements agree with trained people). **They never
change anyone's report.**

**How the work is set up**

- **Blinded.** You see transcript turns only: no name, email, AI scores,
  other raters' ratings or outcome. You must not try to identify anyone and
  must report any identifying detail you see.
- **Evidence first.** Every score must be backed by something the person
  actually said or did. If there is no evidence for a capability, you mark
  it as insufficient evidence instead of guessing.
- **Fair.** Language errors are not penalised on capabilities that are not
  about language.
- **No speed targets.** Accuracy over throughput.
- **Your own judgement.** No AI tools may be used to produce ratings.

**Qualification.** Before any live work you rate training transcripts. You
qualify when your agreement with the reference ratings reaches a quadratic
weighted kappa of at least 0.6 (the workbench enforces this). Agreement is
monitored afterwards on double-rated sessions.

**Who we are looking for**

- Experience assessing people's work or communication: teaching, training,
  assessment centres, HR development, university tutoring or similar.
- Careful, consistent reader; comfortable writing a short justification.
- Fluent English (Hindi or Tamil is useful for later language studies).
- No role in StudAI's learning products (independence rule).
- Willing to keep transcripts confidential and sign a confidentiality and
  data-processing agreement.

**Terms (to be completed before sending)**

| | |
| --- | --- |
| Hours / volume | `______` |
| Pay | `______` |
| Contract form | `______` |
| Training time (paid?) | `______` |
| Contact | `______` |

---

## Internal notes for the science lead (not for candidates)

- Target: at least 4 qualified raters (S2 floor); the psychometrician may
  set a higher number (HA-008).
- Two workbenches exist: the legacy rater workbench (five Prism dimensions,
  0–4, `rater_training_refs`, kappa gate `TRAINING_KAPPA_THRESHOLD = 0.6`,
  `server/lib/studies.js:192`) and the V3 evidence rating queue
  (`PRISM_V3_RATING_QUEUE`, OFF; two ratings per item, rubric
  `evidence-rubric.v1-provisional`, excerpts up to 2,000 characters;
  `server/domain/validation/ratingQueue.js:9-12`). The manual describes the
  first; the V3 queue needs its own protocol approved under HA-C008.
- Before raters see real excerpts: counsel's consent basis for rater use of
  candidate excerpts (HA-C008 precondition, with HA-C005).
- Evidence to close HA-009: rater roster + signed engagements. Qualification
  (HA-010) is a separate item closed by kappa records in the workbench.
