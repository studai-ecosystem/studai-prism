# PRISM — PRODUCTION-READINESS AND SALES-READINESS CHARTER

**Charter ID**: PROD-READY-2026-10 · **Adopted**: 2026-10-10 · **Repository**: `studai-ecosystem/studai-prism` (baseline `main` @ `609f748`)
**Change control**: Save this file as `docs/production/PROD_READY_CHARTER_2026-10.md` and do not edit it afterwards. Record decisions, deviations and progress in `docs/production/PROD_READY_STATE.md`, using the same decision-log format as `docs/campus/CAMPUS_PROGRAM_STATE.md` (K-numbered rows continue there as P-numbered rows here).

---

Act as the staff engineer, security engineer, DevOps lead and technical programme owner for **StudAI Prism**.

The objective is to take the existing, well-tested `main` branch to the point where StudAI One can sell **paid, clearly labelled pilots to colleges** and a **development-use (L&D) pilot to employers**, and run them safely in production. This is a hardening, gap-closing and release-preparation programme. It is not a feature-invention exercise and not a rewrite.

Read before you change anything:

- `docs/campus/CAMPUS_FINAL_REPORT.md`, `CAMPUS_PROGRAM_STATE.md` (Risks table), `SECURITY_REVIEW.md`, `ROLLOUT_PLAN.md`, `PERFORMANCE_REVIEW.md`, `CAMPUS_HUMAN_ACTIONS.md`
- `docs/remediation/HUMAN_ACTION_REGISTER.md`, `RELEASE_RECORDS.md`, `PROGRAM_STATE.md`, `INCIDENT-2026-08-04-credential-exposure.md`
- `docs/ui/UI_PROGRAM_STATE.md`, `docs/JOB_FAMILY_SCOPE_v1.md`, `docs/PROHIBITED_USES_POLICY_v1.md`, `docs/BUYER_ACCESS_SPEC_v1.md`, `docs/RETENTION_POLICY_v1.md`
- `server/lib/flagRegistry.js`, `server/lib/sharedConstants.js`, `server/app.js`, `server/lib/legacyReportGuard.js`, `server/routes/assessment.js` (frozen legacy router), `server/routes/v1/`, `server/domain/`, `server/db/migrations/`
- All test suites (`server/test`, `src/**/*.test.jsx`, `tests/e2e`, `calibration/tests`) and `.github/workflows/*`, `infra/aws/*`, `Dockerfile`

## 1. Non-negotiable laws

These override every other instruction in this prompt.

1. **ONE LAW stays in force.** You never flip a feature flag in any real environment, never deploy, never push to `main` directly, never touch production secrets, databases or EFS, and never execute the PostgreSQL cutover. You prepare; humans execute.
2. **No fabricated completion.** Never mark a human action (HA-xxx, HA-Cxxx) closed. You may move one to `PREPARED (materials ready)` and link the materials. Never invent study results, legal approvals, rater data, customers, prices or incident conclusions.
3. **Frozen artifacts stay frozen.** Committed migrations 0001–0039, versioned prompts under `server/prompts/`, the frozen legacy router (`server/routes/assessment.js`), the scenario bank and both existing charters are never edited. Changes go in new migrations (0040+), new prompt versions, or middleware mounted in `server/app.js`, which is how K103 and K104 were done.
4. **Never weaken a test.** Fix root causes. Do not delete assertions, raise timeouts to hide failures, skip tests, or relax the claims ceiling, campus copy ceiling or design-system ratchets. If a test is wrong, explain why in the state file before changing it.
5. **Every new behaviour ships dark** behind a server-side flag registered OFF in `flagRegistry.js`, with a flag-off test proving the route returns 404 and legacy behaviour is unchanged.
6. **Scope and claims.** Nothing you write (code, copy, docs, seed data, sales material) may exceed `JOB_FAMILY_SCOPE_v1.md` or state a PENDING claim as fact. Prism is never presented as a hiring screen, a ranking, a pass/fail cut-off or a job-performance predictor.
7. **Data protection by default.** Every new table holding personal data is covered by the erasure cascade and the retention policy in the same phase it is introduced.

## 2. Working method

- Work on stacked branches, one phase per branch and per commit: `prod/p00-baseline`, `prod/p01-dependencies`, and so on. Open a pull request per phase against `main` only if you have permission; otherwise leave the branches local and list them for the operator (HA-C007).
- At the end of every phase run the full gate and record the result in the state file: `npm --prefix server test` (with a throwaway Postgres so DB suites run, as in CI), `npx vitest run`, `python -m pytest calibration/tests -q`, `npm run build`, `npm run audit:static`, `npm audit --omit=dev` (root and server), and Playwright `@critical` plus the specs the phase touches. Run the full four-project Playwright suite at Phase 0 and Phase 10.
- Resolve details from existing conventions without asking. Ask the operator only when a decision is genuinely irreversible or belongs to a human (pricing, legal copy, flag flips).

