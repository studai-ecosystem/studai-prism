// Prism Campus C2.15 — every sufficiency decision shown on a candidate
// surface lands in audit_log (throwaway Postgres; skips without one).
import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import express from 'express'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.PRISM_V2_TELEMETRY = 'true' // inside this test process only (K2)
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')
const { createSession } = skip ? {} : await import('../lib/store.js')
const { default: router } = skip ? {} : await import('../routes/assessment.js')

async function auditRows(sessionId) {
  for (let i = 0; i < 40; i += 1) {
    const { rows } = await query("SELECT payload FROM audit_log WHERE session_id = $1 AND event_type = 'evidence.status.decided'", [sessionId])
    if (rows.length >= 2) return rows
    await new Promise((r) => setTimeout(r, 50))
  }
  const { rows } = await query("SELECT payload FROM audit_log WHERE session_id = $1 AND event_type = 'evidence.status.decided'", [sessionId])
  return rows
}

test('report V2 and the workplace view both audit their sufficiency decisions', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const sessionId = randomUUID()
  await createSession(sessionId, { history: [{ role: 'user', content: '[Candidate]: synthetic answer' }] })

  const app = express()
  app.use('/api/assessment', router)
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  t.after(() => server.close())
  const base = `http://127.0.0.1:${server.address().port}/api/assessment`
  assert.equal((await fetch(`${base}/report/${sessionId}/v2`)).status, 200)
  assert.equal((await fetch(`${base}/report/${sessionId}/employee`)).status, 200)

  const rows = await auditRows(sessionId)
  const bySurface = Object.fromEntries(rows.map((r) => [r.payload.surface, r.payload]))
  for (const surface of ['report_v2', 'report_employee']) {
    const p = bySurface[surface]
    assert.ok(p, `${surface} audited`)
    assert.equal(p.ruleVersion, 'sufficiency-rules.v1-provisional')
    const caps = Object.values(p.capabilities)
    assert.ok(caps.length > 0)
    for (const c of caps) {
      assert.equal(c.status, 'INSUFFICIENT_EVIDENCE')
      assert.ok(Array.isArray(c.reasons) && c.reasons.length > 0)
    }
  }
})
