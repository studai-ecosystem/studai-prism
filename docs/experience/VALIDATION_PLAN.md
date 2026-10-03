# Prism human-validation plan (P9.8, CH-45)

Status: PREPARED, NOT EXECUTED. No rater has been recruited, trained or has rated anything under this plan. No study has started. No agreement, reliability, validity or fairness figure exists. A coding agent cannot self-certify independent review; every gate below is signed by the named human role or stays open.

The machine completeness check validates required headings and the T01-T60
ledger only. It cannot approve intended use, constructs, tasks, timing,
accessibility, confounds, rater independence, blinding, thresholds or study
interpretation. Studies A-E below are complete as blank executable plans, not
as executed studies; suggested counts remain proposals.

Carries forward the human-action register (`docs/campus/CAMPUS_HUMAN_ACTIONS.md`, HA-C items) and the existing blinded double-rating queue (`/api/admin/validation`, dark behind `PRISM_V3_RATING_QUEUE`). This file adds the study designs, rater programme and pre-registered thresholds; it does not replace the register.

## 1. Measurement-lead review (precondition for everything below)

A qualified measurement lead reviews and signs, in writing: intended use of the pilot form; the constructs and their behaviour anchors; task alignment (does the handover slice elicit the behaviours it claims to); timing and accessibility (timing policy, modes, accommodations); confounds (prior exposure, language, device, AI-participant variance). Open items block Studies B–F. Output: a signed review note stored in the research store with the form version, rubric reference and method version from the run manifest (`scripts/live-model-smoke.mjs`).

## 2. Rater programme

- Minimum two independent raters for all initial double-rating; a third qualified reviewer for training and adjudication where feasible. The lead justifies actual counts and sample design in writing before rating starts.
- Qualification: domain experience with early-career workplace interaction and completion of the training set with agreement at or above the training threshold (set by the lead before training; recorded, not tuned afterwards).
- Training material and held-out evaluation material are disjoint sets, split by participant and by task; a rater never sees a held-out item during training.
- Independent initial ratings are stored before any adjudication and are never overwritten; adjudication produces a separate record with the adjudicator and reason.
- Blinding: raters do not see AI judge output, evidence status, treatment condition or participant identity when the protocol requires blind rating (all of Studies C, D and E). Only the necessary source context (the opportunity, the candidate action text, the artifact diff) is shown; no names, institutions or report narrative.
- Identity minimisation: rating items carry run/action/opportunity ids and a rater code only.
- Rater drift check: a small anchored set re-rated at fixed intervals; drift beyond the pre-set tolerance triggers retraining, not re-scoring of past items.

## 3. Rating rubrics (prepared, to be reviewed by the lead)

- Evidence rating: for each opportunity–action pair, the rater assigns the governed rubric level or ABSTAIN with a reason code (TOO_SPARSE, NOT_ADDRESSED, AMBIGUOUS, OFF_TASK, TECHNICAL). Abstention is a valid outcome and is analysed, not discarded.
- Comprehension rating (for RESEARCH_PROTOCOLS.md §2–3 verbatim notes): FINDING_CORRECT / OVERSTATED / MISSED; LIMIT_CORRECT / MISSED; NEXT_STEP_RELEVANT / UNRELATED / NONE. Two blinded raters; disagreements adjudicated by the third.
- Transfer rating (Studies D/E): performance on the unfamiliar task against a predefined behavioural outcome rubric written before data collection; blinded to condition and to Prism results.

## 4. Study sequence

| Study | Question | Design | Required safeguards | Primary outcome (pre-registered before data) |
|---|---|---|---|---|
| A — Feasibility | Do users understand the task and produce interpretable behaviour? | Suggested 40–60 voluntary participants; diverse modes; qualitative error analysis | No broad validity claim; interruptions and technical faults logged as such | Share of runs with interpretable behaviour per opportunity (rater-judged); error taxonomy |
| B — Elicitation | Does the Director improve evidence over an appropriate non-adaptive condition? | Randomised or counterbalanced; comparable task and time | Independent opportunity delivery and evidence review; non-adaptive condition must be a fair alternative | Rater-judged evidence yield per delivered opportunity, by condition |
| C — Evaluation | Does Prism interpret behaviours defensibly? | Held-out actions double-rated | Human–human and AI–human agreement; confusion, error and abstention analysis; held-out items never used for prompt or rubric iteration | Weighted ordinal agreement (AI–human) against the human–human baseline; abstention agreement |
| D — Development | Does targeted practice improve unfamiliar-task performance? | Equal-time comparator; blinded rating | Predefined outcome; no coaching leakage from practice into the fresh task; exposure metadata recorded | Blinded rating on the fresh task, by condition |
| E — Transfer | Do results relate to independently observed performance? | Independent observation of a different task or setting | Observer blind to Prism results; same construct definitions | Association between Prism evidence levels and independent ratings, with uncertainty |
| F — Fairness / mode | Are there unintended interpretation differences across supported modes and groups? | Planned adequate samples per mode and group | Language / ASR / task-access analysis; unvalidated modes kept separate and not pooled | Group- and mode-specific agreement and abstention rates with intervals |