---

## Phase 0 — Baseline

- Confirm `main` @ `609f748` (or record the newer commit). Run every gate and record the baseline numbers. Expected: server 623 tests / 599 pass / 0 fail / 24 skipped without Postgres; Vitest 312 pass; build pass; static audit pass.
- Create `docs/production/PROD_READY_STATE.md` with a checklist mirroring the phases below, a decision log, a risks table and a session-handoff section.
- Record clearly that production still runs image `2b84e13` (5 Aug) and that Campus V1 and the UI rebuild are on `main` but undeployed.

## Phase 1 — Dependency and supply-chain security

1. Fix the advisories that appeared after the 26 Sept review: server `proxy-addr` (critical), `nodemailer` ≤ 10.0.8 (high), `engine.io` 6.6.0–6.6.9 (high), `axios` via `razorpay` (high), `ip-address` (moderate); client `shell-quote` (critical) and `dompurify` via `jspdf` (low). Prefer semver-compatible `npm audit fix`. If a major bump is needed (for example `nodemailer` 10.x), read its changelog, adapt the mail code, and add or extend tests for report and invite email.
2. Move `concurrently` from `dependencies` to `devDependencies` in the root `package.json`. Check every other root dependency for the same mistake.
3. Use the existing `overrides` block only where no upstream fix exists, with a comment and a P-row explaining why.
4. Add to `ci.yml`: `npm audit --omit=dev --audit-level=high` for root and server (fail the build), a secret scan (gitleaks or equivalent, with an allowlist for the known Tesseract wasm false positives and the documented public Razorpay key id), and CodeQL for JavaScript. Add Dependabot config for npm (root, server), pip (calibration) and GitHub Actions. This closes the CI half of SECURITY_REVIEW S5; DAST stays with HA-C012.
5. Update `docs/campus/SECURITY_REVIEW.md` through a new dated addendum section (do not rewrite history) with before/after audit results.

## Phase 2 — Account erasure cascade (SECURITY_REVIEW S8, blocking)

Build the erasure cascade so `DELETE /api/assessment/candidate-data` (and any v1 equivalent) removes or pseudonymises every campus-era row for the person. Do this without editing the frozen router: add a service in `server/domain/` (for example `domain/privacy/erasureCascade.js`) and invoke it through middleware or a v1 route, following the K103/K104 pattern.

Cover at least everything listed in the S8 risk row: memberships, invites, consents, entitlements, share grants, assignment roster rows, `user_preferences`, `assessment_client_events`, `assessment_artifact_versions`, `student_report_versions`, `notifications`, `student_import_rows`, `organization_audit_events` actor ids, `mission_attempts.work`, `practice_evidence_units.excerpt`, `development_plans`, `intervention_memberships`, `evidence_rating_items`, and `evidence_unit_ratings`. Search the migrations for every other column that can hold a user id, email, name, phone, free text or verbatim quote, and add those too.

Rules:
- Append-only tables with `ON DELETE RESTRICT` (for example `evidence_unit_ratings`) are pseudonymised or detached, never deleted, per `RETENTION_POLICY_v1.md`. Audit tables keep the event but replace the actor with a stable pseudonym.
- The cascade runs in one transaction where possible. If it cannot, make it idempotent and resumable, and record each step in an erasure ledger table (new migration) so an operator can prove completion.
- Add a retention purge for `student_import_rows.raw` (N days after commit; N is a governed constant marked PROVISIONAL pending HA-003) and remove intervention memberships when a student leaves a cohort or organization.
- Tests: one DB test per table proving the row is gone or pseudonymised after erasure, a test that another student's data is untouched, a test that a rerun after a mid-way failure completes, and a ratchet test that fails if a future migration adds a personal-data column not registered in the cascade.
- Update S8 to Fixed in a dated addendum and remove it from the ROLLOUT_PLAN step 5 blockers through a new P-row (the plan file itself may get an addendum, not a rewrite).

## Phase 3 — Multi-instance and data-integrity readiness

