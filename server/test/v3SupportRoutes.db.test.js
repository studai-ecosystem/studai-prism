// PROD-READY Phase 4: migration 0058 and the PostgreSQL repositories behind
// the V3 support routes — one HUMAN_REVIEW request per session (partial unique
// index, concurrent requests), pre-start accommodation requests (one per
// assignment and learner, update only while REQUESTED, decide vs. start race,
// lapse at start), the v1 store records the routes write (v1_accommodations,
// v1_verifications), erasure of the new table per session and per account,
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
}

const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { closePool, query } = skip ? {} : await import('../db/pool.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')
const { getPool, getSessionLockPool } = skip ? {} : await import('../db/pool.js')
const v1Store = skip ? {} : await import('../lib/storePg.js')
const { legacySupportSources } = skip ? {} : await import('../domain/support/legacySources.js')
const { createSupportService } = skip ? {} : await import('../domain/support/service.js')
const { eraseCampusSessionData } = skip ? {} : await import('../lib/campusErasure.js')

const one = async (sql, params = []) => (await query(sql, params)).rows[0]
const n = async (sql, params = []) => Number((await query(sql, params)).rows[0].n)
const repos = () => createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })

async function seedAssignment() {
  await query(`INSERT INTO assessment_definitions (assessment_definition_id, job_family, title) VALUES ('P4-DEF', 'synthetic', 'Synthetic') ON CONFLICT DO NOTHING`)
  const org = (await one(`INSERT INTO organizations (name, slug, organization_type, status) VALUES ('Synthetic College', $1, 'COLLEGE', 'ACTIVE') RETURNING id`, [`p4-${randomUUID()}`])).id
  const id = `p4-asg-${randomUUID()}`
  await query(`INSERT INTO assessment_assignments (id, definition_id, form_policy, sponsor_type, organization_id, integrity_policy, accommodations_policy, reminder_policy, created_by, status)
               VALUES ($1, 'P4-DEF', 'SERVER_SELECTED', 'INSTITUTION', $2, 'STANDARD', '{"requestable": true}', '{}', 'p4staff', 'ACTIVE')`, [id, org])
  return { id, org }
}

async function seedVersion(sid, version = 1) {
  await query(`INSERT INTO student_report_versions (session_id, version, content_hash, builder_version, report_json) VALUES ($1, $2, $3, 'b', '{}')`, [sid, version, `p4-${sid}-${version}`])
}

test('0058: one HUMAN_REVIEW request per session (index + repository), MOMENT requests unchanged, kind visible to the staff queue', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  assert.ok((await query("SELECT name FROM schema_migrations WHERE name = '0058_v3_support_routes'")).rows.length === 1)
  const r = repos()
  const sid = randomUUID()
  await seedVersion(sid)
  const user = `p4u${randomUUID().slice(0, 8)}`
  // Two MOMENT requests are fine (P5.7 behaviour unchanged, default kind).
  await r.reportReviews.create({ sessionId: sid, version: 1, userId: user, reason: 'Moment one reads differently.' })
  const m2 = await r.reportReviews.create({ sessionId: sid, version: 1, userId: user, reason: 'Moment two reads differently.' })
  assert.equal(m2.kind, 'MOMENT')
  // Concurrent HUMAN_REVIEW requests: exactly one row; the rest CONFLICT.
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => r.reportReviews.create({ sessionId: sid, version: 1, userId: user, kind: 'HUMAN_REVIEW', category: 'OTHER', reason: 'Please review the whole assessment.' })))
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1)
  for (const x of results.filter((y) => y.status === 'rejected')) assert.equal(x.reason.details?.reason, 'HUMAN_REVIEW_EXISTS')
  assert.equal(await n("SELECT count(*)::int AS n FROM report_review_requests WHERE session_id = $1 AND request_kind = 'HUMAN_REVIEW'", [sid]), 1)
  await assert.rejects(query(`INSERT INTO report_review_requests (session_id, version, user_id, reason, request_kind) VALUES ($1, 1, $2, 'A direct second free review insert.', 'HUMAN_REVIEW')`, [sid, user]), /report_review_requests_one_human_review/)
  await assert.rejects(query(`INSERT INTO report_review_requests (session_id, version, user_id, reason, request_kind) VALUES ($1, 1, $2, 'An unknown kind of request.', 'PAID')`, [sid, user]), /check/i)
  const found = await r.reportReviews.findHumanReview(sid)
  assert.equal(found.kind, 'HUMAN_REVIEW')
  assert.equal(found.state, 'OPEN')
  assert.deepEqual((await r.reportReviews.listHumanReviewsForUser(user)).map((x) => x.id), [found.id])
  const open = (await r.reportReviews.listOpen()).filter((x) => x.sessionId === sid)
  assert.deepEqual(open.map((x) => x.kind).sort(), ['HUMAN_REVIEW', 'MOMENT', 'MOMENT'])
  const decided = await r.reportReviews.addDecision({ reviewId: found.id, reviewerId: 'p4reviewer', decision: 'UPHOLD', reason: 'The report stands as issued.' })
  assert.equal(decided.decision, 'UPHOLD')
  assert.equal((await r.reportReviews.findHumanReview(sid)).state, 'RESOLVED')
})

