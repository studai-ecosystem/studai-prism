# College pilot onboarding runbook (operator and staff)

PROD-READY Phase 8 item 2 ([charter](./PROD_READY_CHARTER_2026-10.md) Phase 8). This
runbook takes one college through a Prism pilot, from the organization record to
data deletion at the end. Every step names the code it relies on. Where the code
has no path for a step, this page says so and names the manual alternative.

**Read first.** Nothing on this page turns a feature flag on. Flags are flipped
only by humans, in the order and with the evidence in
[GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) (section F) and
[ROLLOUT_PLAN.md](../campus/ROLLOUT_PLAN.md) §3 (HA-C001 / HA-020). Where a step
says "needs flag X", it works only after a human has turned X on in that
environment. Human actions marked PENDING are open in
[HUMAN_ACTION_REGISTER.md](../remediation/HUMAN_ACTION_REGISTER.md) or
[CAMPUS_HUMAN_ACTIONS.md](../campus/CAMPUS_HUMAN_ACTIONS.md); this page never
closes them.

---

## 1. Scope and prerequisites

### 1.1 What a pilot is, and what it is not

- Prism is "an evidence-based workplace-readiness assessment for graduating
  students, used for development and structured interview preparation — not
  automated rejection" ([JOB_FAMILY_SCOPE_v1.md](../JOB_FAMILY_SCOPE_v1.md) §1).
- Claims cover only two job families: Graduate Business Operations and
  Customer-Facing Growth (§2). Technical, clinical and specialist roles are out of
  scope (§3).
- **Prism is never a hiring screen, a ranking, a pass/fail cut-off or a
  job-performance predictor.** The institution agrees to
  [PROHIBITED_USES_POLICY_v1.md](../PROHIBITED_USES_POLICY_v1.md) (DRAFT, HA-004
  PENDING). It must not use a result as the sole or primary basis for any
  decision, build rankings, set cut-offs, read "Insufficient evidence" as a low
  score, or infer anything from accommodation status.
- No price is set in the application. Contract prices are a human approval
  (HA-015, HA-C006 PENDING). `server/routes/admin/organizations.js` has no price
  input.

### 1.2 Flags involved (all registered OFF in `server/lib/flagRegistry.js`)

| Flag | What it gates for a pilot | GO_LIVE row |
| --- | --- | --- |
| `PRISM_EVIDENCE_FAIL_CLOSED` | Evidence status vocabulary (SUFFICIENT / PROVISIONAL / INSUFFICIENT_EVIDENCE / HUMAN_REVIEW_REQUIRED) | F1 |
| `PRISM_APP_SHELL_V3` | `/app/*` student shell, `/api/v1` student routes, invite acceptance page | F2 |
| `PRISM_STUDENT_REPORT_V3` | Student Report V3, institution report reads | F3 |
| `PRISM_ASSESSMENT_WORKSPACE_V3` | V3 assessment player | F4 |
| `PRISM_V3_SUPPORT_ROUTES` | Human review, accommodation and identity-check routes (section 8) | F4b |
| `PRISM_CAMPUS_ENABLED` | Every `/api/v1/organizations/*` route and `/campus/*` page (`server/domain/permissions/middleware.js` `requireCampus`) | F5 |
| `PRISM_JOB_WORKER` | Queued CSV-invite emails, reminders, time-based seat release | F5b |
| `PRISM_CAMPUS_ANALYTICS` | Aggregate analytics and cohort reports (section 7) | F6 |
| `PRISM_ANALYTICS_DECISION_CACHE` | Cost of analytics only; same output | F6b |
| `PRISM_DEVELOPMENT_V2`, `PRISM_GROWTH_ENABLED` | Development missions; reassessment and growth | F7, F8 |
| `PRISM_RETENTION_ENFORCEMENT` | Scheduled retention passes (section 9) | F12 |
| `PRISM_UNDER18_PATH` | Stays OFF (HA-006 PENDING) | "Stay OFF" row |
| `PRISM_PILOT_REPORT_EXPORT` | Admin export of the pilot technical report (section "Pilot technical report export") | not yet in GO_LIVE; after F6, with HA-008 / HA-C010 |
| `PRISM_DEMO_MODE` | Demo seed in a separate demo environment only — never production | never in the production environment |

### 1.3 Human actions that gate a paid pilot (all PENDING)

Follow [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) top to bottom. The rows a
college pilot depends on are:

- **A1–A3** credential rotation and incident closure (HA-001, HA-002, HA-018).
- **C1–C9** the release and PostgreSQL cutover (HA-023). C1 includes
  `PRISM_ERASURE_PSEUDONYM_KEY` and `PUBLIC_APP_URL`.
- **E1** HA-C002 (level labels and thresholds); **E2** HA-C005 + HA-005
  (disclosure, consent and support copy, all DRAFT); **E3** HA-003 (retention
  periods); **E4** HA-004 (prohibited uses); **E5** HA-C010 (aggregate
  reporting); **E9** HA-015 + HA-C006 (pricing, contract).
- **G1** stage B with one internal organization, then **G2** HA-016 (signed
  design partners) and **G3** stage C, one institution pilot.

---

## 2. Organization creation

### 2.1 What the code offers today

**The admin console cannot create an organization.** The admin router
`server/routes/admin/organizations.js` (mounted at `/api/admin/organizations` in
`server/routes/admin/index.js`) offers only:

| Route | Admin permission | What it does |
| --- | --- | --- |
| `GET /api/admin/organizations` | `organizations:read` | Lists organizations |
| `GET /api/admin/organizations/:orgId` | `organizations:read` | Membership counts, sponsorship pools, contracts, invoice exports |
| `POST /api/admin/organizations/:orgId/contracts` | `contracts:manage` | Creates a DRAFT contract (reason of 10+ characters) |
| `POST /api/admin/organizations/contracts/:id/activate` | `contracts:manage` | Mints the sponsorship pool (section 5) |
| `POST /api/admin/organizations/contracts/:id/close` | `contracts:manage` | `ENDED` or `CANCELLED` |

