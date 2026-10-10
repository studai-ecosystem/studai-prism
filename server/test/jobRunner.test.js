// PROD-READY Phase 5 — background job runner on the memory store (the
// PostgreSQL behaviour, SKIP LOCKED across two pools, is in
// jobRunner.db.test.js). Proves: the flag is registered OFF and everything is
// dark without it (CSV import invites are still sent inside the request, the
// admin view 404s, no worker starts); enqueue is idempotent per dedupe key and
// payloads are references only; retries back off exponentially with jitter;
// a job that keeps failing (or fails permanently) is dead-lettered with a
// sanitised error; an expired lease is recovered and the old lease holder is
// fenced out; a graceful stop gives unfinished leases back; the recurring
// scheduler enqueues one job per time bucket across replicas; every moved
// workload (queued invite emails, reminders, seat release, retention gating)
// is idempotent; erasure removes the person's jobs; the admin view masks
// account ids and audits retry/cancel.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createMemoryDb } from '../domain/campusStore/memoryDb.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { createJobsRepoMemory } from '../domain/jobs/repository.js'
import { createJobRunner } from '../domain/jobs/runner.js'
import { createJobHandlers } from '../domain/jobs/handlers.js'
import { scheduleRecurring, RECURRING_JOBS, bucketStart } from '../domain/jobs/scheduler.js'
import { startJobWorker, createJobWorker } from '../domain/jobs/index.js'
import { JOB_KINDS, PermanentJobError, backoffMs, sanitiseError, prepareJob } from '../domain/jobs/kinds.js'
import { createJobQueueAdminRouter } from '../routes/admin/jobQueue.js'
import { eraseUserFromMemoryDb } from '../domain/privacy/erasureCascade.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'
import { clientFlags } from '../domain/flags/index.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
delete process.env.PRISM_JOB_WORKER
delete process.env.PRISM_RETENTION_ENFORCEMENT

const MIN = 60 * 1000
const memRepo = (start = '2026-10-10T09:00:00.000Z') => {
  let now = new Date(start)
  const db = createMemoryDb({ clock: () => now })
  return { db, repo: createJobsRepoMemory(db), clock: () => now, set: (d) => { now = new Date(d) }, advance: (ms) => { now = new Date(now.getTime() + ms) } }
}
const withFlag = async (key, value, fn) => {
  const before = process.env[key]
  if (value == null) delete process.env[key]
  else process.env[key] = value
  try { return await fn() } finally { if (before == null) delete process.env[key]; else process.env[key] = before }
}

// ── campus world (memory store, synthetic users) ─────────────────────────────
const SCENARIOS = { generalScenarios: [{ id: 'syn-general-a', title: 'Synthetic Workplace Scenario' }], bankScenarios: {} }
const u = (id, name) => ({ id, email: `${id}@test.local`, name })
const USERS = { owner: u('p5-owner', 'Synthetic Owner'), s1: u('p5-student-1', 'Student One'), s2: u('p5-student-2', 'Student Two'), s3: u('p5-student-3', 'Student Three') }

async function world() {
  let now = new Date('2026-10-05T09:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'p5-syn-u', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const cohort = await repos.organizations.createCohort({ organizationId: org.id, name: 'Commerce 2027' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.owner.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  for (const s of [USERS.s1, USERS.s2, USERS.s3]) {
    await repos.memberships.upsertMembership({ organizationId: org.id, userId: s.id, role: 'STUDENT', status: 'ACTIVE' })
    await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: s.id })
  }
  const byId = new Map(Object.values(USERS).map((x) => [x.id, x]))
  const users = {
    findById: async (id) => byId.get(id) || null,
    findByEmail: async (email) => [...byId.values()].find((x) => x.email === String(email).toLowerCase()) || null,
  }
  const inviteEmails = []
  const reminders = []
  let tokens = 0
  let reminderFailures = 0
  const campus = createCampusContext({
    repos, clock: () => now, users, scenarioSource: async () => SCENARIOS,
    audit: () => {},
    tokenFactory: () => `p5-invite-token-${String(++tokens).padStart(4, '0')}-abcdefghijkl`,
    sendInviteEmail: async (msg) => { inviteEmails.push(msg); return true },
    inviteUrlFor: (token) => `https://prism.test.local/app/campus-invite/${token}`,
    sendAssignmentEmail: async () => true,
    sendReminderEmail: async (msg) => {
      if (reminderFailures > 0) { reminderFailures -= 1; const e = new Error(`550 rejected <${msg.to}> see https://prism.test.local/x?t=1`); e.code = 'EENVELOPE'; throw e }
      reminders.push(msg); return true
    },
    appUrl: 'https://prism.test.local',
  })
  const requireUser = (req, _res, next) => {
    const user = Object.values(USERS).find((x) => x.id === req.get('x-test-user')) || (req.get('x-test-email') ? { id: `acct-${req.get('x-test-email')}`, email: req.get('x-test-email'), name: 'Invitee' } : null)
    if (!user) return next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.'))
    req.user = user
    return next()
  }
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = async (headers, method, path, body) => {
    const r = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch { json = null }
    return { status: r.status, body: json }
  }
  const asOwner = { 'x-test-user': USERS.owner.id }
  const runner = (opts = {}) => createJobRunner({ repo: repos.jobs, handlers: createJobHandlers({ campus, repo: repos.jobs }), clock: () => now, random: () => 0.5, ...opts })
  const importCsv = async (csv, key) => {
    const preview = await call(asOwner, 'POST', `/organizations/${org.id}/imports/students`, { csv, defaultCohortId: cohort.id })
    assert.equal(preview.status, 201, JSON.stringify(preview.body))
    return call({ ...asOwner, 'Idempotency-Key': key }, 'POST', `/organizations/${org.id}/imports/${preview.body.data.job.id}/commit`)
  }
  return {
    repos, org, cohort, campus, call, asOwner, inviteEmails, reminders, runner, importCsv,
    failNextReminders: (n) => { reminderFailures = n },
    now: () => now, setNow: (d) => { now = new Date(d) },
    close: () => server.close(),
  }
}

