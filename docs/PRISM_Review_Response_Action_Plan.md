# Prism — Response to the Investor & Product Review, and the Resulting Action Plan

**Date**: 2026-08-04 · **Status**: Management response, adopted as the operating plan
**Companion to**: `PRISM_Product_Reference.md` (same folder) — the descriptive reference this review examined
**Method**: Every material claim in the review was cross-checked against the live codebase (main @ `ad4be54`), the test suite, and production state before this response was written. Where the review is right, we say so and act. Where it needs nuance, we show the code. Nothing here is code — this is the plan.

---

## 0. Management summary

We accept the review's central verdict:

> *Prism has built the trust and control plane faster than it has proven the measurement and commercial layers.*

That is accurate, and it was partially by design — the governance machinery was built first precisely so that measurement claims could never outrun evidence. But the review is right that machinery is not evidence, and that the next quarter must be spent on **validity, buyers, accessibility, and unit economics — not features**.

Our disposition of the review's findings:

| Disposition | Count | Examples |
| --- | --- | --- |
| Accepted, act now (P0/P1) | 14 | Credential rotation, scoring-identity pseudonymization, accommodations, age gating, rater recruitment, wording downgrades |
| Accepted, scheduled (P2) | 11 | PG migration, GitOps, secret splitting, job-family profiles, contribution-margin dashboard |
| Accepted in principle, already partially built | 8 | Institution-payer model (invites), honest percentiles, claims ceiling, evidence-gated flag flips |
| Nuanced / corrected with evidence | 5 | "300-session switch", judge "reliability" internals, standardization degree, proctoring consent model, credential semantics |
| Rejected | 0 | — |

The one place our own cross-check went **further than the review**: after the 2026-08-04 personalization release, the candidate's first name now appears inside avatar lines in the judge transcript. The review flagged name-based bias as a theoretical risk; it is now a concrete one. It is P0 in this plan alongside the credential rotation.

---

## 1. Where the review is right (verified against code)

### 1.1 The measurement layer is unproven — correct

- The rubrics, IRT plans, conformal machinery, and calibration jobs exist and are tested — but **zero human-rated sessions, zero test-retest pairs, zero criterion studies** exist. The pilot dashboard itself reports these as honest zeros. The review's 3/10 on psychometric evidence is fair.
- Content, construct, criterion, fairness, and consequential validity are all future work. The plan in §4 makes them the roadmap.

### 1.2 Five judges are one model in five stances — correct

- Verified: the panel is five samples of the **same** Bedrock model (`mistral-large-3`) with different persona stances and position-swapped rubric order. Errors are plausibly correlated; agreement is *panel consistency*, not reliability in the psychometric sense.
- Accepted: external wording changes from "reliability" to **"AI panel consistency"** until human-anchored studies exist (report copy + verify page + docs). The internal field names can stay; the public language cannot.

### 1.3 Scoring identity must be separated from conversation identity — correct, and now urgent

- Verified in `routes/assessment.js`: the `/evaluate` transcript labels candidate turns as `CANDIDATE:` (good), but avatar turns are included verbatim — and since `avatar_system.v2`, avatars address the candidate by first name. **The judge model therefore sees the candidate's name.** Names carry gender/ethnicity/religion signals; character whitelisting prevents injection, not bias.
- Adopted (P0, next release): strip/replace the candidate's name in the transcript before it reaches any judge, micro-rater, or calibration artifact (e.g., substitute a neutral token). Personalization stays in the conversation; it must never reach scoring.

### 1.4 ASR down-weighting is score-affecting — correct

- Verified: `asrConfidence` (0–1, clamped) flows into per-turn evidence weighting (audit C17). The product law says ASR may down-weight, never change, a score — but a down-weight **is** score-affecting in the review's sense and therefore needs channel- and subgroup-level validation before high-stakes use. Added to the validity agenda (§4.2), and the report will disclose when a session's turns were down-weighted.

### 1.5 Standardization gaps — correct in substance

Verified sources of construct-irrelevant variance: chosen avatar working-style now colors conversations; challenger/observer appearances are probabilistic; the director adapts targets; difficulty tiers differ; voice and text are both allowed. Individually defensible, collectively they reduce comparability.

Adopted:

- Define a **standardized core** per scenario: fixed opening stimulus (already fixed), a set of **anchor probes** every session must include, and **minimum evidence opportunities per reported dimension** before adaptivity is allowed to steer.
- When a dimension lacks evidence, report **"insufficient evidence"** instead of a confident number. (Today the micro-rater can output `NA` per turn, but the final report still scores all five dimensions — the review is right that this must change.)
- The candidate's chosen character may change tone, **never scored difficulty**; this becomes an explicit invariant with a test once implemented.

