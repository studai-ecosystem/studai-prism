# Prism go-live checklist (single ordered sequence)

PROD-READY Phase 7 (charter Phase 7 item 5; decision P79). One sequence for
every remaining human action and flag flip from
[ROLLOUT_PLAN.md](../campus/ROLLOUT_PLAN.md), [HUMAN_ACTION_REGISTER.md](../remediation/HUMAN_ACTION_REGISTER.md),
[CAMPUS_HUMAN_ACTIONS.md](../campus/CAMPUS_HUMAN_ACTIONS.md) and the
[charter](./PROD_READY_CHARTER_2026-10.md). **Nothing on this page is done.**
Statuses live in the registers and change only with linked evidence from a
human; this page never marks an item closed. Work top to bottom: a step starts
only when every step it depends on has its evidence. Engineering prepared the
materials named in each row; humans execute.

## A. Security first (blocks everything that touches money or mail)

| # | Step | Owner | Evidence required |
| --- | --- | --- | --- |
| A1 | **HA-001** Rotate the Razorpay live key pair; review provider activity since the 2026-08-04 exposure ([RUNBOOK-credential-rotation.md](../remediation/RUNBOOK-credential-rotation.md) §A) | Founder/Ops | New key verified live, old key returns 401, activity review notes |
| A2 | **HA-002** Rotate the SendPulse SMTP password; review sending activity (§B) | Founder/Ops | New password verified in-pod, old one rejected, log review notes |
| A3 | **HA-018** Written provider-side incident conclusions | Founder/Ops | Provider logs reviewed + written conclusion (incident closure) |

## B. Platform, CI and staging (before any production change)