Sequencing: A first; B–F are powered after A and only with the lead's written sample justification. Primary outcomes and exclusions are pre-recorded per study before its data collection. Splits are by participant and task, and by institution where required; turns from one person are not independent people. Training-template exposure is tracked so it cannot leak into held-out tasks.

## 5. Analysis outputs (method chosen by the measurement lead)

Prepared, not computed: weighted ordinal agreement where appropriate (e.g. quadratic-weighted kappa or an ordinal alternative the lead selects), confusion matrices per rubric level, abstention rates and abstention agreement, a human–human baseline for every AI–human comparison, uncertainty intervals (bootstrap by participant), rater-specific and construct-specific effects. Correlation is not agreement; reliability is not external validity. There is no universal accuracy target and no "95% accurate" claim.

## 6. Pre-registered thresholds (to be fixed by the lead before data; placeholders stay empty until then)

| Decision | Threshold | Set by | Set on |
|---|---|---|---|
| Rater qualification agreement on training set | _not yet set_ | measurement lead | — |
| Minimum human–human agreement to proceed to AI–human comparison | _not yet set_ | measurement lead | — |
| AI–human agreement relative to human–human baseline (Study C go) | _not yet set_ | measurement lead | — |
| Maximum acceptable abstention disagreement | _not yet set_ | measurement lead | — |
| Study D effect of interest and minimum sample | _not yet set_ | measurement lead | — |
| Fairness tolerance per mode/group (Study F) | _not yet set_ | measurement lead | — |

Thresholds are written here with a date before the relevant data exists and are not changed afterwards to make a study pass. Google Vantage and other external frameworks are methodological references only, never borrowed validity or copied content.

## 7. Go / no-go authority by role

| Gate | Signs | Cannot be signed by |
|---|---|---|
| Engineering reliability (fault suite, DB suites, load observations) | engineering lead | — |
| Content (form, rubric, missions out of DRAFT) | content owner with measurement lead | the author of the content |
| Measurement (review in §1, study designs, thresholds, results interpretation) | measurement lead | engineering, product, a coding agent |
| Security / privacy (data class, consent, retention, rater access) | security/privacy owner | — |
| Product / finance (spend limits, incentives, pricing experiments) | product/finance owner | — |
| Operations (live-model authorisation, staging credentials, participant scheduling) | operations lead | — |
| Wider activation | all of the above, with no unresolved critical failure | any single role |

A pending signature is an open gate. A fixture-tested result is not a human-approved one. State labels used in the implementation ledger: IMPLEMENTED, FIXTURE_TESTED, INTEGRATION_VERIFIED, LIVE_MODEL_VERIFIED, HUMAN_APPROVED, DEPLOYED, BLOCKED.

## 8. Current blockers (precise)

| Blocked action | Dependency | Owner | Evidence needed |
|---|---|---|---|
| Rater recruitment and training | measurement-lead review (§1) signed; rater agreement and data-handling terms | measurement lead; security/privacy | signed review note; rater codes issued |
| Any study start | APPROVED pilot form (current form is DRAFT 0.1.0-draft); consent materials; institution clearance where applicable | content owner; research lead | approval record in the HA register |
| Live-model Layer C evidence | operator authorisation, credentials, spend limit, consent/data class, staging target | operations lead; product/finance; security/privacy | `scripts/live-model-smoke.mjs` reporting READY_FOR_OPERATOR_RUN, then operator-recorded run ids |
| Thresholds in §6 | measurement lead decision | measurement lead | dated entries in §6 |

## 9. Record keeping

Independent ratings, adjudications, study pre-registrations and results live in the research store, pseudonymous, with run/action/opportunity ids as the only link to product data. Nothing from a participant enters the repository, fixtures, tests, product copy or analytics. Results, when they exist, are reported with their study, sample, exclusions, uncertainty and the threshold they were tested against — separately from planned studies.
