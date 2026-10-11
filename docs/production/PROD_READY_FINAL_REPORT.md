# PROD-READY 2026-10 — Final report

Charter [PROD_READY_CHARTER_2026-10.md](./PROD_READY_CHARTER_2026-10.md), Phase 11. Programme record and decision log: [PROD_READY_STATE.md](./PROD_READY_STATE.md) (P1–P110). Written 2026-10-11 on `prod/p11-final-report`, which branches from `prod/p10s-consent-layout` @ `b59306d`.

**Bottom line.** The engineering work in the charter is done in code. Everything is dark, nothing is deployed, and no human action is closed. A college pilot is still blocked by human and operator steps (§5, §6). The first of those is P0 credential-rotation evidence (HA-001/HA-002). The release itself needs the PostgreSQL cutover (HA-023) in the same change window. Final gates on `d6371b1` (clean worktree): every suite green, 0 failures; the full four-project Playwright run passed 902 with 0 failures.

## 1. Phases, branches and commits

All branches are **local, stacked and not pushed**. Pushing, opening PRs and merging is HA-C007. The base is `ui/prism-brand-transformation` @ `4e417a9`, a superset of `main` @ `609f748` (P1).

| Phase | Branch | Commits | Outcome |
| --- | --- | --- | --- |
| 0 Baseline | `prod/p00-baseline` | `d71abf1` | Charter adopted, state file created, baseline gates recorded. Production runs image `2b84e13c07f2` (2026-08-05), and everything after it is undeployed |
| 1 Dependencies | `prod/p01-dependencies` | `70bdc85`, `a500ed1` | Production advisories: root 3→0, server 5→0 (`nodemailer` ^10). CI audit gate, gitleaks, CodeQL and Dependabot added (S5, CI half) |
| 1S Security hotfix | `prod/p01s-security-hotfix` | `26e4581`, `bf6accc` | Audit findings N1–N15 fixed (legacy erasure, payment replay, proctor socket, ecosystem hand-over, lifecycle, TLS). Migration 0055 |
| 2 Erasure cascade | `prod/p02-erasure-cascade` | `78f904a`, `52ae461` | S8 fixed. One erasure service, a registry of about 440 personal-data columns with a ratchet, append-only pseudonymisation and a resumable ledger. Migration 0056 |
| 3 Multi-instance | `prod/p03-multi-instance` | `f4cf8e3`, `9edbd33` | S6 fixed: PG advisory locks, repository transactions, equivalence and rating guards, persisted form id. JSON→PG rehearsal at realistic size, with a quadratic reconciliation fixed. Migration 0057 |
| 4 V3 support routes | `prod/p04-v3-support-routes` | `462db44`, `975d397` | Human review, pre-start accommodation and Level 1 identity routes, all dark. Migration 0058 |
| 5 Job runner | `prod/p05-job-runner` | `53965c9`, `bd59fc0` | PostgreSQL job queue (`SKIP LOCKED`) for invites, reminders, seat release and retention, with an admin dead-letter view, all dark. Migration 0059 |
| 6 Performance | `prod/p06-performance` | `9b98727`, `bf9384c` | SQL paging and a batched user directory. List p95 ≤ 131 ms at 2,000 students. Decision cache (dark). Nested-lock pool starvation fixed. Vitest load flakes root-caused (P69). Migration 0060 |
| 7 Deployment | `prod/p07-deployment` | `41ab7a7`, `d42bb29` | One EKS path (kustomize), a staging overlay, gated `build-image.yml`, operator Jobs, a release template, a smoke battery and GO_LIVE_CHECKLIST |
| 8 Sales readiness | `prod/p08-sales-readiness` | `11e9a7b`, `e38cfdd` | Demo organization, onboarding runbook, pilot report export, under-18 guardian path and campus P3 UX, all dark. Migrations 0061–0062 |
| 9 Employer L&D | `prod/p09-employer-lnd` | `e85782b`, `44267fa` | Employer development-use workspace (dark) with prohibited-use enforcement. The Hire hand-off interface answers 501, and HA-025 was added. Migration 0063 |
| 10 Human-action pack | `prod/p10-human-actions` | `8c8c7eb`, `ea65d3f` | Materials in `human-actions/`. Register rows moved to PREPARED at most, none CLOSED |
| 10S Consent layout | `prod/p10s-consent-layout` | `b59306d` | Root-cause fix for the system-check layout shift behind the intermittent WebKit consent failures (P107) |
| 11 Final report | `prod/p11-final-report` | `cc09a30`, `0dd7bfc`, `dbe2747`, `d6371b1`, this commit | This report and a documentation consistency pass (P108); one Firefox-only test corrected (P109); second root cause of the consent-step flake fixed — route focus no longer scrolls the page (P110); final gates |