The console screen is `src/features/admin/AdminOrganizationsPage.jsx` at
`/admin/organizations` (nav entry in `src/pages/admin/AdminShell.jsx`). It lists
organizations and creates contracts. It has no "new organization" form.

`createOrganization` exists only in the repositories
(`server/domain/organizations/repository.pg.js` / `.memory.js`). It is called
only by tests. No route or script creates the **first organization owner** either:
`upsertMembership` is called only by invite acceptance
(`server/domain/memberships/inviteService.js`) and role change
(`server/domain/campusAdmin/service.js` `changeRole`). An invite needs an inviter
who already holds an ACTIVE membership with `team.manage`.

ROLLOUT_PLAN step 5 requires "one internal QA organization created in the
console". The console cannot do that today, so this is an open gap.

### 2.2 Manual path until a reviewed endpoint exists

Record the choice as a decision before the first pilot. This is a
production-database write, so a human runs it (charter §1 law 1):

1. Insert one `organizations` row (migration
   `server/db/migrations/0026_campus_organizations.sql`): `name`, a unique `slug`,
   `organization_type` = `COLLEGE` (or `UNIVERSITY`), `status` = `ACTIVE`, and
   optionally `country` and `timezone`.
2. Bootstrap the first owner in one of two ways:
   - **Preferred:** insert an `organization_invites` row (migration 0027) with
     `role` = `ORG_OWNER`, `status` = `PENDING`, `token_hash` = the SHA-256 hex
     of a random token (`hashToken` in `inviteService.js`), `invited_by`, and
     `expires_at`. Send the owner the link `${PUBLIC_APP_URL}/app/campus-invite/<token>`
     (`server/domain/campusStore/defaultContext.js` `inviteUrlFor`). On
     acceptance, the consent, membership, workspace and invite status are
     written together in one transaction (`acceptInvite`).
   - **Alternative:** insert the membership row directly. This skips the consent
     record and the `CAMPUS_ADMIN` workspace that acceptance creates.
3. Write the reason, the operator and the row ids into the change record. A
   direct insert writes no `admin_audit_events` row.

Contract and pool actions write `admin_audit_events` rows through
`server/lib/adminAudit.js`: `campus_contract_created`,
`campus_contract_activated` and `campus_contract_closed`.

### 2.3 Admin roles that can act (`server/lib/adminRbac.js`)

| Admin role | `organizations:read` | `contracts:manage` |
| --- | --- | --- |
| `super_admin`, `break_glass` | yes (`*`) | yes (`*`) |
| `finance_admin` | yes | yes |
| `product_admin` | yes | no |
| `auditor` | yes (read-only) | no |

Admin login with TOTP for seeded admins is GO_LIVE D1 (HA-019, PENDING).

---

## 3. Organization roles

### 3.1 Roles and what each can do

The roles are defined in `server/domain/permissions/roles.js`, the matrix in
`server/domain/permissions/matrix.js`, and evaluation in `can.js`. A missing cell
means deny, and a denial is a 404.

Scope values: ALL = the whole organization. ASSIGNED = the cohorts listed in
`membership.scope.cohortIds`. DEPARTMENT = the membership's department. LIMITED =
allowed, with restrictions. PERMISSION = only if granted explicitly.

| Permission | ORG_OWNER | PLACEMENT_DIRECTOR | PLACEMENT_OFFICER | DEPARTMENT_COORDINATOR | FACULTY_MENTOR |
| --- | --- | --- | --- | --- | --- |
| `org.manage` (structure, onboarding, analytics settings) | ALL | LIMITED | — | — | — |
| `team.manage` (invite staff, change roles, remove members) | ALL | ALL | LIMITED (faculty mentors only) | — | — |
| `students.read` / `cohorts.read` | ALL | ALL | ASSIGNED | DEPARTMENT | ASSIGNED |
| `students.manage` (cohorts, CSV import, student invites) | ALL | ALL | ASSIGNED | DEPARTMENT | — |
| `assignments.write` | ALL | ALL | ALL | LIMITED | — |
| `students.sponsored_result.read` / `reports.read` / `analytics.read` | ALL | ALL | ASSIGNED | DEPARTMENT | ASSIGNED |
| `exports.cohort` | ALL | ALL | PERMISSION | PERMISSION | — |
| `billing.read`, `org.settings.read`, `integrations.read` | ALL | ALL | — | — | — |

- `STUDENT` holds only OWN on `assignments.read` and
  `students.sponsored_result.read`.
- `PRISM_REVIEWER` and `STUDAI_ADMIN` are platform roles. They cannot be invited
  (`INVITABLE_ROLES`).
- `personal_result.read` is granted to no organization role. Personal results are
  never visible through the institution.

### 3.2 Staff invites (`server/domain/memberships/inviteService.js`)

1. A staff member with `team.manage` opens **Members** (`/campus/:orgId/members`)
   and invites by email. The API is `POST /api/v1/organizations/:orgId/invites`
   (`server/routes/v1/organizations.js`), body
   `{ role, emails[1..200], cohortId?, departmentId? }`.
2. Rules enforced by `assertMayInvite`:
   - Only an ACTIVE `ORG_OWNER` (or `STUDAI_ADMIN`) can invite an `ORG_OWNER`.
   - A LIMITED inviter can invite only `FACULTY_MENTOR`.
   - A scoped inviter cannot hand out a cohort or department outside their own
     reach.
3. Invites expire after `INVITE_TTL_DAYS` = 14. Only the token's hash is stored,
   and the response never contains the token.
