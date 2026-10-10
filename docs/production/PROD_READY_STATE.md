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
active_phase: 1S
branch: prod/p01s-security-hotfix
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
Status: COMPLETE
Branch: `prod/p01-dependencies` (from `prod/p00-baseline` @ `d71abf1`)
Commit: `70bdc85` (fixes, CI, docs) + follow-up commit recording this hash
Gates: see table

- [x] P1.01 Server advisories fixed (proxy-addr, nodemailer, engine.io, axios via razorpay, ip-address) — evidence: `server/package-lock.json` (`proxy-addr` 2.0.7→2.0.8, `engine.io` 6.6.9→6.6.11, `axios` 1.19.0→1.20.0, `ip-address` 10.4.0→10.7.3 via `npm audit fix`); `server/package.json` `nodemailer` ^9.0.3→^10.1.0 (major, P5; changelog read, no code change needed in `server/lib/mailer.js`); new `server/test/mailerDelivery.test.js` (6 tests: report email with PDF attachment, report-link, campus invite, campus assignment, SMTP failure) against an in-process SMTP server; server `npm audit --omit=dev` 5→0
- [x] P1.02 Client advisories fixed (shell-quote, dompurify via jspdf) — evidence: `package-lock.json` `shell-quote` 1.10.0→1.12.0, `dompurify` 3.4.14→3.4.16; `dompurify` override removed (P6); root `npm audit --omit=dev` 3→0
- [x] P1.03 `concurrently` and other build/dev-only packages moved to devDependencies — evidence: `package.json` (`concurrently` → devDependencies; it is used only by the `dev:concurrently` script). Every other root dependency is imported by `src/` and bundled by Vite; `date-fns` is unused but kept (P7). Dockerfile `client-build` runs a full `npm ci --ignore-scripts` (devDependencies included) and the runtime stage installs only `server` production dependencies, so neither the image nor `npm start` depends on the move (`npm start` smoke: `/api/health` 200)
- [x] P1.04 CI: `npm audit --omit=dev --audit-level=high` (root + server), secret scan, CodeQL — evidence: `.github/workflows/ci.yml` jobs `dependency-audit` and `secret-scan` (gitleaks 8.30.1 CLI, SHA-256 pinned, full history, `.gitleaks.toml`; P9), top-level `permissions: contents: read`; `.github/workflows/codeql.yml` (javascript-typescript, security-extended, `security-events: write` on its job only). actionlint 1.7.12: no findings. gitleaks run locally with the committed config: full history (177 commits; 178 including `70bdc85`) and tracked tree "no leaks found"; canary GitHub/AWS/Slack tokens and a generic key outside the fixtures are still detected. Workflows have not run on GitHub yet (branches stay local, P4)
- [x] P1.05 Dependabot (npm root + server, pip calibration, GitHub Actions) — evidence: `.github/dependabot.yml` (also npm `/desktop` and cargo `/desktop/src-tauri`, both have lockfiles)
- [x] P1.06 SECURITY_REVIEW dated addendum (before/after audit) — evidence: `docs/campus/SECURITY_REVIEW.md` § "Addendum 2026-10-10 — PROD-READY Phase 1"; S5 CI half fixed, DAST stays with HA-C012

| Gate (2026-10-10, Node 24.12 locally) | Phase 1 result |
| --- | --- |
| `npm --prefix server test` (no DB, as CI step 1) | 974 tests · 947 pass · 0 fail · 27 skipped (baseline 968/941; +6 `mailerDelivery.test.js`) |
| Server DB suites (`test/*.db.test.js`, serial, throwaway Postgres :55432) | 39 tests · 36 pass · 0 fail · 3 skipped (unchanged) |
| `npx vitest run` | 38 files · 521 pass |
| `python -m pytest calibration/tests -q` | 64 passed |
| `npm run build` | PASS |
| `npm run audit:static` | PASS |
| `npm audit --omit=dev` root | 0 (was 3: 1 critical, 2 low); `--audit-level=high` exit 0 |
| `npm audit --omit=dev` server | 0 (was 5: 1 critical, 3 high, 1 moderate); `--audit-level=high` exit 0 |
| `npm audit` root incl. dev tooling | 13 (2 critical, 6 high, 5 moderate) in vite/vitest/tailwind toolchains — major upgrades, not shipped (P8) |
| Playwright | not re-run in this phase (no UI or route change; the baseline worktree run was in progress); orchestrator runs `@critical` |