Deviations from the charter text, each recorded as a P-row:

- The base branch is not `main` (P1).
- New migrations start at 0055, not 0040 (P2).
- Phase 1S was added, and it narrowed the S9 residual rather than leaving it unchanged (P3).
- The release range is 0021–0063, not 0025–0039 (P77).

## 2. Test counts: baseline to final

| Gate | Baseline (`4e417a9`/`d71abf1`) | Last orchestrator gate before P11 (`44267fa`, p09) | Final (`d6371b1`, orchestrator, clean worktree, 2026-10-11) |
| --- | --- | --- | --- |
| Server, no DB (`npm --prefix server test`; tests / pass / fail / skip) | 968 / 941 / 0 / 27 | 1154 / 1081 / 0 / 73 (p10 agent run: 1160 / 1087 / 0 / 73) | 1160 / 1087 / 0 / 73 |
| Server DB suites (`*.db.test.js`, throwaway PG) | 39 / 36 / 0 / 3 | 160 / 157 / 0 / 3 | 160 / 157 / 0 / 3 |
| DB pipeline (baseline db + p2, cr03, rehearse migrations and rollback) | PASS (27+21+1+1+18) | PASS (5 steps exit 0; rehearsal head 0063) | PASS (5 steps exit 0, 0 failing tests; rehearsal head 0063) |
| Vitest | 521 pass | 580 / 580 (p10s adds 1 test) | 582 / 582 |
| Pytest (calibration) | 64 | 69 | 69 |
| `npm run build` | PASS | PASS | PASS |
| `npm run audit:static` | PASS | PASS | PASS |
| `npm audit --omit=dev` root | 3 (1 critical, 2 low) | 0 | 0 |
| `npm audit --omit=dev` server | 5 (1 critical, 3 high, 1 moderate) | 0 | 0 |
| Playwright `@critical` | 223 passed · 1 flaky · 0 failed | 223 passed · 1 failed (WebKit consent, fixed in p10s) | 222 passed · 2 flaky · 0 failed (18.8 min) |
| Playwright full four-project (`browser-all`, isolated runner) | 867 passed · 8 flaky · 25 skipped · 0 failed (1.1 h) | — | 902 passed · 5 flaky · 33 skipped · 0 failed (56.7 min) |

Full four-project run at Phase 10 tip (`ea65d3f`, orchestrator): 900 passed · 6 flaky · 33 skipped · **1 failed** — Firefox `prod-p08-ux-polish.spec.js:27`: the test read the stacked-table label in a way only Chromium/WebKit report (Gecko serialises `attr()` unresolved); test corrected, not the product (P109). The same commit's `@critical` run had 220 passed · 3 flaky · 1 failed (WebKit consent step, before the P107 fix)

Final-gate notes (`d6371b1`): the two remaining `@critical` retries were Firefox `prism-readiness.spec.js:122` and WebKit `campus-workspace.spec.js:74` (both passed on retry; the WebKit one was already intermittent in the p02 and p06 gates, before any UI change of this programme). The consent-step instability that failed hard in the p08, p09 and p10 gates had two root causes, both fixed in the product (P107 system-check layout shift, P110 route-focus scroll); the full four-project run on the final tip shows no occurrence of it.

### Per-phase gate history (orchestrator, clean worktree)

These are the authoritative numbers. Where an agent's state-file entry differs, the difference is noted below the table.

