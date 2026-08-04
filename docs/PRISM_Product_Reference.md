# Prism — Complete Product Reference

**Product**: Prism, an AI-conducted, psychometrically governed skills assessment and verification platform
**Company**: Studai Edutech Private Limited (CIN U85500TN2024PTC168744, Chennai, India)
**Live at**: <https://prism.studai.one> · **Status**: In production (AWS EKS, ap-south-1)
**Document date**: 2026-08-04 · Reflects main @ `ad4be54` (image `prod/prism:ad4be54df1ad`)

---

## 1. What Prism Is

Prism measures how a person **thinks, communicates, and works with people** — not what facts they know. A candidate spends 30 minutes inside a realistic workplace scenario, talking (by voice or text) with AI-played characters who have real agendas and push back. A panel of AI judges then scores the conversation transcript against behavioral rubrics, and the result is issued as a cryptographically signed, independently verifiable credential.

The core positioning: **an instrument, not an oracle**. Every score comes with its evidence (transcript quotes), its uncertainty (confidence bands), and its limitations stated honestly. Claims that have not yet been proven by preregistered studies are labelled *pending* — never asserted.

### The five measured dimensions

| Dimension | Weight in overall Prism Score |
| --- | --- |
| Critical Thinking | 25% |
| Communication | 25% |
| Collaboration | 20% |
| Problem Solving | 20% |
| AI & Digital Fluency | 10% |

Canonical values live in `server/lib/sharedConstants.js` — a single source imported by both server and client so public claims can never drift from what the scoring code does (test-enforced).

### Key product constants

- **Assessment duration**: 30 minutes (server independently enforces 30 + 5 min grace)
- **Score validity**: 12 months, stamped into every report
- **Reassessment gap**: 90 days (growth measurement needs spaced attempts)
- **Scale version**: `prism-scale-v1` (bumps only on a frozen calibration/equating run)
- **Price**: ₹499 INR (server-side `PRICE_PAISE=49900`; never trusted from the client)

---

## 2. Non-Negotiable Product Laws

These are enforced in code and CI, not just policy:

1. **Server is the source of truth.** Every score is clamped 0–100 and recomputed server-side; the browser never calls AI; scoring is idempotent per session.
2. **No emotion scoring — ever.** Facial expression, voice prosody, tone, and emotion are NEVER scored. Voice is speech-to-text input only. ASR confidence may down-weight a turn, never directly change a score.
3. **Every score-affecting decision writes an `audit_log` row.**
4. **All AI prompts are versioned files** in `/server/prompts` — no inline prompt strings in route handlers. Production prompt templates are never edited in place; corrections are new version files (e.g. `avatar_system.v2.md`).
5. **Scenario bank is frozen at ≤ 8 active scenarios** until the first IRT calibration run succeeds. No new scenarios may be generated; per-item response counts must accumulate.
6. **Feature flags**: every v2 behavior ships behind a `PRISM_V2_*` flag defaulting off; v1 behavior stays reproducible.
7. **ONE LAW (agent/ops governance)**: automated systems flip no flags and make no public claims — humans decide. `flip-check` verifies preconditions and blesses/refuses; a person flips.
8. **Never fabricate data.** Synthetic/test sessions carry `is_synthetic=true` (derived from entitlement mode) and are excluded from calibration, dashboards, and evidence.
9. **Claims ceiling** (CI suite): banned words in public copy — "certified/certification", specific kappa values, evasion rates, "fairness-tested", "tamper-proof" etc. — until the study that would justify them is complete.

---

## 3. The Candidate Journey

### 3.1 Entry and commerce

