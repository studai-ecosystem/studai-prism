// PROD-READY Phase 5: the background job queue on a real PostgreSQL
// (migration 0059). Two "replicas" (each with its own pg pool, repository
// and runner) share one database: they claim disjoint jobs with FOR UPDATE
// SKIP LOCKED and process N jobs exactly once. Also: the 0059 constraints
// (dedupe per kind, lease shape), retry with backoff and dead-lettering
// through the SQL path, lease expiry recovery and fencing, graceful release,
// the scheduler's per-bucket dedupe across replicas, every moved workload
// (queued CSV invites in one transaction with their invites, reminders,
// seat release, the import-row and unstarted-accommodation retention passes
// behind PRISM_RETENTION_ENFORCEMENT), account erasure of the person's jobs,
// and a clean down/up. Requires TEST_DATABASE_URL (skips otherwise); run
// serially with the other *.db.test.js files.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.PRISM_PG_STORE = 'true'
  process.env.PRISM_CAMPUS_ENABLED = 'true'
}

const pg = skip ? null : (await import('pg')).default
const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { closePool, query, getPool, getSessionLockPool } = skip ? {} : await import('../db/pool.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')
const { createCampusContext } = skip ? {} : await import('../domain/campusStore/context.js')
const { createJobsRepoPg } = skip ? {} : await import('../domain/jobs/repository.js')
const { createJobRunner } = skip ? {} : await import('../domain/jobs/runner.js')
const { createJobHandlers } = skip ? {} : await import('../domain/jobs/handlers.js')
const { scheduleRecurring } = skip ? {} : await import('../domain/jobs/scheduler.js')
const { USER_STATEMENTS } = skip ? {} : await import('../domain/privacy/erasureCascade.js')

const one = async (sql, params = []) => (await query(sql, params)).rows[0]
const n = async (sql, params = []) => Number((await query(sql, params)).rows[0].n)
const silent = { info() {}, warn() {}, error() {} }

function replica() {
  const pool = new pg.Pool({ connectionString: TEST_DB, max: 4 })
  const repo = createJobsRepoPg({ query: (text, params) => pool.query(text, params) })
  return { pool, repo, close: () => pool.end() }
}

async function withFlag(key, value, fn) {
  const before = process.env[key]
  if (value == null) delete process.env[key]
  else process.env[key] = value
  try { return await fn() } finally { if (before == null) delete process.env[key]; else process.env[key] = before }
}

// Only rows this file created are touched: every kind used here is scoped by
// a per-run tag inside the payload or the dedupe key.
const TAG = `p5-${randomUUID().slice(0, 8)}`
const cleanJobs = () => query(`DELETE FROM jobs WHERE dedupe_key LIKE $1 OR payload::text LIKE $2`, [`%${TAG}%`, `%${TAG}%`])
// The runners below drain whatever is due, so the workload tests start from
// an idle queue on this scratch database (other suites may leave rows behind).
const idleQueue = () => query(`DELETE FROM jobs WHERE status IN ('PENDING', 'FAILED', 'RUNNING')`)

test('0059: dedupe per kind and the lease shape are database facts', { skip }, async (t) => {
  t.after(async () => { await cleanJobs(); await closePool() })
  await migrateUp()
  assert.equal(await n("SELECT count(*)::int AS n FROM schema_migrations WHERE name = '0059_job_queue'"), 1)
  await query(`INSERT INTO jobs (kind, payload, dedupe_key) VALUES ('campus.seat_release', '{}', $1)`, [`${TAG}-d`])
  await assert.rejects(() => query(`INSERT INTO jobs (kind, payload, dedupe_key) VALUES ('campus.seat_release', '{}', $1)`, [`${TAG}-d`]), /jobs_dedupe_per_kind/)
  await query(`INSERT INTO jobs (kind, payload, dedupe_key) VALUES ('jobs.prune', '{}', $1)`, [`${TAG}-d`]) // another kind: allowed
  await assert.rejects(() => query(`INSERT INTO jobs (kind, payload, status, dedupe_key) VALUES ('campus.seat_release', '{}', 'RUNNING', $1)`, [`${TAG}-r`]), /jobs_running_has_lease/)
  await assert.rejects(() => query(`INSERT INTO jobs (kind, payload, locked_by, dedupe_key) VALUES ('campus.seat_release', '{}', 'w', $1)`, [`${TAG}-l`]), /jobs_idle_has_no_lease/)
  await assert.rejects(() => query(`INSERT INTO jobs (kind, payload, status, dedupe_key) VALUES ('campus.seat_release', '{}', 'LOST', $1)`, [`${TAG}-s`]), /check/i)
  await assert.rejects(() => query(`INSERT INTO jobs (kind, payload, dedupe_key) VALUES ('Bad Kind!', '{}', $1)`, [`${TAG}-k`]), /check/i)
})

