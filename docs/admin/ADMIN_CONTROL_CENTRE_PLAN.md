# StudAI Prism — Super Admin & Product Control Centre
## Required first output: audit, design, and phased plan (2026-07-13)

Status: **PLANNING BASELINE — approved deliverable set before implementation.**
Scope: replaces the read-only pilot cockpit (`/admin`, `x-admin-token`) with a
database-backed, role-based, audited administration system, in six phases.

Verified against the live codebase on 2026-07-13 (main; server 90+ test files
green per repo memory; prod = Azure App Service `studai-prism`, JSON v1 store at
`DATA_DIR=/home/data/prism`, PostgreSQL for v2 telemetry, migrations 0001–0010
applied).

---

# 1. Current Prism entity inventory

Legend — PII: **D**irect PII, **P**seudonymous, **S**ensitive-derived, **H**ashed/masked, —: none.
Lifecycle: V=view, C=create, E=edit, A=archive, X=hard delete, SUP=supersede, RET=retire, REV=revoke, ERA=privacy-erasure only.

## 1.1 Candidate-facing product (v1 store: JSON files, or `v1_*` PG tables when `PRISM_PG_STORE=true`)

| Entity | Storage | Owner module | PII | Allowed lifecycle | Required permission (new) | Required audit event |
|---|---|---|---|---|---|---|
| User account | `users.json` / `v1_users` (id, email, name, college, year, passwordHash, candidateId) | `lib/db.js` (dbJson/… twin) | **D** | V, E(name/college/year), suspend/reactivate (new state), ERA | `users:read`, `users:write`, `users:suspend`, `privacy:erasure` | `user_updated`, `user_suspended`, `user_reactivated` |
| Candidate identity spine | `v1_users.candidate_id` (write-once UUID) | `lib/identity.js` | P | V only — **never edit** | `users:read` | — |
| Assessment session | `assessments.json.sessions` / `v1_sessions` (history, evidence, ledger) | `routes/assessment.js` | **D** (user_email) + S | V, annotate, review-hold/release, mark-invalid(reason), ERA. **No transcript edit. No score edit.** | `sessions:read`, `sessions:review`, `sessions:invalidate` | `session_review_hold`, `session_marked_invalid` |
| Entitlement / payment | `assessments.json.payments` / `v1_payments` (paymentId, orderId, amount, mode, consumed) | `routes/payment.js` | S | V, grant(reason), revoke-unused(reason), reconcile. **No edit of paid identifiers/amounts** — correction ledger only | `payments:read`, `payments:grant`, `payments:revoke` | `entitlement_granted`, `entitlement_revoked` |
| Score report | `assessments.json.reports` / `v1_reports` | `routes/assessment.js` `/evaluate` | S (+userId ref) | V, resend, hold/release, regenerate presentation from same score data, SUP (reviewed correction). **Never overwrite issued version** | `reports:read`, `reports:resend`, `reports:supersede` | `report_resent`, `report_superseded` |
| Proctoring event | `assessments.json.events` / `v1_events` (tab_switch, fullscreen_exit, paste, face_absent, multiple_faces, …) | `routes/assessment.js` `/event` | S | V, reviewer-decision annotate (false-positive/escalate). Append-only | `integrity:read`, `integrity:review` | `integrity_reviewed` |
| Pre-assessment calibration | `.calibrations` / `v1_calibrations` | assessment | S | V only | `sessions:read` | — |
| Consent record | `.consents` / `v1_consents` (scopes, consent_version) | Briefing flow | S | V only; withdrawals via privacy workflow. Never edit | `consents:read` | — |
| Dispute | `.disputes` / `v1_disputes` (status: open/in_review/resolved) | (created by candidate flow) | **D** (contact) | V, assign, state transitions (expanded workflow §10), close(reason). Never delete | `disputes:read`, `disputes:manage` | `dispute_state_changed` |
| Identity verification | `.verifications` / `v1_verifications` (fullName, fathersName, dob, aadhaarLast4) | VerifyIdentity flow | **D** | V (masked by default), ERA. Never edit | `verifications:read`, `verifications:read_pii` | `verification_viewed` (PII view) |
| Device link | `.deviceLinks` / `v1_device_links` | `routes/device.js` | S | V, disconnect | `sessions:read` | — |
| Per-turn item telemetry | `.items` / `v1_items` | assessment | S | V, ERA | `sessions:read` | — |

## 1.2 v2 telemetry & psychometrics (PostgreSQL, migrations 0001–0010)