1. **Register / sign in** (email + password; JWT with `tokenVersion` claim so password change/suspension revokes other sessions).
2. **Pay ₹499 via Razorpay** (live keys; HMAC signature verification server-side; entitlement `mode='paid'`), **or redeem a group-invite / coupon code** (e.g. the live `msw` coupon — entitlement `mode='invite'`, counted as a REAL candidate for calibration). `/start` refuses with 402 unless a valid entitlement exists.
3. Legal surfaces: `/privacy`, `/terms`, `/refund-policy`, `/security`, `/contact` (reachable logged-out; Razorpay-verification friendly).

### 3.2 Briefing (`/briefing`)

- **Name entry** — the candidate's first name is now (since 2026-08-04) sent to the server and used by the AI characters to address them naturally.
- **Character picker** — 8 hand-built SVG avatar personas (Priya *The Creator*, Meera *The Communicator*, Sara *The Leader*, Nisha *The Empath*, Arjun *The Analyst*, Ravi *The Bold One*, Dev *The Strategist*, Aadi *The Innovator*), with gender filter and "Surprise me". The chosen character's working style is passed to the avatar prompt (server-side persona map; client free text is never trusted).
- **Consent** — 7 explicit scopes, version-stamped (`CONSENT_VERSION 2026-07-05.1`): AI scoring with human-review right, proctoring, on-device face analysis, phone-camera relay, research/calibration use of interaction patterns (explicitly *never* voice recordings or keystrokes), own-work confirmation. Consent copy is canon — byte-identical strings test-enforced; the accepted version is stamped onto the session and every issued score traces to exact consent wording.
- **Difficulty calibration** — a short written prompt ("describe a difficult decision…"). An AI estimator (with heuristic fallback) maps the answer to a difficulty tier (foundational / intermediate / advanced) and a prior θ₀.
- Optional: install as PWA, or use the desktop shell.

### 3.3 The assessment room (`/assessment`)

- **Scenario Card** overlay before the clock starts: *Your role* · *The situation* · *In the room* (cast with roles) · *How this works* — plus the disclaimer that there is no right answer and no field knowledge is required. The 30 minutes start when the candidate clicks continue.
- **Scenario selection**: near-tier pool (foundational draws from foundational + intermediate; advanced from advanced + intermediate; intermediate from all), unseen-first with bank-wide fallback before any repeat; recently-seen scenarios per signed-in user are excluded (last 20).
- **The conversation**: a main speaker leads every turn; a challenger jumps in ~1 turn in 3–4; an observer speaks rarely. Each AI turn ends with exactly one specific question. Characters use simple Grade 6–7 English, Indian names/₹/context, acknowledge answered points and never re-ask them, and address the candidate by name. Candidates reply by **voice** (recorded, transcribed server-side, 12-second review window to fix the transcript) or **typing**.
- **Voices**: Amazon Polly neural TTS, one fixed voice per cast member, gender-matched (e.g. Kajal/Amy female, Brian/Matthew male; 150 synth calls/session budget; graceful browser-voice fallback).
- **Steering**: the PRISM-Director (v1) or the Executive Engine (Phase 1, flag-gated) picks each turn's questioning style and target dimension based on where evidence is thinnest; optional pressure probes (flag-gated, max 2/session, audited) create contingency shifts or call back the candidate's own earlier words.
- **Integrity (honest, calm, never alarmist)**: webcam REC indicator with clear permission guidance; on-device face analysis (face detection, landmarks, gaze, additional-person detection — *integrity events only, never scoring*); optional phone as second camera (frames relayed in memory only, never stored); fullscreen + keyboard lock; tab-switch/paste/blur telemetry; server-enforced time limit; slow-connection notice on long waits.
- **Interaction telemetry** (consented): response latency, typing cadence, revision counts — used for integrity and calibration research, never as direct score inputs.

### 3.4 Scoring and the report

