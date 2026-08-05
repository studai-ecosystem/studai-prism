# PRISM Master Remediation — Final Completion Report (charter §29)

Date: 2026-08-05 · Programme: MASTER-2026-08-04 · Author: remediation agent
(operator granted autonomous execution for the release session; every claim
below traces to a commit, test tally, CI run id, or live-verification output
recorded in the release ledger).

## A. Executive verdict

**Partially complete — autonomous scope COMPLETE and DEPLOYED; human-gated
scope PREPARED and truthfully open.**

- All six phases of the autonomous remediation scope are implemented, tested
  and committed (commits d2efbd9 → 2b84e13, pushed to origin/main).
- Production runs the remediated build: image `2b84e13c07f2` on EKS
  `StudAI-Prod-EKS-Cluster` / ns `prism`, deployed 2026-08-05 with verified
  backups and a green §21 post-deploy battery.
- NOT complete: P0 credential rotation (HA-001/002 — provider consoles),
  standardized-core activation (HA-021 — ONE LAW, not flipped without
  explicit operator authorization), PG cutover (HA-023), secret-split
  execution (HA-022), all legal/science/commercial approvals (register).
- **No blanket claim is made**: per-area readiness is rated at the end.

## B. Completed autonomous work (by phase)

| Phase | Charter §§ | Commit | Key changes | Tests | Live verification |
| --- | --- | --- | --- | --- | --- |
| 1 — P0 security | §4, §5 | e6635c6 | identityIsolation.js ({{candidate}} token, post-generation substitution, judge/rater/director scrubbing), avatar_system.v3 (+3 variants), incident record + rotation runbook + secret-split design | identityIsolation (9) | Live transcript for the P6 test session contains NO raw candidate name (in-pod session_transcripts check) |
| 2 — Trust & reporting | §2,3,6,7,8,17 | 6141c66 | reportPolicy.js (profile-first, composite internal), anchor bank v1 + engine, bundle schema v2, mailer rewrite, claims-ceiling extension, JOB_FAMILY_SCOPE | trustReporting (20), anchorProbes (10) | Live report: no overall/composite/percentile keys; AIDF = Insufficient evidence; verify view composite-free |
| 3 — Governance | §9–16, §18 | b1d48ff + d3b1372 | age gate, identity assurance, buyer boundary (buildVerifyView), appeals plane, proctoring minimization, accommodations, fairness framework (dark), retention machinery (dark scheduler), read audits | governance (18), governance2 (11) | Age gate 400/402/403 paths live; assurance L1 stamped; tri-status on verify; dispute open+idempotent; erasure cascade proven |
| 4 — Platform | §20, §21, §4.2 | 793aeac | JSON→PG migration tooling + reconciliation, runbooks (PG cutover, deployment), release ledger, deploy-aws guard, CI Postgres service, multi-secret loader | platform (9), storeMigration.db, runtimeSecrets (+5) | §20 rehearsal PASSED on real Postgres in CI run 30980599973 |
| 5 — Commercial | §22, §23, §25, §18 | 5d552ad | ai_usage_events + margin plane (UNKNOWN-never-zero), invite cohort packaging (price-free schema), 19 governed docs + index, separation policy | commercial (16) | Live: 8 usage rows for the test session, 0 unpriced; erased with the session (cascade count ai_usage_events=8) |
| 6 — Release | §26, §27, §21 | 04950e2 + 2b84e13 | dependency fixes (server prod deps → 0 vulns), 0017 down migration, this report | full battery | See §H |

Database changes: migrations 0018–0020 applied to prod RDS during this
release (verified in the migration-gate output). All additive.

## C. Human-gated work (truthful register state)

See [HUMAN_ACTION_REGISTER.md](./HUMAN_ACTION_REGISTER.md) — 24 items. Highest priority:

| ID | Action | Role | Why not automatable | Prepared artifact |
| --- | --- | --- | --- | --- |
| HA-001/002 | Rotate Razorpay live keys + SendPulse SMTP password; review provider activity | Founder/Ops | Provider console access + account authority | Rotation runbook + incident record (OPEN since 2026-08-04) |
| HA-021 | Flip PRISM_STANDARDIZED_CORE=true | Founder/Ops | ONE LAW: agent flips no flags; explicit authorization was not given in-session | Anchor bank + engine + tests live in prod, dark |
| HA-022 | Execute secret split (8 category secrets + IRSA scoping) | Operator | Live secret values must never pass through the agent | Loader deployed + design doc SOPs |
| HA-023 | PG cutover (backup → enforce-migrate → flag flip → verify) | Operator | Irreversible-risk step + flag flip | Tooling deployed, CI-rehearsed, runbook |
| HA-024 | GitHub environment protection for build-image.yml | Repo admin | Repo settings authority | Runbook §1 (push portion COMPLETED this session — CI green) |
| HA-003/004/005/006/007 | Legal reviews (retention, terms, DPDP, under-18, ID) | Counsel | Legal judgement | All policy drafts written and labelled |
| HA-008–014 | Science programme (psychometrician, raters, studies, flag gates) | Science lead | Real humans + real data | Rater manual, power framework, protocols, workbench |
| HA-015/016/017 | Pricing approval, design partners, outcome agreements | Founder | Commercial authority | Pricing package, programme docs, margin dashboard |

