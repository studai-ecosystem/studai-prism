# Prism Campus — Rollout Plan

Phase 12, C12.03 (spec §49, §55, §58 item 30). Every campus behaviour ships
dark behind a server-side flag registered OFF in `server/lib/flagRegistry.js`.
**Only a human flips a flag (HA-C001).** This plan is the order, the entry
criteria, the rollback and the owner for each step; it asserts nothing has
happened yet. Deployment itself is HA-C007.

## 1. Principles

- Server flags are the authorization boundary for dark features; frontend flags only hide UI.
- Rollback = turn the flag off. Every flag-off path is covered by a test that the
  route returns 404 and the legacy behaviour is unchanged.
- Never roll back by running a `.down.sql` on a database that holds real data.
  Migrations 0025–0039 are additive; leaving them applied with the flag off is safe.
- One flag per change window; observe for at least one full business day before the next.
- Legacy direct (B2C) users keep working at every step (Journey A, `campus-baseline.spec.js`).

## 2. Environment prerequisites (before any flag)

| # | Prerequisite | Evidence | Owner |
| --- | --- | --- | --- |
| P1 | `DATABASE_URL` configured; migrations through 0039 applied in staging, then production (`node server/db/migrate.js up`) | migrate status output | Operator (HA-C007) |
| P2 | Admin console reachable (`PRISM_ADMIN_CONSOLE`) with MFA for the finance, psychometric and product admins who operate campus tooling | admin login + role list | Operator |
| P3 | Mail configured with `PUBLIC_APP_URL` so invites carry a safe absolute link | test invite received | Operator |
| P4 | Backups and point-in-time restore verified for the Postgres instance | restore drill record | Operator |
| P5 | Legal review of disclosure, consent and sharing copy | HA-C005 closed | Counsel |

## 3. Flag order

| Step | Flag | Entry criteria (all required) | Rollback | Owner |
| --- | --- | --- | --- | --- |
| 1 | `PRISM_EVIDENCE_FAIL_CLOSED` | Provisional sufficiency thresholds approved (HA-C002) | Flag off: surfaces return to the previous vocabulary; fabrication removal stays (it is unconditional) | Psychometrics lead + operator |
| 2 | `PRISM_APP_SHELL_V3` | Internal QA of the shell at 360/768/1024/1440, axe clean (`campus-shell.spec.js`) | Flag off: `/app/*` routes go back to the legacy launcher | Product + operator |
| 3 | `PRISM_STUDENT_REPORT_V3` | Steps 1–2 live; claim registry review (HA-C002); Journey D green | Flag off: report links fall back to the legacy report route. Not while step 4 is live: V3 sessions would then land on the frozen legacy result page, whose review and delete actions are closed for them (SECURITY_REVIEW S9) — roll back step 4 first | Psychometrics lead + operator |
| 4 | `PRISM_ASSESSMENT_WORKSPACE_V3` | Steps 1–3 live (Report V3 must be on so V3 sessions never land on the frozen legacy result page); Journey E green; a single API instance until advisory locks land (the `/workspace/:id?legacy=1` escape is already closed for V3 sessions by the S9 lock); a human-review, accommodation and identity-check path for V3 sessions exists (the `/api/v1` routes, or a published support procedure until they are built — the legacy routes are closed for V3 sessions) | Flag off stops new V3 starts only. In-flight V3 sessions must **not** be resumed in the legacy player: the legacy engine does not read the V3 event history and would restart the conversation (the S9 lock returns 404 on the legacy routes for them). Planned rollback: drain first (announce a window, wait until no V3-started session is `IN_PROGRESS`, then flip). Emergency rollback: no tooling exists to re-issue a V3 seat, so in-flight V3 sessions stay paused (saved on the server, unreachable) until the flag is turned back on, and a session can pass its time limit meanwhile; the operator lists them (V3 start events without a finish) and tells the affected students — a manual procedure | Engineering + operator |
| 5 | `PRISM_CAMPUS_ENABLED` | Steps 1–4 live; HA-C005 closed; P1–P4 done; account erasure cascades to campus tables and the evidence rating queue (SECURITY_REVIEW S8 — open, blocking); one internal QA organization created in the console | Flag off: every `/api/v1/organizations/*` and `/campus/*` route is dark (404 / redirect); personal data is untouched | Product + operator |
| 6 | `PRISM_CAMPUS_ANALYTICS` | Step 5 live; privacy review of aggregate reporting (HA-C010) | Flag off: analytics and reports return 404; overview hides the capability section | Counsel/DPO + operator |
| 7 | `PRISM_DEVELOPMENT_V2` | Step 5 live; mission content and evaluator review (HA-C009) | Flag off: missions and interventions dark; practice evidence never reaches formal results either way | Content governance + operator |
| 8 | `PRISM_GROWTH_ENABLED` | Steps 1 and 5 live; at least one form pair approved as comparable (HA-C004) | Flag off: reassessments and growth dark; snapshots stay immutable | Psychometrics lead + operator |
| 9 | `PRISM_ROLE_EXPLORATION_V2` | Copy review | Flag off: `/app/explore` falls back to the legacy page | Product + operator |
| — | `PRISM_V3_RATING_QUEUE` (validation tooling, independent) | Rating protocol approved; qualified raters exist (HA-C008) | Flag off: `/api/validation` and `/api/admin/validation` return 404; ratings stay append-only | Psychometrics lead + operator |

