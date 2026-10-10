# Prism Production-Readiness — Programme State

Living document and the ONLY live checklist for
[PROD_READY_CHARTER_2026-10.md](./PROD_READY_CHARTER_2026-10.md)
(the charter itself is frozen — record interpretations and deviations here, never there).

Formats follow [CAMPUS_PROGRAM_STATE.md](../campus/CAMPUS_PROGRAM_STATE.md):

- Phase heading: `## Phase <N> — <title>` followed by `Status:`, `Gates:`, `Branch:` / `Commit:` lines.
- Items: `- [ ] P<N>.<nn> ...` (open), `- [x] P<N>.<nn> ... — evidence: ...` (done),
  `- [H] P<N>.<nn> ... — HA-xxx` (human-gated; cites a register id in
  [HUMAN_ACTION_REGISTER.md](../remediation/HUMAN_ACTION_REGISTER.md) or
  [CAMPUS_HUMAN_ACTIONS.md](../campus/CAMPUS_HUMAN_ACTIONS.md)).
- Status values: `NOT_STARTED` | `IN_PROGRESS` | `COMPLETE`.

<!-- PROD-STATE:BEGIN
active_phase: 0
branch: prod/p00-baseline
last_updated: 2026-10-10
PROD-STATE:END -->

## Baseline

| Field | Value |
| --- | --- |
| Charter baseline | `main` @ `609f748` |
| Actual starting HEAD | `ui/prism-brand-transformation` @ `4e417a9` — a superset of `main` (68 commits ahead; `main` has no content the branch lacks). See P1 |
| Migrations at start | 0001–0054 (0040–0054 are on the branch, not on `main`); new migrations start at 0055 (P2) |
| Production image | `2b84e13c07f2` (released 2026-08-05 per [RELEASE_RECORDS.md](../remediation/RELEASE_RECORDS.md); last entry). Campus V1, the UI rebuild and everything after 2b84e13 are **undeployed**. Images were built from `main` on 2026-10-01/02 (Build Image runs 36879290369, 36978677257) but no release record shows them deployed; not independently verifiable from the engineering workstation |
| `main` CI | last push run on `main` (36978675693, 2026-10-02) FAILED: `src/features/development/development.test.jsx` mission-player test; the branch's later CI runs are green (37442643787) |
| Build Image | last run (37365615065, branch, 2026-10-05) FAILED: `sts:AssumeRoleWithWebIdentity` denied for `studai-prism-github-deploy` (HA-024 / operator) |
| Baseline gates | recorded under Phase 0 below |

## Phase 0 — Baseline
Status: IN_PROGRESS
Branch: `prod/p00-baseline`
Gates: see table

- [x] P0.01 Charter saved verbatim — evidence: `docs/production/PROD_READY_CHARTER_2026-10.md`
- [x] P0.02 State file created (checklist, decision log, risks, handoff) — evidence: this file
- [x] P0.03 Production image and deployment status recorded — evidence: Baseline table
- [x] P0.04 Baseline gate numbers recorded — evidence: table below (2026-10-10, `4e417a9`, Node 24.12 locally, throwaway embedded PostgreSQL 17)
- [ ] P0.05 Full four-project Playwright baseline (running in a separate worktree; result recorded with Phase 1)

| Gate | Baseline result |
| --- | --- |
| `npm --prefix server test` (no DB, as CI step 1) | 968 tests · 941 pass · 0 fail · 27 skipped |
| Server DB suites (`test/*.db.test.js`, serial, throwaway Postgres) | 39 tests · 36 pass · 0 fail · 3 skipped (the 3 run only via their own disposable-DB scripts, next row) |
| DB pipeline (`run-experience-baseline-tests.mjs database` + `p2`, `run-cr03-runtime-tests.mjs`, `rehearse:migrations`, `rehearse:rollback`) | PASS (27 + 21 + 1 + 1 + 18 pass, 0 fail) |
| `npx vitest run` | 521 pass (an earlier run on a loaded machine timed out 11 tests across 6 files; they pass 87/87 alone — load, not defects) |
| `python -m pytest calibration/tests -q` | 64 passed |
| `npm run build` | PASS |
| `npm run audit:static` | PASS |
| `npm audit --omit=dev` root | 3 (1 critical `shell-quote`, 2 low incl. `dompurify` via `jspdf`) |
| `npm audit --omit=dev` server | 5 (1 critical `proxy-addr`, 3 high `nodemailer`/`engine.io`/`axios`, 1 moderate `ip-address`) |
| Playwright critical (`test:e2e:critical`) | 223 passed · 1 flaky (passed on retry) · 0 failed (17.7 min) |

The charter's expected numbers (623 / 599 / 312) describe `main` @ `609f748`; the branch base (P1) carries more tests.

## Phase 1 — Dependency and supply-chain security
Status: NOT_STARTED
- [ ] P1.01 Server advisories fixed (proxy-addr, nodemailer, engine.io, axios via razorpay, ip-address)
- [ ] P1.02 Client advisories fixed (shell-quote, dompurify via jspdf)
- [ ] P1.03 `concurrently` and other build/dev-only packages moved to devDependencies
- [ ] P1.04 CI: `npm audit --omit=dev --audit-level=high` (root + server), secret scan, CodeQL
- [ ] P1.05 Dependabot (npm root + server, pip calibration, GitHub Actions)
- [ ] P1.06 SECURITY_REVIEW dated addendum (before/after audit)

