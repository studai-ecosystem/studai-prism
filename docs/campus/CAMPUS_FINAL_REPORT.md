# Prism Campus + Personal V1 — Final Report

Programme: `PRISM_CAMPUS_MASTER_IMPLEMENTATION_SPEC.md` (frozen), phases 0–12,
run on autopilot 2026-09-25 → 2026-09-26. Live state:
`docs/campus/CAMPUS_PROGRAM_STATE.md`; human actions:
`docs/campus/CAMPUS_HUMAN_ACTIONS.md`.

**Nothing is deployed and no flag is on.** Every campus behaviour is built,
tested and dark behind a server-side flag registered OFF. Every branch is local
(pushing, PRs, merging and deploying are HA-C007). Scientific, legal,
commercial and rollout decisions are listed as open human actions.

## 1. Phases, branches, commits

Stacked branches, one phase per branch and commit (git root `studai-prism/`).

| Phase | Scope | Branch | Commit |
| --- | --- | --- | --- |
| 0 | Baseline safety and regression lock | `campus/p00-baseline` | 388d459 |
| 1 | Frontend foundation, design system, API/auth/workspace layer | `campus/p01-foundation` | 24c0b75 |
| 2 | Measurement integrity (fail closed) | `campus/p02-measurement` | ce17ce7 |
| 3 | Organizations, workspaces, memberships, entitlements | `campus/p03-org-foundation` | 6ccb0fe |
| 4 | Student application V3 | `campus/p04-student-app` | 074b32c |
| 5 | Assessment Workspace V3 | `campus/p05-assessment-workspace` | 0807ab6 |
| 6 | Student Report V3 | `campus/p06-student-report` | 0de71ec |
| 7 | Campus administration | `campus/p07-campus-admin` | e6b9478 |
| 8 | Development Engine V2 | `campus/p08-development-engine` | 46b634d |
| 9 | Reassessment and growth | `campus/p09-reassessment-growth` | 2f5f84a |
| 10 | Campus analytics and reporting | `campus/p10-campus-analytics` | 2800bfe |
| 11 | Billing, operations, integrations | `campus/p11-billing-operations` | 2325964 |
| 12 | Validation and controlled rollout hardening | `campus/p12-validation-rollout` | (this commit) |

## 2. Test counts, baseline → final

| Gate | Baseline (spec baseline 63d320d) | Final (Phase 12) |
| --- | --- | --- |
| Server `node --test` | 396 tests · 383 pass · 1 fail (a JSON-store race, fixed at root in Phase 0) · 12 skipped | 620 tests · 596 pass · 0 fail · 24 skipped (DB suites) |
| Server DB suites (throwaway Postgres) | not run locally (no database) | 36 pass · 0 fail on embedded Postgres `prism_test` |
| Python calibration (`pytest`) | 57 passed | 64 passed |
| Frontend unit (Vitest + Testing Library) | none (no runner existed) | 226 passed |
| Production build | PASS | PASS (built in 24.21s) |
| Static audit | PASS (1 campus-scan violation, fixed) | PASS; campus-scan clean |
| Playwright | 10 critical (chromium) | 571 passed, four projects (chromium, firefox, webkit, mobile-chromium), 18.1m; 1 flaky retry, same assertions (K111) |

Server skips are the DB-gated suites, which run separately in the DB gate.

## 3. Definition of Done (spec §58)

