// Campus load profile (PROD-READY Phase 6): one synthetic organization at
// cohort scale on a real PostgreSQL, driven through the real /api/v1 campus
// handlers with the production campus wiring (createDefaultCampusContext:
// PostgreSQL repositories, the PostgreSQL v1 store and user store, the
// evidence ledger). Reports p50/p95/p99 for the list, analytics and report
// endpoints (analytics with the decision cache off and on), the assessment
// lock pool under concurrent engine turns, and the job worker draining a
// cohort-sized queue.
//
//   node scripts/loadtest.mjs --profile campus --database-url postgres://…/scratch \
//        [--students 2000] [--assignments 5] [--cohorts 8] [--concurrency 10] [--duration 8] [--out results.json]
//
// Test tooling (like the rest of test-support): flags are enabled inside this
// process only, never in any environment. It WRITES synthetic rows, so it
// refuses a non-loopback database unless --allow-remote is given, and refuses
// NODE_ENV=production outright. Nothing here is a service level.
import http from 'node:http'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const arg = (name, def) => { const i = argv.indexOf(`--${name}`); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def }
const has = (name) => argv.includes(`--${name}`)
const DATABASE_URL = arg('database-url', process.env.LOADTEST_DATABASE_URL || '')
const STUDENTS = Number(arg('students', '2000'))
const ASSIGNMENTS = Number(arg('assignments', '5'))
const COHORTS = Number(arg('cohorts', '8'))
const CONCURRENCY = Number(arg('concurrency', '10'))
const DURATION = Number(arg('duration', '8'))
const OUT = arg('out', null)
const TURN_MS = Number(arg('turn-ms', '2000'))
const SMTP_MS = Number(arg('smtp-ms', '50'))

if (!DATABASE_URL) { console.error('campus profile: --database-url is required (a scratch database; synthetic rows are written)'); process.exit(2) }
if (process.env.NODE_ENV === 'production') { console.error('campus profile: refused under NODE_ENV=production'); process.exit(2) }
const host = new URL(DATABASE_URL).hostname
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !has('allow-remote')) {
  console.error(`campus profile: refusing non-loopback database host ${host} (pass --allow-remote for a staging scratch database)`)
  process.exit(2)
}

process.env.DATABASE_URL = DATABASE_URL
process.env.PRISM_PG_STORE = 'true'
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_CAMPUS_ANALYTICS = 'true'
process.env.PRISM_GROWTH_ENABLED = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'

const log = (...a) => console.error(`[campus-load ${new Date().toISOString().slice(11, 19)}]`, ...a)
const { default: express } = await import('express')
const pool = await import('../db/pool.js')
const { migrateUp } = await import('../db/migrate.js')
const { createDefaultCampusContext } = await import('../domain/campusStore/defaultContext.js')
const { createV1Router } = await import('../routes/v1/index.js')
const { ApiError } = await import('../domain/http/errors.js')
const { seedCampusScale } = await import('./campusScaleSeed.mjs')
const { createPgSessionLocks } = await import('../domain/assessments/sessionLocks.js')
const { createJobsRepoPg } = await import('../domain/jobs/repository.js')
const { createJobRunner } = await import('../domain/jobs/runner.js')
const { buildStudentReportV3, reportContentHash, REPORT_V3_BUILDER_VERSION } = await import('../domain/reports/v3/build.js')
const { assertReportSafe } = await import('../domain/reports/v3/schema.js')
const evidenceGraph = (await import('../lib/evidenceGraph.js')).default
const { query } = pool

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pct = (sorted, q) => +(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] || 0).toFixed(1)

async function machine() {
  const pg = (await query('SELECT version() AS v')).rows[0].v
  return {
    os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model?.trim(), cores: os.cpus().length,
    memoryGb: +(os.totalmem() / 1024 ** 3).toFixed(1), node: process.version, postgres: pg.split(',')[0], databaseHost: host,
  }
}