test('two replicas on one database: disjoint SKIP LOCKED claims; N jobs processed exactly once', { skip }, async (t) => {
  await migrateUp()
  await idleQueue()
  const a = replica()
  const b = replica()
  t.after(async () => { await cleanJobs(); await a.close(); await b.close(); await closePool() })
  const N = 60
  for (let i = 0; i < N; i += 1) await a.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: `${TAG}-${i}` } })
  // Raw claims racing on two connections never return the same row.
  const raced = await Promise.all([
    a.repo.claim({ workerId: 'a', kinds: ['campus.seat_release'], limit: 7, leaseMs: 60_000 }),
    b.repo.claim({ workerId: 'b', kinds: ['campus.seat_release'], limit: 7, leaseMs: 60_000 }),
    a.repo.claim({ workerId: 'a2', kinds: ['campus.seat_release'], limit: 7, leaseMs: 60_000 }),
    b.repo.claim({ workerId: 'b2', kinds: ['campus.seat_release'], limit: 7, leaseMs: 60_000 }),
  ])
  const ids = raced.flat().map((j) => j.id)
  assert.equal(ids.length, 28)
  assert.equal(new Set(ids).size, 28, 'no row claimed twice')
  for (const j of raced.flat()) await (j.lockedBy.startsWith('a') ? a : b).repo.release(j.id, j.leaseToken)
  // Two runners drain the queue concurrently.
  const seen = new Map()
  const handlers = { 'campus.seat_release': { async run({ assignmentId }, { job }) { if (!assignmentId.startsWith(TAG)) return {}; seen.set(assignmentId, [...(seen.get(assignmentId) || []), job.lockedBy]); await new Promise((r) => setTimeout(r, 2)); return { ok: true } } } }
  const ra = createJobRunner({ repo: a.repo, handlers, workerId: 'replica-a', concurrency: 4 })
  const rb = createJobRunner({ repo: b.repo, handlers, workerId: 'replica-b', concurrency: 4 })
  await Promise.all([ra.drainDue(), rb.drainDue()])
  assert.equal(seen.size, N)
  assert.ok([...seen.values()].every((by) => by.length === 1), 'each job ran exactly once')
  const byWorker = new Set([...seen.values()].map((by) => by[0]))
  assert.deepEqual([...byWorker].sort(), ['replica-a', 'replica-b'], 'both replicas took work')
  assert.equal(await n(`SELECT count(*)::int AS n FROM jobs WHERE payload->>'assignmentId' LIKE $1 AND status = 'SUCCEEDED' AND attempts = 1 AND lease_token IS NULL`, [`${TAG}-%`]), N)
})