| Gate @ commit | Server (no DB) | DB suites | Pipeline | Vitest | Pytest | Build / static / audit | `@critical` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| p01 @ `a500ed1` | 974/947/0/27 | 39/36/0/3 | PASS | 520/521 (1 load flake) | 64 | PASS / PASS / 0·0 | covered by p01s |
| p01s @ `bf6accc` | 1005/976/0/29 | 41/38/0/3 | tests pass; cr03 EBUSY (rerun PASS) | 524/526 (2 load timeouts; rerun 16/16) | 64 | PASS / PASS / 0·0 | 223 passed, 0 failed |
| p02 @ `52ae461` | 1027/991/0/36 | 106/103/0/3 | PASS | 526/526 | 64 | PASS / PASS / 0·0 | 220 passed, 4 flaky, 0 failed |
| p03 @ `9edbd33` | 1044/1007/0/37 | 122/119/0/3 | PASS | 524/526 (same 2 load timeouts) | 64 | PASS / PASS / 0·0 | 219 passed, 5 flaky, 0 failed |
| p04 @ `975d397` | 1056/1014/0/42 | 128/125/0/3 | PASS | 537/539 (same 2) | 64 | PASS / PASS / 0·0 | 220 passed, 4 flaky, 0 failed |
| p05 @ `bd59fc0` | 1081/1030/0/51 | 138/135/0/3 | PASS | 541/543 (same 2) | 64 | PASS / PASS / 0·0 | 221 passed, 3 flaky, 0 failed |
| p06 @ `bf9384c` | 1099/1041/0/58 | 145/142/0/3 | PASS | **546/546** (P69 fix) | 64 | PASS / PASS / 0·0 | 220 passed, 4 flaky, 0 failed |
| p07 @ `d42bb29` | 1111/1053/0/58 | 145/142/0/3 | PASS | 546/546 | 64 | PASS / PASS / 0·0 | 222 passed, 2 flaky, 0 failed |
| p08 @ `e38cfdd` | 1133/1066/0/67 | 154/151/0/3 | PASS | 566/566 | 69 | PASS / PASS / 0·0 | 1st run: 220 passed, 3 flaky, **1 failed**. Rerun: 222 passed, 2 flaky, 0 failed |
| p09 @ `44267fa` | 1154/1081/0/73 | 160/157/0/3 | PASS | 580/580 | 69 | PASS / PASS / 0·0 | 223 passed, **1 failed** |
| p10 @ `ea65d3f` | 1160/1087/0/73 | 160/157/0/3 | PASS | 580/580 | 69 | PASS / PASS / 0·0 | 220 passed, 3 flaky, **1 failed** (WebKit consent; before P107). Full four-project: 900 passed, 6 flaky, 33 skipped, **1 failed** (Firefox test, P109) |
| p11 @ `dbe2747` (incl. p10s P107, P109) | 1160/1087/0/73 | 160/157/0/3 | PASS | 581/581 | 69 | PASS / PASS / 0·0 | 221 passed, 3 flaky, 0 failed (1 WebKit consent retry → P110). Full four-project: 900 passed, 7 flaky, 33 skipped, 0 failed |
| **final @ `d6371b1`** (incl. P110) | **1160/1087/0/73** | **160/157/0/3** | **PASS** | **582/582** | **69** | **PASS / PASS / 0·0** | **222 passed, 2 flaky, 0 failed. Full four-project: 902 passed, 5 flaky, 33 skipped, 0 failed** |

Flaky and failed items, and how each was resolved:

- **Intermittent WebKit consent failures (p08, p09).**
  - In p08, `campus-journey-a:172` (Journey D) failed both attempts with "checkbox did not change its state, element not stable / outside the viewport". A rerun of p08 was green.
  - In p09 the same failure hit `cr05-returning-loop:61`.
  - Root cause: the system-check page grew from a one-line placeholder to a 4–5-row list when the asynchronous health check returned. That pushed the consent card down mid-click, the same mechanism as K105 (5). The page was fixed in p10s (`b59306d`, P107), not the test. A new Vitest test fails on the old page. The final `@critical` run is the confirmation.
- **Campus Vitest load timeouts (p01s–p05).**
  - The timeouts were in analytics capabilities and the campusExperience overview insight, and occurred only when three heavy jobs ran at once.
  - Root cause, found in P69: user-event's real per-keystroke `setTimeout`, and recharts/d3 being transformed on demand inside the first chart test. The investigation also exposed a real import-wizard read race.
  - The fix raised no timeout. From p06 on, the orchestrator gates are 546/546 or better.
  - Residual flake classes, outside the named tests, are listed in P69: AppRouter route chunks, `handoverMission`, and occasional first-render timeouts under 3× load.