// ── seed ────────────────────────────────────────────────────────────────────
log(`migrating ${new URL(DATABASE_URL).pathname}`)
await migrateUp()
const campus = createDefaultCampusContext()
const repos = campus.repos
const t0 = Date.now()
const seed = await seedCampusScale({ query, repos, catalog: campus.catalog, students: STUDENTS, assignments: ASSIGNMENTS, cohorts: COHORTS, log })
const seedMs = Date.now() - t0
log(`seeded ${STUDENTS} students in ${seedMs} ms`, seed.counts)
const org = seed.org.id
const owner = seed.owner
const actor = await campus.workspaceService.actorFor(owner)

// A reassessment cycle on the first assignment (rosters every student), with
// the students who completed the second assignment marked complete on it
// (their existing synthetic sessions stand in for reassessment sessions).
const req = { user: owner, requestId: `load-${seed.tag}` }
const tc = Date.now()
const cycle = await campus.growth.createCycle(req, actor, org, {
  name: 'Synthetic reassessment', baselineAssignmentId: seed.assignmentIds[0],
  windowStart: new Date(Date.now() - 3_600_000).toISOString(), windowEnd: new Date(Date.now() + 14 * 86_400_000).toISOString(),
}, { admin: campus.admin })
const cycleMs = Date.now() - tc
await query(
  `UPDATE assessment_assignment_students r SET status = 'COMPLETED', session_id = s.session_id, started_at = s.started_at, completed_at = s.completed_at + interval '30 days'
     FROM assessment_assignment_students s
    WHERE r.assignment_id = $1 AND s.assignment_id = $2 AND s.user_id = r.user_id AND s.status = 'COMPLETED'`,
  [cycle.reassessment.assignmentId, seed.assignmentIds[1]],
)
log(`reassessment cycle created in ${cycleMs} ms (rosters ${cycle.rostered})`)

// Sponsored scopes + published V3 reports for a sample of sessions (the
// sponsor report endpoint reads a published version). Synthetic sessions
// have no pinned run method, so the normal publication path refuses them
// (PINNED_METHOD_UNAVAILABLE, recorded below); the version is built from the
// session's own synthetic evidence with the real Report V3 builder and
// appended, as the campus growth tests do for published-state fixtures.
const sample = seed.sessions.filter((s) => s.assignmentId === seed.assignmentIds[0]).slice(0, 60)
const cohortOf = new Map((await query('SELECT user_id, cohort_id FROM cohort_members WHERE cohort_id = ANY($1::uuid[])', [seed.cohorts.map((c) => c.id)])).rows.map((r) => [r.user_id, r.cohort_id]))
const published = []
const publishFailures = {}
for (const s of sample) {
  await repos.scopes.createSessionScope({ sessionId: s.sessionId, ownerUserId: s.userId, sponsorType: 'INSTITUTION', sponsorOrganizationId: org, workspaceId: `ws-syn-${seed.tag}`, cohortId: cohortOf.get(s.userId) || null, visibilityPolicy: 'OWNER_AND_SPONSOR', createdBy: owner.id }).catch(() => null)
  const out = await campus.reports.publish(s.sessionId, { reason: 'INITIAL' }).then(() => true).catch((err) => `${err?.code || 'ERROR'}: ${String(err?.message || '').slice(0, 120)}`)
  if (out === true) { published.push(s.sessionId); continue }
  publishFailures[out] = (publishFailures[out] || 0) + 1
  const units = await evidenceGraph.getEvidenceUnits(s.sessionId)
  const report = assertReportSafe(buildStudentReportV3({
    sessionId: s.sessionId, definition: seed.definition, formId: seed.form?.id || null, units, turns: [],
    header: { assessmentTitle: seed.definition.title, completedAt: new Date().toISOString(), scope: 'INSTITUTION' },
  }))
  await repos.reportVersions.append({ sessionId: s.sessionId, version: 1, contentHash: reportContentHash(report), builderVersion: REPORT_V3_BUILDER_VERSION, report, issuedAt: new Date().toISOString(), reason: 'INITIAL' })
  published.push(s.sessionId)
}
log(`published ${published.length}/${sample.length} sample reports`, publishFailures)

// Planner statistics, as autovacuum keeps them on a live database: freshly
// bulk-loaded tables without statistics get pathological plans (measured:
// a 12 s directory page before ANALYZE), which is not what production sees.
if (!has('no-analyze')) {
  const ta = Date.now()
  await query('ANALYZE')
  log(`ANALYZE ${Date.now() - ta} ms`)
}