| Entity | Table | Owner module | PII | Allowed lifecycle | Permission | Audit event |
|---|---|---|---|---|---|---|
| Item / probe | `items` (status: provisional/calibrated/retired) | `db/seedItems.js`, engine | P | V, RET, SUP. **Bank frozen at 8 scenarios until first IRT calibration** — no create until unfreeze | `items:read`, `items:retire` | `item_retired` |
| Item response | `item_responses` (+`behavior` JSONB) | assessment | S | V, ERA. Append-only | `sessions:read` | — |
| Judge vote | `judge_votes` | judge panel | S | V, ERA. Append-only | `scoring:read` | — |
| Ability estimate | `ability_estimates` | executive engine | S | V, ERA | `scoring:read` | — |
| Behavioral features | `behavioral_features` | T3.1 rollup | S | V, ERA | `scoring:read` | — |
| Human rating | `human_ratings` | rater workbench | S | V, SUP (versioned correction; never silent edit) | `raters:read`, `ratings:supersede` | `human_rating_superseded` |
| Calibration run | `calibration_runs` (frozen, applied) | Python jobs | S | V, review→freeze→apply→SUP/reject. Freeze/apply = separate dual-controlled actions. One applied per run_type | `calibrations:read`, `calibrations:freeze`, `calibrations:apply` | `calibration_frozen`, `calibration_applied` |
| Audit log (assessment) | `audit_log` | every score decision | S | V, export. **Never edit/delete via admin** | `audit:read` | — |
| DIF demographics | `candidate_demographics` | dif_audit.py | S | V (fairness auditing only). Default-off collection | `psychometrics:read` | — |
| Timeline entry | `assessment_timeline` (candidate_id, flags, final_theta, is_synthetic) | Track 0 | P | V, exclude-from-calibration (is_synthetic already), ERA | `sessions:read` | — |
| Study | `studies` (preregistered/active/complete/abandoned) | Track 6 | P | V, C (preregistration), E **only before activation**, status transitions | `studies:read`, `studies:manage` | `study_status_changed` |
| Study session (arm) | `study_sessions` — **UPDATE-blocked by trigger `trg_study_sessions_no_update`** | Track 6 | P | V only. Immutable. ERA cascade only | `studies:read` | — |
| Study result | `study_results` — **append-only trigger `trg_study_results_guard_upd`** (write-once `superseded_by`) | calibration jobs | S | V, SUP only. Never edit/delete | `studies:read`, `studies:compute` | `study_result_superseded` |
| Rater | `raters` (handle, token_hash, training/qualified/suspended) | Track 6 | P/H | V, C, token rotate (once-shown), suspend/reactivate, reset training. **Never reveal token hash** | `raters:read`, `raters:manage` | `rater_created`, `rater_suspended`, `rater_token_rotated` |
| Training reference | `rater_training_refs` | Track 6 | P | V, C, review, activate, RET | `raters:manage` | `training_ref_created` |
| Training answer | `rater_training_answers` | rater flow | S | V only | `raters:read` | — |
| Session transcript (blinded) | `session_transcripts` | Track 6.3 | P | V, ERA. Never edit | `sessions:read` | — |
| Credential | `credentials` — **immutability trigger `trg_credentials_guard`** (lifecycle cols only) | Track 2 | P | V, issue, REV(reason), reissue (SUP chain), verify, audit-export. **Signed contents immutable — no edit UI for bundle/hash/signature/key_id/issued_at** | `credentials:read`, `credentials:issue`, `credentials:revoke` | `credential_issued`, `credential_revoked`, `credential_reissued` |
| External rating | `external_ratings` — **append-only trigger** | Track 4.3 | P | V, C, SUP correction, export. Never edit | `studies:manage` | `external_rating_added` |
| Practice replay | `practice_replays` (is_practice CHECK) | Track 5.1 | P | V, export, ERA, flag-abuse. **Cannot touch certified scores (structural)** | `replays:read` | `replay_flagged` |
| Team / member / team-fit session | `teams`, `team_members`, `teamfit_sessions` | Track 5.2 | P | Team: C/A, add/remove consented member (no history rewrite). Teamfit sessions: V. **No numeric fit score, ever** | `teamfit:read`, `teamfit:manage` | `teamfit_*` (existing) |

## 1.3 Content, config, ops