- **The first full Playwright attempt (p00) was invalid.** Raw `npx playwright test` produced 60 failures because the specs need the isolated runner. That was an orchestrator invocation error. The rerun through `run-experience-baseline-tests.mjs browser-all` is the baseline above.
- **Windows `EBUSY` in `run-cr03-runtime-tests.mjs` (p01s, p09).** All 18 tests passed, then the script exited non-zero while removing its disposable cluster directory. This is a cleanup race on Windows only. Reruns and separate rehearsals passed, and CI on Linux is unaffected.
- **Agent-harness failures, not gate failures (P90/P99).** `CAMPUS-SHELL-04` and `campus-workspace` "resume after refresh" fail in the agents' scratch harness, and they fail identically on a clean `d42bb29`. SHELL-04 fails because `server/.env` points at port 55433. The cause of the workspace failure was not identified. Neither failure appears in the orchestrator `@critical` gates.
- **State-file numbers that differ from the orchestrator's.**
  - Vitest, agent vs orchestrator: p01 521 vs 520/521; p01s 526 vs 524/526; p03 "4 timeouts" vs 2; p04 536/539 vs 537/539; p05 542/543 vs 541/543. Every difference is the load flakes above.
  - p07: the agent did not run the DB suites, and the orchestrator ran 145/142/0/3.
  - p09: the agent did not re-run pytest, and the orchestrator ran 69.
  - Server numbers match in every phase.

## 3. Security findings

Sources: [SECURITY_REVIEW.md](../campus/SECURITY_REVIEW.md) §3 and the addenda for Phases 1, 1S, 2, 3 and 10.

| # | Finding (severity) | Status | Evidence |
| --- | --- | --- | --- |
| S1 | Server production advisories, Sept (High) | **Fixed** (2026-09-26) | SECURITY_REVIEW §1 |
| S2 | `/api/evidence/claims` error path used an undefined `req` (Low) | **Fixed** (C12.02) | §3 |
| S3 | Public Razorpay key id quoted in remediation docs (Info) | **Operator action**: rotation (HA-001). Allow-listed in gitleaks as a public id | P9, `.gitleaks.toml` |
| S4 | CORS omits `x-rater-token`; the rater plane is same-origin only (Info) | **Residual** (by design) | §3 |
| S5 | No DAST or dependency scanning in CI (Medium) | **Fixed, CI half** (audit gate, gitleaks, CodeQL, Dependabot; not yet run on GitHub). **DAST is an operator action** (HA-C012) | Phase 1 addendum |
| S6 | No multi-instance advisory locks (Medium) | **Fixed in code**. `replicas > 1` also needs the multi-replica checklist (P41): Residual | Phase 3 addendum, `multiInstance.db.test.js` |
| S7 | Legacy report JSON readable by anyone with a session id (High) | **Fixed** (K103) | `legacyReportGuard.test.js` |
| S8 | Account erasure did not cascade (High) | **Fixed** (P23–P31). **Operator action**: `PRISM_ERASURE_PSEUDONYM_KEY`; until it is set, erasure fails closed with 503 (P39) | Phase 2 addendum; `erasureCascade*.test.js`, `personalDataRegistry.test.js` |
| S9 | Legacy session routes act on a session id alone (High) | **Residual, narrowed.** Erasure (N1) and five write routes (N6) are now owner-bound. `/start`, `/message`, `/evaluate`, `/calibrate`, `/speech` and the GET status routes remain for undisclosed personal legacy sessions (Medium) | P10, P11 |
| N1 | Unauthenticated legacy erasure by session id (Critical) | **Fixed** | `phase1sSecurity.test.js` N1, `legacyErasure.test.jsx` |
| N2 | Payment replay, cross-account redemption, grants on authorisation (High) | **Fixed** (0055 ledger). **Operator action**: keep Razorpay auto-capture on; review existing duplicates (P12 query) | P12, `paymentRedemption.db.test.js` |
| N3 | HMAC under an empty key; production could boot with no Razorpay secrets (High) | **Fixed** | P13 |
| N4 | Proctor socket: unvalidated pair code, any origin (High) | **Fixed**. Residual (P3): a leaked QR code is usable for 3 h | P14 |
| N5 | Unauthenticated ecosystem hand-over with a placeholder identity (High) | **Fixed**. **Operator action**: `ECOSYSTEM_SECRET` / `HIRE_BASE_URL` (503 without them) | P15 |
| N6 | Legacy write routes on a session id alone (Medium) | **Fixed** for `/consent`, `/verify-identity`, `/accommodation`, `/dispute`, `/artifacts`. The rest stays under S9 | P11 |
| N7 | Public report view exposed user id and email (Medium) | **Fixed before this programme** (`6c218ec`). Test added | P18 |
| N8 | `/transcribe` without a session, any file type (Medium) | **Fixed** | P18 |
| N9 | Revoked or suspended tokens still worked (Medium) | **Fixed** | P17 |
| N10 | Async rejections hang requests or crash the process (Medium) | **Fixed** | P16 |
| N11 | No graceful shutdown (Medium) | **Fixed** | P16 |
| N12 | No readiness endpoint (Low) | **Fixed**: `/api/ready` and the manifest probes (P72). Live with the release | P19, P72 |
| N13 | PostgreSQL TLS not verified (Medium) | **Fixed in code. Operator action**: RDS CA bundle, then `PGSSLMODE=verify-full` | P20 |
| N14 | `network-info` disclosure; `/data/` not git-ignored (Low) | **Fixed** | P21 |
| N15 | Login timing enumeration (Low) | **Fixed**. Residual: minimum password length is still 6 | P21 |
| L1 | `infra/aws/prism-eks.yml` pinned an image older than production, so re-applying it rolled production back | **Fixed**: placeholder tag, test, CI render, optional admission policy | P71 |
| L2 | `deploy-aws.yml` held a script-injectable input next to `id-token: write` | **Fixed**: removed | P70 |
| L3 | `build-image.yml` could publish from any ref | **Mitigated in code** (main only, green CI, environment). **Operator action**: the binding controls (HA-024) | P76 |
| L4 | Erasure failed whenever a rated item or review request existed; some session-keyed admin records were outside every cascade | **Fixed** | P30 |
| L5 | V3 starts starved the lock pool through nested locks (5 concurrent starts all failed) | **Fixed** | P66 |
| L6 | An EMPLOYER organization could reach campus admin views (latent prohibited use) | **Fixed** (separation guard, ships on) | P95 |

