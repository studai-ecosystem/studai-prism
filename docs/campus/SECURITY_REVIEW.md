# Prism Campus — Security Review

Phase 12, C12.04 (spec §41, §58 item 28), 2026-09-26, branch
`campus/p12-validation-rollout`. Agent review of the code in this repository;
it is **not** a penetration test and does not replace the human production
security review before launch (HA-C012).

## 1. Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Server production dependencies | `npm audit --omit=dev` (server) | Before: 5 (2 high: `multer` ≤ 2.2.0 DoS/limit bypass, `nodemailer` ≤ 9.1.0 address parsing; 3 moderate: `qs` via `express` / `body-parser`). Fixed with the semver-compatible `npm audit fix` (express 4.22.3, multer 2.4.0, nodemailer 9.1.1; lockfile only). After: **0** |
| Client production dependencies | `npm audit --omit=dev` (root) | **0** |
| Static audit (routes, secret patterns, markers) | `npm run audit:static` | PASS (gate `static-audit`) |
| Campus forbidden patterns | campus-scan gate | clean |
| CSP | `server/app.js` helmet | `script-src 'self' 'wasm-unsafe-eval' https://checkout.razorpay.com` — no `unsafe-eval`, no `unsafe-inline` scripts. `wasm-unsafe-eval` only permits WebAssembly compilation (self-hosted OCR); it does not allow `eval()`. `upgrade-insecure-requests` is sent in production only (K102: on a local http server WebKit otherwise upgrades every asset request and the page never loads) |
| Bundle eval scan | case-sensitive search of `dist/assets/*.js` for `eval(`, `new Function(`, string `setTimeout(` | none |
| Secrets in tracked files | `git grep` for AWS keys, GitHub tokens, live Stripe/Razorpay keys, Slack tokens, Google API keys, private-key headers | Two matches, both the **public Razorpay key id** (`rzp_live_…`, a publishable identifier, not the key secret) quoted in the remediation incident record and programme state (`docs/remediation/`), where the historical exposure is already tracked for rotation by the remediation programme's human-action register. Two further matches are false positives inside minified `public/ocr/tesseract-*.wasm.js`. No secret key material found |
| Raw HTML | search `src/` for `dangerouslySetInnerHTML` / `innerHTML =` | none |
| SQL construction | search campus repositories for interpolated `query(...)` | only code-constant fragments (column lists, internal table names, `$n` placeholders); every value is parameterised |

## 2. OWASP Top 10 (2021) by endpoint family

Families: **V1-S** student (`/api/v1/me/*`, assessment sessions, reports,
sharing), **V1-C** campus admin (`/api/v1/organizations/*`: students, cohorts,
programs, imports, assignments, members, audit, development, growth,
analytics, reports, billing, integrations), **ADM** admin console
(`/api/admin/organizations`, `/api/admin/equivalence`, `/api/admin/validation`),
**RAT** rater plane (`/api/validation`), **SSO** (`/api/v1/auth/sso/start`).