## D. Security status

- **Credential rotation: NOT DONE** (HA-001/002 OPEN). The exposed Razorpay
  live keyId still serves production payments — this remains the top risk.
- Provider-log review: NOT DONE (HA-018).
- Secret scan: gitleaks over all remediation commits (ad4be54..HEAD):
  **no leaks** (7-commit scan, then re-run implicitly via CI on push).
- Dependency scan: server production deps **0 vulnerabilities** after fixes;
  client residuals recorded (face-api→node-fetch chain, react-router 6 —
  breaking-only fixes; accepted with rationale in PROGRAM_STATE §5).
- Container scan: ECR scan gate passed at build (refuses criticals).
- Identity isolation deployed: no candidate identity in model payloads
  (code-tested + live transcript evidence).
- Remaining P0/P1: HA-001/002 (P0); client dependency residuals (P2);
  no GitHub environment approval yet (HA-024, P2).

## E. Scientific honesty status

- Claims permitted: none new. Public statistics render only from the
  registry (all PENDING); flip-check: all 9 science flags **NO-GO**.
- Claims removed (now live in prod): "certified" family, composite score +
  percentile, reliability labels, "300 sessions" — claims-ceiling CI suite
  enforces permanently, including server-side email copy.
- Studies pending: S2 agreement, S3 retest, DIF, adversarial (HA-009/010/013).
- Flags off: every science/high-risk flag verified dark post-deploy
  (velocity/replay/teamfit 404; proctoring gaze/phone-cam off; demographics,
  retention scheduler, standardized core, L3 identity — all dark).
- AIDF reports "Insufficient evidence" in production until the core flips
  (verified live on the P6 test report).

## F. Data and architecture

- PostgreSQL migration: **PREPARED, not cut over** (HA-023). Tooling +
  reconciliation deployed; CI rehearsal green on real Postgres; runbook
  complete. JSON/EFS store remains the system of record (single-writer,
  replicas 1, Recreate — test-pinned).
- Backups (this release): RDS manual snapshot `prism-remediation-p6-20260805`
  (available); EFS AWS-Backup recovery point COMPLETED 2026-08-04; JSON store
  hash-verified readable copy taken pre-deploy (local operator machine,
  `%USERPROFILE%\prism-backups\p6-20260805`).
- Reconciliation: rehearsal evidence in CI run 30980599973 (zero mismatches,
  counts + canonical SHA-256 hashes); production reconciliation happens at
  HA-023 execution.
- Replica count: 1 (correct until PG is authoritative).
- Deployment architecture: EKS single deployment + EFS + RDS; serial
  releases; immutable tags; release ledger live.
- Rollback readiness: previous image `ad4be54df1ad` retained; one-command
  rollback recorded in the release ledger; migrations additive-only.

## G. Commercial readiness

- Pilot package: built (cohort plans, seat/completion/review accounting,
  price-free schema); pricing PROVISIONAL and unpublished (HA-015).
- Margin dashboard: live at /admin/margin (finance + auditor roles).
- Known unit economics: measured AI cost per assessment now accumulates
  (first live session: 8 priced calls, 0 unpriced). No cost/margin CLAIMS —
  volume is near-zero and most categories are not yet instrumented.
- Unknown variables (rendered as UNKNOWN, never zero): TTS, infrastructure,
  gateway fees, email/PDF, human review, support, refunds, institution
  revenue, INR/USD conversion (no FX configured).
- Human sales actions: HA-015/016/017 (no partners, no revenue evidence).

## H. Deployment

- Branch: main (direct push per repository policy) · pushed ad4be54..2b84e13.
- Commit: 2b84e13c07f2cb02d76adf96e6aafe83a5ccf120.
- Image: `prod/prism:2b84e13c07f2` (immutable tag; ECR scan clean).
- Cluster/ns: StudAI-Prod-EKS-Cluster / prism · deployed 2026-08-05 ~06:15Z.
- Health: rollout successful; boot log clean (35 secret keys, backend json,
  items 96); live bundle `index-DCrdqvtl.js` byte-matches the commit's build;
  0 error log lines after verification traffic.