// ── flag, registry, dark by default ──────────────────────────────────────────
test('flag PRISM_JOB_WORKER is registered OFF, not client-visible, and nothing starts without it', async () => {
  const entry = FLAG_CATALOGUE.find((f) => f.key === 'PRISM_JOB_WORKER')
  assert.ok(entry, 'registered')
  assert.match(entry.dataGate, /0059/)
  assert.equal(process.env.PRISM_JOB_WORKER, undefined, 'default off')
  assert.ok(!Object.hasOwn(clientFlags(), 'PRISM_JOB_WORKER'), 'server-only flag')
  const repos = createMemoryCampusRepos()
  const campus = { repos, storeAvailable: () => true }
  assert.equal(startJobWorker({ campus, logger: { info() {}, warn() {}, error() {} } }), null, 'flag off → no worker')
  await withFlag('PRISM_JOB_WORKER', 'true', async () => {
    assert.equal(startJobWorker({ campus: { repos: null, storeAvailable: () => false }, logger: { info() {}, warn() {}, error() {} } }), null, 'no store → no worker')
  })
})

test('flag off: CSV import sends every invite email inside the request exactly as before and queues nothing; the admin view is 404', async () => {
  const w = await world()
  try {
    const out = await w.importCsv('email,name\nnew1@test.local,New One\nnew2@test.local,New Two\n', 'off-1')
    assert.equal(out.status, 201)
    assert.equal(out.body.data.job.totals.invited, 2)
    assert.equal(w.inviteEmails.length, 2, 'sent synchronously')
    assert.deepEqual(w.inviteEmails.map((m) => m.to).sort(), ['new1@test.local', 'new2@test.local'])
    assert.deepEqual(await w.repos.jobs.counts(), {}, 'no job written')
    // The emailed link works (accept with the synchronous token).
    const token = w.inviteEmails.find((m) => m.to === 'new1@test.local').inviteUrl.split('/').pop()
    assert.equal((await w.call({ 'x-test-email': 'new1@test.local' }, 'POST', `/org-invites/${token}/accept`, { acknowledged: true })).status, 200)

    const app = express()
    app.use('/api/admin/job-queue', (req, _res, next) => { req.admin = { id: 'a', permissions: new Set(['system:read']) }; next() }, createJobQueueAdminRouter({ campus: w.campus }))
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    try {
      assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/admin/job-queue`)).status, 404)
    } finally { server.close() }
  } finally { w.close() }
})

// ── queue semantics ──────────────────────────────────────────────────────────
test('enqueue: payloads are validated references only; (kind, dedupe key) is idempotent; subject comes from the kind', async () => {
  const { repo } = memRepo()
  assert.throws(() => prepareJob({ kind: 'campus.invite_email', payload: { inviteId: 'not-a-uuid' } }), /Invalid payload/)
  assert.throws(() => prepareJob({ kind: 'campus.invite_email', payload: { inviteId: '7d0d1f0e-1111-4c8e-9a52-0d3c1e2b3a4f', email: 'x@y.z' } }), /Invalid payload/, '.strict(): no address in a payload')
  assert.throws(() => prepareJob({ kind: 'campus.assignment_reminder', payload: { assignmentId: 'a 1', userId: 'u' } }), /Invalid payload/, 'ids only, no free text')
  assert.throws(() => prepareJob({ kind: 'no.such_kind', payload: {} }), /Unknown job kind/)
  const a = await repo.enqueue({ kind: 'campus.assignment_reminder', payload: { assignmentId: 'asg-1', userId: 'user-1' }, dedupeKey: 'asg-1:user-1:w' })
  const b = await repo.enqueue({ kind: 'campus.assignment_reminder', payload: { assignmentId: 'asg-1', userId: 'user-1' }, dedupeKey: 'asg-1:user-1:w' })
  assert.equal(a.created, true)
  assert.equal(b.created, false)
  assert.equal(b.job.id, a.job.id)
  assert.equal(a.job.subjectUserId, 'user-1', 'subject recorded for erasure')
  assert.equal(a.job.maxAttempts, JOB_KINDS['campus.assignment_reminder'].maxAttempts)
  // The same dedupe key under another kind is a different job.
  assert.equal((await repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: 'asg-1' }, dedupeKey: 'asg-1:user-1:w' })).created, true)
})

test('retry with exponential backoff and jitter; not claimable before run_at; succeeds once the cause clears', async () => {
  assert.equal(backoffMs(1, { baseMs: 1000 }, () => 0), 500)
  assert.equal(backoffMs(1, { baseMs: 1000 }, () => 1), 1000)
  assert.equal(backoffMs(3, { baseMs: 1000 }, () => 0), 2000)
  assert.equal(backoffMs(3, { baseMs: 1000 }, () => 1), 4000)
  assert.equal(backoffMs(30, { baseMs: 1000, maxMs: 60_000 }, () => 1), 60_000, 'capped')
  const m = memRepo()
  let calls = 0
  const handlers = { 'campus.seat_release': { async run() { calls += 1; if (calls < 3) { const e = new Error('transient'); e.code = 'ETIMEDOUT'; throw e } return { released: 0 } } } }
  const runner = createJobRunner({ repo: m.repo, handlers, clock: m.clock, random: () => 1, backoff: { baseMs: 1000 } })
  const { job } = await m.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: 'asg-b' } })
  let s = await runner.runOnce()
  assert.deepEqual([s.claimed, s.failed], [1, 1])
  let row = await m.repo.get(job.id)
  assert.equal(row.status, 'FAILED')
  assert.equal(row.attempts, 1)
  assert.equal(new Date(row.runAt).getTime() - m.clock().getTime(), 1000, 'attempt 1 waits base (jitter at its maximum)')
  assert.equal(row.lastError, 'ETIMEDOUT: transient')
  assert.equal((await runner.runOnce()).claimed, 0, 'not due yet')
  m.advance(1000)
  s = await runner.runOnce()
  row = await m.repo.get(job.id)
  assert.equal(row.attempts, 2)
  assert.equal(new Date(row.runAt).getTime() - m.clock().getTime(), 2000, 'attempt 2 waits twice as long')
  m.advance(2000)
  s = await runner.runOnce()
  assert.equal(s.succeeded, 1)
  row = await m.repo.get(job.id)
  assert.equal(row.status, 'SUCCEEDED')
  assert.equal(row.lastError, null)
  assert.equal(calls, 3)
})

test('dead letter after max attempts or a permanent error; last_error carries no address, link or number', async () => {
  const m = memRepo()
  const handlers = {
    'campus.seat_release': { async run() { const e = new Error('550 rejected <student@college.edu> https://prism.test/i/abc?token=SECRET +91 98765 43210'); e.code = 'EENVELOPE'; throw e } },
    'campus.invite_email': { async run() { throw new PermanentJobError('INVITE_PAYLOAD_UNUSABLE') } },
  }
  const runner = createJobRunner({ repo: m.repo, handlers, clock: m.clock, random: () => 0, backoff: { baseMs: 10 } })
  const { job } = await m.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: 'asg-d' }, maxAttempts: 3 })
  for (let i = 0; i < 3; i += 1) { await runner.runOnce(); m.advance(60_000) }
  const row = await m.repo.get(job.id)
  assert.equal(row.status, 'DEAD')
  assert.equal(row.attempts, 3)
  assert.ok(row.finishedAt)
  assert.ok(!/student@college\.edu|SECRET|98765/.test(row.lastError), row.lastError)
  assert.match(row.lastError, /^EENVELOPE: 550 rejected <\[address\]> \[link\] \[number\]/)
  assert.equal((await runner.runOnce()).claimed, 0, 'a dead letter is never claimed again')
  const perm = await m.repo.enqueue({ kind: 'campus.invite_email', payload: { inviteId: '7d0d1f0e-1111-4c8e-9a52-0d3c1e2b3a4f' } })
  await runner.runOnce()
  const p = await m.repo.get(perm.job.id)
  assert.equal(p.status, 'DEAD', 'a permanent error dead-letters at once')
  assert.equal(p.attempts, 1)
  assert.equal(sanitiseError({ name: 'TypeError', message: 'line one\nline two with a@b.co' }), 'TypeError: line one')
  // Operator retry puts it back with fresh attempts.
  const retried = await m.repo.retry(job.id)
  assert.equal(retried.status, 'PENDING')
  assert.equal(retried.attempts, 0)
  assert.equal(await m.repo.retry(job.id), null, 'only a dead job can be retried')
})

test('lease expiry: a crashed worker\'s job is recovered and reclaimed; the old holder is fenced out', async () => {
  const m = memRepo()
  const { job } = await m.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: 'asg-l' }, maxAttempts: 2 })
  const [claimedByA] = await m.repo.claim({ workerId: 'worker-a', limit: 5, leaseMs: 30_000 })
  assert.equal(claimedByA.status, 'RUNNING')
  assert.equal(claimedByA.lockedBy, 'worker-a')
  assert.deepEqual(await m.repo.claim({ workerId: 'worker-b', limit: 5 }), [], 'a leased job is not claimable')
  assert.deepEqual(await m.repo.recoverExpired(), { recovered: 0, dead: 0 }, 'lease still valid')
  m.advance(30_001)
  assert.deepEqual(await m.repo.recoverExpired(), { recovered: 1, dead: 0 })
  let row = await m.repo.get(job.id)
  assert.equal(row.status, 'FAILED')
  assert.match(row.lastError, /^LEASE_EXPIRED/)
  const [claimedByB] = await m.repo.claim({ workerId: 'worker-b', limit: 5 })
  assert.equal(claimedByB.attempts, 2)
  assert.equal(await m.repo.complete(job.id, claimedByA.leaseToken, { result: { late: true } }), false, 'old lease token is fenced out')
  assert.equal(await m.repo.complete(job.id, claimedByB.leaseToken, { result: { ok: true } }), true)
  row = await m.repo.get(job.id)
  assert.deepEqual([row.status, row.result], ['SUCCEEDED', { ok: true }])
  // A crash on the last attempt dead-letters instead of retrying forever.
  const last = await m.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: 'asg-l2' }, maxAttempts: 1 })
  await m.repo.claim({ workerId: 'worker-a', limit: 5, leaseMs: 1000 })
  m.advance(1001)
  assert.deepEqual(await m.repo.recoverExpired(), { recovered: 0, dead: 1 })
  assert.equal((await m.repo.get(last.job.id)).status, 'DEAD')
})

test('the runner renews the lease of a long job and a graceful stop gives unfinished leases back', async () => {
  const m = { repo: createJobsRepoMemory(createMemoryDb()) } // real time: leases move with the wall clock
  let release
  const gate = new Promise((r) => { release = r })
  const handlers = { 'campus.seat_release': { async run() { await gate; return {} } } }
  const runner = createJobRunner({ repo: m.repo, handlers, leaseMs: 3_000, logger: { info() {}, warn() {}, error() {} } })
  const { job } = await m.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: 'asg-g' } })
  const pass = runner.runOnce()
  await new Promise((r) => setTimeout(r, 50))
  const leased = await m.repo.get(job.id)
  assert.equal(leased.status, 'RUNNING')
  await new Promise((r) => setTimeout(r, 1_200))
  assert.ok(new Date((await m.repo.get(job.id)).lockedUntil) > new Date(leased.lockedUntil), 'lease renewed while the handler runs')
  const stopped = await runner.stop({ drainMs: 100 })
  assert.equal(stopped.released, 1)
  const row = await m.repo.get(job.id)
  assert.equal(row.status, 'PENDING', 'given back for another replica')
  assert.equal(row.attempts, 0, 'the interrupted attempt is not counted')
  release()
  await pass
  assert.equal((await m.repo.get(job.id)).status, 'PENDING', 'the late finish cannot overwrite the released row')
  assert.equal((await runner.runOnce()).claimed, 0, 'a stopped runner claims nothing')
})

test('two runners on one store process N jobs exactly once', async () => {
  const m = memRepo()
  const seen = new Map()
  const handlers = { 'campus.seat_release': { async run({ assignmentId }) { seen.set(assignmentId, (seen.get(assignmentId) || 0) + 1); await new Promise((r) => setTimeout(r, 1)); return {} } } }
  for (let i = 0; i < 40; i += 1) await m.repo.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: `asg-${i}` } })
  const a = createJobRunner({ repo: m.repo, handlers, workerId: 'a', concurrency: 3 })
  const b = createJobRunner({ repo: m.repo, handlers, workerId: 'b', concurrency: 3 })
  await Promise.all([a.drainDue(), b.drainDue()])
  assert.equal(seen.size, 40)
  assert.ok([...seen.values()].every((n) => n === 1))
  assert.equal((await m.repo.counts()).SUCCEEDED, 40)
})

test('scheduler: one job per kind per time bucket across replicas; retention passes only under PRISM_RETENTION_ENFORCEMENT', async () => {
  const m = memRepo('2026-10-10T09:07:00.000Z')
  const r1 = await scheduleRecurring({ repo: m.repo, now: m.clock() })
  const r2 = await scheduleRecurring({ repo: m.repo, now: new Date('2026-10-10T09:14:59.000Z') })
  assert.deepEqual(r1.scheduled.sort(), ['campus.reminders_scan', 'campus.seat_release_scan', 'jobs.prune'])
  assert.deepEqual(r1.skipped.sort(), ['retention.accommodation_requests', 'retention.enforce', 'retention.guardian_consents', 'retention.import_rows'])
  assert.deepEqual(r2.scheduled, [], 'second replica in the same bucket is a no-op')
  const r3 = await scheduleRecurring({ repo: m.repo, now: new Date('2026-10-10T09:15:00.000Z') })
  assert.deepEqual(r3.scheduled.sort(), ['campus.reminders_scan', 'campus.seat_release_scan'], 'next 15-minute bucket; prune stays daily')
  const scans = await m.repo.list({ kind: 'campus.reminders_scan' })
  assert.deepEqual(scans.map((j) => j.payload.bucket).sort(), ['2026-10-10T09:00:00.000Z', '2026-10-10T09:15:00.000Z'])
  assert.equal(bucketStart(Date.parse('2026-10-10T23:59:59Z'), 24 * 60 * MIN), '2026-10-10T00:00:00.000Z')
  await withFlag('PRISM_RETENTION_ENFORCEMENT', 'true', async () => {
    const r4 = await scheduleRecurring({ repo: m.repo, now: new Date('2026-10-10T09:16:00.000Z') })
    assert.deepEqual(r4.scheduled.sort(), ['retention.accommodation_requests', 'retention.enforce', 'retention.guardian_consents', 'retention.import_rows'])
  })
  assert.ok(RECURRING_JOBS.every((d) => JOB_KINDS[d.kind]?.recurring))
  // The worker's tick uses the same path (and starts nothing else here).
  const worker = createJobWorker({ repo: createJobsRepoMemory(createMemoryDb()), handlers: {}, logger: { info() {}, warn() {}, error() {} } })
  await worker.tick()
})

test('retention jobs: a no-op while PRISM_RETENTION_ENFORCEMENT is off; dry run then enforce when on; a legal hold is a clean skip', async () => {
  const m = memRepo()
  const calls = []
  const purge = async (opts) => { calls.push(opts.dryRun ? 'dry' : 'enforce'); return opts.dryRun ? { ok: true, matched: 3 } : { ok: true, matched: 3, cleared: 3, effectiveDays: 30 } }
  const held = async (opts) => (opts.dryRun ? { ok: true, matched: 1 } : { ok: false, error: 'ENTITY_LEGAL_HOLD' })
  const retention = { purgeImportRowRaw: purge, purgeUnstartedAccommodationRequests: held, purgeUnverifiedGuardianConsents: purge, ENFORCEABLE_ENTITIES: ['integrity_telemetry'], runRetention: async () => ({ ok: true, receipt: { matched: 2, deleted: 2 } }) }
  let on = false
  const handlers = createJobHandlers({ campus: null, repo: m.repo, retention, retentionOn: () => on })
  const ctx = { now: () => m.clock() }
  assert.deepEqual(await handlers['retention.import_rows'].run({}, ctx), { skipped: 'RETENTION_ENFORCEMENT_OFF' })
  assert.deepEqual(await handlers['retention.enforce'].run({}, ctx), { skipped: 'RETENTION_ENFORCEMENT_OFF' })
  assert.deepEqual(await handlers['retention.guardian_consents'].run({}, ctx), { skipped: 'RETENTION_ENFORCEMENT_OFF' })
  assert.deepEqual(calls, [], 'nothing runs while the flag is off')
  on = true
  assert.deepEqual(await handlers['retention.import_rows'].run({}, ctx), { matched: 3, cleared: 3, effectiveDays: 30 })
  assert.deepEqual(calls, ['dry', 'enforce'], 'a dry-run receipt precedes every real run')
  assert.deepEqual(await handlers['retention.accommodation_requests'].run({}, ctx), { skipped: 'ENTITY_LEGAL_HOLD', matched: 1 })
  // PROD-READY Phase 8: unverified guardian consent requests, same discipline.
  assert.deepEqual(await handlers['retention.guardian_consents'].run({}, ctx), { matched: 3, cleared: 3, effectiveDays: 30 })
  assert.deepEqual(calls, ['dry', 'enforce', 'dry', 'enforce'])
  assert.deepEqual(await handlers['retention.enforce'].run({}, ctx), { integrity_telemetry: { matched: 2, deleted: 2 } })
  const refused = createJobHandlers({ campus: null, repo: m.repo, retentionOn: () => true, retention: { ...retention, purgeImportRowRaw: async () => ({ ok: false, error: 'DRY_RUN_REQUIRED' }) } })
  await assert.rejects(() => refused['retention.import_rows'].run({}, ctx), /DRY_RUN_REQUIRED/)
})

// ── moved workloads on the campus memory store ───────────────────────────────
test('flag on: CSV import queues one invite job per invite (no email in the request); the worker sends each once with a working link', async () => {
  await withFlag('PRISM_JOB_WORKER', 'true', async () => {
    const w = await world()
    try {
      const out = await w.importCsv('email,name\nq1@test.local,Q One\nq2@test.local,Q Two\nq3@test.local,Q Three\n', 'on-1')
      assert.equal(out.status, 201)
      assert.equal(out.body.data.job.totals.invited, 3, 'outcomes unchanged')
      assert.equal(w.inviteEmails.length, 0, 'no email inside the request')
      const jobs = await w.repos.jobs.list({ kind: 'campus.invite_email' })
      assert.equal(jobs.length, 3)
      for (const j of jobs) {
        assert.deepEqual(Object.keys(j.payload), ['inviteId'], 'payload is the invite id only')
        assert.ok(!JSON.stringify(j).includes('@test.local'), 'no address anywhere in the job row')
        assert.equal(j.subjectUserId, null)
      }
      const s = await w.runner().drainDue()
      assert.equal(s.succeeded, 3)
      assert.deepEqual(w.inviteEmails.map((m) => m.to).sort(), ['q1@test.local', 'q2@test.local', 'q3@test.local'])
      assert.ok((await w.repos.jobs.list({ kind: 'campus.invite_email' })).every((j) => j.result.outcome === 'SENT'))
      const link = w.inviteEmails.find((m) => m.to === 'q1@test.local').inviteUrl
      const token = link.split('/').pop()
      assert.equal((await w.call({ 'x-test-email': 'q1@test.local' }, 'POST', `/org-invites/${token}/accept`, { acknowledged: true })).status, 200)
      // Idempotent handler: re-running a delivered (now ACCEPTED) invite sends nothing.
      const before = w.inviteEmails.length
      const invite = (await w.repos.campusAdmin.listOrgInvites(w.org.id)).find((i) => i.email === 'q1@test.local')
      assert.deepEqual(await w.campus.invites.deliverQueuedInvite(invite.id), { outcome: 'NOT_PENDING' })
      assert.equal(w.inviteEmails.length, before)
      // A re-import replaces the pending invite: the old job then skips it.
      const re = await w.importCsv('email,name\nq2@test.local,Q Two\n', 'on-2')
      assert.equal(re.status, 201)
      const revoked = (await w.repos.campusAdmin.listOrgInvites(w.org.id)).find((i) => i.email === 'q2@test.local' && i.status === 'REVOKED')
      assert.deepEqual(await w.campus.invites.deliverQueuedInvite(revoked.id), { outcome: 'NOT_PENDING' })
      // A retry re-issues the link: only the newest email's token works.
      const pending = (await w.repos.campusAdmin.listOrgInvites(w.org.id)).find((i) => i.email === 'q3@test.local')
      const oldToken = w.inviteEmails.find((m) => m.to === 'q3@test.local').inviteUrl.split('/').pop()
      await w.campus.invites.deliverQueuedInvite(pending.id)
      const newToken = w.inviteEmails.filter((m) => m.to === 'q3@test.local').at(-1).inviteUrl.split('/').pop()
      assert.notEqual(oldToken, newToken)
      assert.equal((await w.call({ 'x-test-email': 'q3@test.local' }, 'POST', `/org-invites/${oldToken}/accept`, { acknowledged: true })).status, 404)
      assert.equal((await w.call({ 'x-test-email': 'q3@test.local' }, 'POST', `/org-invites/${newToken}/accept`, { acknowledged: true })).status, 200)
    } finally { w.close() }
  })
})

test('reminders (K80): due recipients get one reminder per window; finished students, other windows and disabled policies get none; failures retry', async () => {
  const w = await world()
  try {
    const cat = await w.call(w.asOwner, 'GET', `/organizations/${w.org.id}/assessment-catalog`)
    const definitionId = cat.body.data.items[0].id
    const launch = (body) => w.call(w.asOwner, 'POST', `/organizations/${w.org.id}/assignments`, { definitionId, cohortIds: [w.cohort.id], windowStart: '2026-10-05T08:00:00.000Z', ...body })
    const withReminders = (await launch({ windowEnd: '2026-10-08T18:00:00.000Z', reminders: true })).body.data.id
    const noReminders = (await launch({ windowEnd: '2026-10-08T18:00:00.000Z' })).body.data.id
    const later = (await launch({ windowEnd: '2026-10-30T18:00:00.000Z', reminders: true })).body.data.id
    await w.repos.assessments.updateStudent({ assignmentId: withReminders, userId: USERS.s3.id, patch: { status: 'COMPLETED', sessionId: 'sess-done', completedAt: '2026-10-05T10:00:00Z' } })
    const scan = (await import('../domain/jobs/handlers.js')).createJobHandlers({ campus: w.campus, repo: w.repos.jobs })['campus.reminders_scan']
    // Before the policy's 2-day horizon nothing is due.
    w.setNow('2026-10-06T12:00:00Z')
    assert.deepEqual(await scan.run({}, {}), { assignments: 0, enqueued: 0 })
    w.setNow('2026-10-07T09:00:00Z')
    assert.deepEqual(await scan.run({}, {}), { assignments: 1, enqueued: 2 })
    assert.deepEqual(await scan.run({}, {}), { assignments: 1, enqueued: 0 }, 'dedupe: once per recipient per window')
    const jobs = await w.repos.jobs.list({ kind: 'campus.assignment_reminder' })
    assert.deepEqual(jobs.map((j) => j.payload.userId).sort(), [USERS.s1.id, USERS.s2.id].sort())
    assert.ok(jobs.every((j) => j.payload.assignmentId === withReminders && j.subjectUserId === j.payload.userId))
    assert.ok(!jobs.some((j) => [noReminders, later].includes(j.payload.assignmentId)))
    w.failNextReminders(1)
    const runner = w.runner()
    let s = await runner.drainDue()
    assert.equal(s.failed, 1, 'an SMTP failure is retried, not lost')
    const failed = (await w.repos.jobs.list({ status: 'FAILED' }))[0]
    assert.ok(!failed.lastError.includes('@test.local') && !failed.lastError.includes('https://'), failed.lastError)
    w.setNow(new Date(Date.parse(failed.runAt) + 1))
    s = await runner.drainDue()
    assert.equal(w.reminders.length, 2)
    assert.deepEqual(w.reminders.map((m) => m.to).sort(), [USERS.s1.email, USERS.s2.email].sort())
    assert.ok(w.reminders.every((m) => m.url === `https://prism.test.local/app/campus/${w.org.id}/assignments` && m.dueAt === '2026-10-08T18:00:00.000Z'))
    assert.ok(!JSON.stringify(w.reminders).includes('Student One'), 'no student name in the email payload')
    // Re-checks at send time: a student who finished meanwhile, or a closed window, gets nothing.
    await w.repos.assessments.updateStudent({ assignmentId: withReminders, userId: USERS.s1.id, patch: { status: 'COMPLETED', sessionId: 'sess-s1', completedAt: '2026-10-07T10:00:00Z' } })
    assert.deepEqual(await w.campus.admin.sendAssignmentReminder({ assignmentId: withReminders, userId: USERS.s1.id }), { outcome: 'NOT_DUE' })
    w.setNow('2026-10-09T09:00:00Z')
    assert.deepEqual(await w.campus.admin.sendAssignmentReminder({ assignmentId: withReminders, userId: USERS.s2.id }), { outcome: 'WINDOW_PASSED' })
    assert.equal(w.reminders.length, 2)
  } finally { w.close() }
})

test('seat release (K69/K79): after the window passes (+ grace) RESERVED seats of unfinished starts are released once; CONSUMED seats are never touched', async () => {
  const w = await world()
  try {
    const cat = await w.call(w.asOwner, 'GET', `/organizations/${w.org.id}/assessment-catalog`)
    const created = await w.call(w.asOwner, 'POST', `/organizations/${w.org.id}/assignments`, { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohort.id], windowStart: '2026-10-05T08:00:00.000Z', windowEnd: '2026-10-08T18:00:00.000Z' })
    const id = created.body.data.id
    const ent = await w.repos.entitlements.createEntitlement({
      organizationId: w.org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5,
      validFrom: '2026-10-01T00:00:00.000Z', validUntil: '2026-12-01T00:00:00.000Z', status: 'ACTIVE',
    })
    const resolution = { allowed: true, consumptionRequired: true, entitlementId: ent.id, scope: { sponsorType: 'INSTITUTION', organizationId: w.org.id } }
    // s1 started and never finished (RESERVED); s2 finished (CONSUMED).
    for (const [user, sid] of [[USERS.s1, 'sess-open'], [USERS.s2, 'sess-done']]) {
      await w.campus.ledger.reserve({ resolution, user, sessionId: sid, idempotencyKey: `start:${id}` })
      await w.repos.sessionIo.putClientEvent({ sessionId: sid, clientEventId: 'start', kind: 'START', response: { entitlementId: ent.id, assignmentId: id, sponsored: true } })
    }
    await w.repos.assessments.updateStudent({ assignmentId: id, userId: USERS.s1.id, patch: { status: 'IN_PROGRESS', sessionId: 'sess-open', startedAt: '2026-10-06T09:00:00Z' } })
    await w.campus.ledger.consume({ entitlementId: ent.id, user: USERS.s2, sessionId: 'sess-done' })
    await w.repos.assessments.updateStudent({ assignmentId: id, userId: USERS.s2.id, patch: { status: 'COMPLETED', sessionId: 'sess-done', completedAt: '2026-10-06T10:00:00Z' } })
    const handlers = createJobHandlers({ campus: w.campus, repo: w.repos.jobs })
    // Inside the grace period nothing is scheduled.
    w.setNow('2026-10-09T12:00:00Z')
    assert.deepEqual(await handlers['campus.seat_release_scan'].run({}, {}), { assignments: 0, enqueued: 0 })
    w.setNow('2026-10-09T19:00:00Z')
    assert.deepEqual(await handlers['campus.seat_release_scan'].run({}, {}), { assignments: 1, enqueued: 1 })
    assert.deepEqual(await handlers['campus.seat_release_scan'].run({}, {}), { assignments: 1, enqueued: 0 }, 'one release job per assignment window')
    const s = await w.runner().drainDue()
    assert.equal(s.succeeded, 1)
    const events = (await w.repos.entitlements.listConsumptions(ent.id)).map((c) => `${c.sessionId}:${c.event}`).sort()
    assert.deepEqual(events, ['sess-done:CONSUMED', 'sess-done:RESERVED', 'sess-open:RELEASED', 'sess-open:RESERVED'])
    const audit = (await w.repos.campusAdmin.listOrgAudit(w.org.id)).find((e) => e.action === 'assignment.seats_released')
    assert.deepEqual([audit.actorUserId, audit.details], ['system:job-runner', { seatsReleased: 1, reason: 'WINDOW_PASSED' }])
    // Idempotent: a second run releases nothing and writes no audit row.
    assert.deepEqual(await w.campus.admin.releaseWindowSeats({ assignmentId: id }), { outcome: 'RELEASED', released: 0 })
    assert.equal((await w.repos.campusAdmin.listOrgAudit(w.org.id)).filter((e) => e.action === 'assignment.seats_released').length, 1)
    assert.equal((await w.repos.entitlements.listConsumptions(ent.id)).filter((c) => c.event === 'RELEASED').length, 1)
    // The assignment status is unchanged (closing stays an admin action); a closed one is skipped.
    assert.equal((await w.repos.assessments.getAssignment(id)).status, 'ACTIVE')
    await w.call(w.asOwner, 'POST', `/organizations/${w.org.id}/assignments/${id}/status`, { status: 'CLOSED' })
    assert.deepEqual(await w.campus.admin.releaseWindowSeats({ assignmentId: id }), { outcome: 'NOT_LIVE', released: 0 })
  } finally { w.close() }
})

