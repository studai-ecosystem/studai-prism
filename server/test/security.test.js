// Phase 2 security-hardening gate tests (audit C7/C8/C9/C10/C21).
//
// Boots the real app (all middleware + routes) on an ephemeral port with a
// throwaway DATA_DIR, and verifies each hardening behaves — not just that the
// code exists.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jwt from 'jsonwebtoken'

// Isolate the JSON store + set a known signing secret BEFORE app modules load.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-sec-test-'))
process.env.JWT_SECRET = 'test-secret-for-security-suite'
delete process.env.PRISM_PG_STORE

const { buildApp } = await import('../app.js')
const { assertProductionSecrets, getJwtSecret, clientIpKey } = await import('../lib/security.js')
const { createSession, saveReport } = await import('../lib/store.js')

const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

const post = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const tokenFor = (id, email) => jwt.sign({ sub: id, email }, process.env.JWT_SECRET)

const BEDROCK_PRODUCTION_ENV = {
  AWS_SECRETS_MANAGER_SECRET_ID: '/studai/prism/prod/runtime',
  AWS_SECRETS_MANAGER_REGION: 'ap-south-1',
  AWS_SECRETS_MANAGER_REQUIRED: 'true',
  AI_PROVIDER: 'aws-bedrock',
  AWS_REGION: 'ap-south-1',
  BEDROCK_PRIMARY_MODEL: 'global.anthropic.claude-sonnet-5',
  BEDROCK_CONVERSATION_MODEL: 'mistral.mistral-large-3-675b-instruct',
  BEDROCK_FAST_MODEL: 'mistral.ministral-3-14b-instruct',
  BEDROCK_FALLBACK_MODEL: 'global.amazon.nova-2-lite-v1:0',
  BEDROCK_EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
  BEDROCK_MULTIMODAL_MODEL: 'mistral.mistral-large-3-675b-instruct',
  BEDROCK_STT_MODEL: 'mistral.voxtral-mini-3b-2507',
  BEDROCK_ALLOW_GLOBAL_INFERENCE: 'true',
}