## Phase 1S — Security hotfix (operator-directed, P3)
Status: COMPLETE (code and tests; operator actions in Risks)
Branch: `prod/p01s-security-hotfix` (from `prod/p01-dependencies` @ `a500ed1`)
Commit: see `git log prod/p01-dependencies..prod/p01s-security-hotfix`
Gates: see table

Findings N1–N15 of the 2026-10-10 audit, each confirmed in code first: [SECURITY_REVIEW.md](../campus/SECURITY_REVIEW.md) § "Addendum 2026-10-10 — PROD-READY Phase 1S". Decisions P10–P22. The frozen legacy router is untouched (legacy fixes are middleware in `server/app.js`, `server/lib/legacyOwnerLock.js`). Security fixes of existing defects ship on (no new flag); no flag was flipped, nothing deployed.

- [x] P1S.01 Legacy erasure route requires the signed-in owner — evidence: `createLegacyErasureGuard` mounted before the router; `ScoreReport.jsx` sends the token and reports the real outcome; `phase1sSecurity.test.js` N1 (3 tests: real app signed-out / other account / unknown / bad token → identical 404, owner → 200, ownerless dev session not erasable, guard unit incl. fail-closed 500); `src/pages/legacyErasure.test.jsx` (3); e2e `campus-workspace.spec.js` (V3 delete 404) and the Journey A specs below (P10). Narrowed S9 residual + the other write routes: `createLegacyOwnerBinding` on `/consent`, `/verify-identity`, `/accommodation`, `/dispute`, `/artifacts/:id` (N6, 3 tests); `/start`, `/message`, `/evaluate`, `/calibrate`, `/speech` and the GET status routes stay in the residual with the reason in P11
- [x] P1S.02 Payment verification is single-use per provider payment id and bound to the order owner — evidence: store `redeemPayment` / `getPaymentRedemption` (JSON + PG), migration `0055_payment_redemptions` (+ `.down.sql`; PK `payment_id`, backfill from the earliest entitlement, safe with existing duplicates), erasure detaches, `db/storeMigration.js` copies the ledger; `/verify` reads the order from Razorpay (owner in notes, product, amount, `paid`); webhook grants only captured money, one grant with `/verify`; tests N2 (6 incl. retry → same session/grant, 4 concurrent → 1 session, cross-account 403, uncaptured 409, erasure → 409, webhook authorised-only → no grant) and `paymentRedemption.db.test.js` (2: 0055 builds over duplicate payment ids, earliest wins; 6 concurrent PG redeems → 1 entitlement; erasure detaches) (P12)
- [x] P1S.03 Production refuses to start without Razorpay secrets when paid offers are enabled; no empty-key HMAC — evidence: `assertPaymentConfiguration` + `anyPaidOfferPurchasable()` called from `index.js`; `/verify` and `/create-order` 503 without the key secret; tests N3 (3) (P13)
- [x] P1S.04 Proctor socket: pair code validated, origin locked in production — evidence: `lib/proctorSocket.js` handshake guard (issued + unexpired code, no row for unknown codes, desktop owner token, phone code only), `allowRequest` origin check, per-IP limit; `lib/pairCodes.js`; `/api/device/pair` owner-only; `src/lib/proctorLink.js` sends `auth.token` for the desktop; tests N4 (3, incl. a real socket.io server + client) and `src/lib/proctorLink.test.js` (2) (P14)
- [x] P1S.05 Ecosystem handover requires auth; no placeholder identity — evidence: `routes/ecosystem.js` (sign-in, account identity, signed pre-authorization, 503 when unconfigured in production; `/aligned-jobs` no localhost / no fictional roles in production); tests N5 (2) + `ecosystem.test.js` (P15)
- [x] P1S.06 Remaining audit findings triaged — evidence: N7 public report (already owner-only since `6c218ec`, test added; P18), N8 `/transcribe` (session + owner + audio-only, P18), N9 revoked tokens (payment routes + gate before the legacy router, P17), N10 async rejections + process handlers and N11 graceful shutdown (P16), N12 `/api/ready` (P19), N13 DB TLS (P20, operator action), N14 `network-info` + `/data/` ignore and N15 login timing (P21); tests N6–N15 in `phase1sSecurity.test.js`
- [x] P1S.07 Tests that encoded pre-fix behaviour updated, none weakened (P22); state file, SECURITY_REVIEW addendum