### 1.6 Age and accessibility gaps — correct

- Verified: "You must be at least 18 years old, or have the consent of a guardian" exists **only as a Terms clause**. There is no age gate, no guardian-consent procedure. Under India's DPDP Act (child = under 18) this is a real gap for student deployments.
- Verified: no accommodations policy and no alternative path for candidates who cannot use camera, microphone, or fullscreen.
- Adopted (P1): explicit 18+ gate at registration for now (the simpler lawful path); a legally reviewed guardian-consent flow only if a customer genuinely needs under-18 cohorts. Accommodations policy + alternate assessment path (text-only, no-camera with disclosure to the score consumer) drafted with counsel.

### 1.7 Exposed credentials are a P0 incident, not a to-do — correct

- Razorpay live keys and the SendPulse password were pasted into chat sessions and remain unrotated. The review's sequencing is adopted verbatim: revoke/rotate → audit usage since exposure (payment logs, mail logs) → update Secrets Manager → restart → verify old credentials dead → incident record → process fix (secrets never enter chat; already partially practiced — bootstrap passwords go to local files, never chat).

### 1.8 Architecture risks — correct, scheduled

- **Single-writer JSON on EFS + 1 replica Recreate**: acknowledged; acceptable for the pilot, not for scale. The PG store twin (`storePg`) already passes the same contract tests, and the flip runbook exists — the migration is execution, not invention. Scheduled ahead of any enterprise volume.
- **Manual deploys** (SSM tunnel + `kubectl set image`): key-person dependency accepted as real; a controlled pipeline (environment approval, signed images, migration gates, rollback) is scheduled.
- **One 35-key secret**: split by function (payments / email / AI / database / signing) for least privilege and rotation containment.
- **Personal-email super-admin**: move to corporate identities; break-glass stays monitored and separate.

### 1.9 Product focus — correct

- The four-products-at-once observation is fair. The chosen beachhead (§5) is the review's recommendation, which matches how Prism is actually being used today (college cohort via coupon): **evidence-based workplace-readiness assessment for graduating students, used for development and structured interview preparation — not automated rejection.**
- "Interviewer guide = decision support" becomes the enterprise framing: *Prism does not decide whom to hire; it gives interviewers structured, evidence-linked signals to investigate consistently.*
- Candidate-paid ₹499 stays only for voluntary self-development; institutional cohorts are institution-paid (the invite/coupon machinery already implements exactly this — it needs pricing, not code).

### 1.10 Wording downgrades — correct

Verified current copy: report cert says "Prism Verified"; site title says "Assessment & Verification". The claims-ceiling suite already killed "certified"; the review pushes one step further and is right:

- "Independently verified skills credential" → **"cryptographically verifiable Prism report"** (the signature proves issuance and integrity, not ability).
- "12-month validity", 90-day gap, 30 minutes, dimension weights, 4-rater minimum, IRR 0.6 → each labelled **provisional policy / operational rule / evidence-based standard** in docs and, where user-facing, in copy. None of these numbers is currently evidence-based; say so.
- Confidence bands → describe as **"AI panel variation interval"** until intervals account for scenario/probe/rater/channel variance.

---

## 2. Where the review needs nuance (with evidence)

### 2.1 "300 sessions as an unlock switch" — partially a misreading

The 300-session figure is a **floor in the pilot dashboard**, not the flip condition. Actual science-flag enablement runs through `flip-check`, which evaluates **preregistered, study-specific preconditions** (e.g., human–AI weighted-kappa non-inferiority within 0.05, per-dimension retest reliability, adequately-powered DIF with an explicit `UNDERPOWERED` refusal) and returns NO-GO / GO with a rollback plan; the admin flag workflow refuses to enable a science flag while flip-check says NO-GO, and a human flips. This is exactly the "preregistered analysis with specified evidence criteria" the review asks for. **Accepted refinement**: add formal power analysis per intended use to the preconditions, and stop quoting "300" in any external material.

### 2.2 "Percentiles/claims may overstate" — largely already enforced

Percentiles render as *pending* until honestly computable (test-enforced); non-English scoring is marked provisional/uncalibrated on every artifact; the tech manual renders from the database with PENDING for every unrun study; the claims-ceiling CI suite bans the listed vocabulary. The review's remaining asks (verifiable-vs-verified, panel-consistency wording, provisional labels on constants) are accepted above — but the honesty *machinery* it recommends largely exists and is CI-enforced.