4. The email is sent only when mail is configured and `PUBLIC_APP_URL` is set
   (`defaultContext.js`). Otherwise the invite's delivery is `NOT_SENT`, and
   because the link is never returned, the fix is to configure mail and then
   **resend**: `POST /api/v1/organizations/:orgId/invites/:inviteId/resend`. A
   resend issues a new link and revokes the old one.
5. Role changes (`PATCH /api/v1/organizations/:orgId/members/:membershipId`) and
   removals (`DELETE …/members/:membershipId`) need `team.manage` with full
   scope.
   - Only an owner can grant or remove owner access.
   - You cannot change your own role or remove yourself.
   - The last ACTIVE owner cannot be removed or demoted ("An organization needs
     at least one owner.").
   - Org audit actions written: `role.changed`, `member.removed`,
     `invite.resent`.

---

## 4. Student CSV import

The parser is `server/domain/campusAdmin/csv.js` (through `csvRosterAdapter` in
`server/domain/integrations/sis/index.js`). The service is
`server/domain/campusAdmin/service.js` (`previewImport`, `commitImport`,
`runCommit`). The routes are in `server/routes/v1/campusAdmin.js`, and the screen
is `/campus/:orgId/cohorts/import` (`src/features/campus/pages/CampusImportPage.jsx`).
It needs `PRISM_CAMPUS_ENABLED` and `students.manage`.

### 4.1 File format

| Item | Rule (from code) |
| --- | --- |
| Format | RFC 4180 CSV with **comma** separator, quoted fields, `""` escapes and CRLF or LF line ends. Blank lines are ignored |
| Encoding | UTF-8. A leading BOM is stripped. The browser reads the file as text (UTF-8) and sends it as the JSON field `csv` |
| Header | Row 1, matched case-insensitively against the aliases below |
| Required column | `email` (`MISSING_EMAIL_COLUMN` without it) |
| Cohort | A `cohort` column naming an existing ACTIVE cohort the uploader can reach (case-insensitive), **or** a default cohort chosen in the wizard (`defaultCohortId`) |
| Limits | 2,000 data rows (`IMPORT_LIMITS.maxRows`) and 1,000,000 bytes (`maxBytes`). The JSON body limit is 2 MB (`server/app.js`) |
| Cell cleaning | Control characters become spaces and whitespace is collapsed. Name and department are cut to 160 characters, student identifier to 80, cohort to 160 |

Header aliases (`ALIASES`):

| Column | Accepted header names |
| --- | --- |
| `email` | email, e-mail, email address, student email |
| `name` | name, full name, student name |
| `student_identifier` | student_identifier, student id, student_id, roll number, roll no, enrolment number, enrollment number |
| `department` | department, dept, branch |
| `cohort` | cohort, cohort name, section, batch |

`name`, `student_identifier` and `department` are optional. They are validated
and kept in the import rows for the preview, but the commit invites by **email
only**. They are not written to the student's account or the invite (`runCommit`).

### 4.2 Errors

- **File-level** (nothing is stored): `EMPTY_FILE`, `MISSING_EMAIL_COLUMN`,
  `TOO_MANY_ROWS`, "larger than 1 MB".
- **Row-level** (shown in the preview, and the row is skipped at commit):
  `EMAIL_MISSING`, `EMAIL_INVALID`, `DUPLICATE_IN_FILE`, `UNKNOWN_COHORT`,
  `COHORT_MISSING`.
- **Row actions:**
  - `INVITE`.
  - `ALREADY_MEMBER`: an existing ACTIVE student the uploader can see. They are
    linked to the cohort, never duplicated.
  - `ERROR`.
  - A `pendingInvite` marker shows that the student already has a pending invite.

### 4.3 Operator steps

1. Create the cohorts first (`POST /api/v1/organizations/:orgId/cohorts`, or the
   **Cohorts** page).
2. **Preview (dry run):** upload the file.
   - API: `POST /api/v1/organizations/:orgId/imports/students` with
     `{ fileName?, csv, defaultCohortId? }`.
   - This creates a `student_import_jobs` row with status `PREVIEW` and one
     `student_import_rows` row per line. Nothing is sent.
   - Org audit action: `import.previewed`.
   - Read the rows again with `GET …/imports/:jobId`, which is paged.
3. Fix the errors in the file, or accept that those rows will be skipped.
4. **Commit:** `POST …/imports/:jobId/commit` with an `Idempotency-Key` header
   (without it: 428 `IDEMPOTENCY_KEY_REQUIRED`).
   - Replaying the same key returns the committed job (200). A different key
     gets `409`.
   - A failed commit frees its claim, so the same key can be retried.
   - Re-importing a student revokes their older pending link, so only the new
     link works.
   - Org audit action: `import.committed`. The uploader gets an
     `IMPORT_COMPLETE` notification.
5. **Invite dispatch:**
   - **`PRISM_JOB_WORKER` off:** every invite email is sent inside the commit
     request (`delivery: 'SEND'`).
   - **`PRISM_JOB_WORKER` on (and a store with a jobs table):** one
     `campus.invite_email` job per invite (`delivery: 'QUEUED'`). The real link
     is issued at send time.
   - Set the flag on every replica together (P54). Watch dead letters in
     **Admin → System → Job queue** (`/api/admin/job-queue`, `system:read`;
     retry and cancel need `jobs:manage`, which only `super_admin` holds).
   - Delivery is at-least-once (Risks, P53).
6. Check the roster on **Students**, including the `INVITED` rows.
7. **Raw-cell retention:** the uploaded cells (emails, names, roll numbers) stay
   in `student_import_rows.raw` / `.normalized` until they are purged
   (`server/domain/privacy/importRowRetention.js`).
   - They are purged `IMPORT_ROW_RAW_RETENTION_DAYS` = 30 days (PROVISIONAL,
     HA-003 PENDING) after the job is COMMITTED or CANCELLED.
   - Purge runs: `npm --prefix server run retention:import-rows` (dry run by
     default; an enforce run needs a dry-run receipt within 24 h), or job
     `retention.import_rows` (needs `PRISM_RETENTION_ENFORCEMENT` and
     `PRISM_JOB_WORKER`).
   - **No route cancels a `PREVIEW` job**, so an uncommitted preview is never
     purged by the timer. Commit or abandon deliberately, and list abandoned
     previews at pilot end (section 9).

### 4.4 Minimal example (synthetic)

```csv
email,name,student_identifier,department,cohort
demo.student.001@example.invalid,Demo Student One,DEMO-0001,Demo Department,Demo Cohort A
demo.student.002@example.invalid,Demo Student Two,DEMO-0002,Demo Department,Demo Cohort A
demo.student.003@example.invalid,"Student, Demo Three",DEMO-0003,Demo Department,Demo Cohort B
```

"Demo Cohort A" and "Demo Cohort B" must exist as ACTIVE cohorts before the
preview.

---

## 5. Sponsorship pools (seats)

The code is in `server/domain/billing/service.js`,
`server/domain/entitlements/ledger.js` and `resolver.js`.

1. **Draft contract** (admin, `contracts:manage`):
   `POST /api/admin/organizations/:orgId/contracts` with `name`, `termStart`,
   `termEnd` (YYYY-MM-DD), `includedSeats` (1–100,000), `billableEvent`,
   `components` (yes/no flags only), and `reason`.
   - `billableEvent` is one of `ASSESSMENT_STARTED`, `ASSESSMENT_COMPLETED`
     (default) or `REPORT_GENERATED`.
   - The components are `platformFee`, `perCompletedAssessment`, `reassessment`,
     `reviewAllowance`, `customIntegrations` and `validationServices`. No
     amounts are entered.
2. **Activate:** `POST /api/admin/organizations/contracts/:id/activate`.
   - This mints one `INSTITUTION_SPONSORSHIP` entitlement with the same id as the
     contract, product `PRISM_CAMPUS_ASSESSMENT`, quantity = included seats, and
     a validity window = the contract term. It then sets the pool to ACTIVE.
   - Activation is idempotent. It is refused if the term has already ended.
3. **Assignment:** a pool is organization-wide. It is not assigned to a cohort or
   an assignment. Any ACTIVE `STUDENT` member can draw a seat when starting a
   sponsored assessment (`resolveCampus`).
   - The start is refused with `NOT_A_MEMBER`, `ENTITLEMENT_EXHAUSTED`,
     `ENTITLEMENT_EXPIRED` or `ENTITLEMENT_REQUIRED`.
   - Personal and sponsored pools never mix.
4. **Ledger:** a start writes `RESERVED`. The billable event writes `CONSUMED`. An
   unfinished start can be `RELEASED`.
   - A failed start keeps its reservation, and the retry reuses it (K69).
   - Closing or cancelling an assignment
     (`POST /api/v1/organizations/:orgId/assignments/:id/status`) releases the
     RESERVED seats of unfinished starts (K79). The org audit row is
     `assignment.closed` / `assignment.cancelled` with `seatsReleased`.
   - With `PRISM_JOB_WORKER` on, `campus.seat_release` releases them on its own
     more than 24 h (and less than 30 days) after the window ends. The org audit
     row is `assignment.seats_released`, actor `system:job-runner` (P57).
   - CONSUMED seats are never touched.
5. **Close the contract:** `POST /api/admin/organizations/contracts/:id/close`
   with `ENDED` (pool becomes EXPIRED) or `CANCELLED` (pool becomes REVOKED).
   Starts already in progress still finish and settle.
6. **Who sees seats:**
   - Admins see seats in `/admin/organizations/:orgId` (included / in use /
     available).
   - `ORG_OWNER` and `PLACEMENT_DIRECTOR` see them on **Billing**
     (`/campus/:orgId/billing`, `GET /api/v1/organizations/:orgId/billing`,
     `billing.read`).
   - Students never see seat counts. They see a sponsored assignment card naming
     the sponsor, and the disclosure in section 6.
   - Institution-required candidates never pay (prohibited use 8).

---

## 6. Student disclosure flow

1. **Account and age gate.** The student needs an account to accept an invite
   (the invite page `/app/campus-invite/:token` sits behind `AuthGuard`).
   - Registration (`POST /api/auth/register`, `server/routes/auth.js`) requires
     `ageConfirmed: true`. Without it: 400 `AGE_CONFIRMATION_REQUIRED`, "Prism is
     currently available to candidates aged 18 or older".
   - The declaration is stored with version `AGE_DECLARATION_VERSION` =
     `age-18plus-v1` (`server/lib/sharedConstants.js`). The text is
     `AGE_DECLARATION_TEXT`, shown on `src/pages/Auth.jsx`.
   - Older accounts confirm through `POST /api/auth/confirm-age`.
   - No date of birth is collected.
2. **Invite preview.** `GET /api/v1/org-invites/:token`
   (`server/routes/v1/orgInvites.js`) is public and rate-limited. It returns the
   organization, the role and `disclosureVersion`.
3. **Acceptance.** `POST /api/v1/org-invites/:token/accept` with
   `{ acknowledged: true }`, signed in with the invited email address
   (`INVITE_EMAIL_MISMATCH` otherwise).
   - It writes a `CAMPUS_SPONSORSHIP_DISCLOSURE` consent record with copy version
     `CAMPUS_DISCLOSURE_COPY_VERSION` = `campus-disclosure.v1-draft`
     (`server/domain/sharing/copyVersions.js`).
   - It also creates the ACTIVE membership, the `CAMPUS_STUDENT` workspace and the
     cohort membership, all in one transaction.
   - The student can decline with `POST …/decline`.
4. **What the institution can and cannot see.** The copy is in
   `src/lib/copy/privacy.js`, as `CAMPUS_CAN_SEE` and `CAMPUS_CANNOT_SEE`. It is
   DRAFT, HA-C005 PENDING.

   | The institution can see | It cannot see unless the student shares it |
   | --- | --- |
   | Whether the student started or completed assessments it assigned | Assessments the student bought and their reports |
   | Results of assessments it sponsored | Private role exploration |
   | Development activities it assigned, and completion | Personal practice |
   | Sponsored reassessment results, when valid to compare | Anything with another institution or employer |
   | Group-level summaries that never single the student out | Activity in other StudAI products |

5. **Per-assessment disclosure.**
   - Before a sponsored start the student acknowledges
     `CAMPUS_ASSESSMENT_DISCLOSURE` with version
     `campus-assessment-disclosure.v1-draft`
     (`POST /api/v1/assessment-assignments/:id/acknowledge`,
     `server/domain/assessments/assignmentService.js`).
   - A stale version gets 409 "The disclosure has changed".
   - Staff can read the exact text with
     `GET /api/v1/organizations/:orgId/consent-preview`.
6. **Sharing personal results (student only).**
   - `POST /api/v1/me/share-grants` (`server/routes/v1/reports.js`; needs
     `PRISM_APP_SHELL_V3` + `PRISM_STUDENT_REPORT_V3`) creates a LINK or an
     ORGANIZATION share, SUMMARY or FULL, for 1–180 days.
   - Only the owner can create a share. An organization share works only while
     the student is an ACTIVE student there.
   - Revoke with `DELETE /api/v1/me/share-grants/:id` or the **Sharing** page.
   - Staff cannot create shares on a student's behalf.

### Under-18 students

Current behaviour, from the code: registration refuses anyone who does not
confirm they are 18 or older (step 1 above). `PRISM_UNDER18_PATH` is registered
OFF. HA-006 (decision memo) and HA-005 (DPDP review) are PENDING.

A guardian-consent path exists **dark** behind `PRISM_UNDER18_PATH` (PROD-READY
Phase 8; [AGE_GATING_POLICY_v1.md](../AGE_GATING_POLICY_v1.md) addendum
2026-10-10). Do not offer it to a college: its copy is DRAFT
(`server/domain/guardian/copy.js`, `src/lib/copy/guardianConsent.js`) and the
flag stays OFF until HA-006 and HA-005 are closed by humans. What it would do,
only once a human turns the flag on:

1. A learner registers with `under18: true` and a guardian's email address
   (`POST /api/auth/register`, `server/routes/auth.js`). The account is created
   without an age declaration, so the existing commencement gate keeps blocking
   every assessment start (403 `AGE_CONFIRMATION_REQUIRED`).
2. The guardian receives a single-use link (`/guardian-consent/:token`; only a
   hash is stored; needs SMTP and `PUBLIC_APP_URL`, otherwise the response says
   `emailSent: false` and the learner can resend with
   `POST /api/auth/guardian-consent/resend`).
3. The guardian reads the draft text and agrees or declines
   (`/api/guardian-consent/:token`). Agreeing writes a declaration whose basis is
   the guardian consent; withdrawing (same link) removes it and blocks starts
   again.
4. Data kept: the guardian's email, the copy version, the state and its times
   (`guardian_consents`, migration 0062). Deleted with the learner's account;
   requests never verified are deleted 30 days after they ended
   (`guardian_consents_unverified`, PROVISIONAL, HA-003).

There is no registration-form control for the under-18 option yet (the form
cannot know a server flag before sign-in); it is part of the HA-006 decision.

---

## 7. Report access

| Reader | What they can read | Code |
| --- | --- | --- |
| Student | Their own reports, in the session's workspace | `GET /api/v1/assessment-sessions/:sessionId/report` (`server/routes/v1/reports.js`) |
| Institution staff with `students.sponsored_result.read` in scope | One **sponsored** report of a student in their scope. Each read is audited in `data_access_audit_events` before the data is returned | `GET /api/v1/organizations/:orgId/sessions/:sessionId/report` (`server/routes/v1/organizations.js`, `server/domain/scopes/sessionScope.js` `authorizeSponsorRead`) |
| Institution staff, personal session | Only through the student's active share grant to the organization, while the student is an ACTIVE student there and within the reader's scope. Disclosure is SUMMARY or FULL | same |
| Staff with `analytics.read` / `reports.read` | Aggregates only, with no student list, ranking, composite or average (`server/domain/analytics/service.js`). Needs `PRISM_CAMPUS_ANALYTICS` | `/api/v1/organizations/:orgId/analytics/*`, `POST …/reports/cohort`, `POST …/analytics/exports` |

**Small-group suppression.**

- `DEFAULT_MIN_GROUP_SIZE` = 10, with a floor of `MIN_GROUP_FLOOR` = 5
  (`server/domain/analytics/service.js`).
- Each organization's value is stored in `organization_analytics_settings`
  (migration `0037_campus_analytics_settings.sql`, `CHECK BETWEEN 5 AND 1000`).
- Only a full-scope `org.manage` holder (`ORG_OWNER`) can change it, through
  `PATCH /api/v1/organizations/:orgId/settings/analytics`. The change is audited
  as `analytics.settings.updated`.
- A group below the minimum is suppressed whole, with reason `SMALL_GROUP`.
- The aggregate-reporting review is HA-C010 (PENDING).

**Labels, and what staff must say about them.**

- The evidence statuses are `SUFFICIENT`, `PROVISIONAL`, `INSUFFICIENT_EVIDENCE`
  and `HUMAN_REVIEW_REQUIRED` (`server/domain/evidence/levels.js`). The UI
  labels them "Sufficient evidence", "Provisional", "Insufficient evidence" and
  "Awaiting review" (`src/lib/copy/evidence.js`).
- The level labels themselves are `LEVEL_LABELS_STATUS = 'PROVISIONAL'` until
  HA-C002 (PENDING).
- What staff must say:
  - "Provisional" means the label and its thresholds are not final.
  - "Insufficient evidence" means not measured. It is **not** a low score
    (prohibited use 4).
  - "Awaiting review" means a person still has to review the evidence.
- No level is a pass mark.

**What staff must not do with reports** (PROHIBITED_USES_POLICY_v1; JOB_FAMILY_SCOPE_v1 §3):

- Do not rank, sort or shortlist students by Prism results, or build
  leaderboards.
- Do not set cut-offs, pass/fail lines or eligibility thresholds on any
  capability or level.
- Do not use a result as the sole or primary basis for placement eligibility,
  admission, selection or any adverse decision.
- Do not present a result as predicting job performance, or use it outside the
  two job families.
- Do not infer anything from accommodation status or ask for integrity
  telemetry.
- Do not forward reports outside the purpose they were shared for. The student
  export (`GET …/students/export`, `exports.cohort`) is roster and status data,
  not a ranking input.

---

## 8. Support and review procedure

The student-facing routes are in `server/routes/v1/support.js`. They need
`PRISM_APP_SHELL_V3` **and** `PRISM_V3_SUPPORT_ROUTES` (404 otherwise), are
owner-only, need an `Idempotency-Key` on every POST, and validate bodies with zod
`.strict()`. The support copy (`src/lib/copy/support.js`) is DRAFT, HA-005
PENDING.

| Need | Student route | Staff plane (admin console session) |
| --- | --- | --- |
| Human review (one free per assessment) | `GET/POST /api/v1/assessment-sessions/:sessionId/human-review` (reason 10–2,000 characters). A second request after a decision gets `409 REVIEW_ALREADY_USED` | `GET /api/admin/report-reviews`, `POST /api/admin/report-reviews/:id/decide` with `UPHOLD`, `CORRECT` or `REJECT` and a reason (`reports:review`: `product_admin`, `assessment_ops`). Screen: `src/pages/admin/AdminReports.jsx` |
| Accommodation, before the start | `GET/POST /api/v1/assessment-assignments/:assignmentId/accommodation`. Refused after the start (`ASSESSMENT_ALREADY_STARTED`) or when the assignment has `accommodationsRequestable` off | `/api/admin/accommodation-requests`: `GET /` and `GET /:id` (`accommodations:read`; the detail read is audited and is the only place the needs text appears), `POST /:id/decide` (`accommodations:manage`: `assessment_ops`). **API only, no console screen** (Risks, P44) |
| Identity check | `GET/POST /api/v1/assessment-sessions/:sessionId/identity-check`. Level 1 self-declaration only. Level 2 is `INSTITUTION_RECORDS_THIS`. Level 3 is `NOT_OFFERED` (HA-007 PENDING) | I found no staff or institution route that records Level 2 |
| Student's own list | `GET /api/v1/me/support-requests` | — |

**Response target.**

- The product states 7 business days (`REVIEW_TARGET_BUSINESS_DAYS = 7`,
  `server/domain/support/service.js`; shown as "a target, not a guarantee").
- **Nothing monitors it.** The report-review queue lists `createdAt` only
  (PROD_READY_STATE Risks, P43).
- Staff procedure:
  1. Open the queue daily.
  2. Sort by age by hand.
  3. Escalate anything older than 5 business days.

**Accommodations never change judging** (P45). Write what was arranged in the
decision note. Extra time and "reduced monitoring" are not V3 decision modes
(Risks, P44).

**Manual path: "invalidate and grant a free reassessment".** This is not a V3
decision option (PROD_READY_STATE Risks, P43). Until a reviewed change adds it:

1. Decide the review in the queue (`UPHOLD` / `CORRECT` / `REJECT`) and write the
   outcome in the reason.
2. An admin with `sessions:invalidate` (`assessment_ops`) marks the session
   invalid: `POST /api/admin/sessions/:id/invalidate` with a reason of 10+
   characters (`server/routes/admin/sessions.js`). This writes
   `admin_session_states` and an audit row `session_marked_invalid`, and excludes
   the session from calibration.
   - This invalidation is **not linked** to the review record. Cite the review id
     in the reason.
   - I did not verify that this route resolves a V3 session id; confirm in staging.
3. The free reassessment has **no V3 tool**. The legacy `review_grant` exists
   only for legacy disputes (`server/routes/admin/disputes.js`). The options in
   code are:
   - **(a)** Institution staff create a new sponsored assignment for the
     student's cohort. It draws a pool seat. Whether that seat is free to the
     institution is a contract matter (component `reviewAllowance`; prices are
     HA-C006 PENDING).
   - **(b)** `POST /api/admin/payments/grant` (`payments:grant`) mints a legacy
     `admin_grant` entitlement for a new random session id. I could not confirm
     that it gives a campus student a V3 start.
   - Record which option was used, and escalate to Product / Engineering (P43
     row owners).

---

## 9. Data deletion at pilot end

### 9.1 What exists

- **Person-level erasure only.** `server/domain/privacy/erasureCascade.js` erases
  one account everywhere. It calls `server/lib/campusErasure.js` for each
  session. The per-column action (DELETE, PSEUDONYMISE, DETACH or RETAIN) is
  listed in `server/domain/privacy/personalDataRegistry.js`.
- **Self-service:** `DELETE /api/assessment/candidate-data`
  (`server/domain/privacy/candidateErasureRoute.js`, mounted in `server/app.js`
  before the frozen router). An active legal hold answers 409.
- **Admin workflow:** `/api/admin/privacy` (`server/routes/admin/privacy.js`).
  1. Open a request: `POST /` with kind `erasure` and scope `candidate` or
     `session` (`privacy:create`).
  2. Verify the data subject: `/:id/verify`.
  3. Run the dry run: `/:id/dry-run` (`privacy:manage`).
  4. A **different** admin approves `privacy_erasure`. Requesting and deciding an
     approval (`/api/admin/admins/approvals`) needs `admins:manage` /
     `approvals:decide`, which only `super_admin` holds.
  5. Execute: `/:id/execute` (`privacy:execute`: `privacy_admin`).
- The proof of completion is in `privacy_erasure_runs` / `privacy_erasure_steps`
  (`npm --prefix server run erasure:ledger`).
- **Key requirement.** In production both paths answer **503
  `ERASURE_NOT_CONFIGURED`** and erase nothing until `PRISM_ERASURE_PSEUDONYM_KEY`
  is set to a secret of at least 32 characters (`server/lib/erasureKey.js`). The
  key is set at GO_LIVE C1 and is not set anywhere yet (Risks).
- **There is no "delete an organization" operation, and no bulk "erase every
  student of an organization" operation.**
  - Nothing sets `organizations.status` to SUSPENDED or ARCHIVED.
  - Nothing revokes a pending invite (except a resend replacing it).
  - No route removes a STUDENT membership: `removeMember` accepts any membership
    id, but no list returns student membership ids.
  - The last ORG_OWNER cannot be removed through the API.

### 9.2 What is retained and why

Retention follows [RETENTION_POLICY_v1.md](../RETENTION_POLICY_v1.md) and its
addenda. Every period is PROVISIONAL, HA-003 PENDING.

- **Finance records** are kept as payment records and pseudonymised, never
  deleted. This covers `campus_contracts`, `invoice_exports`, the seat ledger
  `entitlement_consumptions`, and entitlements referenced by the ledger.
- **Audit trails** keep the event and replace the person with `erased:<hex>`.
  This covers `organization_audit_events`, `data_access_audit_events` and
  `admin_audit_events`. Operational audit is kept for 3 years.
- **Institution structure** has no learner data and stays until the organization
  row is removed. This covers programs, cohorts, interventions, analytics
  settings and import-job totals.
- **Review and dispute materials:** 3 years. Reviewed requests keep a
  pseudonymised row.
- **Anonymised aggregates** survive (policy §3.4).

### 9.3 Operator checklist (pilot end)

1. [ ] Agree the end date and data instructions with the institution in writing.
   Check for legal holds (`/api/admin/privacy` holds) before deleting anything.
2. [ ] Close or cancel every open sponsored assignment
   (`POST /api/v1/organizations/:orgId/assignments/:id/status`). This releases the
   RESERVED seats of unfinished starts. Confirm `seatsReleased` in the org audit.
3. [ ] End the contract: `POST /api/admin/organizations/contracts/:id/close` with
   `ENDED` (the pool becomes EXPIRED). Started assessments still settle.
4. [ ] If an invoice export is due, run it before step 6
   (`POST /api/v1/organizations/:orgId/billing/invoice-exports`).
5. [ ] Remove staff memberships (`DELETE /api/v1/organizations/:orgId/members/:membershipId`)
   except the last owner. Then end the last owner's membership, revoke pending
   invites and remove student memberships by a reviewed, recorded DB change,
   because no route does these.
   - Removing a student membership removes their intervention memberships in the
     same transaction (`setMembershipStatus`, P29).
   - It also ends any organization share grants they made.
6. [ ] To close the organization's own access, set `organizations.status` to
   `SUSPENDED` or `ARCHIVED` by a recorded DB change.
   - Campus admin routes and invites then answer 404 / "not valid"
     (`getOrg`, `loadInvite`).
   - The sponsored report route also checks ACTIVE.
   - The session-metadata route `GET …/sessions/:sessionId` does not check
     status, so step 5 is still needed.
7. [ ] Erase students who asked for it, or whom the contract says to erase: one
   admin privacy request each, scope `candidate` (section 9.1). Students can also
   self-erase. Keep the ledger read-out.
8. [ ] List import jobs still in `PREVIEW` (never purged by the timer) and
   decide how to clear them. Run `retention:import-rows` (dry run, then enforce)
   for committed jobs past 30 days. This happens automatically only with
   `PRISM_RETENTION_ENFORCEMENT` + `PRISM_JOB_WORKER` on (F12, F5b).
9. [ ] Do not delete the `organizations` row by hand. Its `ON DELETE CASCADE`
   foreign keys would remove finance and audit history that the retention policy
   keeps.
10. [ ] Record the steps, the dates and the evidence ids in the pilot file.

---

## Pilot technical report export

Needs flag `PRISM_PILOT_REPORT_EXPORT` (registered OFF; data gate HA-008 and
HA-C010). API only; there is no console screen yet.

1. A StudAI administrator holding both `organizations:read` and
   `exports:create` (`product_admin` or `finance_admin`, or `super_admin`) calls
   `POST /api/admin/organizations/:orgId/pilot-report` with
   `{ "format": "markdown" | "json", "term": "<label>", "purpose": "<at least 10 characters>" }`
   (`server/routes/admin/pilotReport.js`).
2. The report fills every section of
   [PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md](../commercial/PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md)
   from live aggregates (`server/domain/pilotReport/service.js`):
   - Contracted and used seats, the assignment and completion counts, the
     window, the forms, accommodations, and integrity counts.
   - Evidence status and level bands per capability, with PROVISIONAL and
     INSUFFICIENT_EVIDENCE exactly as computed. SUFFICIENT cannot appear while
     the rubric is uncalibrated.
   - Completion rate, median duration, and review requests and outcomes.
   - The limitations text.
3. Small-group suppression uses the organization's minimum group size (default
   10, floor 5). Any non-zero count below it shows as suppressed. A lone
   suppressed cell next to a shown total suppresses one more cell
   ("complementary"). A rate is shown only when every count in it is shown.
