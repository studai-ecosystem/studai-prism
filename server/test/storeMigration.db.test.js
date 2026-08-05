// Charter §20 CI rehearsal — JSON store → PostgreSQL migration + reconciliation.
// Requires a throwaway Postgres (TEST_DATABASE_URL) AND an isolated DATA_DIR;
// skips entirely when the DB is unset so the local suite stays green.
//
// This is the dev rehearsal the runbook requires: seed a JSON store through
// the REAL storeJson/dbJson APIs, migrate, reconcile to zero mismatches, then
// verify erasure / reports / entitlements / disputes THROUGH the PG backend.

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (!skip) {
  process.env.DATABASE_URL = TEST_DB
  // Isolate the JSON source store BEFORE storeJson/dbJson resolve DATA_DIR.
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-migrate-'))
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { closePool, query } = skip ? {} : await import('../db/pool.js')
const migration = skip ? {} : await import('../db/storeMigration.js')
const jsonStore = skip ? {} : await import('../lib/storeJson.js')
const dbJson = skip ? {} : await import('../lib/dbJson.js')
const pgStore = skip ? {} : await import('../lib/storePg.js')
const dbPg = skip ? {} : await import('../lib/dbPg.js')

test('json→pg migration rehearsal: copy, reconcile, verify, idempotent', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()

  const suffix = randomUUID().slice(0, 8)
  const sid = `mig-${suffix}`
  const sid2 = `mig2-${suffix}`

  // ── Seed the JSON store through the real APIs ──────────────────────────────
  const user = await dbJson.createUser({
    email: `mig-${suffix}@example.com`, name: 'Migration Test', college: 'C', year: '3',
    passwordHash: 'x'.repeat(20), ageDeclaration: { version: 'age-18plus-v1', confirmedAt: new Date().toISOString() },
  })
  await jsonStore.createEntitlement({ sessionId: sid, mode: 'dev', amount: 0 })
  await jsonStore.createSession(sid, {
    scenarioId: 'group-project', userId: user.id, userEmail: user.email,
    exchangeCount: 2, history: [{ role: 'user', content: 'hello' }],
  })
  await jsonStore.updateSession(sid, { exchangeCount: 3, language: 'en' })
  await jsonStore.recordEvent(sid, 'tab_switch', { n: 1 })
  await jsonStore.recordEvent(sid, 'looking_away', { n: 2 })
  await jsonStore.recordItem({ sessionId: sid, dimension: 'criticalThinking', level: 3 })
  await jsonStore.setCalibration(sid, { tier: 'advanced' })
  await jsonStore.recordConsent(sid, ['assessment'], { locale: 'en' })
  await jsonStore.createDispute(sid, 'please review', 'me@example.com')
  await jsonStore.setDisputeResolution(sid, { outcome: 'upheld', explanation: 'ok', decidedAt: new Date().toISOString() })
  await jsonStore.recordVerification(sid, { fullName: 'Migration Test', nameMatch: true, matchScore: 0.9 })
  await jsonStore.recordDeviceLink(`pair-${suffix}`, { sessionId: sid, status: 'linked', phoneUserAgent: 'ua' })
  await jsonStore.requestAccommodation(sid, 'screen reader')
  await jsonStore.decideAccommodation(sid, { approved: true, modes: { textOnly: true }, material: true, note: 'ok', decidedBy: null })
  await jsonStore.saveReport(sid, {
    userId: user.id,
    scores: { criticalThinking: 71, collaboration: 64 },
    composite: { value: 68, access: 'research' },
    feedback: {}, highlights: [], growthAreas: [],
  })
  // A second, incomplete session (no report — exercises null completedAt).
  await jsonStore.createEntitlement({ sessionId: sid2, mode: 'dev', amount: 0 })
  await jsonStore.createSession(sid2, { scenarioId: 'design-sprint', userId: user.id, userEmail: user.email, exchangeCount: 0 })

  // ── Dry run copies nothing ─────────────────────────────────────────────────
  const dry = await migration.migrateJsonStoreToPg({ dryRun: true })
  assert.equal(dry.dryRun, true)
  assert.equal(dry.buckets.sessions.jsonCount >= 2, true)
  const before = await pgStore.getSession(sid)
  assert.equal(before, null, 'dry run must not write')

  // ── Enforce, then reconcile to zero mismatches ─────────────────────────────
  const run = await migration.migrateJsonStoreToPg({ dryRun: false })
  assert.equal(run.dryRun, false)
  assert.equal(run.buckets.sessions.copied, run.buckets.sessions.jsonCount)
  assert.equal(run.buckets.users.copied, run.buckets.users.jsonCount)

  const recon = await migration.reconcileStores()
  assert.equal(recon.ok, true, `reconciliation mismatches: ${JSON.stringify(
    Object.fromEntries(Object.entries(recon.buckets).filter(([, b]) => b.mismatched.length)))}`)
  for (const [name, bucket] of Object.entries(recon.buckets)) {
    assert.deepEqual(bucket.mismatched, [], `bucket ${name} must have no mismatches`)
    assert.equal(bucket.jsonHash, bucket.pgHash, `bucket ${name} canonical hashes must match`)
  }

  // ── Post-migration verification through the PG backend ────────────────────
  const pgReport = await pgStore.getReport(sid)
  assert.equal(pgReport.composite.value, 68)
  assert.equal(pgReport.scores.criticalThinking, 71)
  const pgEnt = await pgStore.getEntitlement(sid)
  assert.equal(pgEnt.consumed, true)
  const pgDispute = await pgStore.getDispute(sid)
  assert.equal(pgDispute.resolution.outcome, 'upheld')
  const pgUser = await dbPg.findUserByEmail(user.email)
  assert.equal(pgUser.id, user.id)
  assert.equal(pgUser.ageDeclaration.version, 'age-18plus-v1')
  const pgSession = await pgStore.getSession(sid)
  assert.equal(pgSession.history, undefined, 'freed transcript stays freed')
  const pgAccom = await pgStore.getAccommodation(sid)
  assert.equal(pgAccom.material, true)

  // ── Idempotency: re-run, still clean, telemetry not duplicated ─────────────
  const rerun = await migration.migrateJsonStoreToPg({ dryRun: false })
  assert.equal(rerun.buckets.events.copied, 0, 'existing per-session events must be skipped on re-run')
  assert.equal(rerun.buckets.items.copied, 0, 'existing per-session items must be skipped on re-run')
  const events = await pgStore.getEvents(sid)
  assert.equal(events.length, 2, 'no duplicate telemetry after re-run')
  const recon2 = await migration.reconcileStores()
  assert.equal(recon2.ok, true)

  // ── Erasure works through the PG store after migration ────────────────────
  const removed = await pgStore.eraseSession(sid2)
  assert.equal(removed, true)
  assert.equal(await pgStore.getSession(sid2), null)
  assert.equal(await pgStore.getEntitlement(sid2), null)

  // Clean up the first session's rows too so repeated CI runs stay stable.
  await pgStore.eraseSession(sid)
  await dbPg.deleteUser(user.id)
  await query('DELETE FROM v1_device_links WHERE pair_code = $1', [`pair-${suffix}`])
})
