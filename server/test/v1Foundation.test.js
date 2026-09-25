// Prism Campus C1.03 — /api/v1 foundation: envelope, request id, auth, flags, 404.
import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'test-secret-for-v1-foundation'
delete process.env.DATABASE_URL

const { buildApp } = await import('../app.js')
const { createUser, updateUserAccount } = await import('../lib/db.js')
const { CAMPUS_FLAGS } = await import('../domain/flags/index.js')

const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

const sign = (user, extra = {}) => jwt.sign({ sub: user.id, email: user.email, tv: user.tokenVersion || 0, ...extra }, process.env.JWT_SECRET)

async function newUser(label) {
  return createUser({ name: 'Synthetic V1 User', email: `${label}-${Date.now()}-${process.hrtime.bigint()}@test.local`, college: 'Synthetic', year: '4', passwordHash: 'x' })
}

test('GET /api/v1/health → { data: { status: ok } } with a request id header', async () => {
  const r = await fetch(`${base}/api/v1/health`)
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { data: { status: 'ok' } })
  assert.ok(r.headers.get('x-request-id'))
  assert.equal(r.headers.get('cache-control'), 'no-store')
})

test('X-Request-Id is echoed when well-formed', async () => {
  const r = await fetch(`${base}/api/v1/health`, { headers: { 'X-Request-Id': 'client-req-12345678' } })
  assert.equal(r.headers.get('x-request-id'), 'client-req-12345678')
})

test('a malformed X-Request-Id is replaced before it reaches envelopes', async () => {
  const r = await fetch(`${base}/api/v1/me`, { headers: { 'X-Request-Id': 'bad id <script>' } })
  const body = await r.json()
  assert.notEqual(r.headers.get('x-request-id'), 'bad id <script>')
  assert.match(body.error.requestId, /^[0-9a-f-]{36}$/)
})

test('GET /api/v1/me without a token → 401 UNAUTHENTICATED envelope', async () => {
  const r = await fetch(`${base}/api/v1/me`)
  assert.equal(r.status, 401)
  const body = await r.json()
  assert.equal(body.error.code, 'UNAUTHENTICATED')
  assert.ok(body.error.requestId)
  assert.equal(body.data, undefined)
})

test('GET /api/v1/me with an invalid token → 401', async () => {
  const r = await fetch(`${base}/api/v1/me`, { headers: { Authorization: 'Bearer not-a-jwt' } })
  assert.equal(r.status, 401)
  assert.equal((await r.json()).error.code, 'UNAUTHENTICATED')
})

test('GET /api/v1/me with a revoked token (token version bumped) → 401', async () => {
  const user = await newUser('revoked')
  const token = sign(user)
  await updateUserAccount(user.id, { bumpTokenVersion: true })
  const r = await fetch(`${base}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(r.status, 401)
})

test('GET /api/v1/me for a suspended account → 403 FORBIDDEN', async () => {
  const user = await newUser('suspended')
  const token = sign(user)
  await updateUserAccount(user.id, { accountState: 'suspended' })
  const r = await fetch(`${base}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(r.status, 403)
  assert.equal((await r.json()).error.code, 'FORBIDDEN')
})

test('GET /api/v1/me → user, allow-listed flags (all off), permissions stub, personal workspace', async () => {
  const user = await newUser('me')
  const r = await fetch(`${base}/api/v1/me`, { headers: { Authorization: `Bearer ${sign(user)}` } })
  assert.equal(r.status, 200)
  const { data } = await r.json()
  assert.equal(data.user.id, user.id)
  assert.equal(data.user.passwordHash, undefined, 'public user only')
  assert.deepEqual(Object.keys(data.flags).sort(), [...CAMPUS_FLAGS].sort(), 'only campus flags are exposed')
  for (const v of Object.values(data.flags)) assert.equal(v, false)
  assert.deepEqual(data.permissions, { global: [] })
  assert.equal(data.workspaces.length, 1)
  assert.equal(data.workspaces[0].type, 'PERSONAL')
  assert.equal(data.workspaces[0].visibilityPolicy, 'OWNER_ONLY')
})

test('client flags reflect env set inside the test process only', async () => {
  const user = await newUser('flag')
  process.env.PRISM_APP_SHELL_V3 = 'true'
  try {
    const r = await fetch(`${base}/api/v1/me`, { headers: { Authorization: `Bearer ${sign(user)}` } })
    assert.equal((await r.json()).data.flags.PRISM_APP_SHELL_V3, true)
  } finally {
    delete process.env.PRISM_APP_SHELL_V3
  }
})

test('unknown /api/v1 route → 404 NOT_FOUND envelope', async () => {
  const r = await fetch(`${base}/api/v1/does-not-exist`)
  assert.equal(r.status, 404)
  const body = await r.json()
  assert.equal(body.error.code, 'NOT_FOUND')
})

test('malformed JSON under /api/v1 → 422 VALIDATION_FAILED envelope (not a bare 500)', async () => {
  const r = await fetch(`${base}/api/v1/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })
  assert.equal(r.status, 422)
  assert.equal((await r.json()).error.code, 'VALIDATION_FAILED')
})

test('legacy routes keep their own shapes', async () => {
  const r = await fetch(`${base}/api/health`)
  assert.deepEqual(await r.json(), { status: 'ok' })
  const nf = await fetch(`${base}/api/nope`)
  assert.deepEqual(await nf.json(), { error: 'Not found' })
})