| Risk | Controls in place | Evidence |
| --- | --- | --- |
| A01 Broken access control | Server-side `can()` with deny-by-default on every V1-C route (`requireOrgPermission`), scope narrowing (ASSIGNED / DEPARTMENT), out-of-scope reads return 404, personal results unreadable by every org role, workspace header checked against the session scope; admin console `requirePermission` per route; raters only with a qualified token; legacy report JSON owner-only (S7); legacy session routes closed for V3/sponsored sessions and owner-only for shared ones (S9); no frontend-only authorization | `campusPermissions.test.js`, `campusIsolation.test.js`, `campusAnalytics.test.js` (role scopes), `campusBilling.test.js` (billing roles), `campusBillingAdmin.test.js`, `validationRatingQueue.test.js`, `legacyReportGuard.test.js` |
| A02 Cryptographic failures | JWT with token-version check (existing); invite and share tokens stored as hashes; rater tokens hashed; rating-queue references are SHA-256 hashes of ids; no secrets in code | contract §4, `campusFoundation.db.test.js` (invite hash), 0039 CHECK on hashed refs |
| A03 Injection | zod `.strict()` validation at every V1 boundary; parameterised SQL only; CSV exports neutralise formulas (`csvCell`); React escaping (no raw HTML) | `campusAdmin.test.js`, `campusAnalytics.test.js` + `campusBilling.test.js` (formula tests) |
| A04 Insecure design | Fail-closed evidence (no defaulted levels); append-only ledgers and audit tables (DB triggers); idempotency keys on start/finish/commit; compare-and-set on contract and pool status; small-group suppression server-side; practice evidence separated from formal evidence | measurement tests, `*.db.test.js` trigger tests, `campusBilling.test.js` race test |
| A05 Security misconfiguration | Every campus surface dark behind a server flag (404 when off); helmet headers + CSP; `Cache-Control: no-store` on `/api/v1`; admin console dark unless `PRISM_ADMIN_CONSOLE` and DB configured | flag-off tests in each campus suite |
| A06 Vulnerable components | Production dependency audit 0/0 after fixes (section 1) | this document |
| A07 Identification and authentication | One identity per verified email (no duplicate accounts on join); SSO is an interface returning 501 until configured (HA-C011); rate limits on auth endpoints (existing); admin MFA (existing) | `campusJoin` e2e (Journey B), `campusBilling.test.js` (SSO 501) |
| A08 Software and data integrity | Committed migrations and prompts never edited (hooks + legacy diff per phase); immutable report versions and growth snapshots; append-only invoice exports and ratings | per-phase legacy diff in the state file, DB tests |
| A09 Logging and monitoring | `organization_audit_events` for campus changes and exports, `data_access_audit_events` for every student-level read, admin audit for console mutations (with reasons), request ids on every V1 response; generic 500 messages | audit assertions across campus suites |
| A10 SSRF | No campus endpoint fetches a user-supplied URL; mail links are built from `PUBLIC_APP_URL` only | code review |

## 3. Findings and follow-ups

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| S1 | Server production dependencies had 2 high / 3 moderate advisories | High | Fixed (lockfile update, tests green) |
| S2 | `GET /api/evidence/claims` referenced an undefined `req` in its error path, so a failure would throw instead of returning a clean 500 | Low | Fixed in C12.02 |
| S3 | A Razorpay public key id is quoted in remediation docs | Info | Tracked by the remediation programme (rotation is human); not a secret |
| S4 | CORS allow-list does not include `x-rater-token`; the rater plane therefore only works same-origin | Info | Intended (raters use the app origin) |
| S5 | No automated DAST or dependency scanning in CI | Medium | Human production security review (HA-C012) |
| S6 | Advisory locks for multi-instance assessment sessions are not in place | Medium | Rollout precondition (single API instance until then; ROLLOUT_PLAN step 4) |
| S7 | The legacy report JSON routes `GET /api/assessment/report/:sessionId/v2` and `/employee` (served by the frozen legacy router) checked nothing: anyone holding a session id could read the candidate's name and quoted answers | High | Fixed (K103): `server/lib/legacyReportGuard.js` is mounted in `server/app.js` in front of the legacy router (the router itself is untouched); only the signed-in session owner passes, everyone else gets the same 404. Tests: `server/test/legacyReportGuard.test.js`, `tests/e2e/prism-next-reality.spec.js` PN-E2E-17 (signed-out 404) |
| S8 | Account erasure does not yet cascade to campus tables (memberships, cohort and assignment rows, consumptions, development and growth records, share grants) or to the evidence rating queue (hashed refs and tokenised excerpts in `evidence_rating_items`; `evidence_unit_ratings` is append-only with `ON DELETE RESTRICT`, so erasure there must pseudonymise or detach rather than delete). The rating queue holds no names, emails or phone numbers and its refs are salted hashes, but excerpts are still personal data | High | **Open.** Blocking entry criterion for ROLLOUT_PLAN step 5 (first real campus students). Tracked as a risk in the programme state and final report |
| S9 | The other legacy session routes in the frozen router (`DELETE /data/:id`, `POST /message`, `/evaluate`, `/start`, `/consent`, `/calibrate`, `/speech`, `/verify-identity`, `/accommodation`, `/dispute`, `GET/POST /artifacts/:id`, `GET /accommodation/:id`, `/dispute/:id`, `/verify-identity/:id`, `/evaluate-status/:id`) act on a session id alone. Campus staff legitimately learn the ids of sponsored sessions and of sessions shared with them | High | Fixed for every id campus staff can know (K104): `createCampusSessionLock` in `server/lib/legacyReportGuard.js`, mounted in `server/app.js` before the legacy router. V3-started or sponsored sessions get 404 on all of these for everyone (they are driven only through `/api/v1`, whose adapter calls the router in-process); shared legacy sessions are owner-only; a store error fails closed (500). The issued-report route `GET /report/:id` (dimension scores, theta, coverage, account id and email) is owner-only for the same campus-known sessions via `createCampusReportGate` and stays public for undisclosed personal sessions (verification links). This also closes the `/workspace/:id?legacy=1` escape for V3 sessions. Residuals (open): (a, Medium) personal legacy sessions whose id was never disclosed keep the old behaviour, because their frozen pages call some of these routes without a token (an owner check would break Journey A); the id is a random UUID known only to its owner. Retire with the legacy flows. (b, Low) the frozen legacy result page's delete button ignores the response and always reports success; for a shared legacy session (no token sent) or a V3 session opened there, nothing is deleted — students use account erasure (`DELETE /candidate-data`, authenticated) instead; ROLLOUT_PLAN keeps Report V3 on while Workspace V3 is on so V3 sessions never land on that page. Tests: `server/test/legacyReportGuard.test.js` (S9 cases incl. the real app) |

