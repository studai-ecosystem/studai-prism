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

## Addendum 2026-10-10 — PROD-READY Phase 6: performance at cohort scale (2,000 students, real PostgreSQL)

Charter Phase 6. Measured on a developer workstation, **not** staging and not
production: Windows 11 Pro (10.0.26200), AMD EPYC 7R13, 8 cores, 62.6 GB RAM,
Node v24.12.0, PostgreSQL 17.10 (embedded, same machine, loopback). These are
engineering measurements, not service levels.

### How it was measured

`node scripts/loadtest.mjs --profile campus --database-url postgres://…/prism_p06_load --students 2000`
(the campus profile runs `server/test-support/campusLoad.mjs`). It seeds ONE
synthetic organization into a scratch database — 2,000 students in 8 cohorts
(4 departments), 5 assignments targeting every cohort (completion 90/80/60/40/10 %),
10,000 roster rows, 6,587 sessions, 5,611 issued reports, 67,332 evidence
units, a reassessment cycle rostering all 2,000 students, and 60 Report V3
versions — then drives each endpoint with 10 concurrent keep-alive clients for
8 s (analytics with the decision cache off: 4 clients) through the real
`/api/v1` handlers and the production campus wiring
(`createDefaultCampusContext`: PostgreSQL repositories, PostgreSQL v1 store and
user store, evidence ledger). All data is synthetic and generated by the
script; it refuses a non-loopback database unless `--allow-remote` is given.
`ANALYZE` runs after seeding (a live database has autovacuum statistics;
without them the first directory page took 12 s — see "First pass").

Not covered: HTTP auth/JWT, rate limiting, helmet/compression, TLS, network
latency, a separate database host, several API replicas, cold container
starts, the AI gateway. Client and server share the 8 cores, so the numbers
include client overhead.

### Target: list endpoints p95 < 500 ms at 2,000 students — met on this machine

| Endpoint | Requests | Status | Req/s | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /overview` | 1804 | 200×1804 | 225.5 | 43 | 61.6 | 77.8 |
| `GET /students?pageSize=25` | 2777 | 200×2777 | 347.1 | 27.4 | 40.9 | 54.8 |
| `GET /students?pageSize=100&page=15` | 1750 | 200×1750 | 218.8 | 44 | 59.3 | 78 |
| `GET /students?q=student 01&pageSize=25` | 2470 | 200×2470 | 308.8 | 30.7 | 43.6 | 59.9 |
| `GET /students?assessment=COMPLETED&cohortId` | 1980 | 200×1980 | 247.5 | 38.4 | 53.4 | 79.2 |
| `GET /students/:studentId` | 3994 | 200×3994 | 499.3 | 18.1 | 30 | 62.8 |
| `GET /cohorts` | 8694 | 200×8694 | 1086.8 | 8.7 | 11.6 | 20.8 |
| `GET /cohorts/:id (members page)` | 4184 | 200×4184 | 523 | 17.5 | 25.6 | 50.8 |
| `GET /assignments` | 2982 | 200×2982 | 372.8 | 25.8 | 33.4 | 44.2 |
| `GET /assignments/:id (roster page 1)` | 1825 | 200×1825 | 228.1 | 40.2 | 65.6 | 105.7 |
| `GET /members` | 7221 | 200×7221 | 902.6 | 10.7 | 13.8 | 23.5 |
| `GET /audit?limit=50` | 8137 | 200×8137 | 1017.1 | 9.2 | 13.2 | 22.5 |
| `GET /assignments/:id (roster page 2)` | 2267 | 200×2267 | 283.4 | 32.6 | 50.1 | 97.3 |
| `GET /students/export (2,000-row CSV)` | 78 | 200×78 | 19.5 | 100 | 130.9 | 151.7 |

### Analytics

Cache off (per-request computation, as before Phase 6; 4 concurrent clients):

| Endpoint | Requests | Status | Req/s | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /analytics/capabilities` | 8 | 200×8 | 1 | 5763.5 | 5773.7 | 5773.7 |
| `GET /analytics/sufficiency` | 8 | 200×8 | 1 | 5238.2 | 5239.5 | 5239.5 |
| `GET /analytics/comparison?groupBy=cohort` | 8 | 200×8 | 1 | 7252.4 | 7326.9 | 7326.9 |
| `GET /analytics/completion` | 444 | 200×444 | 55.5 | 70.4 | 92.4 | 136.9 |
| `GET /analytics/growth` | 4 | 200×4 | 0.5 | 9174.5 | 9174.6 | 9174.6 |