1. Replace the in-process V3 per-session locks with PostgreSQL advisory locks (`pg_try_advisory_xact_lock` keyed on a hash of the session id), keeping the in-memory lock only when no database is configured. Include artifact saves so a version row is appended before the engine sees the save. Tests: two concurrent requests with the same client event id run exactly one engine turn across two app instances sharing one database.
2. Make these multi-write operations transactional through repository transactions: invite acceptance (consent, membership, workspace, cohort, invite status), campus admin role change, and the rating queue's "two ratings per item" check (lock the item row so a third rating cannot be inserted).
3. Add a database guard trigger in a new migration so a form-equivalence pair cannot become APPROVED without a decision row, and a growth snapshot cannot be written on a PENDING pair.
4. Persist the assessment form id on the session (new nullable column, backfilled from the evidence units) so a future bank version bump cannot remap old sessions.
5. PostgreSQL cutover (HA-023): do not execute it. Re-run the JSON-to-PG migration rehearsal against a throwaway Postgres seeded with a synthetic store of realistic size, confirm the reconciliation report format, update `PG_MIGRATION_RUNBOOK_v1.md` through an addendum if anything changed since August, and add the advisory-lock work as a prerequisite for running more than one replica.
6. Update S6 to Fixed in the security addendum.

## Phase 4 — Missing V3 support routes

Build the `/api/v1` routes the final report lists as missing, so V3 sessions no longer depend on the closed legacy routes:
- Human-review request (charter §11: one free review per assessment), with status reads.
- Accommodation request and status, following `ACCOMMODATIONS_POLICY_v1.md` (accommodations are arranged before the start and never change judging).
- Identity check, at the assurance levels already allowed by `IDENTITY_ASSURANCE_SPEC_v1.md` (Level 3 stays gated behind HA-007).

Each route: zod `.strict()` validation, owner-only access, idempotency keys, audit events, flag-off 404, unit and e2e tests, and UI entry points in the V3 report and settings pages built on the existing design system. When done, record that the ROLLOUT_PLAN step 4 support-path criterion is met in code.

## Phase 5 — Background job runner

The app has no scheduler. Add a PostgreSQL-backed job queue (a `jobs` table with `FOR UPDATE SKIP LOCKED`, retries with backoff, a dead-letter state and an admin view). Do not add Redis or another service unless you record why Postgres cannot do it. Move onto it:
- Invitation email dispatch from CSV import (currently up to 2,000 emails inside one request).
- Assignment reminder emails.
- Time-based release of reserved seats when an assignment window passes.
- The import-row retention purge from Phase 2 and any retention-enforcement job (still dark behind `PRISM_RETENTION_ENFORCEMENT` until HA-003).

The worker runs in the same container behind a flag and must be safe with several replicas. Test idempotency, retry, dead-lettering and multi-worker behaviour.

## Phase 6 — Performance for real cohort sizes

- Add SQL-side filtering and pagination to campus admin list endpoints and a batched user-directory lookup, replacing the O(students × assignments) service loops.
- Materialise per-session sufficiency decisions (or cache per organization with explicit invalidation) for campus analytics and growth outcomes.
- Extend `scripts/loadtest.mjs` with a campus profile: one organization with 2,000 students and 5 assignments against a real Postgres. Record p50/p95 for list, analytics and report endpoints in `PERFORMANCE_REVIEW.md` (addendum). Target p95 under 500 ms for list endpoints at that size; if you cannot reach it, document the gap.
- Review the bundle: the entry chunk (~377 kB) and charts chunk (~374 kB). Split further only if measurement justifies it.

## Phase 7 — Deployment consolidation and release preparation

1. Production is EKS in `ap-south-1` (per `RELEASE_RECORDS.md`). Remove `azure-webapp.yml` and `infra/aws/prism-ecs.yml` only after confirming nothing in the EKS deployment references them; otherwise mark them deprecated with a header comment. Update the README's Azure federation section to match, and record the decision as a P-row.
2. Add a staging overlay for the EKS manifest (separate namespace, database and secret ids) so ROLLOUT_PLAN stage A can run.
3. Prepare the release of `main` to staging and then production: migrations 0025–0039 plus new ones, the post-deploy smoke battery (extend the existing §21 battery with campus flag-off checks and the new v1 routes), and a filled-in `RELEASE_RECORDS.md` entry template. Do not append a real entry and do not deploy.
4. Add GitHub environment protection instructions for `build-image.yml` (HA-024) to the deployment runbook addendum.
5. Write a one-page `docs/production/GO_LIVE_CHECKLIST.md` that orders every remaining human action and flag flip from ROLLOUT_PLAN, the human-action registers and this charter into one sequence with owners and evidence required.

## Phase 8 — Sales-readiness engineering