The SECURITY_REVIEW Phase 10 addendum lists the surfaces from Phases 4–9 that the independent review must cover. No DAST or penetration test has been performed (HA-C012).

## 4. Dependency audit (`npm audit --omit=dev`)

| Scope | Before (2026-10-10) | After | How |
| --- | --- | --- | --- |
| root | 3: `shell-quote` critical (via `concurrently`); `dompurify` ×2 low (via `jspdf`) | **0** | `shell-quote` 1.12.0 and `concurrently` moved to devDependencies (P7). `dompurify` 3.4.16, with the stale override removed (P6) |
| server | 5: `proxy-addr` critical; `nodemailer`, `engine.io`, `axios` (via `razorpay`) high; `ip-address` moderate | **0** | `npm audit fix`, plus `nodemailer` ^9→^10.1.0 (major, P5; new `mailerDelivery.test.js`) |
| CI | none | `--audit-level=high` gate for root and server | `ci.yml` `dependency-audit` |

Still remaining:

- 13 advisories in dev-only toolchains under full `npm audit` (vite 5, vitest 2, tailwind 3 and their transitive dependencies: 2 critical, 6 high, 5 moderate). None of this code ships, and the fixes are major upgrades left to Dependabot (P8).
- The root `overrides` entry for `node-fetch` 2.7.0 stays, because there is no upstream fix (P6).

## 5. College pilot: what is ready, and what still blocks it

### Ready in code (dark, tested, not live anywhere)

- **Security.** Production advisories are at 0/0 with CI enforcement. N1–N15 are fixed. Erasure cascades everywhere and is ledgered and resumable. Payments are single-use and owner-bound.
- **Integrity.** Multi-instance locking (S6), the transactional multi-writes, the DB guards, and the persisted form id.
- **V3 support routes.** Review, accommodation and identity (the ROLLOUT step 4 support-path criterion is met in code, P51).
- **Job runner.** Invites, reminders, seat release and retention.
- **Performance.** Campus lists meet the target at 2,000 students: p95 ≤ 131 ms on the workstation.
- **Deployment.** One EKS path with a staging overlay. The release is prepared: 0021–0063, the secrets table, the smoke battery and a record template. There is one go-live checklist.
- **Sales readiness.** Demo organization, onboarding runbook and pilot report export.
- **Dark paths.** The under-18 path and the employer L&D workspace exist dark, with prohibited-use tests.
- **Human-action pack.** Ready for every human item listed in the charter.

### Blocks a college pilot

Each item comes from GO_LIVE_CHECKLIST, the registers or the state Risks. Nothing here is new.

