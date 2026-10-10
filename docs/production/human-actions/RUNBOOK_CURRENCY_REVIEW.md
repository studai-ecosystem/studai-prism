# Runbook currency review — HA-022, HA-023, HA-024, HA-C012, HA-C013

PROD-READY Phase 10 (charter Phase 10, last bullet). Engineering checked
whether the runbooks the operator will execute are still correct after this
programme's changes (Phases 1, 1S and 2–9, commits `70bdc85` … `44267fa` on
top of `4e417a9`). **Result: the core procedures are correct, but no runbook
was fully current.** The gaps were mostly in counts (migrations up to 0060
instead of 0063) and in secret/key lists written before the programme. Each
gap is now closed by a **dated addendum appended to the runbook** (records are
never rewritten). This page lists exactly what changed and where.

Nothing here was executed against any environment. No register item is
closed: HA-022, HA-023 and HA-024 stay `PREPARED (materials ready)`;
HA-C012 and HA-C013 move to `PREPARED (materials ready)` with this review and
the addenda as their materials.

## 1. What the programme changed that runbooks must reflect

| Change | Phase / decision | Where it is now documented |
| --- | --- | --- |
| Production runs from head `0020_commercial` (image `2b84e13c07f2`); the release applies **0021–0063 (43 migrations)**: 0021–0054 pre-existing on the branch, 0055 payment redemptions, 0056 erasure guard, 0057 integrity guards, 0058 V3 support routes, 0059 job queue, 0060 session decision cache, 0061 demo organizations, 0062 guardian consents, 0063 employer L&D | P2, P12, P23, P36, Phase 4–9 | RELEASE_TEMPLATE body says 0060 / 40; Phase 8 and 9 addenda add 0061–0063 → **consolidated in the RELEASE_TEMPLATE Phase 10 addendum** |
| Production refuses to boot without `PRISM_PG_STORE=true` (since `63d320d`, DEF-07): the release and the PostgreSQL cutover are one window | P38 risk row | PG runbook addendum (Phase 7), DEPLOYMENT addendum §D–§G, GO_LIVE §C — correct |
| `/api/ready` (readiness: draining state + `SELECT 1` with a timeout, `server/lib/readiness.js`); liveness stays `/api/health`; ALB health check on `/api/ready` | Phase 1S N12, P72 | DEPLOYMENT addendum §A/§G, manifest — correct. SECRET-SPLIT-DESIGN §5 still said "health does NOT exercise the DB — use admin login 401" → **corrected by its Phase 10 addendum** |
| EKS kustomize tree `infra/aws/eks/` (base, production + staging overlays, ops + cutover Jobs, optional admission policy); image placeholder `RELEASE_TAG_REQUIRED`; `infra/aws/prism-eks.yml` tombstone | P71–P75 | DEPLOYMENT addendum §A, §B, §D, §H — correct |
| Operator Jobs (distroless image, no `kubectl exec … npm`): `migrate-status`, `migrate-up`, `sessions-pin-forms-dry-run`/`-enforce`, `import-rows-retention-dry-run`, `erasure-ledger-open`, `store-migration-dry-run`/`-enforce` | P75 | DEPLOYMENT addendum §D — correct (8 Jobs match `jobs/ops` + `jobs/cutover`) |
| Hardened pod: non-root 65532, read-only root filesystem (only `DATA_DIR` and `/tmp` writable), `terminationGracePeriodSeconds: 40`, `PRISM_SHUTDOWN_TIMEOUT_MS` | P72 | DEPLOYMENT addendum — correct; never run on a cluster (risk row) |
| `build-image.yml`: production from `main` only, after green CI for the exact commit, `environment: <target>`, staging to `staging/prism` with its own role; scan gate refuses CRITICAL only (HIGH recorded in the release record) | P76 | DEPLOYMENT addendum §B/§C — correct |
| OIDC trust-policy ordering: switch `sub` to `repo:studai-ecosystem/studai-prism:environment:production` **before** the new `build-image.yml` reaches `main` | P76 | DEPLOYMENT addendum §C — correct. GO_LIVE numbers B1 (merge) before B2 (trust policy) although B2's text says "before B1" → **explicit ordering note in the GO_LIVE Phase 10 addendum** |
| New secrets / env: `PRISM_ERASURE_PSEUDONYM_KEY` (erasure fails closed without it), `RAZORPAY_WEBHOOK_SECRET` (boot-required once an offer is purchasable), `PUBLIC_APP_URL`, `ECOSYSTEM_SECRET` / `HIRE_BASE_URL` / `CAREER_BASE_URL` / `HIRE_API_URL`, `PGSSLMODE` / `PGSSLROOTCERT`, `PG_POOL_MAX` / `PG_SESSION_LOCK_POOL_MAX`, `REDIS_URL` (multi-replica only), `PRISM_JOB_CONCURRENCY` / `_POLL_MS` / `_LEASE_MS`, `PROCTOR_SOCKET_RATE_PER_MIN`, `PROCTOR_CORS_ORIGIN`, `PRISM_RELEASE_STAGE` | Phase 1S–9 | RELEASE_TEMPLATE §3 lists most of them; **SECRET-SPLIT-DESIGN (pre-programme) assigned none of them to a category** → Phase 10 addendum; `PROCTOR_SOCKET_RATE_PER_MIN` added to the RELEASE_TEMPLATE addendum |
| Variables that must never be in production: `PRISM_DEMO_MODE`, `PRISM_DEMO_DATABASE_URL`, `PRISM_DEMO_PASSWORD` (demo seed only, P82) | P82 | Missing from RELEASE_TEMPLATE "must not be present" → **added in its Phase 10 addendum** |
| Flags registered OFF during the programme: `PRISM_V3_SUPPORT_ROUTES`, `PRISM_JOB_WORKER`, `PRISM_ANALYTICS_DECISION_CACHE`, `PRISM_PILOT_REPORT_EXPORT`, `PRISM_DEMO_MODE`, `PRISM_EMPLOYER_LND`; `PRISM_UNDER18_PATH` gained behaviour | Phases 4–9 | GO_LIVE §F + addenda, RELEASE_TEMPLATE addenda, smoke battery (`scripts/post-deploy-smoke.mjs` classifies each) — correct |
| Payment changes: single-use redemption ledger (0055), `/verify` grants captured orders only, webhook secret | P12, P13 | RUNBOOK-credential-rotation (pre-programme) had no webhook step → **Phase 10 addendum** |

