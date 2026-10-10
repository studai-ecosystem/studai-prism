# Prism Campus — Performance Review

Phase 12, C12.05 (spec §47), 2026-09-26. Engineering goals, not service
levels. Everything below was measured on a developer laptop; nothing here was
run against Postgres under load, a network, or production data.

## 1. Frontend bundle (production `vite build`)

| Chunk | Size (min, not gzipped) | Loaded by |
| --- | --- | --- |
| `index-*.js` (app entry: router, providers, design system) | 365 kB (≈ 112 kB gzip) | every route |
| `charts-*.js` (recharts) | 365 kB (≈ 104 kB gzip) | lazily, only when a campus chart renders (Overview capability section, Analytics, Reports) |
| `jspdf.es.min-*.js` | 381 kB | lazily, only on "Download PDF" in Campus Reports (and the legacy report) |
| `faceProctor-*.js` | 624 kB | legacy proctored flow only |
| Campus pages (`CampusOverviewPage`, `CampusAnalyticsPage`, `CampusBillingPage`, `CampusReportsPage`, …) | 6–8 kB each | their own route |

- Every page is a route-level lazy chunk (`src/app/AppRouter.jsx`, `lazyWithRetry`).
- Charts are behind `React.lazy` inside `src/features/campus/analytics/components.jsx`; pages render
  their table equivalents without waiting for the chart chunk.
- Student lists are server-paginated (`pageSize` ≤ 100); dashboards call summary endpoints only.
- Follow-up (not blocking): the entry chunk could shrink further by moving rarely used providers and
  icons out of it; the Vite size warning is informational.

## 2. API summary endpoints (local, in-process)

Command: `node server/test-support/campusPerf.mjs --students 300 --concurrency 10 --duration 6`
(real `/api/v1` handlers, **memory store**, 300 synthetic students in 3 cohorts, all
with a completed sponsored assessment and 12 synthetic evidence units each; Node
v24.12.0; flags enabled inside the probe process only).

Why not `scripts/loadtest.mjs`: that script hammers one URL of a running server
over HTTP (single method and body, no sign-in or seeded data), so it cannot reach
the authenticated campus endpoints with realistic data. The campus summary
endpoints need an organization, cohorts, sponsored sessions and evidence, which
the in-process probe seeds synthetically. `loadtest.mjs` stays the tool for the
staging capacity run against a deployed server. The probe lives in
`server/test-support/` because it assigns `PRISM_*` flags inside its own
process (the ONE LAW test forbids that anywhere in shipped server code).