## Addendum 2026-10-10 — PROD-READY Phase 1 (dependencies and supply chain)

Appended by PROD-READY Phase 1 (branch `prod/p01-dependencies`); the sections above are the 2026-09-26 record and are unchanged. Decisions: P5–P9 in [PROD_READY_STATE.md](../production/PROD_READY_STATE.md).

### Production dependency audit (`npm audit --omit=dev`), before and after

New advisories published after the 26 September review (section 1 recorded 0/0 then).

| Package (path) | Before | Severity | Advisories | After |
| --- | --- | --- | --- | --- |
| root `shell-quote` (via `concurrently`) | 1.10.0 | Critical | GHSA-pqg4-j6r4-53mv | 1.12.0, and `concurrently` moved to devDependencies so it no longer ships as a production dependency |
| root `dompurify` (via `jspdf` 4.2.1) | 3.4.14 (pinned by an `overrides` entry) | Low (2) | GHSA-p98j-92pf-mc4p, GHSA-6688-9rhm-gjv2 | 3.4.16; the override was removed because `jspdf`'s own range (`^3.3.1`) now admits the fixed release (P6) |
| root `jspdf` | 4.2.1 | Low (transitive) | via `dompurify` | 4.2.1 (unchanged; clean once `dompurify` is fixed) |
| server `proxy-addr` (via `express` 4.22.3) | 2.0.7 | Critical | GHSA-jqcg-44mw-7w3h (IPv4-mapped IPv6 trust-subnet spoofing) | 2.0.8 |
| server `nodemailer` | 9.1.1 | High | GHSA-6vj9-mwq6-2f5v, GHSA-8vvx-rff5-p5rq, GHSA-g57g-f23g-4646, GHSA-v53p-9fqp-m79j, GHSA-prgh-xp8r-p3m5 | 10.1.0 (major bump, P5) |
| server `engine.io` (via `socket.io` 4.8.3) | 6.6.9 | High | GHSA-2gc4-cqfq-p2gv | 6.6.11 |
| server `axios` (via `razorpay` 2.9.6) | 1.19.0 | High | 12 advisories incl. GHSA-vh66-26gq-q6x8, GHSA-r4gj-5m52-g5wh, GHSA-3pq3-5fj3-cg6v | 1.20.0 |
| server `ip-address` (via `express-rate-limit` 8.5.2) | 10.4.0 | Moderate | GHSA-rpw4-54j3-4h4q, GHSA-2vr4-cq9g-pvrc, GHSA-j6r3-76f7-8jcv, GHSA-h3mg-xc3c-68pw | 10.7.3 |