### 2.3 "Institutions should pay" — the mechanism already exists

Group invites with seat limits, time windows, custom coupon codes, real-candidate entitlement status, and roster/report views were built precisely for institution-sponsored cohorts, and the live MSW cohort runs on one. What's missing is **commercial packaging** (B2B platform fee + per-assessment usage), not product capability.

### 2.4 Proctoring — consent is real, but the point stands

Every integrity signal is behind explicit granular consent, frames are never stored, and face analysis runs on-device. But the review's strategic point — perceived disproportion at ₹499, and the risk candidates *assume* signals affect scores — is accepted: for standard development-use pilots, phone second-camera and gaze-interpretation default **off**, fullscreen enforcement softens to disclosure, and the report states plainly that integrity events never change scores. High-stakes configurations remain available when a buyer's use case justifies them.

### 2.5 "Overbuilt platform" — true, but most of it is already dark

TeamFit, replay, pressure probes, languages, velocity/growth, steering A/B, prompt-registry DB mode are all **flag-off in production** and cost nothing operationally. The review's freeze is accepted as *"no further construction"* — not as evidence the team is currently spending there. The two live surfaces it names (desktop shell, phone camera) do get frozen/minimized respectively.

---

## 3. The response matrix

| # | Review finding | Verdict | Action | Priority |
| --- | --- | --- | --- | --- |
| 1 | Rotate exposed Razorpay/SendPulse credentials, audit, incident record | Accepted | Full incident sequence (§1.7) | **P0** |
| 2 | Judge must not see candidate identity | Accepted (verified worse post-personalization) | Pseudonymize transcript before scoring; test-enforce | **P0** |
| 3 | "Verified skills" → "cryptographically verifiable report" | Accepted | Copy change + claims-ceiling rule addition | **P1** |
| 4 | "Reliability" → "AI panel consistency" externally | Accepted | Report/verify/docs copy | **P1** |
| 5 | Confidence bands → "AI panel variation interval" | Accepted | Copy + docs | **P1** |
| 6 | Insufficient evidence ⇒ no confident score | Accepted | Per-dimension evidence floor + "insufficient evidence" rendering | **P1** |
| 7 | Standardized core stimulus + anchor probes + min evidence, then adaptivity | Accepted | Assessment-design change, spec'd with psychometrician | **P1** |
| 8 | Character choice must not alter scored difficulty | Accepted | Explicit invariant + test | **P1** |
| 9 | Age gating / DPDP under-18 | Accepted | 18+ gate; guardian flow only if needed | **P1** |
| 10 | Accommodations policy + alternative path | Accepted | Policy + text-only/no-camera path with disclosure | **P1** |
| 11 | Recruit senior I-O psychologist / psychometrician | Accepted | Hire/retain; external advisory board | **P1** |
| 12 | Human raters (0/4) are the critical dependency | Accepted (long known — weekly report names it) | Recruit + qualify 4 raters; rater manual; double-rate meaningful % | **P1** |
| 13 | Two job families only; job-analysis-based profiles; de-emphasize overall score | Accepted | Beachhead scoping (§5) | **P1** |
| 14 | Institutions pay, not candidates (for cohorts) | Accepted; mechanism exists | B2B pricing package | **P1** |
| 15 | Proctoring minimization for standard pilots | Accepted | Default-off phone-cam/gaze; softened fullscreen | **P1** |
| 16 | Voice/text = separate measurement channels, validate subgroups; ASR down-weight disclosure | Accepted | Channel studies in validity agenda; report disclosure | P1/P2 |
| 17 | Power-analysis gates, not one session number | Accepted refinement (flip-check already evidence-gated) | Add power analysis to preconditions; drop "300" externally | P2 |
| 18 | Migrate JSON/EFS single-writer → PostgreSQL | Accepted | Execute existing flip runbook (staging first) | P2 |
| 19 | CI/CD-GitOps deploys, signed images, rollback | Accepted | Pipeline work | P2 |
| 20 | Split the 35-key secret by function | Accepted | Secrets restructure + rotation SOP | P2 |
| 21 | Corporate admin identities, hardened MFA | Accepted | Identity migration | P2 |
| 22 | Contribution-margin dashboard | Accepted | Extend existing per-call AI cost logging into per-assessment margin view | P2 |
| 23 | DPAs, controller/processor, incident response, prohibited uses, "not sole basis" statement | Accepted | Counsel-drafted enterprise legal pack | P2 |
| 24 | Adverse-impact monitoring | Accepted | Standing DIF/adverse-impact cadence once rated data exists | P2 |
| 25 | StudAI ecosystem conflict (teaching to own test) | Accepted | Separation policy (§6) | P2 |
| 26 | Freeze dark/adjacent features | Accepted | Freeze list (§7) | Standing |
| 27 | Weights are policy, not science | Accepted | Label provisional; profile-first reporting; job-family weights later with governance | P1 (label) / P3 (science) |
| 28 | Eight scenarios insufficient long-term | Accepted (already the plan: calibration unlocks controlled expansion — forms, anchors, exposure control, human review, equating) | Post-calibration bank roadmap | P3 |