test('erasure removes the person\'s pending jobs (reminders by account, invite emails by address); other people\'s jobs stay', async () => {
  await withFlag('PRISM_JOB_WORKER', 'true', async () => {
    const w = await world()
    try {
      await w.importCsv('email,name\nerase-me@test.local,E\nkeep-me@test.local,K\n', 'erase-1')
      await w.repos.jobs.enqueue({ kind: 'campus.assignment_reminder', payload: { assignmentId: 'asg-x', userId: 'acct-erase' }, dedupeKey: 'asg-x:acct-erase:w' })
      await w.repos.jobs.enqueue({ kind: 'campus.assignment_reminder', payload: { assignmentId: 'asg-x', userId: 'acct-keep' }, dedupeKey: 'asg-x:acct-keep:w' })
      const counts = eraseUserFromMemoryDb(w.repos.db, { uid: 'acct-erase', pseudo: 'erased:abc', email: 'erase-me@test.local', sessionIds: [] })
      assert.equal(counts.jobs, 2)
      const left = [...w.repos.db.jobs.values()]
      assert.equal(left.length, 2)
      assert.ok(!left.some((j) => j.subjectUserId === 'acct-erase'))
      const keepInvite = (await w.repos.campusAdmin.listOrgInvites(w.org.id)).find((i) => i.email === 'keep-me@test.local')
      assert.ok(left.some((j) => j.payload.inviteId === keepInvite.id))
    } finally { w.close() }
  })
})