| # | Item | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Direct users continue to work without regression | `campus-baseline.spec.js`, Journey A (`campus-journey-a.spec.js`), legacy specs in the full run; per-phase legacy-immutability diff (migrations, `src/pages`, engine routes, scenario bank, prompts) | Met |
| 2 | Existing personal data stays isolated from Campus | `campusIsolation.test.js`, `campusPermissions.test.js` (`personal_result.read` granted to no org role), Journey B | Met |
| 3 | Existing personal customer can join a campus without a duplicate account | invite flow (`inviteService`), Journey B (`campus-join.spec.js`) | Met |
| 4 | College can create cohorts and programs | Phase 7 (`campusAdmin.test.js`, Journey C) | Met |
| 5 | College can import and invite students | CSV import preview → commit (SIS CSV adapter), invites; Journey C | Met |
| 6 | College can sponsor an assessment | assignments + sponsorship pools; contracts mint pools (Phase 11) | Met |
| 7 | Student understands sponsorship/privacy before starting | disclosure acknowledgement required before start (`ACKNOWLEDGEMENT_REQUIRED`), `SponsoredByCard`; copy pending legal review HA-C005 | Met (copy review HA-C005) |
| 8 | Assessment runs from server-defined scenario metadata | fixed-form resolution through pinned forms; `SCENARIO_NOT_FOUND` fails closed (`campusSessions.test.js`) | Met |
| 9 | Assessment survives refresh/network interruption safely | Journey E (`campus-workspace.spec.js`), idempotent messages, versioned artifacts | Met |
| 10 | No client fallback dialogue fabricates content | Phase 2/5 removal + tests (`failClosedPages.test.jsx`, `campusSessions.test.js`) | Met |
| 11 | Evidence system fails closed | `evidenceUnit.js` (no defaults), sufficiency engine, Phase 2 suites, Journey D | Met |
| 12 | Report V3 has no fabricated evidence or unsupported claims | claim provenance, verbatim quotes, renderer drops unsupported claims (Phase 6 suites) | Met |
| 13 | Student receives concise capability + evidence + development output | Report V3 + development plan (Phases 6, 8) | Met |
| 14 | Campus can view authorized sponsored outcomes | sponsored report access with data-access audit (`CampusReportPage`, Phase 7) | Met |
| 15 | Campus cannot view unrelated personal outcomes | isolation suites, Journey B | Met |
| 16 | Campus can see cohort capability distributions | Phase 10 analytics + reports | Met (behind `PRISM_CAMPUS_ANALYTICS`) |
| 17 | Small-group privacy suppression works | `campusAnalytics.test.js` (9 vs 10, org threshold, complementary incl. per-column and residue rows) | Met (privacy review HA-C010) |
| 18 | Campus can assign development interventions | Phase 8 interventions (`campusDevelopment` suites, e2e) | Met (content review HA-C009) |
| 19 | Mission engine only claims observed practice behaviours | evaluator quote verification + fail-closed pipeline (Phase 8) | Met |
| 20 | Practice does not directly raise formal scores | separate practice ledger, formal reads never union it (tests) | Met |
| 21 | Reassessment flow exists | Phase 9 reassessment cycles | Met (behind `PRISM_GROWTH_ENABLED`) |
| 22 | Growth only appears where comparison is approved | equivalence registry, PENDING pairs, dual-approved decisions (Phase 9) | Met (no pair approved yet, HA-C004) |
| 23 | RBAC is server-enforced | permission matrix + `can()` on every campus route; tests per role; legacy report JSON owner-only (S7) and legacy session routes plus the issued-report route closed or owner-only for every session id campus staff can know (S9, K104) | Met for campus surfaces; residual: undisclosed personal legacy sessions keep the frozen router's id-only access until the legacy flows are retired (S9 residual, Risks) |
| 24 | Audit logs exist for privileged access | organization audit, data-access audit, admin audit with reasons | Met |
| 25 | Student and admin critical journeys pass Playwright | Journeys A–E: `campus-journey-a.spec.js` (A, D), `campus-join.spec.js` (B), `campus-journey-c.spec.js` (C), `campus-insufficient.spec.js` (D), `campus-workspace.spec.js` (E). Four-project run: 571 passed (section 2) | Met |
| 26 | Accessibility critical checks pass | axe sweep of every campus route with a mandatory skip link (`campus-a11y-sweep.spec.js`), keyboard-only walkthroughs of Journeys B, C and E (`campus-keyboard.spec.js`), `A11Y_MANUAL_CHECKLIST.md` automated rows A1–A11 | Met (automated); manual audit HA-C013 |
| 27 | Billing/entitlement separation is test-covered | `campusBilling.test.js` independence test, `campusSessions.test.js` C11.07, `campusEntitlements.test.js` | Met |
| 28 | Security review passes | `SECURITY_REVIEW.md` (dependency audit 0/0 after fixes, CSP, secrets, OWASP per family; S7 legacy report routes and S9 legacy session routes fixed for campus-known sessions, K103/K104) | **Partially met:** agent review done with one open High finding — S8, account erasure does not yet cascade to campus tables or the rating queue (blocking entry criterion for rollout step 5); production review HA-C012 |
| 29 | Claims register matches actual validation state | `CAMPUS_CLAIMS_REGISTER.md` + `campusClaims.test.js` (all PENDING) | Met |
| 30 | Production rollout is feature-flagged and reversible | flags OFF (`flagRegistry.js`), flag-off tests per surface, `ROLLOUT_PLAN.md` (entry criteria and rollback per flag) | Met (flips HA-C001), with one documented limit: turning `PRISM_ASSESSMENT_WORKSPACE_V3` off does not move in-flight V3 sessions to the legacy player — they must be drained first, or held and re-issued (rollout step 4) |

