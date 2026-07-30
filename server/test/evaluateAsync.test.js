// Async evaluation contract tests (submit reliability fix).
//
// The judge panel can outlive load-balancer idle timeouts, so /evaluate runs
// scoring as a server-side job: fast path returns the report inline, slow path
// returns 202 and the client polls /evaluate-status/:sessionId. These tests pin
// the status-endpoint contract and the idempotency of /evaluate — the states a
// client can observe across retries, restarts and double-submits.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-eval-test-'))
process.env.JWT_SECRET = 'test-secret-for-evaluate-suite'
delete process.env.PRISM_PG_STORE

const { buildApp } = await import('../app.js')
const { createSession, saveReport } = await import('../lib/store.js')

const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

test('evaluate requires a sessionId', async () => {
  const res = await fetch(`${base}/api/assessment/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert.equal(res.status, 400)
})

test('evaluate-status: unknown session → 404', async () => {
  const res = await fetch(`${base}/api/assessment/evaluate-status/${randomUUID()}`)
  assert.equal(res.status, 404)
})

test('evaluate-status: session exists but was never scored → idle (client re-submits)', async () => {
  const sessionId = randomUUID()
  await createSession(sessionId, { userId: null, userEmail: null })
  const res = await fetch(`${base}/api/assessment/evaluate-status/${sessionId}`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, 'idle')
})

test('evaluate-status: scored session → complete with the stored report', async () => {
  const sessionId = randomUUID()
  await createSession(sessionId, { userId: null, userEmail: null })
  await saveReport(sessionId, { scores: { overall: 61 }, reliability: { label: 'high' } })
  const res = await fetch(`${base}/api/assessment/evaluate-status/${sessionId}`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, 'complete')
  assert.equal(body.report.scores.overall, 61)
})

test('evaluate is idempotent: an already-scored session returns the stored report, never re-scores', async () => {
  const sessionId = randomUUID()
  await createSession(sessionId, { userId: null, userEmail: null })
  await saveReport(sessionId, { scores: { overall: 74 }, reliability: { label: 'high' } })
  const res = await fetch(`${base}/api/assessment/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  assert.equal(res.status, 200, 'must return the cached report inline, not 202')
  const body = await res.json()
  assert.equal(body.scores.overall, 74)
})