## 2. Per runbook

| Runbook | HA | Verdict before Phase 10 | Phase 10 addendum (what it adds) |
| --- | --- | --- | --- |
| [DEPLOYMENT_RUNBOOK_v1.md](../../DEPLOYMENT_RUNBOOK_v1.md) | HA-024, HA-023 | Phase 7 addendum (A–I) correct for overlays, Jobs, build gating, OIDC ordering, `/api/ready`, PG coupling. Stale: rollback rehearsal "on the 0060 schema" (§G); no Phase 8/9 flags; no statement that the demo seed and `PRISM_DEMO_*` never touch production | Head is 0063 (rehearse the old image on the **0063** schema: 0061 and 0063 add triggers on existing tables); Phase 8/9 flags stay off and need no manifest change; no demo overlay exists (by design); secret split needs `AWS_SECRETS_MANAGER_SECRET_IDS` via an overlay patch |
| [PG_MIGRATION_RUNBOOK_v1.md](../../PG_MIGRATION_RUNBOOK_v1.md) | HA-023 | Phase 3 + Phase 7 addenda correct for the cutover Jobs and ordering. Stale: "0040–0057", "57 migrations", "0021–0060" | 0021–0063 (43); post-cutover checks for the 0061/0063 triggers; `PGSSLROOTCERT` from the `prism-rds-ca` ConfigMap (the cutover Jobs mount it) |
| [SECRET-SPLIT-DESIGN.md](../../remediation/SECRET-SPLIT-DESIGN.md) | HA-022 | Pre-programme. Key lists miss every programme secret; "35 keys" count stale; DB verification step obsolete; no staging role; no rotation rows for the erasure key, `ECOSYSTEM_SECRET`, webhook secret | Category assignment for every new key; demo variables excluded; verification via `/api/ready`; rotation notes (erasure key: never rotate without a governance decision, it changes pseudonyms; `ECOSYSTEM_SECRET`: coordinate with the Hire owner); manifest change for `SECRET_IDS`; staging role |
| [RUNBOOK-credential-rotation.md](../../remediation/RUNBOOK-credential-rotation.md) | HA-001, HA-002 | Pre-programme. No webhook-secret step; verification without `/api/ready`; "Phase 4" secret-split reference stale | Webhook secret after key rotation; `/api/ready` after restart; brief outage under `Recreate`; evidence goes in the [HA-001/002 template](./HA-001-002_CREDENTIAL_ROTATION_EVIDENCE.md) |
| [RELEASE_TEMPLATE_PROD_READY.md](../RELEASE_TEMPLATE_PROD_READY.md) | HA-023, HA-C007 | Body 0060 / 40; addenda conditional | Consolidated: head `0063_employer_lnd`, 43 migrations, record line wording; demo variables in "must not be present"; `PROCTOR_SOCKET_RATE_PER_MIN` |
| [SECURITY_REVIEW.md](../../campus/SECURITY_REVIEW.md) | HA-C012 | Addenda through Phase 3; DAST still open (correct); no addenda for the surfaces added in Phases 4–9; registry coverage text says "0001–0056" | Scope list for the independent review (DAST) covering every surface added in Phases 4–9; registry now covers through 0063 (0061 `demo_accounts`, 0062 `guardian_consents`; 0063 adds no personal-data column) |
| [A11Y_MANUAL_CHECKLIST.md](../../campus/A11Y_MANUAL_CHECKLIST.md) | HA-C013 | Unchanged since 2026-09-26; manual rows M1–M8 cover campus journeys only | Automated evidence from Phases 4, 8 and 9 recorded; manual rows M9–M13 for support paths, guardian page, demo banner and P3 UX, employer workspace and employee consent flows |
| [infra/aws/eks/](../../../infra/aws/eks/) | HA-023, HA-024 | Current for Phases 7–9 (Phase 8/9 features are flags and API routes; no manifest change needed) | No change. Noted: no demo overlay (demo runs only in a separate environment with its own database, by the seed's refusal rules) |
| [GO_LIVE_CHECKLIST.md](../GO_LIVE_CHECKLIST.md) | all | B8/B9 say 0060; B1/B2 numbering inverts the required order | Phase 10 addendum: pack links, "do B2 before B1", 0063 |

## 3. Still open after this review (human)

- Every procedure above is unexecuted. The hardened pod and the Jobs have
  never run on a cluster; staging (B5–B9) comes first.
- HA-C012 needs an independent security reviewer and a staging environment;
  HA-C013 needs people and devices. Engineering cannot do either.