## 4. Open human actions

| Id | Item | Owner |
| --- | --- | --- |
| HA-C001 | Flip any campus flag in a real environment (order in `ROLLOUT_PLAN.md`) | Operator |
| HA-C002 | Finalise capability level labels and sufficiency thresholds | Psychometrics lead |
| HA-C003 | Author/approve new scenario content | Content governance + psychometrics |
| HA-C004 | Approve assessment form equivalence for growth | Psychometrics lead |
| HA-C005 | Legal/privacy review of disclosure, consent and sharing copy | Counsel |
| HA-C006 | Sign contracts and approve campus price values | Business owner + finance |
| HA-C007 | Push, open PRs, merge, deploy | Operator |
| HA-C008 | Run the validation programme (raters, reliability, DIF, criterion studies) | Psychometrics lead |
| HA-C009 | Review mission content and the practice evaluator | Content governance + psychometrics |
| HA-C010 | Privacy review of aggregate reporting | Counsel + DPO |
| HA-C011 | Configure any live SSO or SIS integration | Operator + counsel |
| HA-C012 | Final production security review | Security lead |
| HA-C013 | Manual accessibility audit with assistive technology | Accessibility lead |

## 5. Risks carried forward

See the Risks table in `CAMPUS_PROGRAM_STATE.md`. The most important:

- **Account erasure does not cascade to campus tables or the evidence rating queue** (SECURITY_REVIEW S8). Blocking for rollout step 5 (first real campus students).
- Single API instance until advisory locks land for assessment sessions (rollout step 4).
- Personal legacy sessions whose id was never disclosed keep the frozen router's id-only access (S9 residual).
- The rating queue needs a counsel-approved consent basis for rater use before real sessions are enqueued (HA-C008 precondition).
- A Workspace V3 flag-off needs a drain; in-flight V3 sessions are never resumed in the legacy player (rollout step 4 rollback).
- Analytics compute per request; needs a staging Postgres probe before the analytics flip (`PERFORMANCE_REVIEW.md`).
- Seats held by starts whose window passes without being closed stay held until an administrator closes the assignment (no scheduler).
- Participation counts, under-review counts and filter differencing are listed for the privacy review (HA-C010).
- Campus analytics polish items from the Phase 10 UX audit (tab-level error copy, h2 skip, 360 px filter disclosure).

## 6. Next human steps

1. Review and merge the stacked branches in order (HA-C007).
2. Close HA-C005 (copy), HA-C002 (levels/thresholds) and HA-C012 (security) — the gates for the first flips.
3. Follow `ROLLOUT_PLAN.md` stage A (internal QA on staging), including the rollback drill.
4. Start rater recruitment and training so the V3 evidence queue can accumulate double ratings (HA-C008).
5. Sign the design-partner contract and record approved prices (HA-C006).

## 7. Open engineering work (not built; not a human action)

- Account-erasure cascade for campus tables and the rating queue (S8) — blocking rollout step 5.
- Postgres advisory locks for multi-instance assessment sessions (S6) — blocking a second API instance.
- V3 seat re-issue tooling for an emergency Workspace V3 rollback (rollout step 4).
- `/api/v1` routes for a V3 session's human-review request (charter §11, one free review), accommodation request and identity check: the legacy routes are closed for V3 sessions (S9), so until these exist a V3 student needs a published support procedure for review requests (rollout step 4 entry criterion).