- **Submission** (`/evaluate`) is deduplicated and async-safe: fast path returns inline within 20 s, otherwise 202 + client polls `/evaluate-status/:sessionId` (survives load-balancer timeouts and server restarts; idempotent).
- **Judge panel**: 5 parallel judge calls with distinct panel-member stances and position-swapped rubric ordering (neutralises ordering bias); median aggregation; minimum 3 judges or the session fails loud; agreement recorded as reliability; judge model pinned by `judge-fingerprint.json` (drift = boot warning + audit event; hard-fail mode available). Candidate text enters prompts only inside `<candidate_transcript>` delimiters with a standing injection guard.
- **Report** (`/score`): overall Prism Score + five dimension scores with confidence bands, evidence quotes from the transcript per dimension, percentiles only when honestly computable (else "pending"), skill map, interviewer guide, multi-page PDF download and email.
- **Credential**: Ed25519-signed evidence bundle (pseudonymous by construction), public verification page `/verify` with selective disclosure via one-time share token, W3C Verifiable Credential rendering (`?format=vc`), revoke/reissue chains, public key endpoint, revocation status endpoint.

### 3.5 Account

Profile with assessment history, resume-pending-session banner, change password (revokes other sessions), and a typed-confirmation **erasure** flow (DPDP): a single request cascades through ~13+ tables (sessions, reports, transcripts, telemetry, credentials, invite redemptions, ratings…) — verified live repeatedly.

---

## 4. The Assessment Engine (server)

### 4.1 Scenario bank

8 ACTIVE scenarios (frozen 2026-07-04, audit C11), one archetype each; 13 retired scenarios retained for historical playback (never served, never deleted):

| Tier | Scenarios |
| --- | --- |
| Foundational | The Group Project · The Fest Budget · The Clinic Backlog |
| Intermediate | The Delayed Launch · The Supplier Crisis · The Brand Crisis |
| Advanced | The Ethical AI Decision · The Team Restructure |

Each scenario: `id, difficulty, domain, title, context` (the measured stimulus — unchanged since freeze), `yourRole` (display-only role line, added 2026-08-04), and 3 `participants` with name/role/personality plus fixed TTS metadata (`gender, voiceId, engine, languageCode`).

### 4.2 Versioned prompts (`server/prompts/`)

`avatar_system.v2` (current; v1 retained) · `avatar_styles.v1` · `opening_turn.v1` · `judge_full.v1` · `judge_turn.v1` · `micro_rater.v1` · `entry_estimator.v1` · `calibration_tier.v1` · `dimension_rubric.v1` · `speech_transcription.v1` · `teamfit_observer.v1` — plus Hindi/Hinglish/Tamil variants (`{name}.{lang}.v{n}.md`) that `@extends` the canonical English base with only a language directive. `renderPrompt` fails loudly on any missing placeholder. A database prompt **registry** (admin Phase 3) layers a draft→testing→approved→production→deprecated workflow with dual approval and drift detection on top of the files; files remain canonical unless `PRISM_ADMIN_PROMPT_REGISTRY=true`.

### 4.3 v2 engine (spec: `docs/PRISM_v2_System_Spec.md`, phases flag-gated)

- **Phase 0** `PRISM_V2_TELEMETRY` (ON): item-response logging, timelines, audit trail.
- **Phase 1** `PRISM_V2_EXECUTIVE`: Entry Estimator (θ₀ prior from calibration answer) + Executive Engine — per-turn micro-rating (0–4 levels/dimension with signals fallback), EvidenceLedger posterior updates, facet-based probe selection, challenger deployment, stop/extend rules.
- **Phase 2** `PRISM_V2_DUAL_SCORER`: dual-channel scoring + conformal confidence intervals (shadow mode until panel-vs-human agreement ≥ human-vs-human).
- **Phase 3** `PRISM_V2_EQUATING`: Python calibration jobs (IRT fit, Rasch facets, conformal refresh, DIF audit with Mantel-Haenszel + logistic uniform/non-uniform, growth curves, channel-B trainer), equating, DIF dashboard — activate after ~300 real sessions.
- Study/A-B machinery: preregistered studies registry (6 studies), deterministic steering A/B arms, blinded human-rater workbench with weighted-kappa qualification (IRR ≥ 0.6), append-only `study_results`, test-retest enrolment, external ratings for transfer validity, adversarial relay-detection job.