4. The report never contains a student, account or session id or a name.
   Anything not measured per organization reads UNKNOWN (for example the
   identity-assurance distribution). Studies read PENDING with their HA ids.
   There is no composite and no ranking.
5. Every export writes an `admin_exports` ledger row (entity
   `pilot_technical_report`, filters only) and an admin audit event
   (`pilot_report_exported`) with the purpose.
6. The report is a DRAFT until science review (HA-008). Do not send it to a
   college as a validity statement. Section 3 states no validity conclusion.

## Demo organization (sales demos)

For sales demos only. Never in the production database.

1. **Where.** Use a separate demo deployment with its own database. In
   production mode `server/db/seedDemoOrg.js` refuses to run unless both of
   these hold:
   - `PRISM_DEMO_MODE=true` (registered OFF; set only in the demo environment).
   - `PRISM_DEMO_DATABASE_URL` names a database other than `DATABASE_URL`.

   The seed writes only to `PRISM_DEMO_DATABASE_URL`. `npm run seed:demo`
   deliberately skips the runtime-secret loader, so it can never pick up the
   production database.
2. **Run.** Migrate the demo database first (0061 adds the demo marker), then
   run `PRISM_DEMO_DATABASE_URL=... PRISM_DEMO_PASSWORD=... npm --prefix server run seed:demo -- --demo`.
   Without `--demo` it refuses. If the demo organization already exists it
   writes nothing. To start over, drop the demo database.