## Phase 1S — Security hotfix (operator-directed, P3)
Status: NOT_STARTED
- [ ] P1S.01 Legacy erasure route requires the signed-in owner
- [ ] P1S.02 Payment verification is single-use per provider payment id and bound to the order owner
- [ ] P1S.03 Production refuses to start without Razorpay secrets when paid offers are enabled; no empty-key HMAC
- [ ] P1S.04 Proctor socket: pair code validated, origin locked in production
- [ ] P1S.05 Ecosystem handover requires auth; no placeholder identity
- [ ] P1S.06 Remaining audit findings triaged (public report PII, unauthenticated session writes, `/transcribe`, process-level error handling, graceful shutdown, readiness probe, revoked tokens, DB TLS)

## Phase 2 — Account erasure cascade (S8)
Status: NOT_STARTED

## Phase 3 — Multi-instance and data-integrity readiness (S6)
Status: NOT_STARTED

## Phase 4 — Missing V3 support routes
Status: NOT_STARTED

## Phase 5 — Background job runner
Status: NOT_STARTED

## Phase 6 — Performance for real cohort sizes
Status: NOT_STARTED

## Phase 7 — Deployment consolidation and release preparation
Status: NOT_STARTED

## Phase 8 — Sales-readiness engineering
Status: NOT_STARTED

## Phase 9 — Employer development-use workspace (dark)
Status: NOT_STARTED

## Phase 10 — Human-action preparation pack
Status: NOT_STARTED

## Phase 11 — Final gates and report
Status: NOT_STARTED

## Decisions log

Format: date · id · decision · reason · charter § · reversible.

| Date | Id | Decision | Reason | § | Reversible |
| --- | --- | --- | --- | --- | --- |
| 2026-10-10 | P1 | The programme stacks on `ui/prism-brand-transformation` @ `4e417a9`, not `main` @ `609f748` (operator decision). The branch contains everything on `main` plus 68 commits (CR-01..CR-05 work, migrations 0040–0054) | Stacking on `main` would collide with the branch's migrations 0040–0054 and duplicate or conflict with work already done there | Phase 0, §2 | Yes (until merged) |
| 2026-10-10 | P2 | Law 3's frozen-migration rule covers every committed migration (0001–0054); new migrations start at 0055 | Same immutability reason as 0001–0039; follows from P1 | Law 3 | No |
| 2026-10-10 | P3 | An operator-directed security hotfix phase (`prod/p01s-security-hotfix`) follows Phase 1 and fixes the defects of the 2026-10-10 production-readiness audit. This includes closing the destructive part of the S9 residual (unauthenticated legacy erasure by session id) via middleware in `server/app.js` (the frozen router stays untouched) and having the legacy result page send its token. The rest of the S9 residual stays documented as before | The operator asked for the audit findings to be fixed; an unauthenticated delete of a candidate's report and payment record is not acceptable for a paid pilot. The charter's "S9 residual unchanged" is read as "not silently widened or forgotten" | Law 3, Law 5 (security fixes of existing defects are not new behaviour), DoD | Yes |
| 2026-10-10 | P4 | Branches stay local (operator decision); the operator pushes and opens PRs | Charter §2, HA-C007 | §2 | Yes |

## Risks

| Risk | Severity | Owner | Mitigation | Blocking |
| --- | --- | --- | --- | --- |
| `main` CI is red (one Vitest test on the merge commit) while the working branch is green | P2 | Engineering | The programme's branches carry the branch's fixes; merge only on green CI | Merge to main |
| Build Image cannot assume the AWS deploy role (OIDC trust denied) | P1 | Operator (HA-024) | Fix the role trust policy for the protected environment/ref; nothing in code can fix it | Any release |
| `main` has no branch protection; `build-image.yml` can publish from any ref | P1 | Operator (HA-024) | Phase 7 runbook addendum gives exact settings | Any release |
| `infra/aws/prism-eks.yml` pins image `69363a6e6b9a` (older than the recorded production `2b84e13c07f2`); re-applying the manifest rolls production back | P1 | Engineering / Operator | Phase 7 | Any release |
| `docs/DEPLOYMENT_RUNBOOK_v1.md` migration step uses `npm run migrate`, which the distroless runtime image does not contain | P1 | Engineering | Phase 7 runbook addendum | Any release with migrations |

## Session handoff

1. Read this file, then the charter, then the active phase section.
2. `git -C studai-prism status` — never overwrite uncommitted human work. Untracked at programme start (not ours, never commit): `PRISM_NEXT_REALITY_AUDIT_2026.md`, `StudAI_Prism_Complete_Brand_Pack*`, `data/` (contains user records — see Phase 1S).
3. Branches are local and stacked: `prod/p00-baseline` → `prod/p01-dependencies` → `prod/p01s-security-hotfix` → `prod/p02-...` and so on.
