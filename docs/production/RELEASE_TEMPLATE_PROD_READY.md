# Release preparation — PROD-READY line to staging, then production

PROD-READY Phase 7 (charter Phase 7 item 3; decisions P77, P78 in
[PROD_READY_STATE.md](./PROD_READY_STATE.md)). **Prepared, not executed.**
Nothing here has been deployed, no flag has been flipped and no secret has
been touched (charter law 1). Every step is an operator action, in the order of
[GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md).

The release candidate is whatever lands on `main` after the operator merges the
stacked `prod/p0x-*` branches (HA-C007). The procedure itself is in
[DEPLOYMENT_RUNBOOK_v1.md](../DEPLOYMENT_RUNBOOK_v1.md) § "Addendum 2026-10-10"
and, for the store cutover, [PG_MIGRATION_RUNBOOK_v1.md](../PG_MIGRATION_RUNBOOK_v1.md)
and its addenda.

## 1. What production runs today, and what this release changes

| | Production today | This release |
| --- | --- | --- |
| Image | `prod/prism:2b84e13c07f2` (2026-08-05, [RELEASE_RECORDS.md](../remediation/RELEASE_RECORDS.md)) | `prod/prism:<sha12 of main>` built by `build-image.yml` (target `production`) |
| v1 store | JSON files on EFS (`backend json` in the August boot log) | PostgreSQL — **mandatory**: since `63d320d` (2026-09-21) the server refuses to start in production unless `PRISM_PG_STORE=true` (DEF-07) |
| Migration head | `0020_commercial` (`git ls-tree 2b84e13 server/db/migrations`; 0018–0020 applied in the August release) | `0063_employer_lnd` |
| Manifest | applied from `infra/aws/prism-eks.yml` (image pin `69363a6e6b9a` in git, older than the running image) | `infra/aws/eks/overlays/production`, rendered with the release tag; readiness `/api/ready`, non-root, read-only root filesystem, 40 s grace |
| Flags | every campus / V3 / programme flag absent (off) | still off — this release flips nothing |

### Consequence: the PostgreSQL cutover (HA-023) is part of this release

An image from this line cannot boot against the JSON store, so the release and
the cutover share one maintenance window: back up → scale to 0 → migrations →
store copy + reconciliation → secret changes (incl. `PRISM_PG_STORE=true`) →
new manifest → verify. Rollback returns to the old image **and** the JSON store
(§6). There is no order in which the new image runs on the JSON store.

## 2. Migrations to apply (43)

Everything after production's head `0020_commercial`, in order, each with a
`.down.sql` (never run a `.down.sql` on real data — ROLLOUT_PLAN §1):