| Endpoint | Requests | Errors | Req/s | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /organizations/:id/overview` | 1732 | 0 | 288.7 | 31.5 | 51.6 | 81.0 |
| `GET /organizations/:id/students?pageSize=25` | 1850 | 0 | 308.3 | 30.9 | 40.7 | 49.1 |
| `GET /organizations/:id/analytics/capabilities` | 760 | 0 | 126.7 | 75.7 | 99.4 | 136.3 |
| `GET /organizations/:id/analytics/comparison?groupBy=cohort` | 700 | 0 | 116.7 | 83.1 | 101.9 | 121.8 |
| `GET /organizations/:id/analytics/completion` | 700 | 0 | 116.7 | 82.4 | 110.9 | 135.5 |
| `GET /organizations/:id/billing` | 17510 | 0 | 2918.3 | 3.2 | 4.5 | 5.5 |

All p95 values are below the spec's ~500–800 ms goal **on this probe**. What this
does not show:

- Postgres latency: analytics computes each view per request from the roster and
  evidence (Risks: "analytics per-request compute"); with Postgres every student's
  evidence is a query. A materialised aggregate or a cache is the likely next step
  once real cohort sizes are known.
- Concurrency across API instances, network latency, cold starts.
- The assessment mutation path (engine + AI gateway), which depends on model latency.

A human should repeat the probe against staging Postgres with a realistic cohort
before the analytics flag is flipped (ROLLOUT_PLAN step 6).

## Addendum 2026-10-10 — PROD-READY Phase 5: background job runner (operator runbook)

Nothing above is changed. This addendum describes the new background worker, its
flag and how an operator watches it. Decisions: PROD_READY_STATE.md P52–P60.

### What it is

- A PostgreSQL-backed job queue: table `jobs` (migration `0059_job_queue`, with a
  `.down.sql`). No Redis or other service (P52). Code: `server/domain/jobs/`
  (`kinds.js` payload schemas, `repository.js` memory + PostgreSQL stores,
  `runner.js`, `scheduler.js`, `handlers.js`, `index.js`).
- One worker per API replica, inside the same container, started from
  `server/index.js` **only when `PRISM_JOB_WORKER=true`** (registered OFF; a human
  flips it). Off = nothing is queued or scheduled, and CSV-import invite emails are
  sent inside the request exactly as before.
- Claims use `FOR UPDATE SKIP LOCKED` with a lease (`locked_by`, a fresh
  `lease_token` per claim, `locked_until`). Several replicas never run the same job;
  a crashed replica's lease expires and another replica recovers the job. Results
  from an expired lease are fenced out.
- Failures retry with exponential backoff and jitter (30 s base, doubling, capped
  at 6 h; attempt *n* waits between half and all of `30 s × 2^(n−1)`). After
  `max_attempts` (per kind, 3–6) the job is **DEAD** (a dead letter) until an
  operator acts. A handler can also declare a failure permanent (DEAD at once).
- Recurring work is enqueued by every replica's scheduler tick (once a minute)
  with a dedupe key per time bucket, so only one job per bucket exists however many
  replicas tick:

| Kind | Every | What it does |
| --- | --- | --- |
| `campus.reminders_scan` | 15 min | Enqueues `campus.assignment_reminder` for each unfinished student of a live assignment whose reminder policy is on and whose window ends within `daysBeforeDue` (default 2). One per student per window (dedupe). |
| `campus.seat_release_scan` | 15 min | Enqueues `campus.seat_release` for live assignments whose window ended more than 24 h ago (grace) and less than 30 days ago. |
| `jobs.prune` | daily | Deletes SUCCEEDED / CANCELLED rows older than 30 days. DEAD rows are kept. |
| `retention.enforce`, `retention.import_rows`, `retention.accommodation_requests` | daily | **Scheduled only while `PRISM_RETENTION_ENFORCEMENT=true`** (still OFF until HA-003). Each runs a dry run (receipt) and then the real run; a legal hold on the entity is a clean skip. While the worker runs, the old in-process retention timer is not started. |

Event-driven kinds: `campus.invite_email` (one per CSV-import invite while the
worker flag is on), `campus.assignment_reminder`, `campus.seat_release`.

### Settings (environment, all optional)

| Variable | Default | Range |
| --- | --- | --- |
| `PRISM_JOB_WORKER` | off | `true` to run the worker on this replica |
| `PRISM_JOB_CONCURRENCY` | 2 | 1–16 jobs at a time per replica |
| `PRISM_JOB_POLL_MS` | 2000 | 250–60000 ms between idle polls |
| `PRISM_JOB_LEASE_MS` | 120000 | 10 s – 1 h; renewed every third of the lease while a job runs |

Before flipping `PRISM_JOB_WORKER`: migration 0059 applied, SMTP (`isMailEnabled`)
and `PUBLIC_APP_URL` verified in that environment (without them invite and reminder
jobs succeed with outcome `NOT_SENT`, as the synchronous path does today), and the
flag set on every replica (a replica without it still queues nothing and does not
claim).

### Load

Each idle replica runs one indexed `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP
LOCKED LIMIT n)` and one lease-recovery `UPDATE` per poll (default every 2 s), and
one `INSERT … ON CONFLICT DO NOTHING` per recurring kind per minute. A CSV import of
2,000 rows writes 2,000 invite rows and 2,000 job rows in one transaction per cohort
instead of sending 2,000 emails inside the request; the emails then go out at
`PRISM_JOB_CONCURRENCY` per replica. Not load-tested at cohort scale in this phase
(Phase 6 owns the load test).

### Watching it (operator runbook)

1. **Admin console** → System → *Job queue* (visible only while the flag is on;
   `system:read`). It shows counts per status and lists **DEAD** jobs first, with
   the kind, attempts and the sanitised last error (an error code and a message
   with addresses, links and long numbers removed; payloads hold ids only and
   account ids are masked).
2. API: `GET /api/admin/job-queue?status=DEAD` (`system:read`), `GET
   /api/admin/job-queue/:id`.
3. Logs (JSON): `job_dead_lettered` (error level) — alert on any; also
   `job_attempt_failed`, `job_lease_lost`, `job_leases_released_on_shutdown`,
   `job_runner_pass_failed`, `job_schedule_failed`, `job_worker_started`.
4. SQL (read-only):
   `SELECT kind, status, count(*) FROM jobs GROUP BY 1, 2 ORDER BY 1, 2;`
   `SELECT id, kind, attempts, last_error, updated_at FROM jobs WHERE status = 'DEAD' ORDER BY updated_at DESC LIMIT 50;`
   `SELECT count(*) FROM jobs WHERE status IN ('PENDING','FAILED') AND run_at < now() - interval '15 minutes';` (a growing backlog means no replica is claiming).
5. **Acting on a dead letter** (`jobs:manage`, audited in `admin_audit_events` as
   `job_retried` / `job_cancelled` with the written reason): fix the cause first
   (for example SMTP credentials), then *Retry* (attempts reset, runs at once). Use
   *Cancel* when the work should not happen any more. Handlers are idempotent: a
   retried invite email re-checks that the invite is still pending and issues a
   fresh link (only the newest email's link works); a reminder re-checks that the
   student has not finished and the window is open; a seat release only releases a
   seat that is still RESERVED.
6. **Shutdown**: on SIGTERM the worker stops claiming at once, waits up to 3 s
   after the HTTP drain for running jobs, and gives unfinished leases back
   (status PENDING, the attempt not counted) so another replica continues.
7. **Delivery semantics**: at-least-once. If a replica dies after an email was sent
   but before the job is marked done, the retry sends it once more; the dedupe key
   still prevents the job being scheduled twice.
