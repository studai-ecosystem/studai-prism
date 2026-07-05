// Dummy-payments mode gate tests (PRISM_DUMMY_PAYMENTS).
//
// The flag lets production mint free 'dummy' sessions while the Razorpay
// account is not live. These tests pin the security boundary: WITHOUT the
// flag, production must keep rejecting free sessions (403).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-pay-test-'))
process.env.JWT_SECRET = 'test-secret-for-payment-suite'
delete process.env.PRISM_PG_STORE

const { buildApp } = await import('../app.js')

const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

function withEnv(vars, fn) {
  const saved = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    })
}

test('dummy mode ON in production: config reports dummyMode and dev-session mints a dummy entitlement', () =>
  withEnv({ NODE_ENV: 'production', PRISM_DUMMY_PAYMENTS: 'true' }, async () => {
    const cfg = await (await fetch(`${base}/api/payment/config`)).json()
    assert.equal(cfg.dummyMode, true)
    assert.equal(cfg.enabled, false, 'live checkout must be disabled in dummy mode')
    assert.equal(cfg.keyId, null, 'publishable key must not be exposed in dummy mode')
    assert.equal(cfg.devSessionAvailable, true)

    const res = await fetch(`${base}/api/payment/dev-session`, { method: 'POST' })
    assert.equal(res.status, 200)
    const { sessionId } = await res.json()
    assert.ok(sessionId, 'dummy session must return a sessionId')
  }))

test('dummy mode OFF in production: dev-session stays forbidden (403)', () =>
  withEnv({ NODE_ENV: 'production', PRISM_DUMMY_PAYMENTS: undefined }, async () => {
    const res = await fetch(`${base}/api/payment/dev-session`, { method: 'POST' })
    assert.equal(res.status, 403)
    const cfg = await (await fetch(`${base}/api/payment/config`)).json()
    assert.equal(cfg.dummyMode, false)
    assert.equal(cfg.devSessionAvailable, false)
  }))

test('non-production keeps the classic dev-session flow with the flag unset', () =>
  withEnv({ NODE_ENV: 'test', PRISM_DUMMY_PAYMENTS: undefined }, async () => {
    const res = await fetch(`${base}/api/payment/dev-session`, { method: 'POST' })
    assert.equal(res.status, 200)
    const { sessionId } = await res.json()
    assert.ok(sessionId)
  }))

test('PRISM_SKIP_VERIFICATION is reflected in config (and defaults off)', async () => {
  await withEnv({ PRISM_SKIP_VERIFICATION: 'true' }, async () => {
    const cfg = await (await fetch(`${base}/api/payment/config`)).json()
    assert.equal(cfg.skipVerification, true)
  })
  await withEnv({ PRISM_SKIP_VERIFICATION: undefined }, async () => {
    const cfg = await (await fetch(`${base}/api/payment/config`)).json()
    assert.equal(cfg.skipVerification, false)
  })
})