test('admin job-queue view: counts, dead letters, masked account ids, audited retry/cancel, permissions', async () => {
  await withFlag('PRISM_JOB_WORKER', 'true', async () => {
    const repos = createMemoryCampusRepos()
    const campus = { repos, storeAvailable: () => true }
    const audits = []
    const ADMINS = { reader: { id: 'adm-r', permissions: new Set(['system:read']) }, ops: { id: 'adm-o', permissions: new Set(['system:read', 'jobs:manage']) } }
    const app = express()
    app.use(express.json())
    app.use('/api/admin/job-queue', (req, _res, next) => { req.admin = ADMINS[req.get('x-test-admin')] || null; next() }, createJobQueueAdminRouter({ campus, audit: async (_req, e) => audits.push(e) }))
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${server.address().port}/api/admin/job-queue`
    const call = async (who, method, path = '', body) => {
      const r = await fetch(`${base}${path}`, { method, headers: { ...(who ? { 'x-test-admin': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: r.status, body: await r.json().catch(() => null) }
    }
    try {
      const { job: dead } = await repos.jobs.enqueue({ kind: 'campus.assignment_reminder', payload: { assignmentId: 'asg-1', userId: 'acct-secret' }, maxAttempts: 1 })
      const [c] = await repos.jobs.claim({ workerId: 'w', limit: 1 })
      await repos.jobs.fail(c.id, c.leaseToken, { error: 'EAUTH: login failed', retryAt: new Date().toISOString() })
      const { job: pending } = await repos.jobs.enqueue({ kind: 'campus.seat_release', payload: { assignmentId: 'asg-2' } })
      assert.equal((await call(null, 'GET')).status, 401)
      const list = await call('reader', 'GET', '?status=DEAD')
      assert.equal(list.status, 200)
      assert.equal(list.body.counts.DEAD, 1)
      assert.equal(list.body.counts.PENDING, 1)
      assert.deepEqual(list.body.jobs.map((j) => j.id), [dead.id])
      assert.equal(list.body.jobs[0].payload.userId, '[account]')
      assert.equal(list.body.jobs[0].subject, 'account')
      assert.ok(!JSON.stringify(list.body).includes('acct-secret'), 'account id never shown')
      assert.ok(!JSON.stringify(list.body).includes('leaseToken'))
      assert.equal((await call('reader', 'GET', '?status=BOGUS')).status, 400)
      assert.equal((await call('reader', 'GET', `/${dead.id}`)).body.job.lastError, 'EAUTH: login failed')
      assert.equal((await call('reader', 'POST', `/${dead.id}/retry`, { reason: 'SMTP fixed' })).status, 403, 'retry needs jobs:manage')
      assert.equal((await call('ops', 'POST', `/${dead.id}/retry`, {})).status, 400, 'a reason is required')
      assert.equal((await call('ops', 'POST', `/${dead.id}/retry`, { reason: 'SMTP fixed', extra: 1 })).status, 400, '.strict()')
      const retried = await call('ops', 'POST', `/${dead.id}/retry`, { reason: 'SMTP credentials rotated' })
      assert.equal(retried.status, 200)
      assert.equal(retried.body.job.status, 'PENDING')
      assert.equal((await call('ops', 'POST', `/${dead.id}/retry`, { reason: 'again please' })).status, 409, 'only a dead job can be retried')
      const cancelled = await call('ops', 'POST', `/${pending.id}/cancel`, { reason: 'Assignment withdrawn' })
      assert.equal(cancelled.body.job.status, 'CANCELLED')
      assert.equal((await call('ops', 'POST', `/${pending.id}/cancel`, { reason: 'twice over' })).status, 409)
      assert.equal((await call('ops', 'POST', '/00000000-0000-4000-8000-000000000000/cancel', { reason: 'unknown job' })).status, 404)
      assert.deepEqual(audits.map((a) => [a.action, a.before.status, a.after.status, a.reason]), [
        ['job_retried', 'DEAD', 'PENDING', 'SMTP credentials rotated'],
        ['job_cancelled', 'PENDING', 'CANCELLED', 'Assignment withdrawn'],
      ])
      // Housekeeping prunes finished rows only.
      const pruned = await repos.jobs.prune({ before: new Date(Date.now() + 60_000).toISOString() })
      assert.equal(pruned, 1)
      assert.ok(await repos.jobs.get(dead.id), 'a pending (retried) job is kept')
    } finally { server.close() }
  })
})