### 4.4 Growth & re-assessment

`final_theta` stamped per assessment; weighted-least-squares growth curves (`growth-v1`, identical math in JS + Python); honesty ladder in code — 1 point: no trend language; 2 points: "trend available after your next assessment"; 3+: trend only if |slope| > 1.96·SE, else "within measurement uncertainty"; mixed scale versions without an equating transform → `not_comparable`.

---

## 5. Trust, Privacy & Compliance

- **Consent-first**: nothing is measured that wasn't consented to, and the consented version is stamped on the session.
- **Pseudonymity**: durable candidate IDs are pseudonymous; evidence bundles and exports are PII-free by construction (runtime guards + schema gate tests listing every table/column allowed to hold PII).
- **Erasure**: candidate-initiated (typed confirmation) or admin privacy-request workflow (verify → dry-run plan → dual approval → execute → receipt). Cascade tested in lockstep with the telemetry eraser.
- **Prompt-injection defence** (audit C14): `sanitizeCandidateText` strips control chars/spoofed delimiters/quote-fence breakouts; candidate content always delimiter-wrapped; standing injection guard in every judge/rater prompt; candidate name additionally letter-whitelisted (≤ 40 chars) before it may enter a prompt; character selection validated against a server-side ID map (prototype-pollution-safe).
- **Security posture**: CSP/HSTS/X-Frame-Options; CORS pinned to `prism.studai.one`; Socket.IO proctor relay origin-pinned; rate limiters (auth 5/min credential endpoints); admin plane behind TOTP-mandatory auth (below); secrets only in AWS Secrets Manager; distroless non-root container; ECR scans clean.
- **What Prism never does**: score faces/voices/emotions, train on candidate data without the research consent scope, persist phone-camera frames or raw audio beyond transcription, or expose another candidate's data.

---

## 6. Admin Control Centre (`/admin`, flag `PRISM_ADMIN_CONSOLE=true`)

Complete 6-phase console (migrations 0011–0016), RBAC with **13 roles** and per-endpoint permissions, dual-approval for sensitive actions, immutable `admin_audit_events`:

1. **Auth**: mandatory TOTP (AES-GCM at rest), 15-min access JWT, rotating single-use refresh cookie, per-session CSRF, lockout 10 fails/15 min, must-change bootstrap passwords, break-glass role.
2. **Operations**: sessions (invalidate with reason), reports (dual-approved supersession with version history), disputes (9-state workflow), integrity reviews, identity verification (PII masked unless `read_pii`, every unmask audited), global permission-scoped search.
3. **Science**: item bank (freeze-aware), calibration runs lifecycle (freeze + apply = separate dual approvals), rater roster/IRR, studies registry, prompt registry, psychometrics dashboard (read-only, registry-rendered).
4. **Governance**: credentials (issue/revoke/reissue/bulk-cap-50/audit-export), replay incidents, TeamFit (qualitative, no numbers — response-time enforced), pseudonymous exports (cap 1000, ledgered), privacy requests, audit browser (structurally read-only), feature-flag workflow (request → dual decision → operator env change → mark-applied verifies live env; science flags refuse enablement while flip-check says NO-GO).
5. **Commerce**: group assessment invites — label, 1–100 seats, time window, revoke; optional custom **coupon code** (e.g. `msw`, redeemable on the payment page); roster with per-candidate report links and scores. Invite sessions are REAL (calibration-eligible).
6. **Pilot panel** (`/api/pilot/*`): gates dashboard (300 sessions / 100 double-rated / 30 retest pairs / 4 raters), 7 data sentinels (telemetry drops, low-ASR, impossibly-fast, consent mismatch, synthetic leakage, item over-exposure, rater drift), incident evidence files, weekly report that names the current bottleneck plainly.