| # | Step | Owner | Evidence required |
| --- | --- | --- | --- |
| B1 | **HA-C007** Push the stacked `prod/p0x-*` branches, open PRs, merge to `main` on green CI | Operator | PR links; green `ci.yml` run on the merge commit (`main` CI is red today — Risks) |
| B2 | **HA-024** OIDC trust policy → `sub = repo:studai-ecosystem/studai-prism:environment:production` (confirm run 37365615065's denial cause first), environment `production` (required reviewers, prevent self-review, branch `main` only), branch protection on `main` — **before** B1 lands the new `build-image.yml` ([DEPLOYMENT_RUNBOOK addendum](../DEPLOYMENT_RUNBOOK_v1.md) §C) | Repo admin + IAM | Settings screenshots; trust-policy diff; a branch dispatch refused, a `main` dispatch waiting for approval |
| B3 | Pin base images by digest (Dockerfile header; repository variables `PRISM_RUNTIME_IMAGE` / `PRISM_BUILD_IMAGE`) | Engineering | Digests in the release record |
| B4 | Build the release candidate: Build Image, target `production`, from `main` | Operator + reviewer | Run id, approval, ECR scan 0 critical, image `prod/prism:<sha12>` |
| B5 | Create staging: secret `/studai/prism/aws-staging/runtime` (own database + keys), IRSA role `studai-prism-staging-runtime`, DNS `prism-staging.studai.one`, optional access restriction; decide ALB group (own `studai-staging` vs shared) ([addendum](../DEPLOYMENT_RUNBOOK_v1.md) §H) | Operator | Secret ARN (names only), role ARN, DNS record |
| B6 | Optional cluster guard `infra/aws/eks/policies/reject-unrendered-image.yaml` (Kubernetes ≥ 1.30) | Cluster admin | `kubectl apply -k` of an overlay refused with the policy message |
| B7 | ConfigMap `prism-rds-ca` from AWS's RDS CA bundle (both namespaces); `PGSSLMODE=verify-full` + `PGSSLROOTCERT` in staging first (P20) | Operator | Staging boot log without `pg_tls_unverified` |
| B8 | Staging deploy of the B4 image: migrate Job (0021–0060), rendered overlay, smoke battery | Operator | Job logs, smoke report (0 FAIL) |
| B9 | Staging rehearsals: JSON→PG copy on a synthetic store (or an isolated snapshot restore — privacy decision); old image `2b84e13c07f2` on the 0060 schema with `PRISM_PG_STORE=false`; the §G rollback; a pod with read-only root filesystem through a full assessment, admin CMS edit and CSV import | Operator + Engineering | Reconciliation `ok:true`; rollback timings; defects filed |
| B10 | **HA-C012** Production security review before launch (DAST of `/api/v1`, admin console, rater plane) on staging | Security lead | Report; findings triaged |
| B11 | **HA-C013** Manual accessibility audit with assistive technology on staging | Accessibility lead | Checklist M1–M8 results |

## C. Production release window = release + PostgreSQL cutover (HA-023)

Inputs: [RELEASE_TEMPLATE_PROD_READY.md](./RELEASE_TEMPLATE_PROD_READY.md). Commands:
[DEPLOYMENT_RUNBOOK addendum](../DEPLOYMENT_RUNBOOK_v1.md) §D–§G, [PG runbook](../PG_MIGRATION_RUNBOOK_v1.md) §3 + addenda.

| # | Step | Owner | Evidence required |
| --- | --- | --- | --- |
| C1 | Secrets prepared in production (names in RELEASE_TEMPLATE §3): `PRISM_ERASURE_PSEUDONYM_KEY`, `PUBLIC_APP_URL`, rotated SMTP (A2), Hire `ECOSYSTEM_SECRET`/`HIRE_BASE_URL`, CA bundle (B7); Razorpay incl. webhook secret only after A1 | Operator | Secret version id; key names diff (never values) |
| C2 | Announce freeze; RDS manual snapshot + EFS on-demand backup | Operator | Snapshot id, recovery point id |
| C3 | Record rollback target: current image + secret version | Operator | `kubectl get deploy` output |
| C4 | Scale to 0 → Jobs `migrate-status`, `migrate-up`, `store-migration-dry-run`, `store-migration-enforce` | Operator | Job logs; reconciliation `ok:true` |
| C5 | **Flip `PRISM_PG_STORE=true`** in the runtime secret (human; HA-023) | Operator | Secret version id |
| C6 | Apply the rendered production overlay (`kubectl diff` first) | Operator | Diff reviewed; rollout status |
| C7 | Verify: boot log (`v1_store_backend postgres`), smoke battery with admin token, PG runbook §4 checklist with a test account | Operator | Smoke report 0 FAIL; checklist results |
| C8 | Jobs `sessions-pin-forms-dry-run` → `-enforce` (P37) | Operator | Job logs |
| C9 | Append the filled release record to RELEASE_RECORDS.md; HA-023 evidence to the register | Operator | Record entry |

## D. After the release (operations)

| # | Step | Owner | Evidence required |
| --- | --- | --- | --- |
| D1 | **HA-019** First admin login + TOTP for seeded admins; set `PRISM_ADMIN_TOKEN_DISABLED=true` | Operator | Login audit rows; legacy token refused |
| D2 | **HA-022** Secret split into 8 category secrets; scope IRSA | Operator | `runtime_secrets_loaded` per secret; IAM diff |
| D3 | Size `PG_POOL_MAX` / `PG_SESSION_LOCK_POOL_MAX` within the RDS connection budget (P66) | Engineering + Operator | Values + `max_connections` math |
| D4 | Review existing duplicate payment redemptions (P12 query); keep Razorpay auto-capture on before any offer (P12) | Finance / Ops | Query output; dashboard setting |
| D5 | **HA-021** Flip `PRISM_STANDARDIZED_CORE` (explicit founder authorization) | Founder/Ops | Fresh session with `anchor_probe_presented` audit rows |

## E. Decisions that gate the flags (can run in parallel with A–D)

| # | Step | Owner | Evidence required | Unblocks |
| --- | --- | --- | --- | --- |
| E1 | **HA-C002** Level labels and sufficiency thresholds | Psychometrics lead | Signed decision | F1, F3 |
| E2 | **HA-C005** + **HA-005** Counsel review of campus disclosure/consent/sharing, support copy (DRAFT), DPDP | Counsel/DPO | Written approval | F5, F4b |
| E3 | **HA-003** Retention periods (all PROVISIONAL) | Counsel | Written approval | F12 |
| E4 | **HA-004** Employment-law review of buyer use / prohibited uses | Counsel | Written approval | Enterprise pack, employer pilot |
| E5 | **HA-C010** Aggregate-reporting privacy review | Counsel + DPO | Written approval | F6 |
| E6 | **HA-C009** Mission content and evaluator review | Content governance | Approval record | F7 |
| E7 | **HA-C004** Form equivalence (also needs E1) | Psychometrics lead | APPROVED pair with decision row | F8 |
| E8 | **HA-C003** Scenario content approval (`APPROVED_FOR_PILOT`) | Content governance | Approval record | `PRISM_RELEASE_STAGE` above STAGING |
| E9 | **HA-015** + **HA-C006** Pricing and campus contract prices | Founder + finance | Written approval | Paid offers, campus billing |
| E10 | **HA-006** (under-18) and **HA-007** (identity Level 3): decisions only; both paths stay off | Founder + counsel | Memo / approval | — |
| E11 | **HA-C011** Any SSO / SIS integration | Operator + counsel | Contracts + configuration | — |

## F. Flag flips — production, one per change window, one business day apart (HA-C001 / HA-020)

Each flip: dual-approved request in the admin flags console → operator secret
change + restart → verified in the console → smoke battery shows the route
live and everything else still 404. Rollback = flag off (ROLLOUT_PLAN §3).
Staging first (stage A), production second (stage B, one internal organization).

| # | Flag | Entry criteria (all) | Owner |
| --- | --- | --- | --- |
| F0 | Set `PRISM_RELEASE_STAGE` (e.g. `INTERNAL_CANARY`) | E8 for canary content | Product + Operator |
| F1 | `PRISM_EVIDENCE_FAIL_CLOSED` | E1 | Psychometrics lead + operator |
| F2 | `PRISM_APP_SHELL_V3` | Shell QA at 4 widths, axe clean | Product + operator |
| F3 | `PRISM_STUDENT_REPORT_V3` | F1–F2; claim registry review (E1); Journey D | Psychometrics lead + operator |
| F4 | `PRISM_ASSESSMENT_WORKSPACE_V3` | F1–F3; Journey E; replicas 1 (multi-replica checklist not met); support path: F4b or the published procedure | Engineering + operator |
| F4b | `PRISM_V3_SUPPORT_ROUTES` (with or before F4) | F2; 0058 applied; staff on `reports:review` and `accommodations:manage`; E2 for the DRAFT copy | Product + operator |
| F5 | `PRISM_CAMPUS_ENABLED` | F1–F4; E2; ROLLOUT P1–P4 (P4 = restore drill); erasure key set (C1); internal QA organization; rollback drill (ROLLOUT §6) in staging | Product + operator |
| F5b | `PRISM_JOB_WORKER` (every replica together) | F5; SMTP + `PUBLIC_APP_URL` verified; someone watching dead letters | Engineering + operator |
| F6 | `PRISM_CAMPUS_ANALYTICS` | F5; E5 | Counsel/DPO + operator |
| F6b | `PRISM_ANALYTICS_DECISION_CACHE` | F6; `PRISM_PG_STORE` on; load results reviewed | Engineering + operator |
| F7 | `PRISM_DEVELOPMENT_V2` | F5; E6 | Content governance + operator |
| F8 | `PRISM_GROWTH_ENABLED` | F1, F5; E7 | Psychometrics lead + operator |
| F9 | `PRISM_ROLE_EXPLORATION_V2` | Copy review | Product + operator |
| F10 | `PRISM_PREPARATION_V1` | 0047; prompt review; retention copy privacy review | Product + operator |
| F11 | `PRISM_V3_RATING_QUEUE` (independent) | **HA-C008** protocol + qualified raters (**HA-009**, **HA-010**); consent basis for excerpts (E2) | Psychometrics lead + operator |
| F12 | `PRISM_RETENTION_ENFORCEMENT` | E3; F5b for the scheduled passes; **HA-020** decision | Governance + operator |
| — | Stay OFF: `PRISM_IDENTITY_L3` (HA-007), `PRISM_UNDER18_PATH` (HA-006), `PRISM_DEMOGRAPHICS` (HA-005 + HA-012), `PRISM_PROCTOR_PHONE_CAM` / `_GAZE` (HA-005/HA-020), science flags (**HA-013**/**HA-014** flip-check GO) | — | — |

More than one API replica: only after every item of the PG runbook
multi-replica checklist (HA-023 done, `REDIS_URL` or sticky routing, proctor
socket stickiness, F5b on every replica), with the guarded manifest change.

## G. Pilot stages and the science programme

| # | Step | Owner | Evidence required |
| --- | --- | --- | --- |
| G1 | Stage B: test users on production, one internal organization, F1–F5 one at a time | Product | Seat ledger, invites, disclosure, privacy isolation verified |
| G2 | **HA-016** Sign design partners (terms need E4); **HA-C006** contract | Founder | Signed agreements |
| G3 | Stage C: one institution pilot (F6–F8 as gated) | Business owner | Pilot measures (ROLLOUT §4) — no validity claim |
| G4 | **HA-008** psychometrician; **HA-009/HA-010** raters; **HA-011** SME workshops; **HA-012** ethics; **HA-013** studies; **HA-017** outcome-data agreements | Founder / science lead | Per register |

## Addendum 2026-10-10 — PROD-READY Phase 8 flags

Two flags were registered OFF in Phase 8. The table above is unchanged; slot them in as follows.

| # | Flag | Entry criteria (all) | Owner |
| --- | --- | --- | --- |
| F6c | `PRISM_PILOT_REPORT_EXPORT` (admin export of the pilot technical report) | F6; template reviewed by the psychometrics lead (**HA-008**); aggregate-reporting policy (**HA-C010**) | Psychometrics lead + operator |
| — | `PRISM_DEMO_MODE` | Never in the production environment. Set only in a separate demo environment with its own database (`PRISM_DEMO_DATABASE_URL`); business decision to run sales demos | Business owner + operator |

`PRISM_UNDER18_PATH` now has real behaviour behind it (guardian-consent path, migration 0062) and stays in the "Stay OFF" row until **HA-006** and **HA-005** are closed and the DRAFT copy is replaced.

Migrations 0061 (demo-organization marker and isolation triggers) and 0062 (guardian consents) join the release after 0060.

## Addendum 2026-10-11 — PROD-READY Phase 9 flag and human dependencies

One flag was registered OFF in Phase 9. The tables above are unchanged; slot it in as follows.

| # | Flag | Entry criteria (all) | Owner |
| --- | --- | --- | --- |
| F6d | `PRISM_EMPLOYER_LND` (employer development-use workspace; also exposes the StudAI Hire hand-off interface, which answers 501) | F5 (`PRISM_CAMPUS_ENABLED`) live; employer disclosure and consent copy approved by counsel (**HA-005**); employer prohibited-use terms approved (**HA-004**); the shared-report view needs F4 (`PRISM_STUDENT_REPORT_V3`), group summaries need F6 (`PRISM_CAMPUS_ANALYTICS`, **HA-C010**), development missions need F7 (`PRISM_DEVELOPMENT_V2`); the employer organization is created by an operator (`organization_type = 'EMPLOYER'`, no route creates one) | Governance + operator |
| — | StudAI Hire evidence hand-off (connection, not a flag) | Stays unconnected (501) until **HA-025** (written decision on Prism → Hire evidence sharing, ECOSYSTEM_SEPARATION_POLICY_v1 rule 2) is closed, with HA-005 and HA-004; then a separately reviewed change ([HIRE_HANDOFF_INTERFACE.md](./HIRE_HANDOFF_INTERFACE.md) §6) | Founder + science lead |

Until F6d, the smoke battery asserts the dark checks `employer-lnd` and `hire-handoff`. Migration 0063 (`0063_employer_lnd`: two employer consent types, the employer-visibility trigger on session scopes, organization type immutable to/from EMPLOYER) joins the release after 0062. **HA-025** is a new register row (OPEN).

## Addendum 2026-10-11 — PROD-READY Phase 10 human-action preparation pack

Materials for the human steps above, in `docs/production/human-actions/`.
**No item is closed**: statuses move only to `PREPARED (materials ready)` in
the registers, and only a human with real evidence closes anything.

**Close HA-001 and HA-002 first** (step A1, A2), before any other step that
touches payments or email — including setting `RAZORPAY_WEBHOOK_SECRET`,
copying SMTP values into a new or split secret (C1, D2), or creating the
staging secret (B5).

| Step | Register items | Pack document |
| --- | --- | --- |
| A1, A2 (A3) | HA-001, HA-002 (HA-018) | [HA-001-002_CREDENTIAL_ROTATION_EVIDENCE.md](./human-actions/HA-001-002_CREDENTIAL_ROTATION_EVIDENCE.md) — evidence template; provider activity review notes feed HA-018 |
| E1 | HA-C002 | [HA-C002_LEVELS_SUFFICIENCY_DECISION_MEMO.md](./human-actions/HA-C002_LEVELS_SUFFICIENCY_DECISION_MEMO.md) |
| E2, E4, E10 | HA-C005, HA-005, HA-004 (HA-006, HA-025) | [COUNSEL_PACKET_CONSENT_STRINGS.md](./human-actions/COUNSEL_PACKET_CONSENT_STRINGS.md) — generated by `node scripts/export-consent-strings.mjs` (test `server/test/consentPacket.test.js` keeps it complete and current) |
| E10 | HA-006 | [HA-006_UNDER18_DECISION_MEMO.md](./human-actions/HA-006_UNDER18_DECISION_MEMO.md) |
| E9 | HA-015, HA-C006 | [HA-015_HA-C006_PRICING_APPROVAL_SHEET.md](./human-actions/HA-015_HA-C006_PRICING_APPROVAL_SHEET.md) |
| G4 | HA-008 | [HA-008_PSYCHOMETRICIAN_ROLE_BRIEF.md](./human-actions/HA-008_PSYCHOMETRICIAN_ROLE_BRIEF.md) |
| G4, F11 | HA-009 | [HA-009_RATER_RECRUITMENT_ONE_PAGER.md](./human-actions/HA-009_RATER_RECRUITMENT_ONE_PAGER.md) |
| B2, B8–B11, C, D2 | HA-022, HA-023, HA-024, HA-C012, HA-C013 | [RUNBOOK_CURRENCY_REVIEW.md](./human-actions/RUNBOOK_CURRENCY_REVIEW.md) — what changed, with dated addenda appended to DEPLOYMENT_RUNBOOK, PG_MIGRATION_RUNBOOK, SECRET-SPLIT-DESIGN, RUNBOOK-credential-rotation, RELEASE_TEMPLATE_PROD_READY, SECURITY_REVIEW and A11Y_MANUAL_CHECKLIST |
| F6d (connection) | HA-025 | [HA-025_HIRE_EVIDENCE_SHARING_BRIEF.md](./human-actions/HA-025_HIRE_EVIDENCE_SHARING_BRIEF.md) |

Corrections to the sequence above (records kept as written):

- **Do B2 before B1.** B2 (trust-policy `sub` → `…:environment:production`,
  environment protection) must be in place before B1 merges the new
  `build-image.yml` to `main`; the table numbers them the other way round.
- B8 and B9: the migrate Job runs **0021–0063** (43 migrations), and the old
  image is rehearsed on the **0063** schema (RELEASE_TEMPLATE Phase 10
  addendum).