test('retry with backoff, dead letter, lease recovery, fencing and graceful release through the SQL path', { skip }, async (t) => {
  await migrateUp()
  await idleQueue()
  const a = replica()
  const b = replica()
  t.after(async () => { await cleanJobs(); await a.close(); await b.close(); await closePool() })
  let now = new Date('2030-01-01T00:00:00.000Z') // far future: every row of this test is due
  const clock = () => now
  let calls = 0
  const handlers = { 'campus.seat_release': { async run({ assignmentId }) { if (assignmentId.endsWith('-flaky') && (calls += 1) < 3) { const e = new Error(`smtp said no to x@y.edu (${calls})`); e.code = 'ETIMEDOUT'; throw e } if (assignmentId.endsWith('-broken')) { const e = new Error('always'); e.code = 'EBROKEN'; throw e } return { done: assignmentId } } } }
  const runner = createJobRunner({ repo: a.repo, handlers, workerId: 'retry-a', clock, random: () => 0, backoff: { baseMs: 1000 } })
  const flaky = (await a.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: `${TAG}-flaky` }, runAt: now }, { now: now.toISOString() })).job
  const broken = (await a.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: `${TAG}-broken` }, runAt: now, maxAttempts: 2 }, { now: now.toISOString() })).job
  await runner.runOnce()
  let row = await a.repo.get(flaky.id)
  assert.equal(row.status, 'FAILED')
  assert.equal(new Date(row.runAt).getTime() - now.getTime(), 500, 'attempt 1: half of base with zero jitter')
  assert.equal(row.lastError, 'ETIMEDOUT: smtp said no to [address] (1)')
  now = new Date(now.getTime() + 500)
  await runner.runOnce()
  row = await a.repo.get(flaky.id)
  assert.equal(new Date(row.runAt).getTime() - now.getTime(), 1000, 'attempt 2 doubles')
  assert.equal((await a.repo.get(broken.id)).status, 'DEAD', 'max attempts (2) reached')
  now = new Date(now.getTime() + 1000)
  await runner.runOnce()
  row = await a.repo.get(flaky.id)
  assert.deepEqual([row.status, row.attempts, row.result, row.lastError], ['SUCCEEDED', 3, { done: `${TAG}-flaky` }, null])
  // Operator retry of the dead letter, then cancel.
  assert.equal((await a.repo.retry(broken.id)).status, 'PENDING')
  assert.equal((await a.repo.cancel(broken.id)).status, 'CANCELLED')
  assert.equal(await a.repo.retry(broken.id), null)

  // Lease expiry: replica A "crashes" holding a job; B recovers and reclaims; A is fenced out.
  const crashed = (await a.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: `${TAG}-crash` }, runAt: now }, { now: now.toISOString() })).job
  const [held] = await a.repo.claim({ workerId: 'crash-a', kinds: ['campus.seat_release'], limit: 1, leaseMs: 5_000, now: now.toISOString() })
  assert.equal(held.id, crashed.id)
  assert.deepEqual(await b.repo.claim({ workerId: 'b', kinds: ['campus.seat_release'], limit: 5, now: now.toISOString() }), [])
  now = new Date(now.getTime() + 5_001)
  assert.deepEqual(await b.repo.recoverExpired({ now: now.toISOString() }), { recovered: 1, dead: 0 })
  const [reclaimed] = await b.repo.claim({ workerId: 'b', kinds: ['campus.seat_release'], limit: 5, now: now.toISOString() })
  assert.deepEqual([reclaimed.id, reclaimed.attempts], [crashed.id, 2])
  assert.equal(await a.repo.complete(crashed.id, held.leaseToken, { result: { late: true } }), false, 'the old lease token is fenced out')
  assert.deepEqual(await a.repo.fail(crashed.id, held.leaseToken, { error: 'x', retryAt: now.toISOString() }), null)
  assert.equal(await b.repo.renew(crashed.id, reclaimed.leaseToken, { leaseMs: 10_000, now: now.toISOString() }), true)
  // Graceful release keeps the attempt count honest.
  assert.equal(await b.repo.release(crashed.id, reclaimed.leaseToken, { now: now.toISOString() }), true)
  row = await a.repo.get(crashed.id)
  assert.deepEqual([row.status, row.attempts, row.lockedBy, row.leaseToken], ['PENDING', 1, null, null])
})

test('scheduler: two replicas ticking the same bucket enqueue each recurring job once', { skip }, async (t) => {
  await migrateUp()
  const a = replica()
  const b = replica()
  const bucketDay = new Date(`2031-0${1 + Math.floor(Math.random() * 8)}-1${Math.floor(Math.random() * 9)}T10:00:00.000Z`)
  t.after(async () => {
    await query(`DELETE FROM jobs WHERE payload->>'bucket' >= $1 AND payload->>'bucket' < $2`, [new Date(bucketDay.getTime() - 86_400_000).toISOString(), new Date(bucketDay.getTime() + 86_400_000).toISOString()])
    await a.close(); await b.close(); await closePool()
  })
  const ticks = await Promise.all([
    scheduleRecurring({ repo: a.repo, now: bucketDay, retentionOn: () => true }),
    scheduleRecurring({ repo: b.repo, now: new Date(bucketDay.getTime() + 60_000), retentionOn: () => true }),
    scheduleRecurring({ repo: a.repo, now: new Date(bucketDay.getTime() + 120_000), retentionOn: () => true }),
  ])
  const scheduled = ticks.flatMap((x) => x.scheduled).sort()
  assert.deepEqual(scheduled, ['campus.reminders_scan', 'campus.seat_release_scan', 'jobs.prune', 'retention.accommodation_requests', 'retention.enforce', 'retention.import_rows'])
  const bucket15 = new Date(Math.floor(bucketDay.getTime() / 900_000) * 900_000).toISOString()
  assert.equal(await n(`SELECT count(*)::int AS n FROM jobs WHERE kind = 'campus.reminders_scan' AND payload->>'bucket' = $1`, [bucket15]), 1)
})