---

## 4. Improvement plan — what changes in what already exists

### 4.1 Trust surface (copy and semantics, no behavior change)

1. Report/credential language: *verifiable*, not *verified*; *AI panel consistency*; *AI panel variation interval*; provisional-policy labels on 30 min / 12 months / 90 days / weights.
2. A visible **"pilot instrument"** notice and a published **"not for sole hiring decisions"** use policy.
3. Report discloses when ASR down-weighting affected evidence weighting, and when any dimension had thin evidence.

### 4.2 Measurement (the real roadmap)

1. **Scoring pseudonymization** (P0) — no candidate name in any scoring/rating/calibration artifact.
2. **Construct definitions + behavioral anchors** workshop-validated with workplace SMEs (content validity).
3. **Standardized core**: anchor probes + per-dimension minimum evidence; adaptivity only after the floor; "insufficient evidence" as a first-class result.
4. **Human-rating program**: 4+ qualified raters (weighted-kappa gate exists), rater manual, double-rating quota — feeds the preregistered human–AI agreement study (S2) that everything else waits on.
5. **Channel studies**: voice vs text equivalence; ASR-confidence subgroup behavior; device quality.
6. **Two job families only** for criterion work: structured-interview and placement outcomes as first external criteria.
7. **Power analysis** added to every flip-check precondition; session counts leave the vocabulary.

### 4.3 Platform (scheduled, not urgent)

PostgreSQL as system of record for users/sessions/reports (runbook exists) → then ≥2 replicas and rolling deploys; pipeline-based deployment; secret splitting; corporate admin identities. EFS remains for genuinely file-shaped data only.

---

## 5. What gets added (new)

1. **Beachhead definition** (one page, public): workplace-readiness development assessment for graduating cohorts; buyer = placement cells/universities/graduate programs; output = cohort gap map + per-student evidence profile + interviewer guides; explicit non-goal = automated rejection.
2. **Accommodations policy + alternate path** (no-camera/text-only with disclosure), plus a candidate challenge/appeal route beyond the existing human-review right.
3. **18+ gate** (and a documented decision memo on under-18 support).
4. **External science governance**: named I-O psychologist/psychometrician, external advisory board, preregistration registry already exists — add external sign-off to it.
5. **Enterprise legal pack**: DPA template, controller/processor matrix, incident-response SOP, prohibited-uses list, EU-AI-Act readiness memo (high-risk employment obligations, Dec 2027 horizon), EEOC/adverse-impact posture note.
6. **Contribution-margin dashboard** per completed assessment (AI, STT/TTS, infra, payment fees, support, refund/completion rates, margin by channel).
7. **Design-partner program**: 3–5 paid institutional partners with defined success metrics (completion, dispute rate, hiring-manager usefulness, renewal intent) and an honest **pilot technical report** at the end.
8. **Conflict-of-interest separation** (see §6).

---

## 6. StudAI ecosystem separation (teaching to the test)

Adopted policy, effective immediately and to be formalized in writing:

- Prism scenario/rubric content is access-restricted; no Loop (or any StudAI learning product) course may be built around live Prism items.
- Prism science decisions (bank, rubrics, calibration, claims) sit with Prism science governance + external advisors — not with growth or learning-product owners.
- Training-product marketing may never claim score improvement on Prism specifically; assessment marketing may never bundle training as the remedy for a low score.
- Independent validation studies preferred over self-run ones wherever a partner can be found.

---

## 7. What gets removed, frozen, or de-emphasized