| Entity | Storage | PII | Allowed lifecycle | Permission | Audit event |
|---|---|---|---|---|---|
| Blog post | `content.json.posts` → migrate to `content_posts` | — | Full CMS: C/E draft, publish/unpublish, schedule, A, X (draft only), versioned | `content:read`, `content:write`, `content:publish` | `content_published` … |
| Job opening | `content.json.jobs` → `content_jobs` | — | C/E, open/close, A | `content:write` | `job_updated` |
| Job application | `content.json.applications` → `job_applications` | **D** | V, status, notes, export, X per retention policy | `content:applications` | `application_status_changed` |
| Prompt | `server/prompts/*.md|.json` (23 versioned files, immutable per audit C15) | — | V; new version via registry (draft→testing→approved→production→deprecated/rolled back). **Never edit active production prompt in place** | `prompts:read`, `prompts:manage`, `prompts:publish` | `prompt_published`, `prompt_rolled_back` |
| Scenario bank | Hard-coded arrays in `routes/assessment.js` (8 active frozen + 8 retired; mirrored in `items`) | — | V; lifecycle per §11 **after** calibration unfreeze. Referenced scenarios never hard-deleted | `scenarios:read`, `scenarios:manage` | `scenario_*` |
| Feature flags | Env vars (`PRISM_*`, 20+) + `lib/flagMap.js` preconditions + `/api/pilot/flip-check` | — | V state + verdicts; change *requests* with dual approval; **actual flips remain human env-var ops (ONE LAW: code never assigns `PRISM_*` at runtime — CI-enforced)** | `flags:read`, `flags:request` | `flag_change_requested`, `flag_change_approved` |
| AI model registry | Env (`BEDROCK_*`, `AWS_REGION`, `PRISM_JUDGE_MODELS`, `PRISM_JUDGE_SAMPLES`, drift pin `scoring/judge-fingerprint.json`) | — | V health/drift/config presence. **No credentials displayed** | `system:read` | — |
| Signing key | `PRISM_CREDENTIAL_SIGNING_KEY` env (keyId 5b702995749a7276) | — | V keyId/public key/health only. **Private key never displayed** | `credentials:read` | — |
| SMTP / Speech / Razorpay / Redis | Env vars | — | V configured/health booleans only | `system:read` | — |
| Admin identity (NEW) | `admin_users` etc. (migration 0011) | **D** | Full lifecycle §2 | `admins:manage` | `admin_*` |
| Privacy request (NEW) | `privacy_requests` (0012) | **D** | Workflow §21 | `privacy:manage` | `privacy_*` |

## 1.4 Everything else found in the audit

- **Auth**: user JWT 30d (`prism_token` in localStorage), `getJwtSecret()` fatal-if-missing in prod; admin = single `ADMIN_TOKEN` env compared with `===` (not timing-safe) in `requireAdmin` copies across 6 routers; rater `x-rater-token` sha256-hash lookup.
- **Frontend**: 26 routes in `src/App.jsx`; `/admin` = read-only cockpit (sessionStorage `prismAdminToken`); design tokens in `src/design/tokens.js` (+ CSS vars), hex ratchet test enforces token-only styling.
- **Engine**: `server/engine/` (probe selector, evidence ledger, entry estimator), `server/scoring/` (judge panel v1.5 5-sample median + position swap, dual scorer, equating, conformal), `server/psychometrics/GROWTH.md`.
- **Queues/jobs**: none in Node (fire-and-forget promises); Python calibration jobs in `calibration/` run manually/scheduled (`run_all.py`).
- **Logging**: `lib/logger.js` structured + request IDs; optional Sentry.
- **Sockets**: `/proctor-socket` (socket.io) for phone camera proctoring.
- **Tests**: `node --test`, 27 server test files incl. security, claims-ceiling, design ratchet; DB-gated tests skip without `DATABASE_URL`.
- **Deploy**: Azure App Service, prebuilt zip via `az webapp deploy` (serial deploys only; verify synced-file count), `DATA_DIR=/home/data/prism`.

---

# 2. Current admin-gap analysis

| # | Gap | Evidence | Risk |
|---|---|---|---|
| G1 | Single shared `ADMIN_TOKEN`, plaintext env, `===` comparison, no per-admin identity, no MFA, no expiry, no revocation | `requireAdmin` in pilot/psychometrics/credentials/studies/teamfit/assessment.js | Critical: one credential = full god-mode; no attribution; timing side-channel |
| G2 | No RBAC — token holder can issue/revoke credentials, create raters, write study results | routes above | Critical: violates least privilege |
| G3 | Admin actions not systematically audited (only some route-level `auditLog` calls; no admin actor recorded anywhere) | `audit_log` has no actor column | Critical: no traceability |
| G4 | Admin token stored in `sessionStorage` and sent as custom header from JS | `Admin.jsx` | Med: XSS-exfiltratable |
| G5 | Cockpit is read-only; ALL mutations are CLI-only (curl with token) | Admin.jsx notes | High: operators bypass UI safety, no confirmation/approval UX |
| G6 | No admin rate limiting beyond generic 300/min `apiLimiter`; no login-attempt lockout for admin plane | `app.js` | High: brute-force |
| G7 | No dispute workflow beyond 3 states; no assignment/notes/communication | `v1_disputes` CHECK | Med |
| G8 | No privacy-request administration (only candidate self-service `DELETE /candidate-data`); no dry-run erasure preview | Track 0.4 | High: DPDP/GDPR ops gap |
| G9 | Content (blog/careers/applications) in JSON file, no versioning, no publish workflow, edited only by deploy | `lib/content.js` | Med |
| G10 | Prompts versioned on disk but no registry UI, no test/approve/publish lifecycle tracking | `server/prompts/` | Med |
| G11 | Scenarios hard-coded in `assessment.js` (frozen by design); no lifecycle metadata surface | audit C11 | Low now (freeze is intentional); blocks §11 later |
| G12 | Feature flags = raw env vars; no registry, ownership, change history, or dual approval; flip-check exists but is advisory-only | `flagMap.js`, `/api/pilot/flip-check` | Med |
| G13 | No admin notes, saved views, exports ledger, incident records, approvals, notifications | — | Med |
| G14 | No job monitor (report/scoring/email retries are ad-hoc) | — | Med |
| G15 | No session explorer / candidate 360° view; support requires direct DB/JSON access | — | High operational |
| G16 | `v1_disputes`/`v1_verifications` PII visible to any token holder — no field-level control | — | High |
| G17 | No CSRF story for cookie-based auth (current header token is CSRF-safe but XSS-weak) | — | Design constraint for new auth |