// ── moved workloads on PostgreSQL ────────────────────────────────────────────
async function seedOrg() {
  await query(`INSERT INTO assessment_definitions (assessment_definition_id, job_family, title) VALUES ('P5-DEF', 'synthetic', 'Synthetic Brief') ON CONFLICT DO NOTHING`)
  const org = (await one(`INSERT INTO organizations (name, slug, organization_type, status) VALUES ('Synthetic College', $1, 'COLLEGE', 'ACTIVE') RETURNING id`, [`${TAG}-${randomUUID()}`])).id
  const cohort = (await one(`INSERT INTO cohorts (organization_id, name, status) VALUES ($1, 'Cohort P5', 'ACTIVE') RETURNING id`, [org])).id
  return { org, cohort }
}
async function seedAssignment(org, { windowEnd, reminders = false, status = 'ACTIVE' }) {
  const id = `${TAG}-asg-${randomUUID().slice(0, 8)}`
  await query(`INSERT INTO assessment_assignments (id, definition_id, form_policy, sponsor_type, organization_id, window_start, window_end, integrity_policy, accommodations_policy, reminder_policy, created_by, status)
               VALUES ($1, 'P5-DEF', 'SERVER_SELECTED', 'INSTITUTION', $2, $3::timestamptz - interval '10 days', $3, 'STANDARD', '{"requestable": true}', $4, 'p5staff', $5)`,
  [id, org, windowEnd, JSON.stringify({ enabled: reminders, daysBeforeDue: reminders ? 2 : null }), status])
  return id
}

function campusWith(repos, { clock, users = new Map() } = {}) {
  const inviteEmails = []
  const reminders = []
  const campus = createCampusContext({
    repos, clock, campusStoreAvailable: () => true,
    users: { findById: async (id) => users.get(id) || null, findByEmail: async (e) => [...users.values()].find((u) => u.email === e) || null },
    sendInviteEmail: async (msg) => { inviteEmails.push(msg); return true },
    inviteUrlFor: (token) => `https://prism.test.local/app/campus-invite/${token}`,
    sendReminderEmail: async (msg) => { reminders.push(msg); return true },
    appUrl: 'https://prism.test.local',
    scenarioSource: async () => ({ generalScenarios: [], bankScenarios: {} }),
  })
  return { campus, inviteEmails, reminders }
}

test('CSV-import invites while the worker flag is on: invite rows and their jobs commit together; the worker delivers working links once', { skip }, async (t) => {
  t.after(async () => { await cleanJobs(); await closePool() })
  await migrateUp()
  await idleQueue()
  const repos = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
  const { org, cohort } = await seedOrg()
  const owner = `${TAG}-owner`
  await query(`INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'ORG_OWNER', 'ACTIVE')`, [org, owner])
  const actor = { userId: owner, memberships: [{ organizationId: org, role: 'ORG_OWNER', status: 'ACTIVE' }] }
  const { campus, inviteEmails } = campusWith(repos)
  const emails = [`${TAG}-a@test.local`, `${TAG}-b@test.local`]
  const results = await campus.invites.createInvites({ actor, orgId: org, role: 'STUDENT', emails, cohortId: cohort, delivery: 'QUEUE' })
  assert.deepEqual(results.map((r) => r.delivery), ['QUEUED', 'QUEUED'])
  assert.equal(inviteEmails.length, 0)
  const jobs = (await query(`SELECT * FROM jobs WHERE kind = 'campus.invite_email' AND payload->>'inviteId' = ANY($1::text[])`, [results.map((r) => r.id)])).rows
  assert.equal(jobs.length, 2)
  assert.ok(jobs.every((j) => !JSON.stringify(j).includes('@test.local')), 'no address in a job row')
  // All-or-nothing: a failure while enqueueing rolls the invites back too.
  const failing = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
  const realTx = failing.transaction
  failing.transaction = (fn) => realTx.call(failing, async (tx) => fn({ ...tx, jobs: { enqueue: async () => { throw new Error('synthetic enqueue failure') } } }))
  const { campus: broken } = campusWith(failing)
  await assert.rejects(() => broken.invites.createInvites({ actor, orgId: org, role: 'STUDENT', emails: [`${TAG}-c@test.local`], cohortId: cohort, delivery: 'QUEUE' }), /synthetic enqueue failure/)
  assert.equal(await n('SELECT count(*)::int AS n FROM organization_invites WHERE email = $1', [`${TAG}-c@test.local`]), 0, 'no invite without its job')
  // The worker delivers each once.
  const runner = createJobRunner({ repo: repos.jobs, handlers: createJobHandlers({ campus, repo: repos.jobs }), workerId: 'invites', concurrency: 2 })
  await runner.drainDue()
  assert.deepEqual(inviteEmails.map((m) => m.to).sort(), emails)
  assert.equal(await n(`SELECT count(*)::int AS n FROM jobs WHERE id = ANY($1::uuid[]) AND status = 'SUCCEEDED' AND result->>'outcome' = 'SENT'`, [jobs.map((j) => j.id)]), 2)
  const token = inviteEmails.find((m) => m.to === emails[0]).inviteUrl.split('/').pop()
  const accepted = await campus.invites.acceptInvite({ token, user: { id: `${TAG}-acct-a`, email: emails[0] }, acknowledged: true })
  assert.equal(accepted.alreadyAccepted, false)
  assert.deepEqual(await campus.invites.deliverQueuedInvite(results[0].id), { outcome: 'NOT_PENDING' }, 'idempotent after acceptance')
})