3. **What it creates.** One "Demo College (synthetic)" with:
   - 2 departments and 3 cohorts, one of them small so suppression shows.
   - "Demo Admin (synthetic)", "Demo Placement Officer (synthetic)", and
     "Demo Student 001…036". Addresses are at `demo-college.example.invalid`,
     a reserved domain with no mailbox.
   - 2 assignments, plus completed and in-progress sessions and reports.
   - Evidence quotes that all read "Demo response (synthetic text)".

   Statuses come from the real sufficiency rules, so the demo shows PROVISIONAL
   and INSUFFICIENT honestly.
4. **Isolation.**
   - `organizations.is_demo` cannot change after creation.
   - Database triggers refuse any membership, cohort or roster row that mixes
     demo and real accounts.
   - Calibration jobs drop demo sessions (`calibration/jobs/_base.py`).
   - The rating queue refuses them.
   - Every app screen shows a persistent "Demo data" banner to demo accounts.
   - A pilot report of a demo organization says "DEMO DATA" at the top and the
     bottom.

---

## Sources

- `docs/production/PROD_READY_CHARTER_2026-10.md` (§1, Phase 8), `docs/production/PROD_READY_STATE.md` (Phases 2, 4, 5; Risks; P43, P44, P53–P58), `docs/production/GO_LIVE_CHECKLIST.md`
- `docs/campus/ROLLOUT_PLAN.md`, `docs/campus/CAMPUS_HUMAN_ACTIONS.md`, `docs/campus/CAMPUS_PROGRAM_STATE.md` (K69, K79, C11.05), `docs/remediation/HUMAN_ACTION_REGISTER.md`
- `docs/JOB_FAMILY_SCOPE_v1.md`, `docs/PROHIBITED_USES_POLICY_v1.md`, `docs/RETENTION_POLICY_v1.md`
- `server/lib/flagRegistry.js`, `server/lib/adminRbac.js`, `server/lib/sharedConstants.js`, `server/lib/campusErasure.js`, `server/lib/erasureKey.js`, `server/lib/retentionEnforcement.js`, `server/app.js`
- `server/routes/admin/index.js`, `organizations.js`, `reportReviews.js`, `accommodationRequests.js`, `sessions.js`, `payments.js`, `disputes.js`, `privacy.js`, `admins.js`
- `server/routes/auth.js`; `server/routes/v1/organizations.js`, `campusAdmin.js`, `orgInvites.js`, `student.js`, `reports.js`, `support.js`, `analytics.js`, `billing.js`, `entitlements.js`
- `server/domain/permissions/roles.js`, `matrix.js`, `can.js`, `middleware.js`; `server/domain/memberships/inviteService.js`; `server/domain/campusAdmin/csv.js`, `service.js`, `repository.pg.js`; `server/domain/integrations/sis/index.js`
- `server/domain/billing/service.js`; `server/domain/entitlements/ledger.js`, `resolver.js`; `server/domain/sharing/copyVersions.js`; `server/domain/assessments/assignmentService.js`; `server/domain/scopes/sessionScope.js`
- `server/domain/analytics/service.js`; `server/domain/evidence/levels.js`; `server/domain/support/service.js`; `server/domain/reports/v3/repository.js`, `service.js`
- `server/domain/privacy/erasureCascade.js`, `candidateErasureRoute.js`, `personalDataRegistry.js`, `importRowRetention.js`; `server/domain/campusStore/defaultContext.js`
- `server/db/migrations/0026_campus_organizations.sql`, `0027_campus_memberships_workspaces.sql`, `0034_campus_programs_ops.sql`, `0037_campus_analytics_settings.sql`
- `src/app/AppRouter.jsx`, `src/features/admin/AdminOrganizationsPage.jsx`, `src/pages/admin/AdminShell.jsx`, `src/pages/admin/AdminReports.jsx`, `src/features/campus/pages/CampusImportPage.jsx`, `src/pages/Auth.jsx`, `src/lib/copy/privacy.js`, `src/lib/copy/evidence.js`, `src/lib/copy/support.js`