// ── HTTP harness ────────────────────────────────────────────────────────────
const requireUser = (rq, _res, next) => (rq.get('x-load-user') === owner.id ? ((rq.user = owner), next()) : next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.')))
const app = express()
app.use(express.json({ limit: '2mb' }))
app.use('/api/v1', createV1Router({ requireUser, campus }))
const server = app.listen(0, '127.0.0.1')
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}/api/v1/organizations/${org}`
const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY })

function hit(method, url, body) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint()
    const payload = body ? JSON.stringify(body) : null
    const r = http.request(url, { method, agent, headers: { 'x-load-user': owner.id, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, (res) => {
      let bytes = 0
      const chunks = []
      res.on('data', (d) => { bytes += d.length; if (chunks.length < 4) chunks.push(d) })
      res.on('end', () => resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, status: res.statusCode, bytes, sample: Buffer.concat(chunks).toString('utf8').slice(0, 400) }))
    })
    r.on('error', () => resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, status: 0, bytes: 0 }))
    if (payload) r.write(payload)
    r.end()
  })
}

async function drive(name, method, path, body = null, { concurrency = CONCURRENCY, duration = DURATION } = {}) {
  const url = `${base}${path}`
  const warm = await hit(method, url, body)
  const lat = []
  const statuses = {}
  let bytes = 0
  const deadline = Date.now() + duration * 1000
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (Date.now() < deadline) {
      const r = await hit(method, url, body)
      lat.push(r.ms)
      statuses[r.status] = (statuses[r.status] || 0) + 1
      bytes = r.bytes
    }
  }))
  lat.sort((a, b) => a - b)
  const row = {
    endpoint: name, method, requests: lat.length, statuses, rps: +(lat.length / duration).toFixed(1),
    firstMs: +warm.ms.toFixed(1), p50: pct(lat, 0.5), p95: pct(lat, 0.95), p99: pct(lat, 0.99), max: +(lat[lat.length - 1] || 0).toFixed(1), responseBytes: bytes,
    ...(warm.status >= 400 ? { firstError: warm.sample } : {}),
  }
  log(`${name.padEnd(46)} p50 ${String(row.p50).padStart(7)} p95 ${String(row.p95).padStart(7)} rps ${row.rps} ${JSON.stringify(statuses)}`)
  return row
}

const results = {
  profile: 'campus', generatedAt: new Date().toISOString(), machine: await machine(),
  size: { students: STUDENTS, assignments: ASSIGNMENTS, cohorts: COHORTS, ...seed.counts, seedMs, reassessmentRostered: cycle.rostered, publishedReports: published.length, publishFailures },
  load: { concurrency: CONCURRENCY, durationSeconds: DURATION, keepAlive: true, analyzed: !has('no-analyze') },
  lists: [], analytics: { cacheOff: [], cacheOn: [] }, reports: [], locks: [], worker: [],
}

// ── lists ───────────────────────────────────────────────────────────────────
const someStudent = seed.studentIds[17]
const rosterCursor = (await (await fetch(`${base}/assignments/${seed.assignmentIds[0]}`, { headers: { 'x-load-user': owner.id } })).json())?.data?.nextCursor || null
const lists = [
  ['GET /overview', '/overview'],
  ['GET /students?pageSize=25', '/students?pageSize=25'],
  ['GET /students?pageSize=100&page=15', '/students?pageSize=100&page=15'],
  ['GET /students?q=student 01&pageSize=25', `/students?q=${encodeURIComponent('student 01')}&pageSize=25`],
  ['GET /students?assessment=COMPLETED&cohortId', `/students?assessment=COMPLETED&cohortId=${seed.cohorts[0].id}&pageSize=25`],
  ['GET /students/:studentId', `/students/${someStudent}`],
  ['GET /cohorts', '/cohorts'],
  ['GET /cohorts/:id (members page)', `/cohorts/${seed.cohorts[0].id}`],
  ['GET /assignments', '/assignments'],
  ['GET /assignments/:id (roster page 1)', `/assignments/${seed.assignmentIds[0]}`],
  ['GET /members', '/members'],
  ['GET /audit?limit=50', '/audit?limit=50'],
]
if (rosterCursor) lists.push(['GET /assignments/:id (roster page 2)', `/assignments/${seed.assignmentIds[0]}?cursor=${rosterCursor}`])
for (const [name, path] of lists) results.lists.push(await drive(name, 'GET', path))
results.lists.push(await drive('GET /students/export (2,000-row CSV)', 'GET', '/students/export', null, { concurrency: 2, duration: Math.max(4, Math.floor(DURATION / 2)) }))

// ── analytics (cache off, then on) ──────────────────────────────────────────
const analytics = [
  ['GET /analytics/capabilities', '/analytics/capabilities'],
  ['GET /analytics/sufficiency', '/analytics/sufficiency'],
  ['GET /analytics/comparison?groupBy=cohort', '/analytics/comparison?groupBy=cohort'],
  ['GET /analytics/completion', '/analytics/completion'],
  ['GET /analytics/growth', '/analytics/growth'],
]
delete process.env.PRISM_ANALYTICS_DECISION_CACHE
for (const [name, path] of analytics) results.analytics.cacheOff.push(await drive(name, 'GET', path, null, { concurrency: Math.min(CONCURRENCY, 4), duration: DURATION }))
process.env.PRISM_ANALYTICS_DECISION_CACHE = 'true'
await query('DELETE FROM session_decision_cache')
const cold = await hit('GET', `${base}/analytics/capabilities`)
results.analytics.coldFillMs = +cold.ms.toFixed(1)
results.analytics.cachedRows = Number((await query('SELECT count(*) AS n FROM session_decision_cache')).rows[0].n)
for (const [name, path] of analytics) results.analytics.cacheOn.push(await drive(name, 'GET', path))
log(`decision cache: cold fill ${results.analytics.coldFillMs} ms for ${results.analytics.cachedRows} rows`)

// ── reports ─────────────────────────────────────────────────────────────────
results.reports.push(await drive('POST /reports/cohort (executive)', 'POST', '/reports/cohort', {}))
results.reports.push(await drive('POST /reports/cohort (one cohort)', 'POST', '/reports/cohort', { cohortId: seed.cohorts[0].id }))
if (published.length) {
  let i = 0
  const sid = () => published[(i += 1) % published.length]
  // Rotate across published sessions so the report is not one cached row.
  const lat = []
  const statuses = {}
  const deadline = Date.now() + DURATION * 1000
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (Date.now() < deadline) {
      const r = await hit('GET', `${base}/sessions/${sid()}/report`)
      lat.push(r.ms)
      statuses[r.status] = (statuses[r.status] || 0) + 1
    }
  }))
  lat.sort((a, b) => a - b)
  results.reports.push({ endpoint: 'GET /sessions/:sessionId/report (sponsor V3)', method: 'GET', requests: lat.length, statuses, rps: +(lat.length / DURATION).toFixed(1), p50: pct(lat, 0.5), p95: pct(lat, 0.95), p99: pct(lat, 0.99), max: +(lat[lat.length - 1] || 0).toFixed(1) })
  log('sponsor report', JSON.stringify(results.reports[results.reports.length - 1]))
}
server.close()
agent.destroy()

// ── assessment lock pool (PG_SESSION_LOCK_POOL_MAX, default 5) ──────────────
// Each "turn" holds its advisory lock for TURN_MS, like an engine turn; a V3
// start nests two locks (assignment, then session). A request waits up to
// 8 s for a pool connection, then gets a retryable 503.
if (!has('skip-locks')) {
  const locks = createPgSessionLocks({ getPool: pool.getSessionLockPool })
  for (const nested of [false, true]) {
    for (const n of [5, 6, 10, 20, 25, 30, 40]) {
      const started = Date.now()
      const outcomes = await Promise.all(Array.from({ length: n }, async (_, k) => {
        const t = Date.now()
        const turn = () => sleep(TURN_MS)
        try {
          if (nested) await locks.withLock(`load:assignment:${seed.tag}:${k}`, () => locks.withLock(`load:session:${seed.tag}:${k}`, turn))
          else await locks.withLock(`load:session:${seed.tag}:${k}`, turn)
          return { ok: true, ms: Date.now() - t }
        } catch (err) {
          return { ok: false, ms: Date.now() - t, code: err?.code || 'ERROR' }
        }
      }))
      const okMs = outcomes.filter((o) => o.ok).map((o) => o.ms).sort((a, b) => a - b)
      const row = {
        scenario: nested ? 'V3 start (two nested locks)' : 'engine turn (one lock)', concurrent: n, turnMs: TURN_MS, poolMax: Number(process.env.PG_SESSION_LOCK_POOL_MAX || 5),
        succeeded: okMs.length, failed: n - okMs.length, failureCodes: [...new Set(outcomes.filter((o) => !o.ok).map((o) => o.code))],
        p50Ms: pct(okMs, 0.5), maxMs: okMs[okMs.length - 1] || 0, wallMs: Date.now() - started,
      }
      results.locks.push(row)
      log(`locks ${row.scenario} n=${n}: ok ${row.succeeded} failed ${row.failed} ${row.failureCodes.join(',')} max ${row.maxMs} ms`)
      if (nested && row.succeeded === 0) break
    }
  }
}

// ── job worker at cohort scale ──────────────────────────────────────────────
// The real queue (FOR UPDATE SKIP LOCKED claims, leases, completion writes);
// the invite email itself is a stub that takes SMTP_MS, so this measures the
// queue and the runner, not a mail provider.
if (!has('skip-worker')) {
  const jobs = createJobsRepoPg({ query })
  const scenarios = [{ replicas: 1, concurrency: 2, jobs: 400 }, { replicas: 2, concurrency: 2, jobs: 400 }, { replicas: 2, concurrency: 8, jobs: 2000 }]
  for (const sc of scenarios) {
    await query("DELETE FROM jobs WHERE kind = 'campus.invite_email' AND dedupe_key LIKE 'load-%'")
    const te = Date.now()
    for (let i = 0; i < sc.jobs; i += 1) await jobs.enqueue({ kind: 'campus.invite_email', payload: { inviteId: randomUUID() }, dedupeKey: `load-${seed.tag}-${sc.replicas}-${sc.concurrency}-${i}` })
    const enqueueMs = Date.now() - te
    const handlers = { 'campus.invite_email': { run: async () => { await sleep(SMTP_MS); return { outcome: 'SENT' } } } }
    const runners = Array.from({ length: sc.replicas }, (_, r) => createJobRunner({ repo: jobs, handlers, workerId: `load-${r}`, concurrency: sc.concurrency, pollMs: 50 }))
    const td = Date.now()
    const done = await Promise.all(runners.map((rn) => rn.drainDue({ maxPasses: 100_000 })))
    const drainMs = Date.now() - td
    const succeeded = done.reduce((s, d) => s + d.succeeded, 0)
    const row = { ...sc, smtpMs: SMTP_MS, enqueueMs, drainMs, succeeded, jobsPerSecond: +(succeeded / (drainMs / 1000)).toFixed(1), idealJobsPerSecond: +((sc.replicas * sc.concurrency * 1000) / SMTP_MS).toFixed(1) }
    results.worker.push(row)
    log(`worker ${JSON.stringify(row)}`)
  }
  await query("DELETE FROM jobs WHERE kind = 'campus.invite_email' AND dedupe_key LIKE 'load-%'")
  // Reminder scan over one assignment with every student unfinished-or-not.
  await query("UPDATE assessment_assignments SET reminder_policy = jsonb_build_object('enabled', true, 'daysBeforeDue', 2), window_end = now() + interval '1 day' WHERE id = $1", [seed.assignmentIds[4 % seed.assignmentIds.length]])
  const ts = Date.now()
  const scan = await campus.admin.scanReminders({ enqueue: (input) => jobs.enqueue(input) })
  results.worker.push({ scenario: 'reminder scan (one assignment)', ...scan, ms: Date.now() - ts })
  log(`reminder scan ${JSON.stringify(results.worker[results.worker.length - 1])}`)
  await query("DELETE FROM jobs WHERE kind = 'campus.assignment_reminder'")
}

await pool.closePool()
const json = JSON.stringify(results, null, 2)
if (OUT) writeFileSync(OUT, json)
console.log(json)