Current admins: `info@studai.one` (super_admin), `pauljeevanesan@gmail.com` (super_admin), `director@studai.one` (break_glass).

---

## 7. Architecture & Technology

### 7.1 Stack

- **Client**: React 18 + Vite + Tailwind, framer-motion; design system "instrument" (paper/ink/viridian accent reserved for measurement moments; Fraunces/Noto Sans/IBM Plex Mono; room-dark scope for the assessment room; CI hex-ratchet bans raw colors outside token sources). PWA (manifest + guarded service worker). Nine-act scroll-driven story homepage.
- **Server**: Node 22 ESM, Express. JSON store on EFS (users/sessions/assessments — single-writer) + PostgreSQL 17 (telemetry, admin plane, science tables; migrations 0001–0017). Dual-backend store modules (`storeJson`/`storePg`) with identical contracts.
- **AI (all AWS Bedrock, ap-south-1)**: conversation + judge panel = `mistral.mistral-large-3-675b-instruct` (judge pinned by fingerprint; Claude is sales-gated on this account), micro-rater on the fast model, STT = Voxtral, TTS = Amazon Polly neural. Model routing in `services/ai/modelRouter.js`; per-call cost/usage logging.
- **Desktop shell**: Tauri v2 (Windows NSIS installer at `/download`), normal window v1.1, deep-link `prism://`, single-instance, UA `PrismShell` detection; honest scope — it measures focus loss, it is not a lockdown browser. Azure Trusted Signing account created; identity validation pending (human step).
- **Calibration**: Python (numpy/psycopg) jobs under `calibration/`, all registered in `run_all.py`, every output written to append-only registries; tech manual and evidence one-pager render **from the database** (honest zeros; 7+ PENDINGs today).

### 7.2 Production infrastructure (AWS 158346964832, ap-south-1)

- **Runtime**: EKS `StudAI-Prod-EKS-Cluster`, namespace `prism`, 1 replica, strategy Recreate (single-writer store), distroless image from ECR `prod/prism`. Shared ALB ingress group `studai-prod`; DNS `prism.studai.one` → k8s ALB (cutover complete 2026-07-27).
- **Config**: single secret `/studai/prism/aws-prod/runtime` (35 keys) hydrated into `process.env` at boot via IRSA; no k8s secrets/configmaps.
- **Data**: RDS PostgreSQL 17.8 (`studai-prod-prism-postgresql-rds`, encrypted, private, deletion-protected) + EFS for the JSON store and uploads.
- **IAM**: IRSA role scoped to GetSecretValue, approved Bedrock models, `polly:SynthesizeSpeech`.
- **Email**: SendPulse SMTP (sender `career@studai.one` "StudAI Prism") — live-verified. SES domain identity parked (sandbox).
- **Fallback**: ECS service kept at desired=0. ⚠ The `studai-prism-prod` CloudFormation stack still owns the EFS + RDS ingress rule EKS depends on — do not delete.
- **Deploy runbook**: commit → push (CI: node suite + python suite + fingerprint check) → `gh workflow run build-image.yml` (build-only; **never** `deploy-aws.yml`) → SSM port-forward tunnel to the private EKS endpoint → `kubectl set image deployment/prism prism=<ecr>:<sha12> -n prism` → rollout + live verification. Secret changes: `put-secret-value` → `kubectl rollout restart`. Deploys strictly serial.

### 7.3 Feature flags (catalogue in `lib/flagRegistry.js`, ~20)