| Blocker | Why | Ref |
| --- | --- | --- |
| No credential-rotation evidence (P0) | Razorpay and SendPulse were exposed on 2026-08-04 and the incident is OPEN. This blocks any step that sets payment or SMTP secrets | HA-001, HA-002, HA-018; GO_LIVE A1–A3 |
| Branches unpushed; `main` CI red | Nothing can be built for release until it is merged on green CI | HA-C007; GO_LIVE B1 |
| OIDC trust policy before the new `build-image.yml` | `environment: production` changes the OIDC `sub`. If the policy is not switched first, every build fails at AssumeRole. **B2 before B1** | HA-024; P76 |
| No staging environment | Staging needs its own secret, IRSA role, database, DNS and ALB. The hardened pod and the operator Jobs have never run on a cluster | GO_LIVE B5, B8–B9; P72, P73, P75 |
| PostgreSQL cutover in the same window as the release | The image refuses to start in production without `PRISM_PG_STORE=true` (since `63d320d`). Production head is `0020_commercial`, so 0021–0063 (43 migrations) apply. Rehearsed only on synthetic data. Rollback with the old image on the 0063 schema is unrehearsed | HA-023; GO_LIVE C; P38, P77 |
| Release secrets | `PRISM_ERASURE_PSEUDONYM_KEY` (erasure answers 503 without it), `PUBLIC_APP_URL`, rotated SMTP, `ECOSYSTEM_SECRET` / `HIRE_BASE_URL` | GO_LIVE C1; RELEASE_TEMPLATE §3 |
| RDS CA bundle | TLS to the database stays unverified (`pg_tls_unverified`) until the bundle is in place and `verify-full` is set. Required "before a paid pilot" | B7; P20 |
| Base images not pinned by digest | Supply-chain hygiene | B3; P74 |
| Independent security review / DAST; manual a11y audit | Never performed | HA-C012, HA-C013 |
| No route creates an organization or its first owner | Also no student-removal route, no invite revocation and no suspend/archive. The onboarding runbook documents a manual database path | P89 (Risk P1, "first college pilot") |
| Uncommitted CSV previews never purged | Personal data with no retention | P89 (Risk P2, "before a paid pilot") |
| V3 review vocabulary lacks "free reassessment" and "second review" (charter §11) | Staff have only a manual path | P43 (Risk P2, before step 4 with real learners) |
| Counsel review of all consent, disclosure, support, employer and guardian copy (all DRAFT) | Two campus disclosure wordings share one version id. The Terms of Service mention guardian consent although the product is 18+ only | HA-C005, HA-005, HA-004, HA-003; P106 |
| Level labels and sufficiency thresholds | SUFFICIENT cannot be reached today (UNCALIBRATED and PROVISIONAL rules), so reports show PROVISIONAL or INSUFFICIENT | HA-C002 (gates F1, F3); K35 |
| Aggregate-reporting privacy review | Gates campus analytics and the pilot report export | HA-C010 |
| Scenario content approval; `PRISM_RELEASE_STAGE` unset | The default `LOCAL_CI` accepts DRAFT content | HA-C003; GO_LIVE F0; P73 |
| Pricing and contract prices | No price is approved, and none was proposed | HA-015, HA-C006 |
| Signed design partners / pilot terms | Terms depend on HA-004 | HA-016, HA-004 |
| Psychometrician; raters | Needed for pilot-report review (HA-008) and the rating queue (HA-009, HA-010, HA-C008) | GO_LIVE G4, F11 |
| Razorpay auto-capture; review of duplicate payment redemptions | Required before any offer becomes purchasable | P12; GO_LIVE D4 |
| Flag flips F0–F5 (+F4b, F5b), one per window, by humans | Every pilot feature is dark | HA-C001, HA-020 |
| Capacity: one replica, 5 concurrent locked V3 turns per replica | Cohort-scale V3 use needs `PG_SESSION_LOCK_POOL_MAX` sized, or the multi-replica checklist completed | P41, P66; GO_LIVE D3 |

## 6. Open human actions, in order

The order follows GO_LIVE_CHECKLIST with its Phase 10 addendum, so B2 comes before B1. **None was closed by this programme.** The best status any item reached is PREPARED.