**What is already strong (build on, don't rebuild):** append-only triggers on `study_results`/`study_sessions`/`external_ratings`/`credentials`; score clamp + server-side recompute; erasure cascade across 13+ tables; prompt-file versioning; claims-ceiling CI tests; ONE-LAW (no runtime flag assignment) test; sentinels; flip-check preconditions; blinded rater queue; pseudonymous research schema with PII schema gate test.

---

# 3. CRUD & lifecycle permission matrix

Column key: SA=Super Admin, PA=Product Admin, AO=Assessment Ops, PSY=Psychometric Admin, RES=Research Admin, RM=Rater Manager, CA=Credential Admin, FIN=Finance, CO=Content Admin, PRV=Privacy Admin, SUP=Support, AUD=Auditor.
Cell: V=view, C=create, E=edit, L=lifecycle action (state transition with reason), ✗=denied. ⚠=dual approval required.

| Entity | SA | PA | AO | PSY | RES | RM | CA | FIN | CO | PRV | SUP | AUD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Admin users/roles | VCEL⚠ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Candidates (profile fields) | VE | VE | V | ✗ | ✗ | ✗ | ✗ | V | ✗ | V | V(limited) | V |
| Candidate suspend/reactivate | L | L | L | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Sessions (view/annotate) | V | V | VL | V | V | ✗ | V | ✗ | ✗ | V | V(status only) | V |
| Session review hold/release, mark-invalid | L | L | L | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Scores | **view only — nobody edits; supersession workflow only** | | VL(supersede⚠) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Reports (resend/hold/supersede) | L | L | L(SUP⚠) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | resend | V |
| Disputes | V | VL | VCEL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V | V | V |
| Consents | V | V | V | ✗ | V | ✗ | ✗ | ✗ | ✗ | V | ✗ | V |
| Verifications (PII view) | V | V | V | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V | ✗(masked) | V |
| Proctoring events | V | V | VL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Payments/entitlements | V | V | ✗ | ✗ | ✗ | ✗ | ✗ | VCL | ✗ | ✗ | V(status) | V |
| Scenarios/items | V | V | ✗ | VCEL(RET) | V | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Prompts | V | V | ✗ | VCEL(publish⚠) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Calibration runs | V | ✗ | ✗ | VL(freeze⚠, apply⚠) | V | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Raters | V | ✗ | ✗ | V | V | VCEL | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Human ratings | V | ✗ | ✗ | VL(SUP) | V | V | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Studies | V | ✗ | ✗ | V | VCEL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Study results | V | ✗ | ✗ | V | V+SUP | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| External ratings | V | ✗ | ✗ | V | VC+SUP | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Credentials | V | V | V | ✗ | ✗ | ✗ | VCL(REV⚠ bulk) | ✗ | ✗ | ✗ | V(status) | V |
| Replays | V | V | V | ✗ | V | ✗ | ✗ | ✗ | ✗ | L(ERA) | ✗ | V |
| Teams/team-fit | V | VL | VL | ✗ | V | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| Content (blog/careers/pages) | V | V | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | VCEL | ✗ | ✗ | V |
| Job applications | V | V | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | VEL | V | ✗ | V |
| Feature flags | VL(request⚠) | V | V | V | V | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V |
| System health | V | V | V | V | V | ✗ | V | V | ✗ | ✗ | ✗ | V |
| Privacy requests / erasure | V | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | VCEL(execute⚠) | C(open on behalf) | V |
| Admin audit events | V | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | V | ✗ | **V (primary)** |

Immutable regardless of role (server-enforced, most already by DB trigger): audit logs, signed credential contents, `study_sessions` arms, historical `study_results`, applied calibration history, consent records, blinded transcripts, assessment `audit_log` decision trail.

---

# 4. Proposed admin information architecture

```
/admin/login                      (public: email+password → MFA)
/admin                            (shell: sidebar, global search, env badge,
                                   identity+roles, pending approvals, health dot,
                                   audit shortcut, secure logout)
├── Overview:      /admin/dashboard · /admin/health · /admin/pending · /admin/alerts
├── People:        /admin/candidates[/:id] · /admin/admins[/:id] · /admin/raters[/:id]
│                  /admin/support
├── Assessments:   /admin/sessions[/:id] · /admin/reports[/:id] · /admin/disputes[/:id]
│                  /admin/consents · /admin/verifications · /admin/integrity
│                  /admin/replays
├── Content bank:  /admin/scenarios[/:key] · /admin/items · /admin/prompts[/:id]
├── Psychometrics: /admin/calibrations[/:id] · /admin/reliability · /admin/dif
│                  /admin/drift · /admin/gates · /admin/sentinels
├── Human rating:  /admin/rating-queue · /admin/ratings · /admin/irr
│                  /admin/training-refs
├── Research:      /admin/studies[/:key] · /admin/external-ratings · /admin/exports
├── Credentials:   /admin/credentials[/:id] · /admin/signing-key
├── Team sim:      /admin/teams[/:id] · /admin/teamfit-sessions[/:id]
├── Commerce:      /admin/payments · /admin/entitlements · /admin/reconciliation
├── CMS:           /admin/content/blog[/:slug] · /admin/content/careers
│                  /admin/content/applications · /admin/content/pages
├── System:        /admin/flags · /admin/models · /admin/jobs · /admin/integrations
└── Governance:    /admin/audit · /admin/privacy[/:id] · /admin/retention
                   /admin/security-events · /admin/incidents
/admin/legacy-ops                 (existing read-only cockpit, temporary)
```

Every list page: server pagination, search, allowlisted filters, sort, column
select, saved views, export (permission-gated + logged), bulk safe-lifecycle
only. Every record page: identity/status/metadata/relationships/history/notes/
audit tab/available actions with a "why disabled" explanation string.

---

# 5. Proposed RBAC matrix (permission keys)

Permissions are `resource:action` strings, stored in `admin_permissions`,
granted via `admin_role_permissions`, resolved to a flat set per admin at
login, and **enforced server-side by `requirePermission()` on every endpoint**.

| Role key | Grants (summary — full list seeded in migration 0011) |
|---|---|
| `super_admin` | `*` (all), plus exclusive: `admins:manage`, `roles:manage`, `security:manage`, `retention:manage`, `flags:approve` |
| `product_admin` | `users:*`, `sessions:read/review`, `reports:*`, `disputes:*`, `content:read`, `payments:read`, `support:*`, `flags:read`, `system:read` — **excludes** `calibrations:*`, `credentials:issue/revoke`, `admins:*` |
| `assessment_ops` | `sessions:*`, `reports:read/resend`, `disputes:*`, `integrity:*`, `consents:read`, `verifications:read`, `users:read`, `support:*` |
| `psychometric_admin` | `items:*`, `scenarios:*`, `calibrations:*` (freeze/apply behind dual approval), `psychometrics:read`, `prompts:*`, `ratings:supersede`, `raters:read`, `dif:read`, `drift:read` |
| `research_admin` | `studies:*`, `external-ratings:*`, `exports:research`, `sessions:read`, `replays:read` — arm assignments & historical results immutable server-side |
| `rater_manager` | `raters:*`, `training-refs:*`, `irr:read`, `rating-queue:manage` |
| `credential_admin` | `credentials:*` (bulk revoke behind dual approval), `signing-key:read` |
| `finance_admin` | `payments:*`, `entitlements:*`, `refunds:*`, `reconciliation:*`, `users:read` |
| `content_admin` | `content:*`, `applications:*` |
| `privacy_admin` | `privacy:*` (erasure execute behind dual approval), `consents:read`, `retention:read`, `users:read`, `verifications:read_pii`, `incidents:*` |
| `support_admin` | `users:read` (masked email/college only), `sessions:read_status`, `reports:resend`, `disputes:read/create`, `support:*` — **no evidence, no research data** |
| `auditor` | `audit:read`, `*:read` on calibrations/credentials/decision trails/security events/exports — zero mutations (enforced: role has no write permission keys at all) |
| `break_glass` | `*` — separate account class: requires explicit activation with reason, hard TTL (60 min), alert email on activation, every request audited with `break_glass=true` |

Field-level rules: `users:read` returns masked email (`a***@x.com`) unless
`users:read_pii`; `verifications` PII requires `verifications:read_pii` and logs
a `verification_viewed` audit event per access.

---

# 6. Proposed database migrations

Uses existing runner (`node db/migrate.js`, `NNNN_name.sql` + `.down.sql`).
All new tables are additive; downs drop only what the up created (safe: admin
plane is new; no down touches scientific tables).

**0011_admin_foundation.sql**
- `admin_users` (admin_id UUID PK, email CITEXT-style UNIQUE lower, name, password_hash, state CHECK IN invited/active/suspended/locked/deactivated, is_break_glass BOOL DEFAULT false, failed_login_count INT, locked_until TIMESTAMPTZ, password_changed_at, invited_by, created_at)
- `admin_roles` (role_id, role_key UNIQUE, title, description, is_system BOOL) — seeded with the 13 roles
- `admin_permissions` (permission_key TEXT PK, description) — seeded catalogue
- `admin_role_permissions` (role_id FK, permission_key FK, PK both)
- `admin_user_roles` (admin_id FK, role_id FK, granted_by, granted_at, PK both)
- `admin_mfa_methods` (method_id, admin_id FK, kind CHECK('totp'), secret_encrypted TEXT, label, confirmed_at, created_at)
- `admin_sessions` (session_id UUID PK, admin_id FK, refresh_hash TEXT UNIQUE, csrf_token TEXT, ip, user_agent, created_at, last_seen_at, expires_at, revoked_at, revoke_reason, is_break_glass, break_glass_reason)
- `admin_audit_events` (event_id BIGSERIAL PK, admin_id, admin_email, roles JSONB, action TEXT, entity_type TEXT, entity_id TEXT, before JSONB, after JSONB, reason TEXT, approval_id UUID, ip, user_agent, request_id, created_at) — **trigger `trg_admin_audit_immutable` blocks UPDATE and DELETE**
- `admin_approvals` (approval_id UUID PK, action TEXT, entity_type, entity_id, payload JSONB, risk TEXT, requested_by FK, requested_reason, status CHECK pending/approved/rejected/expired/executed, decided_by, decided_reason, decided_at, expires_at, created_at) — CHECK `decided_by <> requested_by`
- `admin_notes` (note_id, entity_type, entity_id, author_admin_id, category, visibility, body TEXT, created_at) — no FK into scientific tables; notes never mutate evidence
- `admin_notifications`, `admin_saved_views`, `admin_exports` (export ledger: who/what/filter/row_count/created_at), `admin_incidents`

**0012_privacy_governance.sql**
- `privacy_requests` (request_id, candidate_email, candidate_id, kind CHECK access/export/correction/erasure/restriction/sharing_revocation, status CHECK received/verifying/dry_run/awaiting_approval/executing/completed/rejected, dry_run_plan JSONB, receipt JSONB, opened_by, approval_id, timestamps)
- `data_retention_rules` (rule_id, entity, retention_days, basis, updated_by, updated_at)
- `feature_flags` (flag_key PK, description, owner, risk CHECK low/med/high, data_gate TEXT, env_state_cache JSONB, created_at) + `feature_flag_changes` (change_id, flag_key FK, requested_state, environment, reason, requested_by, approval_id, status CHECK requested/approved/applied_by_operator/rejected, created_at) — registry + workflow; **actual enablement stays an operator env action (ONE LAW)**

**0013_registry.sql** (Phase 3)
- `prompt_definitions` (prompt_id, name UNIQUE, purpose, engine, current_production_version) + `prompt_versions` (version_id, prompt_id FK, version, language, template TEXT, variables JSONB, output_schema JSONB, model, temperature, token_limit, status CHECK draft/testing/approved/production/deprecated/rolled_back, author, approved_by, test_results JSONB, created_at) — seeded by importing `server/prompts/*` as production v1; loader gains optional DB-registry read behind `PRISM_ADMIN_PROMPT_REGISTRY` (default off; files remain source of truth until cut-over)
- `model_registry` (model_id, provider, deployment, purpose, cost_per_mtok_in/out, health JSONB, fallback, allowed_workloads JSONB, released_at, drift_state)
- `scenario_versions` (scenario_key, version, payload JSONB, status per §11 lifecycle, created_by, approved_by, published_at) — starts as read-only mirror of the frozen bank
- `report_versions` (session_id, version, report JSONB, reason, superseded_by, created_by, created_at) — every regeneration/supersession recorded; `v1_reports` keeps the current-active pointer

**0014_cms_jobs.sql** (Phase 5)
- `content_posts`, `content_post_versions`, `content_jobs`, `job_applications`, `content_pages`, `content_page_versions` (+ one-time import script from `content.json`)
- `system_jobs` (job_id, kind, entity_id, state CHECK queued/running/succeeded/failed/cancelled, attempts, last_error, idempotency_key UNIQUE, created_at, updated_at)
- `system_integrations` (name PK, status, last_ok_at, error_rate, latency_ms, config_state JSONB — booleans only, never secrets)

---

# 7. Proposed API catalogue (`/api/admin/*`)

All endpoints: cookie/JWT admin auth → `requirePermission(key)` → zod-style
input validation (hand-rolled validators, no new deps) → allowlisted
filter/sort/update fields → pagination (`?page,pageSize<=100`) → audit event on
every mutation → rate limits (`adminAuthLimiter` 5/min on auth; `adminApiLimiter`
120/min) → uniform error shape `{error, code}`.

| Namespace | Endpoints (summary) |
|---|---|
| `/api/admin/auth` | `POST /login` (pwd → mfa_required), `POST /mfa/verify`, `POST /mfa/setup` + `POST /mfa/confirm`, `POST /refresh`, `POST /logout`, `GET /me`, `GET /sessions`, `POST /sessions/:id/revoke`, `POST /password/change`, `POST /password/reset-request` + `/reset`, `POST /break-glass/activate` |
| `/api/admin/admins` | CRUD + invite flow, role grant/revoke (⚠ elevation), state transitions |
| `/api/admin/dashboard` | `GET /` metrics, `GET /alerts`, `GET /pending` |
| `/api/admin/users` | list/search, `GET /:id` (+tabs data), `PATCH /:id` (allowlist: name/college/year), suspend/reactivate, `POST /:id/entitlement` (reason), `POST /:id/resend-report`, revoke-sessions |
| `/api/admin/sessions` | list w/ filters, `GET /:id` (summary/conversation/ledger/scoring/integrity/decisions/related), `POST /:id/note`, `/review-hold`, `/review-release`, `/reprocess-scoring` (idempotent), `/mark-invalid`, `/exclude-from-calibration` |
| `/api/admin/reports` | list, `GET /:sessionId` + versions, `/resend`, `/hold`, `/release`, `/regenerate` (same score data), `/supersede` (⚠ reviewed) |
| `/api/admin/disputes` | list, detail, `POST /:id/assign`, `/transition` (state machine §10), `/note`, `/request-info`, `/second-rating`, `/resolve` |
| `/api/admin/consents` `/verifications` `/events` | read/list/export; verification PII behind `read_pii`; event reviewer decisions |
| `/api/admin/payments` | list, detail, reconcile, grant/revoke entitlement, refund workflow, export, metrics |
| `/api/admin/scenarios` `/items` | read bank + lifecycle (freeze-aware), item retire/supersede |
| `/api/admin/prompts` `/models` | registry CRUD per §12 lifecycle; publish/rollback (⚠); model health read |
| `/api/admin/calibrations` | list runs, detail, review, freeze (⚠), apply (⚠), reject, supersede |
| `/api/admin/raters` | wraps + extends existing studies plane: create (token once), rotate, suspend/reactivate, reset-training, assign, IRR, training-refs CRUD |
| `/api/admin/studies` | registry, preregister, edit-before-activation, transitions, compute, results (supersede-only), external ratings |
| `/api/admin/credentials` | list, chain, issue, revoke (reason), reissue, verify, audit-export, signing-key status |
| `/api/admin/replays` `/teamfit` | list/view/export/flag; team CRUD + archive |
| `/api/admin/content` | blog/careers/applications/pages CRUD + publish workflow + versions |
| `/api/admin/flags` | registry read + env-state + flip-check verdicts, change-request, approve (⚠) — **no direct enable endpoint** |
| `/api/admin/system` | health panels, integrations, jobs list/retry/cancel/inspect |
| `/api/admin/privacy` | requests CRUD, `POST /:id/dry-run`, `/approve` (⚠), `/execute`, receipts |
| `/api/admin/audit` | search/filter/export, entity timeline, admin timeline — read-only |

---

# 8. Security threat model (STRIDE × admin plane)

| Threat | Vector | Mitigation |
|---|---|---|
| Spoofing | Stolen admin password | Mandatory TOTP MFA; login rate limit 5/min/IP + account lock after 10 failures; suspicious-login audit events (new IP/UA) |
| Spoofing | Refresh-token theft | HTTP-only Secure SameSite=Strict cookie scoped to `/api/admin`; rotating refresh (hash stored, one-time use, reuse detection revokes family); 15-min access JWT held in JS memory only |
| Tampering | Score/credential/study mutation | No endpoints exist for these mutations; DB triggers block UPDATE/DELETE; supersession workflows are the only path, dual-approved |
| Tampering | Audit-log tampering | `admin_audit_events` UPDATE/DELETE-blocking trigger; no admin API writes to it except middleware |
| Tampering | Mass assignment | Explicit field allowlists per PATCH; body keys outside allowlist → 400 |
| Repudiation | "I didn't do that" | Every mutation records admin_id, roles, before/after, reason, IP, UA, request_id |
| Info disclosure | PII to wrong role | Field-level masking; `read_pii` permission; PII views themselves audited; global search filters results by permission before rendering |
| Info disclosure | Secrets in admin UI | System panels return booleans/health only; tests assert no `KEY|SECRET|PASSWORD|TOKEN` values in any `/api/admin/system` response |
| Info disclosure | IDOR | Every `:id` fetch re-checks permission + entity-scope; no sequential IDs exposed (UUIDs); auditor smoke tests cross-role access |
| DoS | Brute force / scraping | Per-route rate limits; export size caps; pagination caps (pageSize ≤ 100) |
| Elevation | Role self-grant | `admins:manage` = super_admin only; privilege elevation requires dual approval (`decided_by <> requested_by` DB CHECK); break-glass separate account + TTL + alert |
| Elevation | SQL injection | Parameterised queries only; filter/sort columns from hard allowlist maps, never request strings |
| Elevation | CSRF | SameSite=Strict cookie + per-session CSRF token required in `x-admin-csrf` header on every mutation |
| Injection | Stored XSS / prompt injection via candidate text | Candidate transcripts rendered as text (React escapes); export CSV formula-escape (`'` prefix on `=+-@`); transcripts never fed to admin-side AI |
| Supply chain | New deps | Phase 1 adds zero npm dependencies (TOTP = RFC 6238 via node:crypto; cookies parsed manually) |

---

# 9. Phased backlog

**Phase 1 — Admin security foundation** *(this session)*
0011 migration; RBAC seed; TOTP MFA; login/refresh/logout/sessions; audit middleware; bootstrap super-admin script; `/api/admin` skeleton + dashboard counts; React `/admin/login`, shell, dashboard; legacy cockpit → `/admin/legacy-ops`; tests (authN/authZ/audit/rate-limit/immutability). `ADMIN_TOKEN` untouched for existing planes; new flag `PRISM_ADMIN_CONSOLE` (default **off**) gates the whole new plane.

**Phase 2 — Core product administration.** Candidates list/detail (tabs), sessions explorer + safe actions, reports + versions (0013 `report_versions` pulled forward if needed), disputes workflow, consents/verifications/events, payments + entitlements, global search v1.

**Phase 3 — Scientific administration.** Scenario bank read surface (freeze-aware) + item lifecycle, prompt registry (0013), psychometrics dashboards (reuse `/api/psychometrics` + pilot data), calibration lifecycle with dual approvals, rater management (supersedes CLI), studies + external ratings.

**Phase 4 — Credentials & advanced.** Credential console (issue/revoke/reissue/chain/audit-export/signing-key status), replays, team-fit, research exports with export ledger.

**Phase 5 — CMS & system.** 0014; content import from JSON; blog/careers/applications/pages with versioned publishing; feature-flag registry + change workflow; model registry; job monitor; integration health.

**Phase 6 — Privacy & enterprise governance.** Privacy request workflow with dry-run erasure planner (extends existing cascade), retention rules, dual-approval hardening across all ⚠ actions, advanced audit views, security-event alerting, export controls. Then: default `PRISM_ADMIN_CONSOLE=on`, migrate remaining `x-admin-token` planes to admin-session auth, retire `ADMIN_TOKEN` to break-glass-only.

Each phase = its own branch + commit series; server tests green before merge (repo rule).

**Explicit constraints honoured throughout:** scenario bank stays frozen (≤8) until first IRT calibration; no facial/voice/emotion scoring anywhere in admin analytics; every score-affecting decision keeps writing `audit_log`; all flags default off; ONE LAW — the admin console never flips `PRISM_*` at runtime.

---

# 10. Files created / modified / deprecated (Phase 1 concrete list)

**Create (server):**
- `server/db/migrations/0011_admin_foundation.sql` + `.down.sql`
- `server/lib/adminAuth.js` (passwords, TOTP RFC 6238, access JWT, refresh sessions, cookies, CSRF, permission resolution)
- `server/lib/adminAudit.js` (audit writer + Express middleware)
- `server/routes/admin/index.js` (mount, guards, rate limits)
- `server/routes/admin/auth.js`
- `server/routes/admin/admins.js` (bootstrap-minimal: me/list; full CRUD later phase)
- `server/routes/admin/dashboard.js`
- `server/db/seedAdmin.js` (bootstrap first super admin from env, one-shot)
- `server/test/adminAuth.test.js`, `server/test/adminRbac.test.js`

**Create (client):**
- `src/pages/admin/AdminLogin.jsx`, `src/pages/admin/AdminShell.jsx`, `src/pages/admin/AdminDashboard.jsx`, `src/lib/adminApi.js`

**Modify:**
- `server/app.js` (mount `/api/admin` behind `PRISM_ADMIN_CONSOLE`)
- `server/lib/security.js` (admin limiters)
- `src/App.jsx` (routes `/admin/login`, `/admin` shell, `/admin/legacy-ops`)
- `server/.env.example` (new vars, documented, all default-off)

**Deprecate (not yet removed):**
- `src/pages/Admin.jsx` → served at `/admin/legacy-ops` until Phase 2 parity
- `ADMIN_TOKEN` header planes (`/api/pilot`, `/api/psychometrics`, admin halves of studies/credentials/teamfit) → retired in Phase 6

**Never removed:** scientific tables, triggers, prompts files, erasure cascade, claims/one-law/design-ratchet test suites.
