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