| # | Step | Owner | Status |
| --- | --- | --- | --- |
| A1 | HA-001 Razorpay key rotation + activity review | Founder/Ops | PREPARED (materials ready); no evidence |
| A2 | HA-002 SendPulse SMTP rotation + log review | Founder/Ops | PREPARED (materials ready); no evidence |
| A3 | HA-018 Provider-side incident conclusions | Founder/Ops | OPEN |
| B2 | HA-024 OIDC `sub` → `environment:production`, environment protection, branch protection | Repo admin + IAM | PREPARED (push done; protection rule pending) |
| B1 | HA-C007 Push branches, PRs, merge to `main` on green CI | Operator | OPEN |
| B3–B9 | Digests, release candidate build, staging creation, admission policy, RDS CA, staging deploy, staging rehearsals | Operator / Engineering | Not started (no register id) |
| B10 | HA-C012 Production security review / DAST | Security lead | PREPARED (materials ready) |
| B11 | HA-C013 Manual accessibility audit | Accessibility lead | PREPARED (materials ready) |
| C1–C9 | HA-023 Release window + PostgreSQL cutover (incl. the human flip of `PRISM_PG_STORE`) | Operator | PREPARED (materials ready) |
| D1 | HA-019 Admin first login + TOTP; retire the legacy token | Operator | OPEN |
| D2 | HA-022 Secret split + IRSA scoping | Operator | PREPARED (materials ready) |
| D3–D4 | Pool sizing; payment duplicate review + auto-capture | Eng + Operator / Finance | Not started |
| D5 | HA-021 `PRISM_STANDARDIZED_CORE` flip | Founder/Ops | PREPARED (deployed dark) |
| E1 | HA-C002 Level labels and sufficiency thresholds | Psychometrics lead | OPEN (memo linked; stays OPEN by test, P102) |
| E2 | HA-C005 + HA-005 Counsel review of copy, DPDP | Counsel/DPO | PREPARED (materials ready) |
| E3 | HA-003 Retention periods | Counsel | OPEN |
| E4 | HA-004 Employment-law review of buyer use / prohibited uses | Counsel | PREPARED (materials ready) |
| E5 | HA-C010 Aggregate-reporting privacy review | Counsel + DPO | OPEN |
| E6 | HA-C009 Mission content and evaluator review | Content governance | OPEN |
| E7 | HA-C004 Form equivalence | Psychometrics lead | OPEN |
| E8 | HA-C003 Scenario content approval | Content governance | OPEN |
| E9 | HA-015 + HA-C006 Pricing and contract prices | Founder + finance | PREPARED (materials ready) |
| E10 | HA-006 Under-18 decision; HA-007 identity Level 3 | Founder + counsel | HA-006 PREPARED; HA-007 OPEN |
| E11 | HA-C011 SSO / SIS integrations | Operator + counsel | OPEN |
| F0–F12 (+F4b, F5b, F6b–F6d) | Flag flips in ROLLOUT order | Per flag | HA-C001 OPEN; HA-020 OPEN |
| G2 | HA-016 Design partners | Founder | PREPARED (programme drafted) |
| G4 | HA-008 psychometrician; HA-009 raters; HA-010 rater qualification; HA-011 SME workshops; HA-012 ethics; HA-013 studies; HA-014 science-flag decisions; HA-017 outcome-data agreements | Founder / science lead | HA-008, HA-009 PREPARED; the rest OPEN |
| F6d-conn | HA-025 Prism → Hire evidence-sharing decision | Founder + science lead | PREPARED (materials ready) |
| F11 | HA-C008 Validation programme / rating-queue preconditions | Psychometrics lead | OPEN |

## 7. Risks carried forward

The full table is in PROD_READY_STATE "Risks". The material rows are grouped here by severity.

- **P0**
  - No rotation evidence for HA-001/HA-002 more than two months after the exposure. The incident is OPEN.
- **P1**
  - Build Image cannot assume the deploy role, and the trust-policy `sub` change must come before the merge (HA-024).
  - `main` has no branch protection. This is mitigated in code; the binding controls are operator settings.
  - The release can boot only after the PG cutover (HA-023).
  - Rollback across this release is unrehearsed. It needs `rollout undo`, the ALB annotation and the previous secret version.
  - No organization-creation or lifecycle routes exist (P89).
- **P2**
  - `main` CI is red.
  - The S9 residual (non-destructive legacy routes).
  - PG TLS is unverified until the CA bundle is in place.
  - Razorpay auto-capture dependency.
  - Erasure key unset (erasure answers 503).
  - `replicas > 1` needs `REDIS_URL` or sticky routing, socket stickiness and the cutover.
  - Lock-pool capacity: 5 concurrent turns per replica.
  - V3 review vocabulary gap.
  - Support, employer and guardian copy is DRAFT.
  - SMTP and `PUBLIC_APP_URL` are needed before the worker flag (otherwise mail silently becomes `NOT_SENT`).
  - The hardened pod and Jobs have never run on a cluster.
  - 0021–0063 have never run on production-shaped data.
  - `PRISM_RELEASE_STAGE` is unset.
  - No staging environment.
  - CSV previews are never purged.
  - The under-18 path has no registration control and verifies the guardian by link possession only.
  - Employer staff see per-person participation, unsuppressed.
  - The Terms of Service say "guardian" while the product is 18+ only.
  - The campus disclosure has two wordings under one version id.