1. **Demo organization.** A seed script (`server/db/seedDemoOrg.js`, run only with an explicit `--demo` flag and refused in production unless a separate demo database is configured) that creates one synthetic college with cohorts, students, completed sessions and reports. Every name, quote and number is synthetic and every screen shows a persistent "Demo data" banner. No synthetic data may ever enter a real organization, analytics or calibration run (add a test).
2. **Pilot onboarding runbook** (`docs/production/COLLEGE_PILOT_ONBOARDING.md`): organization creation in the admin console, roles, CSV import format, sponsorship pools, disclosure flow for students, report access, support and review procedure, data deletion at pilot end.
3. **Pilot technical report generator**: fill `docs/commercial/PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md` from real pilot data through an admin export, respecting small-group suppression and showing PROVISIONAL and INSUFFICIENT honestly.
4. **Under-18 readiness.** First-year college cohorts include 17-year-olds. Build the guardian-consent path described in `AGE_GATING_POLICY_v1.md` behind a dark flag, with the copy marked draft pending HA-006 and HA-005. Do not enable it.
5. Clear the P3 UX items recorded in the campus Risks table (analytics tab-level error copy, h2 skip, 360 px filter disclosure, unfinished attempts list, "Go to your work" jump link, stacked table rows on small screens), with axe and width-matrix tests.

## Phase 9 — Employer development-use workspace (dark)

The schema already allows `organization_type = 'EMPLOYER'` and an `EMPLOYER` workspace type, but there is no employer experience. Build a minimal employer L&D mode by reusing the campus machinery, behind a new flag `PRISM_EMPLOYER_LND` registered OFF:
- An employer organization can invite its own new hires or fresher cohorts, sponsor assessments, see individual reports only with each employee's sharing consent, see suppressed cohort aggregates, and assign development missions.
- Copy says development and structured onboarding, never selection. Add employer-specific disclosure and consent copy as draft constants pending HA-005 and HA-004.
- **Prohibited by design, with tests:** candidate ranking, sorting or filtering by level for selection, pass/fail thresholds, bulk export of individual results, any "hire / do not hire" or fit wording, and any job family outside `JOB_FAMILY_SCOPE_v1.md`. Extend the claims ceiling and campus copy ceiling tests to the employer surfaces.
- Define, but do not connect, a candidate-consented evidence hand-off interface to StudAI Hire (`server/domain/integrations/hire/`, returning 501 until configured, like the SSO interface). Document the contract in `docs/production/HIRE_HANDOFF_INTERFACE.md`.

## Phase 10 — Human-action preparation pack

Prepare materials so humans can close their items quickly. Change statuses to `PREPARED` only; never `CLOSED`.

- **HA-001 / HA-002 (P0):** an evidence template for credential rotation (new key verified, old key returns 401, provider activity review notes), plus a checklist line telling the operator to close these first. If the register already has evidence elsewhere, link it; do not assume it happened.
- **HA-C002:** a decision memo with the current provisional level labels and sufficiency thresholds, what each choice changes in reports, and the data needed to revisit.
- **HA-C005 / HA-005 / HA-004:** one counsel packet with every consent, disclosure, sharing, employer and guardian string in the product, where it appears, and the policy it implements.
- **HA-006:** an under-18 decision memo (guardian consent vs. explicit exclusion) with the engineering status from Phase 8.
- **HA-015 / HA-C006:** a pricing approval sheet built from the `/admin/margin` dashboard method, showing UNKNOWN costs as UNKNOWN.
- **HA-008 / HA-009:** a role brief for the psychometrician and a rater recruitment one-pager based on the existing rater manual.
- **HA-022 / HA-023 / HA-024 / HA-C012 / HA-C013:** confirm the existing runbooks are current after this programme's changes and note what changed.

## Phase 11 — Final gates and report

- Run every gate including the full four-project Playwright suite and a DB-enabled server run. Record exact counts.
- Write `docs/production/PROD_READY_FINAL_REPORT.md`: phases with branches and commits; test counts baseline to final; security findings S1–S9 plus new ones with status; dependency audit before/after; what is now ready for a college pilot and what still blocks it; the ordered list of open human actions; risks carried forward; and an explicit statement that no flag was flipped, nothing was deployed and no human action was closed.

## Definition of done

- `npm audit --omit=dev` reports 0 high or critical for root and server, and CI enforces it.
- S5 (CI part), S6 and S8 are fixed with tests; S9 residual is unchanged and still documented.
- V3 sessions have v1 routes for review, accommodation and identity check.
- A job runner handles invites, reminders, seat release and retention, safely across replicas.
- Campus endpoints meet the Phase 6 target at 2,000 students or the gap is documented.
- One production deployment path (EKS), a staging overlay, a prepared release and a single go-live checklist exist.
- A demo organization, pilot onboarding runbook and pilot report export exist.
- The employer L&D workspace and under-18 path exist dark, with prohibited-use tests.
- Every human action touched is PREPARED with linked materials, and none is marked CLOSED.
- All gates pass with no weakened assertions.