// ── C8: JWT hard-fail in production ──────────────────────────────────────────
test('C8: startup check throws in production without JWT_SECRET', () => {
  const saved = new Map()
  for (const key of ['NODE_ENV', 'JWT_SECRET', ...Object.keys(BEDROCK_PRODUCTION_ENV)]) saved.set(key, process.env[key])
  try {
    process.env.NODE_ENV = 'production'
    Object.assign(process.env, BEDROCK_PRODUCTION_ENV)
    delete process.env.JWT_SECRET
    assert.throws(() => assertProductionSecrets(), /JWT_SECRET/)
    assert.throws(() => getJwtSecret(), /JWT_SECRET/)
    process.env.JWT_SECRET = 'a-real-secret'
    assert.doesNotThrow(() => assertProductionSecrets())
    assert.equal(getJwtSecret(), 'a-real-secret')
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('AI security: production requires explicit global routing and temporary AWS credentials', () => {
  const saved = new Map()
  for (const key of ['NODE_ENV', 'JWT_SECRET', ...Object.keys(BEDROCK_PRODUCTION_ENV), 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_BEARER_TOKEN_BEDROCK', 'AWS_AZURE_FEDERATED_ROLE_ARN', 'AWS_AZURE_FEDERATED_AUDIENCE']) {
    saved.set(key, process.env[key])
  }
  try {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'a-real-secret'
    Object.assign(process.env, BEDROCK_PRODUCTION_ENV)
    delete process.env.BEDROCK_ALLOW_GLOBAL_INFERENCE
    assert.throws(() => assertProductionSecrets(), /global Bedrock inference/)

    process.env.BEDROCK_ALLOW_GLOBAL_INFERENCE = 'true'
    process.env.BEDROCK_PRIMARY_MODEL = 'not-a-bedrock-model-id'
    assert.throws(() => assertProductionSecrets(), /invalid Bedrock model ID/)
    process.env.BEDROCK_PRIMARY_MODEL = BEDROCK_PRODUCTION_ENV.BEDROCK_PRIMARY_MODEL

    process.env.AWS_BEARER_TOKEN_BEDROCK = 'never-log-this'
    assert.throws(() => assertProductionSecrets(), /long-lived Bedrock API key/)
    delete process.env.AWS_BEARER_TOKEN_BEDROCK

    process.env.AWS_ACCESS_KEY_ID = 'static-key-id'
  process.env.AWS_SECRET_ACCESS_KEY = 'static-secret'
    delete process.env.AWS_SESSION_TOKEN
  assert.throws(() => assertProductionSecrets(), /incomplete AWS environment credentials/)
    process.env.AWS_SESSION_TOKEN = 'temporary-session-token'
    assert.doesNotThrow(() => assertProductionSecrets())

    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
    delete process.env.AWS_SESSION_TOKEN
    process.env.AWS_AZURE_FEDERATED_ROLE_ARN = 'arn:aws:iam::123456789012:role/prism-runtime'
    assert.throws(() => assertProductionSecrets(), /role and audience/)
    process.env.AWS_AZURE_FEDERATED_AUDIENCE = 'api://prism-runtime'
    assert.doesNotThrow(() => assertProductionSecrets())
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

// ── C7: rate limiting on auth ────────────────────────────────────────────────
test('C7: 6th rapid login attempt from one IP is rate-limited (429)', async () => {
  let last
  for (let i = 0; i < 6; i++) {
    last = await post('/api/auth/login', { email: `probe@example.com` })
  }
  assert.equal(last.status, 429)
  const body = await last.json()
  assert.match(body.error, /Too many requests/)
})

// ── C9: proctor-event endpoint auth ──────────────────────────────────────────
test('C9: /event rejects unknown sessions (404)', async () => {
  const res = await post('/api/assessment/event', { sessionId: 'no-such-session', type: 'face_absent' })
  assert.equal(res.status, 404)
})

test('C9: /event rejects a user-owned session without that user\u2019s token (403), accepts with it', async () => {
  await createSession('sec-test-owned', { scenarioId: 's1', userId: 'user-1', userEmail: 'owner@example.com', history: [] })

  const anon = await post('/api/assessment/event', { sessionId: 'sec-test-owned', type: 'face_absent' })
  assert.equal(anon.status, 403)

  const wrongUser = await post(
    '/api/assessment/event',
    { sessionId: 'sec-test-owned', type: 'face_absent' },
    { Authorization: `Bearer ${tokenFor('user-2', 'other@example.com')}` },
  )
  assert.equal(wrongUser.status, 403)

  const owner = await post(
    '/api/assessment/event',
    { sessionId: 'sec-test-owned', type: 'face_absent' },
    { Authorization: `Bearer ${tokenFor('user-1', 'owner@example.com')}` },
  )
  assert.equal(owner.status, 200)
})

// ── C10: send-report auth + destination restriction ─────────────────────────
test('C10: send-report requires auth and an account-linked destination', async () => {
  // Enable the mailer's config check (no email is actually sent — every case
  // below is rejected before the SMTP transport would be used).
  process.env.SMTP_HOST = 'smtp.test.invalid'
  process.env.SMTP_USER = 'x'
  process.env.SMTP_PASS = 'y'
  try {
    await createSession('sec-test-report', { scenarioId: 's1', userId: 'user-9', userEmail: 'cand@example.com', history: [] })
    await saveReport('sec-test-report', {
      scores: { overall: 70 }, userId: 'user-9', userEmail: 'cand@example.com',
    })
    const pdfBase64 = Buffer.alloc(2000, 1).toString('base64')

    const unauth = await post('/api/assessment/send-report', {
      sessionId: 'sec-test-report', email: 'attacker@evil.example', pdfBase64,
    })
    assert.equal(unauth.status, 401)

    const wrongOwner = await post(
      '/api/assessment/send-report',
      { sessionId: 'sec-test-report', email: 'cand@example.com', pdfBase64 },
      { Authorization: `Bearer ${tokenFor('user-2', 'other@example.com')}` },
    )
    assert.equal(wrongOwner.status, 403)

    const arbitraryDest = await post(
      '/api/assessment/send-report',
      { sessionId: 'sec-test-report', email: 'attacker@evil.example', pdfBase64 },
      { Authorization: `Bearer ${tokenFor('user-9', 'cand@example.com')}` },
    )
    assert.equal(arbitraryDest.status, 403)
  } finally {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
  }
})

// ── C21: security headers + CORS ─────────────────────────────────────────────
test('C21: responses carry CSP / HSTS / X-Content-Type-Options headers', async () => {
  const res = await fetch(`${base}/api/health`)
  assert.equal(res.status, 200)
  assert.ok(res.headers.get('content-security-policy'), 'CSP header missing')
  assert.ok(res.headers.get('strict-transport-security'), 'HSTS header missing')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
})

test('payments: COOP allows popups (Razorpay bank-auth windows need window.opener)', async () => {
  const res = await fetch(`${base}/api/health`)
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups')
})

test('C7: rate-limit keys strip the port Azure ARR appends to X-Forwarded-For', () => {
  assert.equal(clientIpKey({ ip: '98.70.48.29:57559' }), '98.70.48.29')
  assert.equal(clientIpKey({ ip: '98.70.48.29' }), '98.70.48.29')
  assert.equal(clientIpKey({ ip: '[2001:db8::1]:443' }), '2001:db8::1')
  assert.equal(clientIpKey({ ip: '2001:db8::1' }), '2001:db8::1')
  assert.equal(clientIpKey({}), 'unknown')
})

test('C21: production app does not reflect arbitrary Origins (no CORS wildcard)', async () => {
  const oldEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const prodApp = buildApp()
    const prodServer = prodApp.listen(0)
    await new Promise((r) => prodServer.once('listening', r))
    try {
      const res = await fetch(`http://127.0.0.1:${prodServer.address().port}/api/health`, {
        headers: { Origin: 'https://evil.example' },
      })
      assert.equal(res.headers.get('access-control-allow-origin'), null)
    } finally {
      prodServer.close()
    }
  } finally {
    process.env.NODE_ENV = oldEnv
  }
})