test('reminders and seat release on PostgreSQL: one reminder per recipient per window; RESERVED seats released after the window, CONSUMED untouched', { skip }, async (t) => {
  t.after(async () => { await cleanJobs(); await closePool() })
  await migrateUp()
  await idleQueue()
  const repos = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
  const { org } = await seedOrg()
  const now = new Date()
  const clock = () => now
  const s1 = { id: `${TAG}-s1`, email: `${TAG}-s1@test.local`, name: 'S One' }
  const s2 = { id: `${TAG}-s2`, email: `${TAG}-s2@test.local`, name: 'S Two' }
  const users = new Map([[s1.id, s1], [s2.id, s2]])
  for (const s of [s1, s2]) await query(`INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'STUDENT', 'ACTIVE')`, [org, s.id])
  const { campus, reminders } = campusWith(repos, { clock, users })
  const handlers = createJobHandlers({ campus, repo: repos.jobs })
  const runner = createJobRunner({ repo: repos.jobs, handlers, workerId: 'campus-pg' })
  const enqueueReal = handlers['campus.reminders_scan']

  // Reminders: due in 1 day, policy on; s2 completed.
  const due = await seedAssignment(org, { windowEnd: new Date(now.getTime() + 24 * 3600_000).toISOString(), reminders: true })
  const quiet = await seedAssignment(org, { windowEnd: new Date(now.getTime() + 24 * 3600_000).toISOString(), reminders: false })
  for (const asg of [due, quiet]) {
    await query(`INSERT INTO assessment_assignment_students (assignment_id, user_id, status) VALUES ($1, $2, 'ASSIGNED')`, [asg, s1.id])
    await query(`INSERT INTO assessment_assignment_students (assignment_id, user_id, status, session_id) VALUES ($1, $2, 'COMPLETED', 'sess-done')`, [asg, s2.id])
  }
  const first = await enqueueReal.run({}, {})
  assert.ok(first.enqueued >= 1)
  const mine = async () => (await query(`SELECT * FROM jobs WHERE kind = 'campus.assignment_reminder' AND payload->>'assignmentId' = ANY($1::text[])`, [[due, quiet]])).rows
  assert.deepEqual((await mine()).map((j) => [j.payload.assignmentId, j.payload.userId, j.subject_user_id]), [[due, s1.id, s1.id]])
  await enqueueReal.run({}, {})
  assert.equal((await mine()).length, 1, 'dedupe across scans')
  await runner.drainDue()
  assert.deepEqual(reminders.filter((m) => m.to.startsWith(TAG)).map((m) => m.to), [s1.email])

  // Seat release: window ended 2 days ago; s1 RESERVED (never finished), s2 CONSUMED.
  const ended = await seedAssignment(org, { windowEnd: new Date(now.getTime() - 48 * 3600_000).toISOString() })
  const ent = await repos.entitlements.createEntitlement({
    organizationId: org, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5,
    validFrom: new Date(now.getTime() - 40 * 86_400_000).toISOString(), validUntil: new Date(now.getTime() + 40 * 86_400_000).toISOString(), status: 'ACTIVE',
  })
  const resolution = { allowed: true, consumptionRequired: true, entitlementId: ent.id, scope: { sponsorType: 'INSTITUTION', organizationId: org } }
  const open = randomUUID()
  const done = randomUUID()
  for (const [user, sid] of [[s1, open], [s2, done]]) {
    await campus.ledger.reserve({ resolution, user, sessionId: sid, idempotencyKey: `start:${ended}` })
    await repos.sessionIo.putClientEvent({ sessionId: sid, clientEventId: 'start', kind: 'START', response: { entitlementId: ent.id, assignmentId: ended, sponsored: true } })
  }
  await campus.ledger.consume({ entitlementId: ent.id, user: s2, sessionId: done })
  await query(`INSERT INTO assessment_assignment_students (assignment_id, user_id, status, session_id) VALUES ($1, $2, 'IN_PROGRESS', $3), ($1, $4, 'COMPLETED', $5)`, [ended, s1.id, open, s2.id, done])
  await handlers['campus.seat_release_scan'].run({}, {})
  await handlers['campus.seat_release_scan'].run({}, {})
  assert.equal(await n(`SELECT count(*)::int AS n FROM jobs WHERE kind = 'campus.seat_release' AND payload->>'assignmentId' = $1`, [ended]), 1)
  await runner.drainDue()
  const events = (await query('SELECT session_id, event FROM entitlement_consumptions WHERE entitlement_id = $1 ORDER BY session_id, event', [ent.id])).rows.map((r) => `${r.session_id === open ? 'open' : 'done'}:${r.event}`).sort()
  assert.deepEqual(events, ['done:CONSUMED', 'done:RESERVED', 'open:RELEASED', 'open:RESERVED'])
  assert.equal(await n(`SELECT count(*)::int AS n FROM organization_audit_events WHERE organization_id = $1 AND action = 'assignment.seats_released' AND actor_user_id = 'system:job-runner'`, [org]), 1)
  assert.deepEqual(await campus.admin.releaseWindowSeats({ assignmentId: ended }), { outcome: 'RELEASED', released: 0 }, 'idempotent')
})

