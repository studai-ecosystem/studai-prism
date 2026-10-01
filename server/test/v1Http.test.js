// Prism Campus C1.03 — /api/v1 http helpers: pagination, idempotency, error handler.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { parsePagination, encodeCursor, DEFAULT_LIMIT, MAX_LIMIT } from '../domain/http/pagination.js'
import { idempotent, createMemoryIdempotencyStore } from '../domain/http/idempotency.js'
import { ApiError, createErrorHandler, ok } from '../domain/http/errors.js'
import { requestId } from '../domain/http/requestId.js'

test('pagination: defaults, cap, cursor round-trip, invalid input', () => {
  assert.deepEqual(parsePagination({}), { limit: DEFAULT_LIMIT, cursor: null })
  assert.equal(parsePagination({ limit: '500' }).limit, MAX_LIMIT)
  const c = encodeCursor({ after: 'abc' })
  assert.deepEqual(parsePagination({ cursor: c }).cursor, { after: 'abc' })
  assert.throws(() => parsePagination({ limit: '0' }), (e) => e.code === 'VALIDATION_FAILED')
  assert.throws(() => parsePagination({ cursor: '%%%' }), (e) => e.code === 'VALIDATION_FAILED')
})

function appWith(handler) {
  const app = express()
  app.use(express.json())
  app.use(requestId)
  app.use((req, _res, next) => { req.user = { id: req.get('x-test-user') || 'u1' }; next() })
  let calls = 0
  app.post('/thing', idempotent({ store: createMemoryIdempotencyStore(), scope: 'test' }), (req, res) => {
    calls += 1
    return handler(req, res, calls)
  })
  app.use(createErrorHandler(null))
  return { app, calls: () => calls }
}

async function listen(app, fn) {
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  try { return await fn(`http://127.0.0.1:${server.address().port}`) } finally { server.close() }
}

test('idempotency: key required, replay returns the original response, keyed per user', async () => {
  const { app, calls } = appWith((_req, res, n) => ok(res, { n }, 201))
  await listen(app, async (base) => {
    const missing = await fetch(`${base}/thing`, { method: 'POST' })
    assert.equal(missing.status, 428)
    assert.equal((await missing.json()).error.code, 'IDEMPOTENCY_KEY_REQUIRED')

    const h = { 'Idempotency-Key': 'key-00000001' }
    const first = await fetch(`${base}/thing`, { method: 'POST', headers: h })
    const second = await fetch(`${base}/thing`, { method: 'POST', headers: h })
    assert.equal(first.status, 201)
    assert.equal(second.status, 201)
    assert.deepEqual(await second.json(), { data: { n: 1 } })
    assert.equal(second.headers.get('idempotent-replay'), 'true')
    assert.equal(calls(), 1, 'handler ran once')

    const other = await fetch(`${base}/thing`, { method: 'POST', headers: { ...h, 'x-test-user': 'u2' } })
    assert.deepEqual(await other.json(), { data: { n: 2 } }, 'another user with the same key is not replayed')

    const bad = await fetch(`${base}/thing`, { method: 'POST', headers: { 'Idempotency-Key': 'x' } })
    assert.equal(bad.status, 422)
  })
})

test('idempotency: a concurrent duplicate while the first is running → 409 CONFLICT', async () => {
  let release
  const gate = new Promise((r) => { release = r })
  const { app, calls } = appWith(async (_req, res, n) => {
    if (n === 1) await gate
    return ok(res, { n }, 201)
  })
  await listen(app, async (base) => {
    const h = { 'Idempotency-Key': 'key-00000003' }
    const first = fetch(`${base}/thing`, { method: 'POST', headers: h })
    await new Promise((r) => setTimeout(r, 50))
    const dup = await fetch(`${base}/thing`, { method: 'POST', headers: h })
    assert.equal(dup.status, 409)
    assert.equal((await dup.json()).error.code, 'CONFLICT')
    release()
    assert.equal((await first).status, 201)
    const replay = await fetch(`${base}/thing`, { method: 'POST', headers: h })
    assert.deepEqual(await replay.json(), { data: { n: 1 } })
    assert.equal(calls(), 1)
  })
})

test('idempotency: a response that bypasses res.json releases the key (no stuck 409)', async () => {
  const { app, calls } = appWith((_req, res, n) => (n === 1 ? res.status(204).end() : ok(res, { n })))
  await listen(app, async (base) => {
    const h = { 'Idempotency-Key': 'key-00000004' }
    assert.equal((await fetch(`${base}/thing`, { method: 'POST', headers: h })).status, 204)
    await new Promise((r) => setTimeout(r, 20))
    const again = await fetch(`${base}/thing`, { method: 'POST', headers: h })
    assert.equal(again.status, 200)
    assert.equal(calls(), 2)
  })
})

test('idempotency: failed responses are not stored', async () => {
  const { app, calls } = appWith((_req, res, n) => (n === 1 ? res.status(500).json({ error: { code: 'INTERNAL' } }) : ok(res, { n })))
  await listen(app, async (base) => {
    const h = { 'Idempotency-Key': 'key-00000002' }
    assert.equal((await fetch(`${base}/thing`, { method: 'POST', headers: h })).status, 500)
    assert.equal((await fetch(`${base}/thing`, { method: 'POST', headers: h })).status, 200)
    assert.equal(calls(), 2)
  })
})

test('error handler: ApiError → envelope; unknown error → generic INTERNAL without details', async () => {
  const app = express()
  app.use(requestId)
  app.get('/api-error', (_req, _res, next) => next(new ApiError('CONFLICT', 'Version conflict', { details: { current: 3 } })))
  app.get('/boom', () => { throw new Error('secret internal detail') })
  app.use(createErrorHandler(null))
  await listen(app, async (base) => {
    const a = await fetch(`${base}/api-error`)
    assert.equal(a.status, 409)
    const ab = await a.json()
    assert.deepEqual({ code: ab.error.code, details: ab.error.details }, { code: 'CONFLICT', details: { current: 3 } })
    const b = await fetch(`${base}/boom`)
    assert.equal(b.status, 500)
    const bb = await b.json()
    assert.equal(bb.error.code, 'INTERNAL')
    assert.doesNotMatch(JSON.stringify(bb), /secret internal detail/)
  })
})
