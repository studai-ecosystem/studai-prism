// C11.01 on a throwaway Postgres (TEST_DATABASE_URL): 0038 contracts,
// finance-only pricing, append-only invoice exports and the usage-ledger view;
// constraints hold in the database too, and down → up.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) process.env.DATABASE_URL = TEST_DB

const pool = skip ? null : await import('../db/pool.js')
const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')

const exists = async (name) => (await pool.query('SELECT to_regclass($1) AS t', [name])).rows[0].t !== null
const latest = async () => (await pool.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0]?.name

test('0038: campus contracts, pricing, invoice exports and the usage ledger; down reverses', { skip }, async (t) => {
  t.after(async () => { await pool.closePool() })
  await migrateUp()
  for (const name of ['campus_contracts', 'campus_contract_pricing', 'invoice_exports', 'campus_usage_ledger']) assert.ok(await exists(name), name)
  const q = (sql, params) => pool.query(sql, params)
  const { rows: [org] } = await q("INSERT INTO organizations (name, slug, organization_type, status) VALUES ('Synthetic Billing DB Org', $1, 'COLLEGE', 'ACTIVE') RETURNING id", [`syn-bldb-${randomUUID().slice(0, 8)}`])
  const insert = (over = {}) => {
    const v = { name: 'Synthetic', status: 'DRAFT', termStart: '2026-09-01', termEnd: '2027-03-31', seats: 5, event: 'ASSESSMENT_COMPLETED', entitlementId: null, ...over }
    return q(
      `INSERT INTO campus_contracts (organization_id, name, status, term_start, term_end, included_seats, billable_event, components, entitlement_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8, 'admin:ops') RETURNING id`,
      [org.id, v.name, v.status, v.termStart, v.termEnd, v.seats, v.event, v.entitlementId],
    )
  }
  await assert.rejects(insert({ event: 'INVOICE_PAID' }), /check constraint/)
  await assert.rejects(insert({ seats: 0 }), /check constraint/)
  await assert.rejects(insert({ termEnd: '2026-08-01' }), /check constraint/)
  await assert.rejects(insert({ status: 'ACTIVE' }), /check constraint/, 'an active contract needs its sponsorship pool')
  await assert.rejects(q("INSERT INTO campus_contracts (organization_id, name, status, term_start, term_end, included_seats, billable_event, created_by) VALUES ($1, 'x', 'DRAFT', '2026-09-01', '2027-03-31', 1, 'ASSESSMENT_COMPLETED', 'o')", [org.id]), /null value/, 'components have no default')
  const { rows: [c] } = await insert()
  await assert.rejects(q("INSERT INTO campus_contract_pricing (contract_id, per_assessment_rate, approved_at) VALUES ($1, 1, now())", [c.id]), /check constraint/, 'approval needs an approver')
  await assert.rejects(q("INSERT INTO campus_contract_pricing (contract_id, currency) VALUES ($1, 'rupees')", [c.id]), /check constraint/)
  const { rows: [pricing] } = await q('INSERT INTO campus_contract_pricing (contract_id) VALUES ($1) RETURNING *', [c.id])
  assert.deepEqual([pricing.per_assessment_rate, pricing.platform_fee, pricing.currency, pricing.approved_at], [null, null, null, null], 'no price defaults')

  const { rows: [ent] } = await q("INSERT INTO entitlements (id, organization_id, source_type, product_code, quantity, valid_from, status) VALUES ($1, $2, 'INSTITUTION_SPONSORSHIP', 'PRISM_CAMPUS_ASSESSMENT', 5, now(), 'ACTIVE') RETURNING id", [c.id, org.id])
  await q("UPDATE campus_contracts SET status = 'ACTIVE', entitlement_id = $2, activated_by = 'admin:ops', activated_at = now() WHERE id = $1", [c.id, ent.id])
  await q("INSERT INTO entitlement_consumptions (entitlement_id, user_id, organization_id, session_id, event, idempotency_key) VALUES ($1, 'u1', $2, 's1', 'RESERVED', $3)", [ent.id, org.id, `db-${ent.id}`])
  const { rows: [personal] } = await q("INSERT INTO entitlements (user_id, source_type, product_code, quantity, valid_from, status) VALUES ('u1', 'PERSONAL_PURCHASE', 'P', 1, now(), 'ACTIVE') RETURNING id")
  await q("INSERT INTO entitlement_consumptions (entitlement_id, user_id, session_id, event, idempotency_key) VALUES ($1, 'u1', 'sp', 'RESERVED', $2)", [personal.id, `db-${personal.id}`])
  const { rows: ledger } = await q('SELECT * FROM campus_usage_ledger WHERE entitlement_id = ANY($1::uuid[])', [[ent.id, personal.id]])
  assert.deepEqual(ledger.map((r) => [r.entitlement_id, r.event, r.organization_id]), [[ent.id, 'RESERVED', org.id]], 'the usage ledger holds sponsored seats only')

  const { rows: [x] } = await q("INSERT INTO invoice_exports (organization_id, contract_id, period_start, period_end, billable_event, billable_count, created_by) VALUES ($1, $2, '2026-10-01', '2026-10-31', 'ASSESSMENT_COMPLETED', 0, 'owner') RETURNING id", [org.id, c.id])
  await assert.rejects(q('UPDATE invoice_exports SET billable_count = 9 WHERE id = $1', [x.id]), /append-only|not allowed|immutable/i)
  await assert.rejects(q('DELETE FROM invoice_exports WHERE id = $1', [x.id]), /append-only|not allowed|immutable/i)
  await assert.rejects(q("INSERT INTO invoice_exports (organization_id, contract_id, period_start, period_end, billable_event, billable_count, created_by) VALUES ($1, $2, '2026-10-31', '2026-10-01', 'ASSESSMENT_COMPLETED', 0, 'o')", [org.id, c.id]), /check constraint/)

  while ((await latest()) >= '0038') await migrateDown()
  for (const name of ['campus_contracts', 'campus_contract_pricing', 'invoice_exports', 'campus_usage_ledger']) assert.equal(await exists(name), false, name)
  await migrateUp()
  assert.ok(await exists('campus_contracts'))
})