Cache on (`PRISM_ANALYTICS_DECISION_CACHE`, registered OFF; 10 concurrent
clients; filling the cache for 1,954 sessions on the first request took 1,874 ms):

| Endpoint | Requests | Status | Req/s | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /analytics/capabilities` | 168 | 200×168 | 21 | 459.8 | 678.5 | 761.1 |
| `GET /analytics/sufficiency` | 183 | 200×183 | 22.9 | 426.4 | 608.3 | 650.2 |
| `GET /analytics/comparison?groupBy=cohort` | 179 | 200×179 | 22.4 | 456.9 | 539.9 | 581.4 |
| `GET /analytics/completion` | 520 | 200×520 | 65 | 145.9 | 225.7 | 279.4 |
| `GET /analytics/growth` | 76 | 200×76 | 9.5 | 1116.1 | 1505.4 | 1622.3 |

No target was set for analytics. With the cache off every view recomputes
every counted student's sufficiency decisions (about 5–9 s per request at
2,000 students). With it on, capabilities / sufficiency / comparison are about
0.5–0.7 s p95 under 10 concurrent requests (about 80 ms for a single request).
Growth outcomes still load full decision entries for both sessions of every
pair (about 1.5 s p95). `completion` needs no decisions and no longer loads them.

### Reports

| Endpoint | Requests | Status | Req/s | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /reports/cohort (executive)` | 89 | 200×89 | 11.1 | 902.7 | 1282.3 | 1370.4 |
| `POST /reports/cohort (one cohort)` | 120 | 200×120 | 15 | 675.5 | 905.7 | 936.1 |
| `GET /sessions/:sessionId/report (sponsor V3)` | 3034 | 200×3034 | 379.3 | 24.8 | 34.9 | 70.1 |

The cohort report runs completion, capabilities, missions and cycles in one
request (measured with the cache on). The sponsor Report V3 read serves a
stored version. The 60 sample versions were built from each session's
synthetic evidence with the real builder and appended, because the normal
publication path refuses synthetic sessions (they have no pinned run method:
`PINNED_METHOD_UNAVAILABLE`, recorded in the results).

### Assessment lock pool (`PG_SESSION_LOCK_POOL_MAX`, default 5 per replica)

Concurrent operations on distinct sessions, each holding its advisory lock for
a simulated 2 s engine turn. A request waits up to 8 s for a pool connection,
then gets a retryable 503 (`CAMPUS_STORE_UNAVAILABLE`):

| Scenario | Concurrent | Turn ms | Pool | OK | Failed | Codes | max ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| engine turn (one lock) | 5 | 2000 | 5 | 5 | 0 |  | 2252 |
| engine turn (one lock) | 6 | 2000 | 5 | 6 | 0 |  | 4016 |
| engine turn (one lock) | 10 | 2000 | 5 | 10 | 0 |  | 4029 |
| engine turn (one lock) | 20 | 2000 | 5 | 20 | 0 |  | 8041 |
| engine turn (one lock) | 25 | 2000 | 5 | 20 | 5 | CAMPUS_STORE_UNAVAILABLE | 8044 |
| engine turn (one lock) | 30 | 2000 | 5 | 20 | 10 | CAMPUS_STORE_UNAVAILABLE | 8042 |
| engine turn (one lock) | 40 | 2000 | 5 | 20 | 20 | CAMPUS_STORE_UNAVAILABLE | 8072 |
| V3 start (two nested locks) | 5 | 2000 | 5 | 5 | 0 |  | 2020 |
| V3 start (two nested locks) | 6 | 2000 | 5 | 6 | 0 |  | 4011 |
| V3 start (two nested locks) | 10 | 2000 | 5 | 10 | 0 |  | 4071 |
| V3 start (two nested locks) | 20 | 2000 | 5 | 20 | 0 |  | 8069 |
| V3 start (two nested locks) | 25 | 2000 | 5 | 20 | 5 | CAMPUS_STORE_UNAVAILABLE | 8048 |
| V3 start (two nested locks) | 30 | 2000 | 5 | 20 | 10 | CAMPUS_STORE_UNAVAILABLE | 8054 |
| V3 start (two nested locks) | 40 | 2000 | 5 | 20 | 20 | CAMPUS_STORE_UNAVAILABLE | 8051 |