test('retention passes behind PRISM_RETENTION_ENFORCEMENT: import-row cells and unstarted accommodation requests', { skip }, async (t) => {
  t.after(async () => { await cleanJobs(); await closePool() })
  await migrateUp()
  const repos = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
  const { org } = await seedOrg()
  const handlers = createJobHandlers({ campus: null, repo: repos.jobs })
  const oldImport = (await one(`INSERT INTO student_import_jobs (organization_id, uploaded_by, status, totals, committed_at) VALUES ($1, 'p5staff', 'COMMITTED', '{}', now() - interval '45 days') RETURNING id`, [org])).id
  await query(`INSERT INTO student_import_rows (job_id, row_number, raw, normalized, errors, action, outcome) VALUES ($1, 1, '{"email": "old@test.local"}', '{"email": "old@test.local"}', '[]', 'INVITE', 'INVITED')`, [oldImport])
  const ended = await seedAssignment(org, { windowEnd: new Date(Date.now() - 40 * 86_400_000).toISOString() })
  const live = await seedAssignment(org, { windowEnd: new Date(Date.now() + 5 * 86_400_000).toISOString() })
  const recent = await seedAssignment(org, { windowEnd: new Date(Date.now() - 3 * 86_400_000).toISOString() })
  const req = async (asg, user, sessionId = null) => (await one(`INSERT INTO assessment_accommodation_requests (assignment_id, user_id, organization_id, session_id, needs) VALUES ($1, $2, $3, $4, 'I need a text-only administration please.') RETURNING id`, [asg, user, org, sessionId])).id
  const stale = await req(ended, `${TAG}-u1`)
  const linked = await req(ended, `${TAG}-u2`, randomUUID())
  const waiting = await req(live, `${TAG}-u3`)
  const young = await req(recent, `${TAG}-u4`)
  const ctx = { now: () => new Date() }

  await withFlag('PRISM_RETENTION_ENFORCEMENT', null, async () => {
    assert.deepEqual(await handlers['retention.import_rows'].run({}, ctx), { skipped: 'RETENTION_ENFORCEMENT_OFF' })
    assert.deepEqual(await handlers['retention.accommodation_requests'].run({}, ctx), { skipped: 'RETENTION_ENFORCEMENT_OFF' })
  })
  assert.equal(await n(`SELECT count(*)::int AS n FROM student_import_rows WHERE job_id = $1 AND raw ? 'email'`, [oldImport]), 1, 'dark: nothing cleared')
  assert.equal(await n('SELECT count(*)::int AS n FROM assessment_accommodation_requests WHERE id = $1', [stale]), 1)

  await withFlag('PRISM_RETENTION_ENFORCEMENT', 'true', async () => {
    const rows = await handlers['retention.import_rows'].run({}, ctx)
    assert.ok(rows.cleared >= 1)
    const acc = await handlers['retention.accommodation_requests'].run({}, ctx)
    assert.ok(acc.cleared >= 1)
    assert.equal(acc.effectiveDays, 30)
  })
  assert.deepEqual((await one('SELECT raw, normalized FROM student_import_rows WHERE job_id = $1', [oldImport])), { raw: { purged: true }, normalized: null })
  const left = (await query('SELECT id FROM assessment_accommodation_requests WHERE id = ANY($1::uuid[])', [[stale, linked, waiting, young]])).rows.map((r) => r.id).sort()
  assert.deepEqual(left, [linked, waiting, young].sort(), 'only the unstarted request of a window that ended more than N days ago is deleted')
  assert.ok(await n(`SELECT count(*)::int AS n FROM retention_runs WHERE entity = 'accommodation_requests_unstarted' AND mode = 'dry_run'`) >= 1, 'dry-run receipt')
  assert.ok(await n(`SELECT count(*)::int AS n FROM retention_runs WHERE entity = 'accommodation_requests_unstarted' AND mode = 'enforce'`) >= 1, 'enforce receipt')
})