Campus billing and integrations ride `PRISM_CAMPUS_ENABLED` (K97); contracts are
created and activated by finance in the admin console only after HA-C006.

## 4. Audience stages (spec §55)

| Stage | Who | Scope | Exit criteria | Owner |
| --- | --- | --- | --- | --- |
| A. Internal QA | StudAI staff with synthetic accounts on staging | Steps 1–9 on staging; the full Playwright suite (`--full-e2e`, including the keyboard-only journeys in `campus-keyboard.spec.js`) and a manual screen-reader pass (A11Y checklist) | No P0/P1 defects; audit trails complete | Product + QA |
| B. Test users | Internal staff and a handful of volunteer students on production, one internal organization | Steps 1–5 on production, one at a time | Seat ledger, invites, disclosure and privacy isolation verified on real infrastructure | Product |
| C. Design partner | One institution, "Prism Work-Readiness Baseline", 200–300 pre-final/final-year students, 6–10 weeks | Week 0 onboard + consent; week 1 baseline; week 2 reports + cohort intelligence (step 6); weeks 2–6 development (step 7); week 7+ reassessment only where a form pair is approved (step 8) | Pilot success measures below; signed contract (HA-C006) | Business owner |
| D. Gradual default | Further institutions, one at a time | Same flags; per-institution contracts | Renewal intent + support load acceptable | Business owner |

Pilot success measures (§55): seat activation, completion, report usefulness,
student understanding, mission engagement, support burden, buyer usefulness,
renewal intent, human-rating/science data quality. None of these is a claim of
validity (see `CAMPUS_CLAIMS_REGISTER.md`).

## 5. Monitoring during each step

- Error rate and p95 latency of `/api/v1/*` (request logs carry `requestId`).
- Seat ledger: RESERVED without CONSUMED/RELEASED older than the assignment window (held seats risk).
- Audit volume: `organization_audit_events`, `data_access_audit_events`, admin audit.
- Support tickets tagged campus.
- Any report of a student seeing another student's data, or a campus seeing personal results → immediate flag-off of step 5 and incident review.

## 6. Rollback drill (before step 5 in production)

1. Turn `PRISM_CAMPUS_ENABLED` off in staging with live synthetic data.
2. Confirm `/campus/*` redirects, `/api/v1/organizations/*` returns 404, personal flows (Journey A) pass.
3. Turn it back on; confirm organizations, seats and audit trails are intact.
Record the drill in the operator log before the production flip.