test('0058: pre-start accommodation requests — one per assignment and learner, update while waiting, decide vs. start race, lapse, constraints', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const r = repos()
  const a = await seedAssignment()
  const user = `p4u${randomUUID().slice(0, 8)}`
  const needs = 'I need a text-only administration without the camera check.'
  // Concurrent first requests → one row.
  const many = await Promise.all(Array.from({ length: 5 }, () => r.accommodationRequests.upsertRequest({ assignmentId: a.id, userId: user, organizationId: a.org, needs })))
  assert.equal(many.filter((x) => x.created).length, 1)
  assert.equal(await n('SELECT count(*)::int AS n FROM assessment_accommodation_requests WHERE assignment_id = $1 AND user_id = $2', [a.id, user]), 1)
  const changed = await r.accommodationRequests.upsertRequest({ assignmentId: a.id, userId: user, organizationId: a.org, needs: `${needs} Larger text too.` })
  assert.deepEqual([changed.created, changed.updated], [false, true])
  const id = changed.row.id
  const approved = await r.accommodationRequests.decide(id, { approved: true, modes: { textOnly: true, noCamera: true, extra: 'ignored' }, material: true, note: 'Approved: text only.', decidedBy: randomUUID() })
  assert.equal(approved.status, 'APPROVED')
  assert.deepEqual(approved.modes, { textOnly: true, noCamera: true, reducedProctoring: false })
  assert.equal(await r.accommodationRequests.decide(id, { approved: false, note: 'Second decision.' }), null, 'decided once')
  const frozen = await r.accommodationRequests.upsertRequest({ assignmentId: a.id, userId: user, organizationId: a.org, needs: 'Trying to change a decided request.' })
  assert.deepEqual([frozen.created, frozen.updated, frozen.row.status], [false, false, 'APPROVED'])
  const sid = randomUUID()
  const linked = await r.accommodationRequests.linkSession({ assignmentId: a.id, userId: user, sessionId: sid })
  assert.equal(linked.sessionId, sid)
  assert.equal(linked.status, 'APPROVED')
  assert.equal((await r.accommodationRequests.linkSession({ assignmentId: a.id, userId: user, sessionId: sid })).sessionId, sid, 'idempotent for the same session')
  assert.equal(await r.accommodationRequests.linkSession({ assignmentId: a.id, userId: user, sessionId: randomUUID() }), null, 'never re-linked to another session')

  // Race: a decision and the start at the same time. Whatever wins, the
  // final row is consistent: linked, and either LAPSED (start first) or
  // APPROVED (decision first) — never a decision on a started session.
  for (let i = 0; i < 8; i += 1) {
    const b = await seedAssignment()
    const row = (await r.accommodationRequests.upsertRequest({ assignmentId: b.id, userId: user, organizationId: b.org, needs })).row
    const s = randomUUID()
    const [dec] = await Promise.all([
      r.accommodationRequests.decide(row.id, { approved: true, modes: { textOnly: true }, material: false, note: 'Approved in a race.', decidedBy: null }),
      r.accommodationRequests.linkSession({ assignmentId: b.id, userId: user, sessionId: s }),
    ])
    const final = await r.accommodationRequests.get(row.id)
    assert.equal(final.sessionId, s)
    assert.ok(final.status === (dec ? 'APPROVED' : 'LAPSED'), JSON.stringify(final))
  }
  // Constraints.
  const c = await seedAssignment()
  await assert.rejects(query('INSERT INTO assessment_accommodation_requests (assignment_id, user_id, needs) VALUES ($1, $2, $3)', [c.id, user, 'short']), /check/i)
  await assert.rejects(query(`INSERT INTO assessment_accommodation_requests (assignment_id, user_id, needs, status, modes) VALUES ($1, $2, $3, 'APPROVED', '{}')`, [c.id, user, needs]), /decision_shape/)
  await assert.rejects(query('INSERT INTO assessment_accommodation_requests (assignment_id, user_id, needs) VALUES ($1, $2, $3)', ['p4-no-such-assignment', user, needs]), /foreign key/i)
  // An undecided request lapses at the start; the staff list filters by status.
  const d = await seedAssignment()
  const waiting = (await r.accommodationRequests.upsertRequest({ assignmentId: d.id, userId: user, organizationId: d.org, needs })).row
  assert.equal((await r.accommodationRequests.linkSession({ assignmentId: d.id, userId: user, sessionId: randomUUID() })).status, 'LAPSED')
  const listed = await r.accommodationRequests.listByStatus({ status: 'LAPSED', limit: 1000 })
  assert.ok(listed.rows.some((x) => x.id === waiting.id))
  assert.ok(listed.rows.every((x) => x.status === 'LAPSED'))
})