test('account erasure removes the person\'s jobs (by account and by invites to their address); another person\'s jobs stay', { skip }, async (t) => {
  t.after(async () => { await cleanJobs(); await closePool() })
  await migrateUp()
  const repos = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
  const { org } = await seedOrg()
  const me = { uid: `${TAG}-erase`, email: `${TAG}-erase@test.local` }
  const other = { uid: `${TAG}-keep`, email: `${TAG}-keep@test.local` }
  const ids = {}
  for (const p of [me, other]) {
    const invite = (await one(`INSERT INTO organization_invites (organization_id, email, role, token_hash, status, invited_by, expires_at) VALUES ($1, $2, 'STUDENT', $3, 'PENDING', 'p5staff', now() + interval '1 day') RETURNING id`, [org, p.email, randomUUID()])).id
    ids[p.uid] = [
      (await repos.jobs.enqueue({ kind: 'campus.invite_email', payload: { inviteId: invite }, dedupeKey: invite })).job.id,
      (await repos.jobs.enqueue({ kind: 'campus.assignment_reminder', payload: { assignmentId: `${TAG}-asg`, userId: p.uid }, dedupeKey: `${TAG}:${p.uid}` })).job.id,
    ]
  }
  const [, statement] = USER_STATEMENTS.find(([tbl]) => tbl === 'jobs')
  const out = await statement((sql, params) => query(sql, params), { uid: me.uid, email: me.email })
  assert.equal(out.rowCount, 2)
  assert.equal(await n('SELECT count(*)::int AS n FROM jobs WHERE id = ANY($1::uuid[])', [ids[me.uid]]), 0)
  assert.equal(await n('SELECT count(*)::int AS n FROM jobs WHERE id = ANY($1::uuid[])', [ids[other.uid]]), 2)
  const order = USER_STATEMENTS.map(([tbl]) => tbl)
  assert.ok(order.indexOf('jobs') < order.indexOf('organization_invites'), 'jobs are found through the invites before those are deleted')
})

test('0059 down/up: the jobs table goes and comes back cleanly', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const applied = async () => (await query('SELECT name FROM schema_migrations ORDER BY name DESC')).rows.map((x) => x.name)
  while ((await applied())[0] >= '0059') await migrateDown()
  assert.equal((await applied())[0], '0058_v3_support_routes')
  assert.equal((await one("SELECT to_regclass('jobs') AS t")).t, null)
  await migrateUp()
  assert.ok((await applied()).includes('0059_job_queue'))
  assert.equal(await n("SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'jobs_due_idx'"), 1)
})
