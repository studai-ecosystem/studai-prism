// P9.1 quality views: three independent routes under system:read, aggregate
// counts only, honest 503 without a database, no learner fields in any
// response, and mounted on the admin plane.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createQualityRouter, QUALITY_FORBIDDEN_RESPONSE_KEYS } from '../routes/admin/quality.js'

const here = dirname(fileURLToPath(import.meta.url))
const NOW = new Date('2026-10-02T12:00:00Z')

// A fake pg `query` that answers by table name with aggregate rows. Payload
// and text columns are deliberately present in the fixture rows the queries
// could touch, so the test proves they never reach the response.
function fakeQuery(sql) {
  const s = String(sql)
  if (s.includes('FROM assessment_candidate_actions') && s.includes('GROUP BY state')) return { rows: [{ state: 'APPLIED', n: 7 }, { state: 'FAILED', n: 1 }, { state: 'ACCEPTED', n: 2 }] }
  if (s.includes('FROM assessment_candidate_actions') && s.includes("kind = 'FINISH'")) return { rows: [{ n: 3 }] }
  if (s.includes('FROM assessment_jobs') && s.includes('GROUP BY')) return { rows: [{ state: 'DONE', result_state: 'DONE', retried: 1, n: 2 }, { state: 'FAILED', result_state: 'TECHNICAL_FAILURE', retried: 0, n: 1 }] }
  if (s.includes('FROM assessment_jobs') && s.includes("state = 'LEASED'")) return { rows: [{ n: 0 }] }
  if (s.includes('FROM student_report_versions')) return { rows: [{ n: 2 }] }
  if (s.includes('FROM report_review_requests')) return { rows: [{ n: 1 }] }
  if (s.includes('FROM assessment_opportunities')) return { rows: [{ state: 'EVALUATED', n: 4 }, { state: 'PRESENTED', n: 1 }, { state: 'PLANNED', n: 1 }] }
  if (s.includes('FROM behavioral_evidence_units') && s.includes('methodVersion')) return { rows: [{ method: 'slice-v1', evidence_status: 'PROVISIONAL', n: 3 }, { method: 'slice-v1', evidence_status: 'HUMAN_REVIEW_REQUIRED', n: 1 }] }
  if (s.includes('FROM behavioral_evidence_units')) return { rows: [{ evidence_status: 'PROVISIONAL', reason: '', n: 3 }, { evidence_status: 'HUMAN_REVIEW_REQUIRED', reason: 'QUOTE_MISMATCH', n: 1 }] }
  if (s.includes('FROM product_events')) {
    return { rows: [
      { event: 'practice_recommended', channel: 'VOLUNTARY', availability: 'AVAILABLE', refunded: 'false', n: 5, actors: 4 },
      { event: 'practice_started', channel: 'VOLUNTARY', availability: '', refunded: 'false', n: 2, actors: 2 },
      { event: 'practice_started', channel: 'COMPULSORY', availability: '', refunded: 'false', n: 3, actors: 3 },
      { event: 'package_viewed', channel: 'VOLUNTARY', availability: '', refunded: 'false', n: 6, actors: 5 },
      { event: 'purchase_verified', channel: 'VOLUNTARY', availability: '', refunded: 'false', n: 1, actors: 1 },
      { event: 'purchase_verified', channel: 'VOLUNTARY', availability: '', refunded: 'true', n: 1, actors: 1 },
    ] }
  }
  throw new Error(`unexpected query: ${s.slice(0, 80)}`)
}

async function serve({ configured = true, admin = { permissions: new Set(['system:read']) }, query = fakeQuery } = {}) {
  const app = express()
  app.use((req, _res, next) => { if (admin) req.admin = admin; next() })
  app.use('/quality', createQualityRouter({ query: async (sql, params) => query(sql, params), isDbConfigured: () => configured, clock: () => NOW }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() } }
  return { get, close: () => server.close() }
}

function keysDeep(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out) }
  return out
}