**Saturation point.** One replica runs 5 locked operations at a time. A burst
of N concurrent operations is served in waves of 5, and a request whose wave
would start after the 8 s connection wait fails. With 2 s turns the burst
ceiling is 5 × 4 = 20 per replica (observed: 20 of 25, 30 and 40 succeed).
With real engine turns of 10–30 s the ceiling is the pool itself: the 6th
concurrent turn on a replica fails after 8 s. Sustained throughput is at most
5 / turn-duration operations per second per replica.

**Defect found and fixed (P66).** Before this phase a V3 start took its two
nested locks (assignment, then session) on two pool connections. In the first
measurement (200 students, 0.3 s turns) 5 concurrent starts each held one
connection and waited for a second: all 5 failed after 8 s. Nested locks now
reuse the enclosing operation's connection, so starts behave like single-lock
turns (table above).

### Job worker (PostgreSQL queue, Phase 5)

Real queue (claims, leases, completion writes); the email itself is a 50 ms stub:

| Replicas | Concurrency | Jobs | Drain | Jobs/s | Ideal jobs/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 2 (default) | 400 | 12.9 s | 30.9 | 40 |
| 2 | 2 | 400 | 6.5 s | 61.2 | 80 |
| 2 | 8 | 2,000 | 8.4 s | 239.2 | 320 |

Enqueueing 2,000 jobs one by one took 3.3 s. A reminder scan over one
assignment of 2,000 students enqueued 1,789 reminders in 2.8 s. With the
default settings a 2,000-row CSV import's invitations drain in about 65 s on
one replica plus the mail provider's real latency; raise
`PRISM_JOB_CONCURRENCY` if that matters.

### First pass (same machine, before ANALYZE and before the last optimisations)

The first 2,000-student run measured: overview p95 1,490 ms; directory page 1
p95 13,181 ms (one 500, no planner statistics); directory with a search
422 ms; student detail 598 ms; team list 355 ms; analytics with the cache on
2.1–3.0 s p95; executive cohort report 4.5 s. The fixes that followed: overview
counts in one SQL statement; the directory page chosen from names first, with
cohorts and the latest assessment looked up for that page only; student detail
reads only that student; the team list reads only staff memberships;
`completion` no longer loads decisions; analytics reads each student's latest
completed session and the roster status counts in SQL and only the analytics
subset of each cached decision; `ANALYZE` after seeding. No pre-Phase-6 code
was load-tested on PostgreSQL; the memory-store probe (§2) is the only earlier
measurement.

### What would close the remaining gaps

- Analytics under concurrency: the per-request cost is now dominated by
  reading the population and about 2,000 cached summaries in one Node thread.
  An organization-level aggregate (counts per cohort × capability × bucket)
  invalidated by the same triggers would make the views O(cohorts).
- Growth outcomes: keep the per-capability comparison inputs (band, status,
  rules version, evidence count) in the summary so pairs need not load full
  entries.
- Lock pool: size `PG_SESSION_LOCK_POOL_MAX` to the expected concurrent engine
  turns per replica within the RDS connection budget, and/or add replicas
  (after the multi-replica checklist, P41).
- Re-run this profile against staging PostgreSQL (separate host, network
  latency) before the analytics flag is flipped (ROLLOUT_PLAN step 6).

### Bundle review

`npm run build` (vite 5): entry `index-*.js` 410.89 kB (123.93 kB gzip) and
charts chunk 374.16 kB (103.76 kB gzip), both unchanged from Phase 5.
Source-map breakdown of the entry: react-dom 126.9 kB, zod 54.8 kB,
react-router 38.8 kB, @tanstack/query-core 38.4 kB, `AppRouter.jsx` 23.5 kB,
`src/lib/copy` 18.7 kB, lucide-react 16.5 kB, `src/api/student.js` 11.9 kB,
everything else under 10 kB. The charts chunk is recharts (224.8 kB), lodash,
d3 and the campus chart module; only the campus analytics components chunk
imports it (`React.lazy`), and it is fetched only when a chart renders.
**Decision: no further split** (P67). Every route needs the framework, the
router, the query client and the zod API layer, and the charts chunk already
loads only where charts are drawn. Possible follow-up (about 8 kB gzip):
move student-only copy and the `api/student.js` schemas out of the entry.