| Range | Migrations | Origin |
| --- | --- | --- |
| 0021–0024 | `0021_entitlement_ownership`, `0022_assessment_catalog`, `0023_occupational_capability_graph`, `0024_behavioral_evidence_ledger` | post-August `main` |
| 0025–0039 | `0025_evidence_fail_closed` … `0039_evidence_rating_queue` (campus V1: organizations, memberships, entitlements v2, consent scopes, assignments, preferences/product events, session I/O, report versions, programs ops, development v2, reassessment/growth, analytics settings, billing, rating queue) | Campus programme (charter's "0025–0039") |
| 0040–0054 | `0040_candidate_actions_jobs` … `0054_report_publication_note` | CR / experience work on the branch base (P1) |
| 0055 | `0055_payment_redemptions` | Phase 1S (P12) |
| 0056 | `0056_erasure_cascade` | Phase 2 (P25, P28) |
| 0057 | `0057_integrity_guards` | Phase 3 (P35–P37) |
| 0058 | `0058_v3_support_routes` | Phase 4 (P43, P44) |
| 0059 | `0059_job_queue` | Phase 5 (P52) |
| 0060 | `0060_session_decision_cache` | Phase 6 (P64) |
| 0061 | `0061_demo_organizations` | Phase 8 |
| 0062 | `0062_guardian_consents` | Phase 8 |
| 0063 | `0063_employer_lnd` | Phase 9 |

Applied by the Job `prism-migrate-up` (`infra/aws/eks/jobs/ops/jobs.yaml`);
`prism-store-migration-*` also run `migrateUp()` first, so the head is 0063
before any copy. Evidence: the `prism-migrate-status` log before and after
(every line `[x]`).

Not rehearsed yet and therefore required in staging first (GO_LIVE_CHECKLIST
B-steps): 0021–0063 on a database that holds production-shaped data (only
empty and synthetic databases so far), and the previous image `2b84e13c07f2`
starting against a 0063 schema with `PRISM_PG_STORE=false` (the rollback path).

## 3. Environment and secrets

All values live in AWS Secrets Manager (`/studai/prism/aws-prod/runtime`; staging
`/studai/prism/aws-staging/runtime`), never in the manifest, a ConfigMap, git or
chat. The manifest carries only non-secret settings (marked *manifest*).
"Boot" = the server refuses to start without it in production.

| Name | Required when | Owner | Source / how to obtain | New for this release? |
| --- | --- | --- | --- | --- |
| `PRISM_PG_STORE=true` | **Boot** (DEF-07) | Operator (HA-023) | Set in the secret at cutover step 5 — a flag flip by a human, never by tooling | Yes (was off) |
| `DATABASE_URL` | **Boot** | Operator | Existing RDS PG 17 instance (telemetry/admin planes already use it); staging: its own database and role | No (staging: new) |
| `JWT_SECRET` | **Boot** | Operator | Existing; staging: a different random value | No (staging: new) |
| `AI_PROVIDER=aws-bedrock`, `BEDROCK_PRIMARY_MODEL`, `BEDROCK_CONVERSATION_MODEL`, `BEDROCK_FAST_MODEL`, `BEDROCK_FALLBACK_MODEL`, `BEDROCK_EMBEDDING_MODEL`, `BEDROCK_MULTIMODAL_MODEL`, `BEDROCK_STT_MODEL`, `AWS_REGION` | **Boot** | Operator | Existing (README "Bedrock Configuration") | No |
| `BEDROCK_ALLOW_GLOBAL_INFERENCE=true` | **Boot** if any model id starts `global.` | Founder (data residency) | Existing decision | No |
| `AWS_SECRETS_MANAGER_SECRET_ID`, `_REGION`, `_REQUIRED` | **Boot** | Engineering | *manifest* (overlay) | No |
| `PRISM_DUMMY_PAYMENTS` | must be absent/false (**boot** refusal otherwise) | Operator | — | No |
| `PRISM_ERASURE_PSEUDONYM_KEY` (≥ 32 chars, random) | Any erasure (fails closed with 503 `ERASURE_NOT_CONFIGURED` without it; P39) | Operator | Generate (e.g. 48 random bytes, base64) into the secret; never reuse staging's | **Yes** |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | **Boot** once any paid offer is purchasable (P13; none is today) | Founder/Ops | Razorpay dashboard — only after the HA-001 rotation; webhook secret from the webhook configuration; staging: TEST-mode keys only | Webhook secret: **yes** |
| Razorpay auto-capture | Before any offer becomes purchasable (P12) | Founder/Ops | Razorpay dashboard setting | Yes (verify) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_FROM_NAME` | Report and invite email; job-worker emails (else `NOT_SENT`) | Founder/Ops | SendPulse — `SMTP_PASS` only after the HA-002 rotation | No (rotate) |
| `PUBLIC_APP_URL` (e.g. `https://prism.studai.one`) | Campus invite links and job-worker emails (P55, ROLLOUT_PLAN P3) | Operator | The canonical host | **Yes** |
| `PUBLIC_BASE_URL` | Admin report links, device pairing page | Operator | The canonical host | Check |
| `CORS_ORIGIN` (and optional `PROCTOR_CORS_ORIGIN`) | Only for cross-origin callers; production denies cross-origin otherwise; proctor socket allows its own origin plus these (P14) | Engineering | Exact origins, comma-separated | Check |
| `ECOSYSTEM_SECRET`, `HIRE_BASE_URL`, `CAREER_BASE_URL`, `HIRE_API_URL` | Hire/career hand-over and aligned jobs; without them `503 NOT_CONFIGURED` / empty list in production (P15) | Founder + Hire owner | Shared HS256 secret agreed with StudAI Hire; Hire's public base URL | **Yes** (hand-over now refuses without them) |
| `PGSSLMODE=verify-full`, `PGSSLROOTCERT=/etc/prism/rds-ca/global-bundle.pem` | Before a paid pilot (P20); without them the app logs `pg_tls_unverified` | Operator | ConfigMap `prism-rds-ca` (key `global-bundle.pem`) from AWS's public RDS CA bundle — the Deployment and Jobs mount it optionally at `/etc/prism/rds-ca` | **Yes** |
| `PG_POOL_MAX` (default 5), `PG_SESSION_LOCK_POOL_MAX` (default 5) | Cohort-scale V3 use (P32, P66) | Engineering / Operator | Size to concurrent engine turns per replica within the RDS `max_connections` budget (Jobs + app + admin) | Check |
| `PRISM_JOB_WORKER` + `PRISM_JOB_CONCURRENCY` / `_POLL_MS` / `_LEASE_MS` | Only when a human flips the worker (P54); then on **every** replica | Operator | Shared secret/config, never per pod | Flag stays off |
| `REDIS_URL` | Only for `replicas > 1` (P41) | Operator | ElastiCache or equivalent | Not needed while replicas = 1 |
| `PRISM_RELEASE_STAGE` | Before any V3 flag; the code default `LOCAL_CI` accepts DRAFT content | Product + Operator | Staging: `STAGING` (*manifest*, staging overlay). Production: the ROLLOUT stage (e.g. `INTERNAL_CANARY`), set with HA-C001 | **Yes** |
| `PRISM_ADMIN_MFA_KEY`, `PRISM_PREVIEW_TOKEN_SECRET`, `PRISM_TELEMETRY_KEY` | Recommended: otherwise derived from `JWT_SECRET` (MFA, preview) or actor hashing is off (telemetry) | Operator | Random values; changing the MFA key later forces TOTP re-enrolment | Check |
| `PRISM_CREDENTIAL_SIGNING_KEY` | Only with `PRISM_GLASS_BOX` | Operator | Ed25519 PKCS8 (existing if credentials are live) | No |
| `PRISM_TAX_TREATMENT` | Before any paid offer (offer gate) | Finance | Finance decision | No |
| `DATA_DIR=/home/data/prism` | Always (CMS file, pre-cutover JSON store) | Engineering | *manifest*; confirm the secret's value, if any, is the same | Now explicit |
| `PRISM_SHUTDOWN_TIMEOUT_MS=25000` | Always | Engineering | *manifest* | Now explicit |
| `AWS_SECRETS_MANAGER_SECRET_IDS` | After the HA-022 secret split | Operator | 8 category secrets ([SECRET-SPLIT-DESIGN.md](../remediation/SECRET-SPLIT-DESIGN.md)) | Optional |
| `SENTRY_DSN` | Optional | Engineering | Sentry project | No |

Must **not** be present in production: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
/ `AWS_SESSION_TOKEN` / `AWS_BEARER_TOKEN_BEDROCK` (boot refusal),
`PRISM_DUMMY_PAYMENTS=true`, any `PRISM_AUDIT_*` harness variable.

## 4. Flags — all OFF after this release

Verified by the smoke battery (`admin-flags` check, with a read-only admin token):

- Campus / V3: `PRISM_APP_SHELL_V3`, `PRISM_EVIDENCE_FAIL_CLOSED`, `PRISM_STUDENT_REPORT_V3`, `PRISM_ASSESSMENT_WORKSPACE_V3`, `PRISM_CAMPUS_ENABLED`, `PRISM_CAMPUS_ANALYTICS`, `PRISM_DEVELOPMENT_V2`, `PRISM_GROWTH_ENABLED`, `PRISM_ROLE_EXPLORATION_V2`, `PRISM_PREPARATION_V1`, `PRISM_V3_RATING_QUEUE`.
- This programme: `PRISM_V3_SUPPORT_ROUTES` (Phase 4), `PRISM_JOB_WORKER` (Phase 5), `PRISM_ANALYTICS_DECISION_CACHE` (Phase 6), `PRISM_PILOT_REPORT_EXPORT` and `PRISM_DEMO_MODE` (Phase 8), `PRISM_EMPLOYER_LND` (Phase 9; `PRISM_UNDER18_PATH` is listed under governance).
- Governance / science: `PRISM_RETENTION_ENFORCEMENT`, `PRISM_IDENTITY_L3`, `PRISM_UNDER18_PATH`, `PRISM_PROCTOR_PHONE_CAM`, `PRISM_PROCTOR_GAZE`, `PRISM_DEMOGRAPHICS`, `PRISM_STANDARDIZED_CORE` (HA-021), `PRISM_V2_EXECUTIVE`, `PRISM_V2_DUAL_SCORER`, `PRISM_V2_EQUATING`, `PRISM_V2_EARLY_STOP`, `PRISM_PRESSURE`, `PRISM_LANG`, `PRISM_VELOCITY`, `PRISM_REPLAY`, `PRISM_TEAMFIT`, `PRISM_ADMIN_PROMPT_REGISTRY`, `PRISM_DRIFT_HARD`, `PRISM_STUDY_STEERING_AB`, `PRISM_DUMMY_PAYMENTS`.
- ON: `PRISM_PG_STORE` only (required to boot).
- Not asserted (existing operator settings this release does not change): `PRISM_V2_TELEMETRY`, `PRISM_GLASS_BOX`, `PRISM_ADMIN_CONSOLE`, `PRISM_CMS_DB`, `PRISM_TTS_NEURAL`, `PRISM_SKIP_VERIFICATION`.

If a human has flipped one of the dark flags with recorded evidence before the
release (for example HA-021), name it in the record and pass it to the battery
with `--allow-on`.

## 5. Post-deploy smoke battery

`scripts/post-deploy-smoke.mjs` (test: `server/test/postDeploySmoke.test.js`).
GET only, plus one unauthenticated DELETE of a freshly generated random UUID on
the legacy erasure route (owner guard → 404; `--no-guard-probes` to skip);
https only; nothing is created.

```bash
node scripts/post-deploy-smoke.mjs --base-url https://prism.studai.one --dry-run   # prints the plan, sends nothing
PRISM_SMOKE_ADMIN_TOKEN=<console access token> \
  node scripts/post-deploy-smoke.mjs --base-url https://prism.studai.one --expect-bundle <index-*.js from the build>
```

| Check | Expect |
| --- | --- |
| `/api/health` | 200 `{status: ok}` |
| `/api/ready` | 200 `ready`, `checks.database: ok` |
| `/` | HTML with the expected `index-*.js` bundle |
| `/api/v1/health` | 200 |
| Dark campus/V3 routes: `/api/v1/me/home`, `/assessment-sessions/:id`, `/shared/:token`, `/organizations/:id`, `/org-invites/:token`, analytics, reassessments, `/missions`, `/preparation`, `/api/validation/rater/next` | 404 |
| New v1 support routes (Phase 4): `human-review`, `identity-check`, `accommodation`, `/me/support-requests` | 404 |
| Legacy report of an unknown id, signed out (K103) | 404 |
| Legacy erasure of a random id, signed out (Phase 1S N1) | 404 |
| Admin (token): `/api/admin/flags` live states | dark list off, `PRISM_PG_STORE` on |
| Admin (token): `/api/admin/job-queue` (`PRISM_JOB_WORKER`) | 404 |
| Admin (token): `/api/admin/accommodation-requests` (`PRISM_V3_SUPPORT_ROUTES`) | 404 |

`PRISM_ANALYTICS_DECISION_CACHE` has no public surface (server-only); it is
covered by the admin flag-state check. Without an admin token those checks
report UNVERIFIED, which is not a pass. The test proves each dark check
discriminates (with its flags on, the same request is no longer 404).

Then the human checks the battery cannot do (they create data): the PG
runbook §4 verification checklist with a dedicated test account, the boot-log
lines below, and the August §21 journey (register → login → invite redemption →
consent → start → evaluate → report → erasure) with a synthetic account that
is erased afterwards.

Boot log lines to capture: `runtime_secrets_loaded` (key count), `v1_store_backend {"backend":"postgres"}`,
no `erasure_pseudonym_key_missing`, no `pg_tls_unverified` once the CA bundle is
set, no `job_worker_started` (worker off).

## 6. Rollback

Inside the window, before traffic: `kubectl rollout undo deployment/prism -n prism`
restores the previous pod template (old image **and** its `/api/health`
readiness probe — the old image has no `/api/ready`, so `kubectl set image` to
the old tag alone would leave the pod un-Ready). Then restore the ALB health
check annotation to `/api/health`, move the secret's `AWSCURRENT` back to the
pre-release version (that sets `PRISM_PG_STORE` back), and follow
PG_MIGRATION_RUNBOOK §5. Migrations stay applied (additive); never run a
`.down.sql` on real data. Exact commands: DEPLOYMENT_RUNBOOK addendum §G.

## 7. Release-record entry template (fill in, then APPEND to RELEASE_RECORDS.md)

Copy into [RELEASE_RECORDS.md](../remediation/RELEASE_RECORDS.md) only when the
release has actually happened (one entry per attempt, including failures and
rollbacks). Never paste an unfilled template; never edit an earlier entry.

```text
## <UTC timestamp> — <sha12>

- environment: production (staging entry: same fields, "environment: staging", namespace prism-staging)
- image: 158346964832.dkr.ecr.ap-south-1.amazonaws.com/prod/prism:<sha12>
- image digest: sha256:<from ECR>; base images: <runtime digest>, <build digest> (Dockerfile header, P74)
- commit: <full sha> (<subject>) — main after merging prod/p00..p0N (HA-C007); previous production image 2b84e13c07f2
- CI: run <id> SUCCESS for <sha>; build: run <id> SUCCESS (environment production approved by <reviewer>, ECR scan: <critical>/<high>)
- staging: stage A run on prism-staging with image <sha12> on <date>; smoke battery <PASS/FAIL counts>; rollback rehearsal <result>
- backups before deploy: RDS manual snapshot <id> (available); EFS recovery point <arn/id> (COMPLETED); JSON store copied out-of-pod <sizes, SHA-256>
- freeze window: <start>–<end> UTC; announced to <who>
- migrations applied: 0021_entitlement_ownership … 0063_employer_lnd (43) via job prism-migrate-up; migrate-status before/after attached
- store cutover (HA-023): store-migration dry run <counts>; enforce ok:true <bucket counts, hashes>; PRISM_PG_STORE=true set by <operator> at <time> (secret version <id>)
- secrets changed (names only, never values): <e.g. PRISM_ERASURE_PSEUDONYM_KEY added, PUBLIC_APP_URL added, PGSSLMODE/PGSSLROOTCERT set>; secret version <old> → <new>
- manifest: infra/aws/eks/overlays/production rendered at <commit>, `kubectl diff` reviewed by <operator>; cluster guard policy installed: yes/no
- verified by: <operator>
- boot log: runtime_secrets_loaded keyCount=<n>; v1_store_backend postgres; erasure key present: yes/no; pg TLS verified: yes/no
- smoke battery: scripts/post-deploy-smoke.mjs — PASS <n> / FAIL <n> / UNVERIFIED <n> / SKIP <n>; bundle <index-*.js>
- PG runbook §4 checklist: <each item pass/fail>
- flags: every flag in RELEASE_TEMPLATE_PROD_READY.md §4 confirmed off (admin-flags check); flags on by a recorded human decision: <none | name + register id>
- post-release: sessions:pin-forms dry run <count>, enforce <count> (job prism-sessions-pin-forms-*)
- health checks: pass|fail (+notes); error-level log lines in the first 10 minutes: <n>
- rollback: not needed | rolled back to 2b84e13c07f2 via `kubectl rollout undo` at <time> (+cause, + PRISM_PG_STORE restored to false)
```

## Addendum 2026-10-10 — PROD-READY Phase 8

If this release is cut from the Phase 8 branch or later, it carries two more migrations, both additive with a `.down.sql`:

- `0061_demo_organizations`: the `organizations.is_demo` marker, `demo_accounts`, isolation triggers and the `demo_session_ids` view.
- `0062_guardian_consents`: an empty table until `PRISM_UNDER18_PATH` is turned on.

Three dark flags must read OFF in the smoke battery: `PRISM_PILOT_REPORT_EXPORT`, `PRISM_DEMO_MODE` (never set in production) and `PRISM_UNDER18_PATH` (dark check `under18-guardian`). The demo seed is never run against the production database; it refuses to.

## Addendum 2026-10-11 — PROD-READY Phase 9

If this release is cut from the Phase 9 branch or later, it carries one more migration, additive with a `.down.sql`:

- `0063_employer_lnd`: `consent_records.consent_type` accepts `EMPLOYER_DEVELOPMENT_DISCLOSURE` and `EMPLOYER_ASSESSMENT_DISCLOSURE`; a trigger refuses an individual-visibility session scope for an EMPLOYER sponsor; `organizations.organization_type` cannot change to or from `EMPLOYER`. No table or column is added. The down refuses (and stops the rollback) while any employer consent record exists, so employee consent evidence is never deleted by a rollback.

One more dark flag must read OFF in the smoke battery: `PRISM_EMPLOYER_LND` (dark checks `employer-lnd` and `hire-handoff`).

## Addendum 2026-10-11 — PROD-READY Phase 10 (consolidated counts)

The release candidate is `main` after every `prod/p0x-*` branch is merged
(HA-C007), so the Phase 8 and Phase 9 addenda apply unconditionally. The
body above was brought in line with these values in place on 2026-10-11
(PROD-READY P108: §1 head, §2 table and count, rehearsal ranges, §4 flag list,
§7 record line):

- Migration head after the release: **`0063_employer_lnd`**; migrations to
  apply: **0021–0063 (43)** — the §2 table plus 0061 `0061_demo_organizations`,
  0062 `0062_guardian_consents`, 0063 `0063_employer_lnd`. The record line in
  the template becomes "0021_entitlement_ownership … 0063_employer_lnd (43)".
- Rehearsals in §2 run 0021–0063, and the rollback rehearsal starts the old
  image against a **0063** schema with `PRISM_PG_STORE=false`.
- §3 "Must **not** be present in production" also includes
  `PRISM_DEMO_MODE`, `PRISM_DEMO_DATABASE_URL` and `PRISM_DEMO_PASSWORD`.
- §3 optional: `PROCTOR_SOCKET_RATE_PER_MIN` (default 60 new proctor-socket
  connections per minute per client IP, Phase 1S N4/P14;
  `server/lib/proctorSocket.js`). Per process, so the limit multiplies with
  replicas.
- §4/§5: the flag list and smoke checks include the Phase 8/9 rows
  (`PRISM_PILOT_REPORT_EXPORT`, `PRISM_DEMO_MODE`, `PRISM_UNDER18_PATH`,
  `PRISM_EMPLOYER_LND`; dark checks `under18-guardian`, `employer-lnd`,
  `hire-handoff`) — all OFF/dark at release.

Review: [RUNBOOK_CURRENCY_REVIEW.md](./human-actions/RUNBOOK_CURRENCY_REVIEW.md).
