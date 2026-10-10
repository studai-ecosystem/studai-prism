// PROD-READY Phase 1S (N2): migration 0055 and the PostgreSQL payment
// redemption ledger. Requires a throwaway Postgres (TEST_DATABASE_URL); skips
// otherwise. Run serially with the other *.db.test.js files.
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
const store = skip ? {} : await import('../lib/storePg.js')

test('0055: builds on a v1_payments table that already holds duplicate payment ids; the earliest entitlement becomes the redemption; down/up is clean', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  // Roll back to just before 0055 (only if it is the head), seed duplicates, re-apply.
  const head = (await query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0].name
  assert.equal(head, '0055_payment_redemptions')
  await migrateDown()
  assert.equal((await query("SELECT to_regclass('v1_payment_redemptions') AS t")).rows[0].t, null)
  const pay = `pay_dup_${randomUUID().slice(0, 8)}`
  const [early, late] = [randomUUID(), randomUUID()]
  await query(`INSERT INTO v1_payments (session_id, payment_id, order_id, amount, mode, consumed, created_at, user_id) VALUES
    ($1, $3, 'order_dup', 49900, 'paid', false, now() - interval '2 days', 'user-dup'),
    ($2, $3, 'order_dup', 49900, 'paid', false, now() - interval '1 day', 'user-dup')`, [early, late, pay])
  await migrateUp()
  const rows = (await query('SELECT * FROM v1_payment_redemptions WHERE payment_id = $1', [pay])).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].session_id, early, 'the earliest entitlement is the redemption')
  assert.equal((await query('SELECT count(*)::int AS n FROM v1_payments WHERE payment_id = $1', [pay])).rows[0].n, 2, 'history is not rewritten')
  // A redeem of the duplicated payment now returns the existing session.
  const again = await store.redeemPayment({ paymentId: pay, orderId: 'order_dup', sessionId: randomUUID(), amount: 49900, userId: 'user-dup' })
  assert.deepEqual([again.created, again.sessionId], [false, early])
})

test('redeemPayment: concurrent first redemptions create one entitlement; erasure detaches the redemption', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const pay = `pay_race_${randomUUID().slice(0, 8)}`
  const results = await Promise.all(Array.from({ length: 6 }, () => store.redeemPayment({
    paymentId: pay, orderId: 'order_race', sessionId: randomUUID(), amount: 49900, userId: 'user-race', userEmail: 'race@test.local',
  })))
  assert.equal(results.filter((r) => r.created).length, 1)
  const sessionIds = new Set(results.map((r) => r.sessionId))
  assert.equal(sessionIds.size, 1)
  const [sid] = sessionIds
  assert.equal((await query('SELECT count(*)::int AS n FROM v1_payments WHERE payment_id = $1', [pay])).rows[0].n, 1)
  const ent = await store.getEntitlement(sid)
  assert.deepEqual([ent.paymentId, ent.mode, ent.userId, ent.consumed], [pay, 'paid', 'user-race', false])

  assert.equal(await store.eraseSession(sid), true)
  assert.equal(await store.getEntitlement(sid), null)
  const detached = await store.getPaymentRedemption(pay)
  assert.deepEqual([detached.paymentId, detached.sessionId, detached.userId], [pay, null, null])
  const replay = await store.redeemPayment({ paymentId: pay, orderId: 'order_race', sessionId: randomUUID(), amount: 49900, userId: 'user-race' })
  assert.deepEqual([replay.created, replay.sessionId], [false, null], 'a replay after erasure mints nothing')
  assert.equal((await query('SELECT count(*)::int AS n FROM v1_payments WHERE payment_id = $1', [pay])).rows[0].n, 0)
})
