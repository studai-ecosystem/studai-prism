// Integration test for the Postgres-backed v1 store (storePg.js + dbPg.js).
// Requires a throwaway Postgres:
//   set TEST_DATABASE_URL=postgres://user:pass@localhost:5432/prism_test
// Skips entirely when unset so the unit suite stays green without a DB.

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.PRISM_PG_STORE = 'true'
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { closePool } = skip ? {} : await import('../db/pool.js')
const store = skip ? {} : await import('../lib/storePg.js')
const userDb = skip ? {} : await import('../lib/dbPg.js')

test('pg store: entitlement → session → report round-trips with JSON-identical shapes', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()

  const sessionId = randomUUID()

  // Entitlement.
  const ent = await store.createEntitlement({ sessionId, mode: 'dev', amount: 0 })
  assert.equal(ent.mode, 'dev')
  assert.equal(ent.consumed, false)
  const gotEnt = await store.getEntitlement(sessionId)
  assert.equal(gotEnt.sessionId, sessionId)

  // Session creation consumes the entitlement.
  const sess = await store.createSession(sessionId, {
    scenarioId: 'group-project', userId: 'u1', userEmail: 'a@b.com', exchangeCount: 0, history: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(sess.scenarioId, 'group-project')
  assert.equal(sess.exchangeCount, 0)
  const afterStart = await store.getEntitlement(sessionId)
  assert.equal(afterStart.consumed, true, 'starting a session consumes the entitlement')

  // Update merges into data.
  const upd = await store.updateSession(sessionId, { exchangeCount: 3 })
  assert.equal(upd.exchangeCount, 3)
  const reread = await store.getSession(sessionId)
  assert.equal(reread.exchangeCount, 3)
  assert.equal(reread.scenarioId, 'group-project')

  // Recent scenarios by user.
  const recent = await store.getRecentScenarioIdsByUser('u1')
  assert.ok(recent.includes('group-project'))

  // Report save clamps history off the session + exposes overall.
  const report = await store.saveReport(sessionId, {
    userId: 'u1', scores: { criticalThinking: 80, overall: 78 }, feedback: {}, highlights: [], growthAreas: [],
  })
  assert.equal(report.scores.overall, 78)
  const gotReport = await store.getReport(sessionId)
  assert.equal(gotReport.scores.overall, 78)
  const byUser = await store.getReportsByUser('u1')
  assert.equal(byUser.length >= 1, true)
  const overalls = await store.getAllOverallScores()
  assert.ok(overalls.includes(78))
  const postReportSess = await store.getSession(sessionId)
  assert.ok(postReportSess.completedAt, 'report marks the session complete')
  assert.equal(postReportSess.history, undefined, 'transcript is freed after scoring')

  // Events + items.
  await store.recordEvent(sessionId, 'tab_switch', { n: 1 })
  const events = await store.getEvents(sessionId)
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'tab_switch')
  await store.recordItem({ sessionId, dimension: 'criticalThinking', level: 3 })
  const items = await store.getItemsBySession(sessionId)
  assert.equal(items.length, 1)

  // Calibration / consent / dispute / verification / device link.
  await store.setCalibration(sessionId, { tier: 'advanced' })
  assert.equal((await store.getCalibration(sessionId)).tier, 'advanced')
  await store.recordConsent(sessionId, ['data_processing', 'proctoring'], { ip: '1.2.3.4' })
  assert.deepEqual((await store.getConsent(sessionId)).scopes, ['data_processing', 'proctoring'])
  await store.createDispute(sessionId, 'too low', 'a@b.com')
  assert.equal((await store.getDispute(sessionId)).status, 'open')
  await store.recordVerification(sessionId, { fullName: 'A B', aadhaarLast4: '123456789012', nameMatch: true })
  const ver = await store.getVerification(sessionId)
  assert.equal(ver.aadhaarLast4, '9012')
  assert.equal(ver.status, 'verified')
  const pair = 'PAIR99'
  await store.recordDeviceLink(pair, { sessionId, status: 'linked', phoneUserAgent: 'iPhone' })
  const dl = await store.getDeviceLink(pair)
  assert.equal(dl.status, 'linked')

  // Erasure removes everything for the session.
  const erased = await store.eraseSession(sessionId)
  assert.equal(erased, true)
  assert.equal(await store.getSession(sessionId), null)
  assert.equal(await store.getReport(sessionId), null)
  assert.equal((await store.getEvents(sessionId)).length, 0)
})

test('pg user store: create / find / update / EMAIL_TAKEN', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()

  const email = `u_${randomUUID().slice(0, 8)}@test.dev`
  const created = await userDb.createUser({ email, name: 'Test', college: 'IIT', year: '3', passwordHash: 'hash' })
  assert.equal(created.email, email)
  assert.ok(created.id)

  const byEmail = await userDb.findUserByEmail(email.toUpperCase()) // normalized
  assert.equal(byEmail.id, created.id)
  const byId = await userDb.findUserById(created.id)
  assert.equal(byId.email, email)

  const updated = await userDb.updateUser(created.id, { name: 'Renamed', college: 'NIT', year: '4' })
  assert.equal(updated.name, 'Renamed')
  assert.equal(updated.college, 'NIT')

  const pub = userDb.publicUser(byId)
  assert.equal(pub.passwordHash, undefined, 'publicUser strips the hash')

  await assert.rejects(
    () => userDb.createUser({ email, passwordHash: 'x' }),
    /EMAIL_TAKEN/,
  )
})