ON in production: `PRISM_V2_TELEMETRY`, `PRISM_GLASS_BOX` (credential auto-issue), `PRISM_ADMIN_CONSOLE`, `PRISM_TTS_NEURAL` + `POLLY_TTS_ENABLED` (since 2026-08-04).
OFF (dark) until their evidence gates pass: `PRISM_V2_EXECUTIVE`, `PRISM_V2_DUAL_SCORER`, `PRISM_V2_EQUATING`, `PRISM_PRESSURE`, `PRISM_LANG` (hi/hi-en/ta ready, provisional-marked), `PRISM_VELOCITY`, `PRISM_REPLAY`, `PRISM_TEAMFIT`, `PRISM_STUDY_STEERING_AB`, `PRISM_DRIFT_HARD`, `PRISM_ADMIN_PROMPT_REGISTRY`, `PRISM_CMS_DB`, and others. Science flags can only turn on via the flip-check → dual-approval → operator workflow.

---

## 8. Quality & Testing

- **286 Node tests** (0 fail; DB-gated suites run with `--test-concurrency=1`) + **57 Python tests**; CI on every push.
- Structural test genres that keep the product honest: claims-ceiling scan of public copy; consent-canon byte-equality; PII schema gate; design-token hex ratchet (shrink-only allowlist); flag-dark sweeps (404 until enabled); injection-guard render tests; prompt-variant inheritance tests; idempotency/dedupe tests for evaluate; erasure-cascade lockstep tests; append-only trigger verification; judge fingerprint check.
- Live E2E verification after every deploy (health, gates, real assessment run where warranted, then erased).

---

## 9. Current Production Status (2026-08-04)

- **Live cohort**: MSW student cohort via the `msw` coupon (100 seats; 25 used / 23 redemptions at last check). Payments live at ₹499.
- **Latest release** (`ad4be54`) shipped fixes for all 8 cohort feedback items: wider scenario variety (near-tier pool), avatars use the candidate's name and chosen character style (`avatar_system.v2`), stronger conversation continuity, "Your role"/"How this works" scenario briefing, camera-permission guidance + slow-connection notice, and gender-correct Polly neural voices (verified live for all 4 cast voices).
- **Calibration progress**: real item responses are accumulating; first IRT calibration run unlocks bank expansion, and ~300 sessions unlock Phase 2/3 science gates.

### Open human actions

1. Rotate the Razorpay live key pair and the SendPulse password (both were exposed in a chat session).
2. Legal review sign-off of the published legal/consent copy.
3. Azure decommission decision (rg `studai-prism-rg` stopped; PG auto-restarts weekly).
4. Desktop-shell code signing: complete Azure Trusted Signing identity validation.
5. Rater recruitment (0/4) — the named bottleneck for the human-agreement study.
6. Science flag flips remain gated on studies (flip-check is the instrument; humans decide).

---

## 10. Repository Map (`studai-prism/`)

| Path | Contents |
| --- | --- |
| `src/` | React client — pages (Landing story, Briefing, Assessment, ScoreReport, Verify, Profile, Payment, legal, `/admin/*`), design tokens, characters, voice lib, turn-signal telemetry |
| `server/routes/` | assessment, payment, auth, credentials, replay, admin routers |
| `server/prompts/` | all versioned AI prompt files (+ language variants) |
| `server/lib/` | stores, invites, credentials, RBAC, flags, prompt registry/security, shared constants, director, eligibility, identity, privacy planner |
| `server/engine/` · `server/scoring/` · `server/psychometrics/` | prompt loader, judge fingerprint, growth math docs |
| `server/services/ai/` | model router, Bedrock clients, Polly TTS, Voxtral STT, prompt manager |
| `server/db/` | migrations 0001–0017 |
| `server/test/` | 286-test suite |
| `calibration/` | Python psychometrics jobs + tests |
| `desktop/` | Tauri shell |
| `infra/aws/` | EKS manifests, CloudFormation |
| `docs/` | v2 System Spec, audits, remediation, finops (17 deliverables), design VOICE, studies protocols, evidence-bundle schema, this document |

---

*This document is descriptive, not authoritative: where it disagrees with `server/lib/sharedConstants.js`, the versioned prompts, `docs/PRISM_v2_System_Spec.md`, or the test suite, the code and spec win.*