- Live verification (full log: agent session evidence + this table):
  age-gate 400 → register 201 → wrong-password 401 → no-entitlement 402 →
  invite redeem 200 (idempotent) → consent 200 → start 200 (Group Project) →
  2 AI exchanges → evaluate 200 → **profile-first report** (no
  overall/composite/percentile; AIDF Insufficient evidence; assurance L1) →
  evaluate idempotent (same issuedAt + scores) → credential verify: default
  view structurally free of evidence/judgeVotes/composite/integrityEvents,
  tri-status + assurance present; share token unlocks ONLY evidence+votes;
  bogus token stays locked → dispute open + idempotent → erasure 200 wiping
  17 planes incl. ai_usage_events(8) → report/verify 404 after. Retention
  defaults seeded (8 provisional rules; scheduler dark). Test invite revoked,
  test account deleted.
- Rollback: `kubectl set image deployment/prism
  prism=158346964832.dkr.ecr.ap-south-1.amazonaws.com/prod/prism:ad4be54df1ad -n prism`
  — trigger on: composite leakage, identity leakage, error storm, or
  candidate-flow regression.

## I. Remaining risks

| Risk | Severity | Owner | Mitigation | Blocking |
| --- | --- | --- | --- | --- |
| Exposed Razorpay/SendPulse credentials unrotated | **P0** | Founder/Ops (HA-001/002) | Runbook prepared; incident OPEN | Incident closure |
| Standardized core dark → sessions not charter-comparable; AIDF unreportable | P1 | Operator (HA-021) | Flip + verify anchor audit rows (machinery live) | §8 compliance |
| JSON single-writer store remains system of record | P2 | Operator (HA-023) | Cutover runbook + rehearsed tooling | Scale + durability |
| Monolithic runtime secret (35 keys) | P2 | Operator (HA-022) | Split design + deployed loader | Least privilege |
| No GitHub environment approval on releases | P2 | Repo admin (HA-024) | Configure required reviewers | §21 approval gate |
| Client dep residuals (face-api/node-fetch, react-router 6) | P2 | Agent (next maintenance window) | Breaking upgrades scheduled deliberately | — |
| No accessibility test suite | P2 | Agent + design | Add axe-based checks | §26 completeness |
| Legal/science approvals absent — features correctly dark | P1 | Counsel/Science | Registers + drafts ready | Feature activation |
| Institution revenue + 7 cost categories not instrumented | P2 | Agent (post-pilot) | Dashboard shows UNKNOWN honestly | Margin claims |

## §30 Definition of done — item by item

| Item | Status |
| --- | --- |
| All feasible autonomous requirements implemented | **YES** (Phases 1–6) |
| P0 security resolved or explicitly blocked with exact human steps | **BLOCKED-DOCUMENTED** (HA-001/002 with runbook) |
| No candidate identity reaches models | **YES** (deployed; live transcript evidence) |
| New external reports expose no composite | **YES** (live-verified) |
| New reports profile-first | **YES** (live-verified) |
| AIDF requires direct evidence | **YES** (live: Insufficient evidence while core dark) |
| Thin evidence → "Insufficient evidence" | **YES** |
| Standardized anchor probes enforced | **BUILT + DEPLOYED, DARK** (HA-021 human flip) |
| Buyer-data access restricted | **YES** (live structural checks) |
| Appeal and supersession rules work | **YES** (live: open/idempotent; decide plane code-tested) |
| Age gating works | **YES** (live 400/403 paths) |
| Alternate administration works | **YES (code + CI)**; live flow needs an admin approval cycle (operator console) |
| Accommodation details private | **YES** (leak-tested) |
| Proctoring defaults minimized | **YES** (live: phoneCam/gaze off) |
| Fairness data protected and gated | **YES** (no write path; flag dark) |
| Retention enforcement operational | **CONFIGURED, SCHEDULER DARK by design** (HA-003/020) |
| Core data migrated or documented verified blocker | **DOCUMENTED + REHEARSED** (HA-023) |
| Margin instrumentation exists | **YES** (live rows) |
| All applicable tests pass | **YES** (389 node/0 fail + 57 py + DB suites in CI) |
| Production live-verified | **YES** (§H) |
| Documentation reflects actual behaviour | **YES** (index + per-doc status labels) |
| Human-gated work truthfully recorded | **YES** (24-item register) |
| No unsupported claim introduced | **YES** (ceiling CI + this report's wording) |

## Final per-area readiness (no blanket statement)

- **Deployment readiness: READY** — remediated build live, verified, serial
  process + rollback + ledger in place. (Environment approval pending HA-024.)
- **Security readiness: NOT READY** — P0 credential rotation outstanding;
  everything agent-side is done and the runbook is waiting.
- **Scientific readiness: NOT READY (honestly labelled)** — no validity
  evidence yet; all claims capped; machinery for the studies is live.
- **Legal readiness: NOT READY** — all governing drafts exist and are
  labelled; counsel reviews pending (HA-003/004/005).
- **Commercial readiness: PARTIALLY READY** — packaging + margin
  instrumentation live; pricing unpublished; no signed partners.