- **P3** (abridged)
  - Dev-only toolchain advisories.
  - CI jobs never run on GitHub.
  - Minimum password length is 6.
  - QR pairing code is usable for 3 h.
  - The 7-day review target is not monitored.
  - Accommodation modes are limited in V3.
  - Jobs are delivered at least once.
  - `PRISM_JOB_WORKER` must be set on every replica.
  - The reminder toggle is not in the UI.
  - Base images use mutable tags.
  - No preStop hook.
  - The plan list and ended missions hide CLOSED attempts.
  - The pilot report and accommodation planes are API-only.
  - Demo data is visible on shared non-production dashboards.
  - `docs/finops` holds stale pricing documents.
  - Pre-Phase-3 sessions need `sessions:pin-forms`.
- **Test-environment notes**
  - Residual Vitest flake classes under 3× load (P69).
  - Windows `EBUSY` in the cr03 script.
  - The two agent-harness Playwright failures (P90/P99; the cause of the workspace one is unknown).
  - The employer journey is not covered end-to-end with a real published V3 report.

## 8. Flags and migrations added

Flags registered **OFF** in `server/lib/flagRegistry.js`. Each is classified dark in `scripts/post-deploy-smoke.mjs`.

| Flag | Phase | Gates |
| --- | --- | --- |
| `PRISM_V3_SUPPORT_ROUTES` | 4 | Human review, accommodation, identity routes; staff accommodation plane |
| `PRISM_JOB_WORKER` | 5 | Worker, scheduler, queued CSV invites, `/api/admin/job-queue` |
| `PRISM_ANALYTICS_DECISION_CACHE` | 6 | Materialised per-session decisions (PG store only) |
| `PRISM_PILOT_REPORT_EXPORT` | 8 | `POST /api/admin/organizations/:orgId/pilot-report` |
| `PRISM_DEMO_MODE` | 8 | Demo seed in production, and only into a separate demo database; never in the production environment |
| `PRISM_EMPLOYER_LND` | 9 | `/api/v1/employer/*`, Hire hand-off interface (501) |
| `PRISM_UNDER18_PATH` (existing, still OFF) | 8 | Gained the guardian-consent path. Description updated |

Migrations (each with a `.down.sql`; 0001–0054 untouched):

| Migration | Phase | Purpose |
| --- | --- | --- |
| `0055_payment_redemptions` | 1S | Single-use payment redemption ledger |
| `0056_erasure_cascade` | 2 | Erasure guard on append-only tables; erasure run/step ledger |
| `0057_integrity_guards` | 3 | Equivalence decision guard, growth-snapshot guard, two-ratings trigger, `v1_sessions.assessment_form_id` |
| `0058_v3_support_routes` | 4 | `request_kind` + one-HUMAN_REVIEW index; `assessment_accommodation_requests` |
| `0059_job_queue` | 5 | `jobs` table |
| `0060_session_decision_cache` | 6 | `session_decision_cache`, `session_decision_inputs`, invalidation triggers |
| `0061_demo_organizations` | 8 | `organizations.is_demo`, `demo_accounts`, isolation triggers, `demo_session_ids` view |
| `0062_guardian_consents` | 8 | `guardian_consents` |
| `0063_employer_lnd` | 9 | Employer consent types, employer-visibility trigger, organization type immutable to/from EMPLOYER |

## 9. Statement (charter law 1 and law 2)

During this programme:

- **No feature flag was flipped in any real environment.**
- **Nothing was deployed.** No workflow was run, and no cluster, AWS or production URL received a mutating request. The smoke battery was only dry-run against the production URL, which sends nothing, and was executed against the in-process test app.
- **No production secret, database or EFS was read or touched.**
- **The PostgreSQL cutover (HA-023) was not executed.** It was rehearsed only on throwaway databases with synthetic data.
- **No human action was closed.** Register rows moved to `PREPARED (materials ready)` at most, and HA-C002 stays OPEN.
- **Nothing was pushed.** Every `prod/*` branch is local, and no merge to `main` was made (HA-C007).
- **No result, approval, rater, customer, price or incident conclusion was invented.** Unknown inputs are recorded as UNKNOWN or PENDING.