test('the start link writes the approved decision on the session record (v1_accommodations) once; identity self-declarations are minimal v1_verifications rows', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const r = repos()
  const a = await seedAssignment()
  const user = { id: `p4u${randomUUID().slice(0, 8)}`, name: 'Synthetic Student' }
  const legacy = legacySupportSources(v1Store)
  const audits = []
  const support = createSupportService({ repos: r, assignments: null, legacy, audit: (type, sid, payload) => audits.push({ type, sid, payload }), enabled: () => true })
  const row = (await r.accommodationRequests.upsertRequest({ assignmentId: a.id, userId: user.id, organizationId: a.org, needs: 'I need a text-only administration please.' })).row
  const admin = randomUUID()
  await support.decideAccommodationRequest({ id: row.id, approve: true, modes: { noCamera: true }, material: true, note: 'Approved: no camera; material.', decidedBy: admin })
  const sid = randomUUID()
  await support.linkAccommodationAtStart({ assignmentId: a.id, user, sessionId: sid })
  const rec = await one('SELECT * FROM v1_accommodations WHERE session_id = $1', [sid])
  assert.equal(rec.status, 'approved')
  assert.deepEqual(rec.modes, { textOnly: false, noCamera: true, reducedProctoring: false })
  assert.equal(rec.material, true)
  assert.equal(rec.decided_by, admin)
  // A retried start does not change the activation record.
  await support.linkAccommodationAtStart({ assignmentId: a.id, user, sessionId: sid })
  assert.equal(await n('SELECT count(*)::int AS n FROM v1_accommodations WHERE session_id = $1', [sid]), 1)
  assert.equal(audits.filter((e) => e.type === 'support.accommodation.linked').length, 1)
  await assert.rejects(support.decideAccommodationRequest({ id: row.id, approve: false, note: 'Too late for a decision.', decidedBy: admin }), (err) => err.details?.reason === 'SESSION_STARTED')

  // Identity: the record the route writes holds the declared name and match only.
  await legacy.recordVerification(sid, { fullName: 'Synthetic Student', nameMatch: true, status: 'self_declared', meta: { source: 'api_v1', level: 'L1' } })
  const v = (await one('SELECT data FROM v1_verifications WHERE session_id = $1', [sid])).data
  assert.equal(v.status, 'self_declared')
  assert.equal(v.aadhaarLast4, '')
  assert.deepEqual(v.meta, { source: 'api_v1', level: 'L1' })
})

test('erasure: the per-session cascade and the account cascade remove accommodation requests; another learner is untouched', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const r = repos()
  const [a, b] = [await seedAssignment(), await seedAssignment()]
  const me = `p4u${randomUUID().slice(0, 8)}`
  const other = `p4o${randomUUID().slice(0, 8)}`
  const needs = 'I need a text-only administration please.'
  await r.accommodationRequests.upsertRequest({ assignmentId: a.id, userId: me, organizationId: a.org, needs })
  await r.accommodationRequests.upsertRequest({ assignmentId: b.id, userId: me, organizationId: b.org, needs })
  await r.accommodationRequests.upsertRequest({ assignmentId: a.id, userId: other, organizationId: a.org, needs })
  const sid = randomUUID()
  await r.accommodationRequests.linkSession({ assignmentId: a.id, userId: me, sessionId: sid })
  await eraseCampusSessionData(sid)
  assert.equal(await n('SELECT count(*)::int AS n FROM assessment_accommodation_requests WHERE session_id = $1', [sid]), 0, 'per-session cascade')
  assert.equal(await n('SELECT count(*)::int AS n FROM assessment_accommodation_requests WHERE user_id = $1', [me]), 1, 'the unlinked request waits for the account step')
  const { USER_STATEMENTS } = await import('../domain/privacy/erasureCascade.js')
  const [, statement] = USER_STATEMENTS.find(([tbl]) => tbl === 'assessment_accommodation_requests')
  await statement((sql, params) => query(sql, params), { uid: me })
  assert.equal(await n('SELECT count(*)::int AS n FROM assessment_accommodation_requests WHERE user_id = $1', [me]), 0, 'account cascade')
  assert.equal(await n('SELECT count(*)::int AS n FROM assessment_accommodation_requests WHERE user_id = $1', [other]), 1, 'another learner is untouched')
})

test('0058 down/up: the table, column and index go and come back cleanly', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const applied = async () => (await query('SELECT name FROM schema_migrations ORDER BY name DESC')).rows.map((x) => x.name)
  while ((await applied())[0] >= '0058') await migrateDown()
  assert.equal((await applied())[0], '0057_integrity_guards')
  assert.equal((await one("SELECT to_regclass('assessment_accommodation_requests') AS t")).t, null)
  assert.equal(await n("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'report_review_requests' AND column_name = 'request_kind'"), 0)
  await migrateUp()
  assert.ok((await applied()).includes('0058_v3_support_routes'))
  assert.equal(await n("SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'report_review_requests_one_human_review'"), 1)
})