test('P9.1: the three views exist, require system:read and answer 503 NO_DB without a database', async () => {
  const noDb = await serve({ configured: false })
  try {
    for (const v of ['operational', 'measurement', 'customer']) {
      const r = await noDb.get(`/quality/${v}`)
      assert.equal(r.status, 503)
      assert.equal(r.body.code, 'NO_DB')
    }
  } finally { noDb.close() }
  const noAdmin = await serve({ admin: null })
  try { assert.equal((await noAdmin.get('/quality/operational')).status, 401) } finally { noAdmin.close() }
  const wrongPerm = await serve({ admin: { permissions: new Set(['users:read']) } })
  try { assert.equal((await wrongPerm.get('/quality/customer')).status, 403) } finally { wrongPerm.close() }
})

test('P9.1: views return aggregate counts only, each independently, with the definition version and no learner fields', async () => {
  const s = await serve()
  try {
    const op = await s.get('/quality/operational')
    assert.equal(op.status, 200)
    assert.equal(op.body.view, 'OPERATIONAL')
    assert.equal(op.body.definitionVersion, 'v1')
    assert.deepEqual(op.body.actions, { acknowledged: 10, applied: 7, failed: 1, recoverable: 10 })
    assert.equal(op.body.jobs.technicalFailures, 1)
    assert.equal(op.body.jobs.retries, 1)
    assert.deepEqual(op.body.publication, { submittedRuns: 3, publishedRuns: 2, missingPublication: 1, reviewRequestsOpen: 1 })

    const me = await s.get('/quality/measurement')
    assert.equal(me.body.view, 'MEASUREMENT')
    assert.deepEqual(me.body.opportunities, { scheduled: 6, delivered: 5, answered: 4, evaluated: 4 })
    assert.equal(me.body.evidence.units, 4)
    assert.equal(me.body.evidence.byStatus.quoteMismatch, 1)
    assert.equal(me.body.evidence.claimRejectionRate, 0.25)
    assert.equal(me.body.evidence.byMethod['slice-v1'].total, 4)

    const cu = await s.get('/quality/customer')
    assert.equal(cu.body.view, 'CUSTOMER')
    assert.deepEqual(cu.body.practice, { recommendedVoluntaryViewers: 4, voluntaryStarters: 2, compulsoryStarts: 3 })
    assert.deepEqual(cu.body.conversion, { offerViewers: 5, verifiedBuyers: 1, refunded: 1 })
    assert.equal(cu.body.comprehension.status, 'MANUAL_ONLY')
    assert.equal(cu.body.transfer.status, 'MANUAL_ONLY')

    for (const body of [op.body, me.body, cu.body]) {
      const keys = keysDeep(body)
      for (const k of QUALITY_FORBIDDEN_RESPONSE_KEYS) assert.equal(keys.has(k), false, `${k} must not appear`)
      // Every leaf is a number, boolean, enum/short string or null — never free text longer than a note.
      const leaves = JSON.stringify(body).match(/"[^"]{200,}"/g)
      assert.equal(leaves, null, 'no long text values')
    }
  } finally { s.close() }
})

test('P9.1: a query failure is a 503 QUALITY_UNAVAILABLE, never a partial or invented view', async () => {
  const s = await serve({ query: () => { throw new Error('relation missing') } })
  try {
    const r = await s.get('/quality/measurement')
    assert.equal(r.status, 503)
    assert.equal(r.body.code, 'QUALITY_UNAVAILABLE')
  } finally { s.close() }
})

test('P9.1: the quality router is mounted on the admin plane behind the authenticated pipeline', () => {
  const src = readFileSync(join(here, '..', 'routes', 'admin', 'index.js'), 'utf8')
  const mountAt = src.indexOf("router.use('/quality', qualityRouter)")
  const authAt = src.indexOf('requireAdminAuth, requireCsrf, adminAuditMiddleware')
  assert.ok(mountAt > 0 && authAt > 0 && mountAt > authAt, 'quality is mounted after the auth/CSRF/audit middleware')
})
