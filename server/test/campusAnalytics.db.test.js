// C10.02 on a throwaway Postgres (TEST_DATABASE_URL): 0037 settings table,
// the minimum-group-size floor is a database CHECK too, and down → up.
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

test('0037: analytics settings floor enforced by the database; down reverses', { skip }, async (t) => {
  t.after(async () => { await pool.closePool() })
  await migrateUp()
  assert.ok(await exists('organization_analytics_settings'))
  const { rows: [org] } = await pool.query("INSERT INTO organizations (name, slug, organization_type, status) VALUES ('Synthetic Analytics DB Org', $1, 'COLLEGE', 'ACTIVE') RETURNING id", [`syn-andb-${randomUUID().slice(0, 8)}`])
  await assert.rejects(pool.query("INSERT INTO organization_analytics_settings (organization_id, min_aggregate_group_size, updated_by) VALUES ($1, 4, 'o')", [org.id]), /check constraint/)
  await assert.rejects(pool.query("INSERT INTO organization_analytics_settings (organization_id, min_aggregate_group_size, updated_by) VALUES ($1, NULL, 'o')", [org.id]), /null value/)
  await pool.query("INSERT INTO organization_analytics_settings (organization_id, min_aggregate_group_size, updated_by) VALUES ($1, 10, 'o')", [org.id])
  while ((await latest()) >= '0037') await migrateDown()
  assert.equal(await exists('organization_analytics_settings'), false)
  await migrateUp()
  assert.ok(await exists('organization_analytics_settings'))
})
