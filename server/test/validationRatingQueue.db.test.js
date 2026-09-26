// C12.01 on a throwaway Postgres (TEST_DATABASE_URL): 0039 rating queue —
// hashed references only, levels without defaults, append-only ratings,
// one rating per rater per item; down → up.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) process.env.DATABASE_URL = TEST_DB

const pool = skip ? null : await import('../db/pool.js')
const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')

const exists = async (name) => (await pool.query('SELECT to_regclass($1) AS t', [name])).rows[0].t !== null
const latest = async () => (await pool.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0]?.name
const h = () => createHash('sha256').update(randomUUID()).digest('hex')

test('0039: evidence rating queue constraints; ratings append-only; down reverses', { skip }, async (t) => {
  t.after(async () => { await pool.closePool() })
  await migrateUp()
  assert.ok(await exists('evidence_rating_items'))
  assert.ok(await exists('evidence_unit_ratings'))
  const q = (sql, params) => pool.query(sql, params)
  const item = (over = {}) => {
    const v = { ref: h(), sref: h(), source: 'DIALOGUE_TURN', excerpt: 'I would check the {{candidate}} data first.', ai: 3, ...over }
    return q(
      `INSERT INTO evidence_rating_items (evidence_ref, session_ref, capability_id, source_type, excerpt, ai_level, rubric_version, enqueued_by)
       VALUES ($1, $2, 'CAP-L1-REASONING', $3, $4, $5, 'r1', 'admin:x') RETURNING id`,
      [v.ref, v.sref, v.source, v.excerpt, v.ai],
    )
  }
  await assert.rejects(item({ ref: 'evid-raw-id' }), /check constraint/, 'references are hashes, never raw ids')
  await assert.rejects(item({ source: 'HUMAN_RATING' }), /check constraint/)
  await assert.rejects(item({ excerpt: '' }), /check constraint/)
  await assert.rejects(item({ ai: 6 }), /check constraint/)
  const { rows: [it] } = await item({ ai: null })
  const rate = (rater, level, cannot) => q('INSERT INTO evidence_unit_ratings (item_id, rater_id, level, cannot_rate) VALUES ($1, $2, $3, $4) RETURNING id', [it.id, rater, level, cannot])
  await assert.rejects(q('INSERT INTO evidence_unit_ratings (item_id, rater_id, level) VALUES ($1, $2, 3)', [it.id, 'r0']), /null value/, 'cannot_rate has no default')
  await assert.rejects(rate('r1', 3, true), /check constraint/)
  await assert.rejects(rate('r1', null, false), /check constraint/)
  const { rows: [r] } = await rate('r1', 4, false)
  await assert.rejects(rate('r1', 2, false), /duplicate key/)
  await assert.rejects(q('UPDATE evidence_unit_ratings SET level = 1 WHERE id = $1', [r.id]), /append-only/)
  await assert.rejects(q('DELETE FROM evidence_unit_ratings WHERE id = $1', [r.id]), /append-only/)
  while ((await latest()) >= '0039') await migrateDown()
  assert.equal(await exists('evidence_rating_items'), false)
  await migrateUp()
  assert.ok(await exists('evidence_unit_ratings'))
})