| Item | Decision |
| --- | --- |
| Desktop shell enhancements (signing pipeline aside) | **Freeze** (keep shipped installer; no new work) |
| Phone second-camera relay | **Default off** for standard pilots; keep dark for high-stakes configs |
| Gaze-based integrity interpretation | **Default off** for standard pilots; face-presence only |
| Pressure probes (`PRISM_PRESSURE`) | **Stays dark**; no further work |
| TeamFit, Replay, Velocity/growth UI, additional languages, steering A/B | **Stay dark**; no further construction until validity + revenue milestones |
| Advanced prompt-registry DB mode, CMS DB mode, credential-format expansion | **Freeze** |
| Overall Prism Score prominence | **De-emphasize**: profile-first report; overall number contextualized as a provisional composite |
| Candidate-paid default for institutional cohorts | **Removed** — institution pays; ₹499 remains only for voluntary individual use |
| "300 sessions", "verified skills", "reliability", bare "confidence band" in external language | **Removed from vocabulary** |
| Aggressive fullscreen enforcement in development-use pilots | **Softened** to disclosure + telemetry |

Nothing is deleted. Dark stays dark; the review is right that optionality is cheap and construction is not.

---

## 8. 90-day operating plan (merged: review's plan × current reality)

### Days 1–15 — risk down

- [ ] **P0** Rotate + audit Razorpay and SendPulse credentials; incident record; secrets-handling rule reaffirmed.
- [ ] **P0** Scoring-identity pseudonymization released and test-enforced.
- [ ] Pilot-instrument notice + "not sole basis" policy live.
- [ ] Proctoring minimization defaults for standard pilots.
- [ ] 18+ gate live; accommodations policy drafted with counsel.
- [ ] Character-choice ≠ scored-difficulty invariant verified.
- [ ] Psychometrician/I-O search started; employment/privacy counsel engaged.
- [ ] PG migration staged (staging first, per existing runbook).

### Days 16–45 — scientific foundations

- [ ] Intended-use statement per score; construct definitions + anchors; SME content-validity workshops.
- [ ] Two job families selected; everything else explicitly out of scope.
- [ ] 4 raters recruited and kappa-qualified; rater manual issued; double-rating quota running.
- [ ] Preregistered go/no-go criteria (with power analysis) written into flip-check preconditions.
- [ ] Standardized-core assessment design (anchor probes, evidence floors, insufficient-evidence rendering) specified and built.
- [ ] Wording downgrades shipped across report/verify/marketing.

### Days 46–90 — prove value

- [ ] 3–5 **paid** design partners signed (institution-paid cohorts on the existing invite machinery).
- [ ] External comparison measures + structured-interview/placement outcomes collected.
- [ ] Completion, support burden, dispute rates, hiring-manager usefulness measured.
- [ ] Honest pilot technical report published (PENDINGs included).
- [ ] ≥1 renewal or expansion commitment.
- [ ] Contribution-margin dashboard live; margin by channel known.
- [ ] PG migration complete; deployment pipeline replaces manual kubectl path.

---

## 9. Fundability checklist (tracking against the review's bar)

| Milestone | Status today |
| --- | --- |
| 3+ paying institutional/employer customers | ☐ (1 unpaid cohort live) |
| ≥1 renewal/expansion | ☐ |
| Defined initial job family | ☐ (selection due Days 16–45) |
| Qualified external psychometric leadership | ☐ (search opening) |
| Human–AI agreement (preregistered) | ☐ (instrumented; blocked on raters) |
| Test-retest + alternate-form evidence | ☐ (instrumented; blocked on volume) |
| Channel/subgroup fairness evidence | ☐ (jobs exist; blocked on rated data) |
| Criterion study vs interview/work outcomes | ☐ |
| Buyer workflow-improvement evidence | ☐ |
| Strong gross margins, known unit economics | ☐ (cost telemetry exists; dashboard due) |
| Core data off single-writer JSON | ☐ (runbook ready) |
| No unresolved P0 security actions | ☐ → clears on credential rotation + pseudonymization |

---

## 10. Closing position

The review asked Prism to stop treating deployment readiness as evidence of scientific or commercial readiness. Agreed — and the same honesty machinery Prism built for candidates now gets pointed at itself: every claim in our own materials will carry its evidence status, including the claim that Prism works.

The thesis is unchanged and narrowed:

> **Prism is an evidence-backed AI work simulation that shows how a person reasons, communicates, and collaborates in realistic situations — sold as decision support to institutions, for two job families, until its scores are proven to mean something valuable.**

*Precedence note: where this document disagrees with the codebase, the spec, or the preregistered study criteria, those win — and where evidence later contradicts this plan, the evidence wins.*