Totals: root 3 (1 critical, 2 low) → **0**; server 5 (1 critical, 3 high, 1 moderate) → **0**; `desktop/` 0 → 0. `npm audit --omit=dev --audit-level=high` exits 0 for root and server.

All fixes except `nodemailer` were semver-compatible lockfile updates (`npm audit fix`). `nodemailer` 9.x has no fixed release (`<=10.0.8` affected), so it moved to `^10.1.0`. The 10.0.0 changelog's only breaking change is "Node.js 20 or newer" (the runtime image is Node 22); the package became a TypeScript build with ESM and CJS entry points, and `(await import('nodemailer')).default.createTransport` is unchanged, so `server/lib/mailer.js` needed no code change. New test `server/test/mailerDelivery.test.js` drives the real nodemailer transport against an in-process SMTP server and checks, on the wire: SMTP auth from the environment, the report email's PDF attachment byte for byte, the pilot notice and not-sole-basis policy, no composite or "certified" wording, the report-link email, campus invite and assignment emails (institution text HTML-escaped, CR/LF stripped from the subject, no injected recipients or headers), and that a refused send rejects to the caller.

The remaining `overrides` entry, `node-fetch` 2.7.0, stays: `face-api.js` 0.22.2 (unmaintained since 2022) depends on `@tensorflow/tfjs-core` 1.7.0, which pins `node-fetch ~2.1.2` (affected by advisories fixed in 2.6.7, e.g. CVE-2022-0235); no upstream fix exists (P6).

Dev-only tooling (not shipped; the runtime image installs only `server` production dependencies and the client bundle is built output) still carries advisories whose fixes are major upgrades: `vite` 5 / `esbuild` (moderate–high), `vitest` 2 / `tinypool` / `vite-node` / `@vitest/mocker` (critical, test runner only), `tailwindcss` 3 / `chokidar` / `micromatch` / `braces` / `fast-glob` / `postcss-selector-parser` / `postcss-nested` (high–moderate, build-time). 13 in total under `npm audit` without `--omit=dev`. Recorded as a risk in the programme state; Dependabot will raise them (P8).

### CI supply-chain controls (S5, CI half)

| Control | Where | Behaviour |
| --- | --- | --- |
| Production dependency gate | `.github/workflows/ci.yml` job `dependency-audit` | `npm audit --omit=dev --audit-level=high` for root and `server/`; any high or critical advisory fails the workflow |
| Secret scan | `ci.yml` job `secret-scan`, `.gitleaks.toml` | gitleaks 8.30.1 CLI (version- and SHA-256-pinned) over the full git history, default rules plus a reviewed allowlist: vendored Tesseract OCR files under `public/ocr/` and `dist/` (section 1 false positives), the documented public Razorpay key id (S3), `.env.example` placeholders, flag-catalogue names, and named test fixtures. Value exceptions are scoped to the `generic-api-key` rule and to their file, so a real token in a test file is still reported (verified with canary GitHub, AWS and Slack tokens). Local run on this branch: history (177 commits) and tracked tree both "no leaks found" |
| Static analysis | `.github/workflows/codeql.yml` | CodeQL `javascript-typescript`, `security-extended` queries, on push, pull request and weekly; `security-events: write` only on that job |
| Least privilege | `ci.yml`, `codeql.yml` | top-level `permissions: contents: read` |
| Dependency updates | `.github/dependabot.yml` | npm (`/`, `/server`, `/desktop`), cargo (`/desktop/src-tauri`), pip (`/calibration`), GitHub Actions (`/`) |

S5 status: **CI half fixed** (dependency audit gate, secret scan, CodeQL, Dependabot). The workflows have been linted (actionlint 1.7.12, no findings) but have not yet run on GitHub, because branches stay local (P4); the first push will be their first run. **DAST remains open** with the human production security review (HA-C012).