| Gate (2026-10-10, Node 24.12 locally) | Phase 1S result |
| --- | --- |
| `npm --prefix server test` (no DB, as CI step 1) | 1005 tests · 976 pass · 0 fail · 29 skipped (Phase 1: 974/947/0/27; +29 `phase1sSecurity.test.js`, +2 PG tests skipped without a database) |
| Server DB suites (`test/*.db.test.js`, serial, scratch database `prism_p1s` on the throwaway Postgres :55432) | 41 tests · 38 pass · 0 fail · 3 skipped (Phase 1: 39/36/0/3; +2 `paymentRedemption.db.test.js`) |
| DB pipeline (`run-experience-baseline-tests.mjs database` + `p2`, `run-cr03-runtime-tests.mjs`, `rehearse:migrations`, `rehearse:rollback`) | PASS (27 + 21 + 1 + 1 + 18 pass, 0 fail; rehearsal head `0055_payment_redemptions`, 16 migrations rolled back and re-applied, idempotent) |
| `npx vitest run` | 40 files · 526 pass (Phase 1: 521; +3 `legacyErasure.test.jsx`, +2 `proctorLink.test.js`). A first full run under load timed out one untouched test (`campusExperience.test.jsx`, passes alone and on the rerun) — load, as in the baseline note |
| `npm run build` | PASS |
| `npm run audit:static` | PASS |
| `npm audit --omit=dev` root / server | unchanged from Phase 1 (no dependency change) |
| Playwright (chromium) | Chromium, 11 specs (campus-journey-a incl. Journey A register → personal entitlement, cr05-returning-loop, campus-workspace, campus-insufficient, p1-legacy-report, p1-account-entry, prism-next-reality, prism-readiness, role-journeys, prism-next-marketing, flow-entry): 134 tests, all pass. Run against the repository's own audit servers (`scripts/start-audit-server.mjs`, same env as the runner) on ports 4273/4274 with a scratch database, because 4173/4174 were held by another worktree's gate run. First pass 125/134: 8 failures were the scratch harness (the issued-views fixture requires a `prism-p0-disposable-*` data root; fixed and re-run: 89/89 for those four specs) and 1 was PRISM-E2E-45, which expected the router's 403 for another account's consent and now gets the binding's 404 (updated, P22). `@critical` across all projects is left to the orchestrator's gate |

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
| 2026-10-10 | P5 | `nodemailer` moves from ^9.0.3 to ^10.1.0 (semver-major) | Every 9.x release is affected (`<=10.0.8`: GHSA-6vj9-mwq6-2f5v, -8vvx-rff5-p5rq, -g57g-f23g-4646, -v53p-9fqp-m79j, -prgh-xp8r-p3m5). The 10.0.0 changelog's only breaking change is Node >= 20 (runtime is Node 22); the ESM default export keeps `createTransport`, so `lib/mailer.js` is unchanged. New wire-level tests (`mailerDelivery.test.js`) cover report, report-link, invite and assignment email | Phase 1.1 | Yes |
| 2026-10-10 | P6 | Root `overrides`: drop `dompurify` (pinned 3.4.14, now vulnerable); keep `node-fetch` 2.7.0. package.json cannot carry comments, so the reason lives here and in the SECURITY_REVIEW addendum | `jspdf`'s own range (`^3.3.1`) admits the fixed `dompurify` 3.4.16, so the pin is no longer needed and was blocking the fix. `node-fetch`: `face-api.js` 0.22.2 (unmaintained since 2022) → `@tensorflow/tfjs-core` 1.7.0 pins `node-fetch ~2.1.2` (advisories fixed in 2.6.7, e.g. CVE-2022-0235); no upstream fix exists | Phase 1.3 | Yes |
| 2026-10-10 | P7 | Only `concurrently` moves to devDependencies. `date-fns` is unused in `src/` but stays in dependencies | Every other root dependency is imported by `src/` and bundled. `date-fns` is listed in the Campus master spec's dependency set (C1.01) and has no advisory; removing it is a scope change for its owner, not a supply-chain fix. Docker `client-build` installs devDependencies, so the build is unaffected | Phase 1.2 | Yes |
| 2026-10-10 | P8 | The CI gate and the Definition of Done use `npm audit --omit=dev`; dev-only toolchain advisories (vite 5, vitest 2, tailwindcss 3 and their transitive deps; 13 total) are recorded, not fixed, in Phase 1 | The charter scopes the target to production dependencies; the fixes are major upgrades (vite 8, vitest 5, tailwind 4) with build and test-runner risk, and none of this code ships in the image or the bundle. Dependabot raises them; tracked in Risks | Phase 1.1, DoD | Yes |
| 2026-10-10 | P9 | Secret scan uses the gitleaks CLI (8.30.1, SHA-256-pinned) over the full history, not `gitleaks/gitleaks-action`; allowlist exceptions for values are scoped to the `generic-api-key` rule and to their file | The action needs a licence key for organisation repositories. A global `[[allowlists]]` entry with `paths` skips the whole file for every rule (its `condition` does not apply to paths; verified locally), so fixture exceptions would have hidden real tokens in tests; rule-scoped AND allowlists do not (verified with canaries). The full history is clean with the config, so no baseline file is needed | Phase 1.4 | Yes |
| 2026-10-10 | P10 | Phase 1S N1: `DELETE /api/assessment/data/:sessionId` is signed-in-owner-only through `createLegacyErasureGuard` (`server/lib/legacyOwnerLock.js`), mounted in `server/app.js` before the frozen router. The owner is the one recorded on the live session, the entitlement or the issued report; signed out, another account, an ownerless session and an unknown id get the same `404 NOT_FOUND` (K103). The legacy result page (`ScoreReport.jsx`, not frozen) sends the bearer token and reports success only on `ok: true`. This narrows the S9 residual: erasure leaves it, and S9 residual (b) (delete button ignoring the response) is closed. Ownerless sessions (anonymous dev `/start` only; production entitlements always carry a user since `/dev-session`, `/verify` and invite redemption require sign-in, and dummy payments are refused in production) can no longer be erased by id; account erasure (`DELETE /candidate-data`) is unchanged | Destructive, unauthenticated, and the id is shown to the candidate and in links; the frozen router cannot be edited | Law 3, P3, S9 | Yes |
| 2026-10-10 | P11 | Phase 1S N6: the other session-keyed legacy WRITE routes named by the audit — `/consent`, `/verify-identity`, `/accommodation`, `/dispute`, `/artifacts/:sessionId` (POST) — are bound to the session's recorded owner (`createLegacyOwnerBinding`; 404 for anyone else). Their pages send the token: `VerifyIdentity.jsx` and the work-material API client already did; `Briefing.jsx` (consent, accommodation) and `ScoreReport.jsx` (review request) now do. Sessions without a recorded owner pass to the router unchanged (anonymous development path, like the router's own `/event` check, audit C9). NOT locked in this phase and left in the S9 residual: `/start`, `/message`, `/evaluate`, `/calibrate`, `/speech` and the GET status routes (`/evaluate-status`, `/verify-identity`, `/accommodation`, `/dispute`, `/artifacts`) — they are outside the audit's list and non-destructive; `/calibrate` (`Briefing.jsx`) and `/speech` (`src/lib/voice.js`) are called WITHOUT a token, so an owner check would break them; `/start`, `/message`, `/evaluate` (`Assessment.jsx`) do send it but are the core assessment loop that many e2e journeys and server suites drive with synthetic or anonymous sessions, so binding them needs its own caller review and full Journey A/C runs rather than a hotfix. Retire with the legacy flows | Owner checks where the pages can carry the token without breaking Journey A; no silent widening of the residual | Law 3, P3, S9 | Yes |
| 2026-10-10 | P12 | Phase 1S N2/N3, payments. (1) Single-use redemption per provider payment id lives in the store layer: JSON store bucket `paymentRedemptions` (serialised) and PostgreSQL table `v1_payment_redemptions` (migration 0055, `payment_id` PRIMARY KEY; the redemption row and the entitlement are written in one transaction). A UNIQUE index on `v1_payments.payment_id` was rejected: production may already hold duplicates, which would fail the index build and block the release; the separate ledger needs no cleanup, and 0055 backfills it from the EARLIEST entitlement per payment id (duplicates stay as history; review with `SELECT payment_id, count(*) FROM v1_payments WHERE payment_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1`). `db/storeMigration.js` copies the JSON ledger (and backfills from JSON entitlements) at cutover. (2) Erasure detaches a redemption (session and user NULL) instead of deleting it, so a replay cannot mint a fresh session; `payment_id`/`order_id` are provider transaction references kept as financial records (RETENTION_POLICY payment records), and the row holds no profile data after erasure. (3) `/verify` reads the order back from Razorpay before the first redemption (`orders.fetch`): `notes.userId` must be the caller, `notes.productCode`, amount and currency must match the server values, and the order must be `paid`; a repeat by the same account is answered from the ledger (no provider call). (4) Offer purchasability: `/create-order` keeps refusing an unpurchasable offer; `/verify` redeems only orders `/create-order` made (bound by the provider-held notes), so the gate cannot be bypassed — refusing to redeem an already captured payment because the offer closed afterwards would keep the money without service. (5) Webhook: grants only on `payment.captured` / `order.paid`; `payment.authorized` is acknowledged and ignored (an uncaptured authorisation is auto-refunded by Razorpay; the order is created without explicit capture settings, so capture follows the account's capture configuration — the operator must keep auto-capture on, otherwise `/verify` answers the retryable `PAYMENT_NOT_CAPTURED`). The webhook keeps keying the grant on the payment id that `/verify` also uses and never creates a session entitlement, so `/verify` + webhook end with one grant and one session. (6) `Payment.jsx` retries `/verify` (up to 6 × 2 s) only on responses marked `retryable` | Replay minted unlimited paid sessions from one payment; cross-account redemption; authorisation-only grants | Law 3 (new migration 0055), Law 7, P3 | Yes (0055 has a down migration) |
| 2026-10-10 | P13 | Phase 1S N3: `/verify` and `/create-order` answer `503 PAYMENTS_NOT_CONFIGURED` when the Razorpay key secret is missing (no HMAC under an empty key). Startup: `assertPaymentConfiguration` (`server/lib/security.js`, called from `index.js` after `assertProductionSecrets`) refuses production when ANY product is purchasable (`anyPaidOfferPurchasable()`, the live offer gate: price approval, reviewed content, tax presentation, approved terms) and `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` is missing. Today no offer is purchasable, so a payments-off production boots unchanged; dev/test are never affected; dummy payments stay refused in production (DEF-02) | Fail closed on a forgeable signature check; refuse a mis-provisioned paid production without breaking a deliberately payments-off one | Law 1 (no flag flipped), P3 | Yes |
| 2026-10-10 | P14 | Phase 1S N4, proctor socket (`server/lib/proctorSocket.js`): a handshake guard admits a pairing code only if `/api/device/pair` issued it and it is under 3 h old (`server/lib/pairCodes.js`); unknown codes create no `v1_device_links` row. Desktop role: the owner's token in `auth.token` (`src/lib/proctorLink.js` sends it); if the paired session has an owner it must be that account; an ownerless session is refused in production and allowed for a signed-in desktop in development. Phone role: the issued, unexpired code is its only credential (the phone page is opened from a QR code on a device that is not signed in). Origins: production allows the request's own origin plus `CORS_ORIGIN` (or `PROCTOR_CORS_ORIGIN`) for every transport via `allowRequest` (CORS alone does not cover WebSockets); development reflects any origin so the LAN-phone flow keeps working. Per-IP connection limit 60/min (`PROCTOR_SOCKET_RATE_PER_MIN`; same client-IP rule as the HTTP limiters). `POST /api/device/pair` now requires the signed-in session owner (`LinkPhone.jsx` sends the token). The phone camera stays OFF by default (`PRISM_PROCTOR_PHONE_CAM`, charter §14) | Anyone could join a room, inject frames/signals into a candidate's proctoring and fill the device-link table | P3 | Yes |
| 2026-10-10 | P15 | Phase 1S N5, `server/routes/ecosystem.js`: `/handover-token` has live callers (`src/pages/ScoreReport.jsx`), so it stays on (no flag) and is fixed: sign-in required; the identity is the authenticated account from the account store (`authenticate` → `findUserById`, i.e. `v1_users` / `users.json`; migrations have no `study_sessions`/`users` tables), never a placeholder; destination and references validated; the Hire pre-authorization carries a 60 s HS256 assertion signed with `ECOSYSTEM_SECRET` via the existing `mintEcosystemJwt` (no secret, no pre-authorization; the identity-free local code fallback is kept); a pre-authorization redirect must stay on the configured Hire origin; in production a missing `HIRE_BASE_URL` / `CAREER_BASE_URL` gives `503 NOT_CONFIGURED` instead of a localhost redirect. `/aligned-jobs` (live caller, no personal data): production skips the localhost default and never serves the curated example roles (fictional employers labelled verified, with salary ranges — Law 2 / claims), returning an empty list unless a configured Hire API answers; development keeps the curated feed | Unauthenticated identity hand-over with a hard-coded identity; fabricated listings on a live surface | Laws 2, 6, P3 | Yes |
| 2026-10-10 | P16 | Phase 1S N10/N11, process lifecycle. (1) `server/lib/asyncRouteErrors.js` patches express 4's `Layer.prototype.handle_request` once (imported by `app.js`): a rejected handler promise goes to `next(err)` (generic 500), as Express 5 does natively; this is the only way to cover the frozen router's async handlers without editing it. A rejection after the response was sent is only logged (handing it to express would destroy a socket that may still be flushing). The global error handler defers to express when headers were already sent. (2) `index.js`: `unhandledRejection` is logged and the process keeps serving; `uncaughtException` is logged and exits 1 (state unknown; the orchestrator restarts). (3) Graceful shutdown (`server/lib/gracefulShutdown.js`) on SIGTERM/SIGINT: stop accepting, `/api/ready` → draining, close proctor sockets, close idle keep-alive connections, wait for in-flight requests up to `PRISM_SHUTDOWN_TIMEOUT_MS` (default 25 s < 30 s Kubernetes grace), then stop the evaluation worker, close the PostgreSQL pools, exit 0 | Crash-on-rejection and dropped requests on every rollout | P3 | Yes |
| 2026-10-10 | P17 | Phase 1S N9, revoked tokens: `routes/payment.js` replaces its signature-only `getAuthUser` with `authenticate` (token version, account state, account must exist; suspended → 403). The frozen router cannot change, so `createRevokedTokenGate` on `/api/assessment` refuses a revoked token (401 `SESSION_REVOKED`) or a suspended account (403) before it. A validly signed token whose account record is missing still passes the gate (the router's existing tests sign tokens for unstored users, and a deleted account's sessions are erased with it); payment routes refuse it. Requests without a token are untouched | Password change / admin revocation / suspension must end access everywhere | P3 | Yes |
| 2026-10-10 | P18 | Phase 1S N7/N8. N7: the audit's "public report view returns userId/userEmail" is already closed — since `6c218ec` (branch base) the K103 owner-only guard covers `GET /api/assessment/report/:sessionId` too, so non-owners get 404 and no response filter is needed (verified by a new test; SECURITY_REVIEW S9's "stays public" wording predates that commit; public verification is `/api/credentials/:id/verify`, unaffected). N8: `/transcribe` is parsed in `app.js` before the frozen router (multer, memory, same 15 MB cap, one file, `audio/*` only → 415 otherwise); the session must exist and, when owned, belong to the signed-in caller (404 otherwise; production refuses ownerless sessions). After parsing, the request's content type is re-labelled so the router's own multer skips the consumed stream and reads `req.file`/`req.body` as set | Cost abuse of paid STT without a session; contained middleware fix | Law 3, P3 | Yes |
| 2026-10-10 | P19 | Phase 1S N12: new readiness endpoint `GET /api/ready` (database `SELECT 1` with a 2 s timeout → 200 `ready` / 503 `not_ready`; 503 `draining` during shutdown; `not_configured` when no database). `/api/health` stays the unchanged liveness check. Phase 7 should point the EKS `readinessProbe` and the ALB health check (`alb.ingress.kubernetes.io/healthcheck-path`) at `/api/ready` and keep `livenessProbe` on `/api/health` (a database outage must not restart pods); the manifest is not changed in this phase | Liveness must not depend on the database; readiness must | P3, Phase 7 | Yes |
| 2026-10-10 | P20 | Phase 1S N13, PostgreSQL TLS (`server/db/pool.js` `sslOptions`), libpq semantics: `PGSSLMODE=verify-full` verifies chain and host name, `verify-ca` the chain (against `PGSSLROOTCERT` when set, else Node's public trust store); `require` verifies against `PGSSLROOTCERT` when set (as libpq does) and otherwise keeps the old encrypted-but-unverified mode, now with a startup warning `pg_tls_unverified`. That fallback is the explicit "opt-out" (plain `require` without a CA bundle) and keeps the current production connection working. The RDS CA bundle is NOT vendored: it is public (AWS trust store) but its fetch and rotation belong to the operator; operator action: mount AWS's RDS bundle, set `PGSSLROOTCERT`, then `PGSSLMODE=verify-full` (Risks) | Unverified TLS allows interception on the database path; must not break the live connection | P3 | Yes |
| 2026-10-10 | P21 | Phase 1S N14/N15 and housekeeping: `GET /api/device/network-info` 404s in production (`LinkPhone.jsx` already falls back to its own origin). Login runs a bcrypt compare against a lazily computed dummy hash (cost 10) for unknown emails and hash-less accounts; same 401 text. Minimum password length stays 6: raising it only for new passwords is technically safe for existing users but changes registration/change-password copy and e2e fixtures, which is product scope beyond this hotfix (Risks). Root `.gitignore` gains `/data/` (a root-started server writes its JSON store there; the existing files were neither read nor deleted, and no history rewrite was needed — they were never committed) | Enumeration by timing; host network disclosure; accidental commit of user records | P3 | Yes |
| 2026-10-10 | P22 | Tests that encoded the pre-fix behaviour, updated to the secure expectation (no assertion removed): `server/test/commerce.test.js` — a reordered `payment.authorized` webhook was expected to answer `duplicate: true`; it is now acknowledged with `ignored: 'payment.authorized'` and the "exactly one grant" assertion stays. `server/test/commerceGaps.test.js` — the buyer is now a stored account (payment routes check the account behind the token), `/verify` gets a fake provider holding the paid orders (it now reads the order back), and payment ids are unique per run (a payment id is single-use and the default JSON store outlives a run); every assertion is unchanged. `server/test/ecosystem.test.js` — the hand-over test signs in first and additionally asserts signed-out → 401. `tests/e2e/prism-readiness.spec.js` PRISM-E2E-45 — another account's consent call is still refused, now with the binding's 404 (same as an unknown session, K103) instead of the router's 403. Count pins move 54 → 55 for the new migration: `scripts/rehearse-migrations.mjs` (`REHEARSAL_EXPECTED_55_MIGRATIONS`) and `server/test/experienceBaseline.db.test.js` (`appliedKnown`). `scripts/check-final-handover.mjs` (validate:p10, not a gate) still checks the P10 handover record's 54 and is left as that record | Law 4: tests that asserted insecure behaviour are corrected and explained, not weakened | Law 4 | Yes |

## Risks

| Risk | Severity | Owner | Mitigation | Blocking |
| --- | --- | --- | --- | --- |
| `main` CI is red (one Vitest test on the merge commit) while the working branch is green | P2 | Engineering | The programme's branches carry the branch's fixes; merge only on green CI | Merge to main |
| Build Image cannot assume the AWS deploy role (OIDC trust denied) | P1 | Operator (HA-024) | Fix the role trust policy for the protected environment/ref; nothing in code can fix it | Any release |
| `main` has no branch protection; `build-image.yml` can publish from any ref | P1 | Operator (HA-024) | Phase 7 runbook addendum gives exact settings | Any release |
| `infra/aws/prism-eks.yml` pins image `69363a6e6b9a` (older than the recorded production `2b84e13c07f2`); re-applying the manifest rolls production back | P1 | Engineering / Operator | Phase 7 | Any release |
| `docs/DEPLOYMENT_RUNBOOK_v1.md` migration step uses `npm run migrate`, which the distroless runtime image does not contain | P1 | Engineering | Phase 7 runbook addendum | Any release with migrations |
| Dev-only toolchain advisories (vite 5 / esbuild, vitest 2 / tinypool, tailwindcss 3 / chokidar / micromatch) — 13 under full `npm audit` | P3 | Engineering | Not shipped; major upgrades via Dependabot PRs with full gate (P8) | No |
| New CI jobs (`dependency-audit`, `secret-scan`, CodeQL) have never run on GitHub (branches local) | P3 | Operator (push) | actionlint clean; gitleaks verified locally with the committed config; watch the first run after push | No |
| S9 residual (narrowed by Phase 1S): `/start`, `/message`, `/evaluate`, `/calibrate`, `/speech` and the GET status routes of the frozen legacy router still act on a session id alone for personal legacy sessions whose id was never disclosed (erasure and the five write routes are now owner-checked, P10/P11) | P2 | Engineering | Ids are random UUIDs; every campus-known id is locked (K104); retire with the legacy flows | No |
| PostgreSQL TLS still unverified in production until the operator supplies the RDS CA bundle (`PGSSLROOTCERT`) and sets `PGSSLMODE=verify-full`; the app logs `pg_tls_unverified` at startup meanwhile (P20) | P2 | Operator | Code supports verification; AWS publishes the RDS bundle | Before a paid pilot |
| The EKS manifest still uses `/api/health` for readiness and the ALB check; `/api/ready` exists (P19) | P3 | Engineering (Phase 7) | Phase 7 manifest update | No |
| Razorpay capture: `/verify` grants only captured (`paid`) orders and the webhook ignores `payment.authorized`; if the Razorpay account is not on auto-capture, paid checkouts stay at `PAYMENT_NOT_CAPTURED` until captured (P12) | P2 | Operator | Keep auto-capture on in the Razorpay dashboard before any offer becomes purchasable; the webhook still grants on capture | Before selling |
| Existing duplicate redemptions in production `v1_payments` (if any, from the replay defect) are kept as history, not revoked (P12) | P3 | Operator / finance | Review with the query in P12 before the first paid pilot | No |
| Minimum password length stays 6 (P21) | P3 | Product | Raise for new passwords with registration copy and fixtures in a product change | No |
| The phone socket accepts any holder of a valid, unexpired pairing code (by design: the phone is not signed in); a leaked QR code lets its holder join that room for up to 3 h (P14) | P3 | Engineering | Codes are random, short-lived and per session; the phone camera stays OFF by default (charter §14) | No |

## Session handoff

1. Read this file, then the charter, then the active phase section.
2. `git -C studai-prism status` — never overwrite uncommitted human work. Untracked at programme start (not ours, never commit): `PRISM_NEXT_REALITY_AUDIT_2026.md`, `StudAI_Prism_Complete_Brand_Pack*`, `data/` (contains user records — see Phase 1S).
3. Branches are local and stacked: `prod/p00-baseline` → `prod/p01-dependencies` → `prod/p01s-security-hotfix` → `prod/p02-...` and so on.
4. New migrations: the head is `0055_payment_redemptions` (Phase 1S). Each new migration also updates the pinned count in `scripts/rehearse-migrations.mjs` and `server/test/experienceBaseline.db.test.js` (P22).
