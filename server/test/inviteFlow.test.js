// Group assessment invite contract tests (no database required).
//
// Pins: input validation on invite creation, the auth + availability gates on
// the public redemption endpoint, and the calibration-reality contract —
// mode='invite' sessions are REAL candidates (never synthetic-flagged), which
// is what makes college cohort data usable.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-invite-test-'))
process.env.JWT_SECRET = 'test-secret-for-invite-suite'
delete process.env.PRISM_PG_STORE
delete process.env.DATABASE_URL

const { buildApp } = await import('../app.js')
const { createInvite } = await import('../lib/invites.js')
const { REAL_ENTITLEMENT_MODES } = await import('../lib/sharedConstants.js')

const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

async function registerUser() {
  const email = `invitee-${Date.now()}@example.com`
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'invite-pass-1', name: 'Invitee', ageConfirmed: true }),
  })
  assert.equal(res.status, 201)
  return (await res.json()).token
}

test('invite creation validates seat counts and windows before touching storage', async () => {
  await assert.rejects(
    () => createInvite({ maxUses: 0, expiresAt: new Date(Date.now() + 3600e3).toISOString(), createdBy: 'x' }),
    (err) => err.code === 'INVALID_MAX_USES',
  )
  await assert.rejects(
    () => createInvite({ maxUses: 101, expiresAt: new Date(Date.now() + 3600e3).toISOString(), createdBy: 'x' }),
    (err) => err.code === 'INVALID_MAX_USES',
  )
  await assert.rejects(
    () => createInvite({ maxUses: 10, expiresAt: new Date(Date.now() - 1000).toISOString(), createdBy: 'x' }),
    (err) => err.code === 'INVALID_EXPIRY',
  )
  await assert.rejects(
    () => createInvite({
      maxUses: 10,
      startsAt: new Date(Date.now() + 7200e3).toISOString(),
      expiresAt: new Date(Date.now() + 3600e3).toISOString(),
      createdBy: 'x',
    }),
    (err) => err.code === 'INVALID_WINDOW',
  )
})

test('coupon codes are validated before touching storage', async () => {
  const future = new Date(Date.now() + 3600e3).toISOString()
  for (const bad of ['ab', 'has space', 'sneaky!code', '-leading', 'x'.repeat(33)]) {
    await assert.rejects(
      () => createInvite({ maxUses: 10, expiresAt: future, createdBy: 'x', code: bad }),
      (err) => err.code === 'INVALID_CODE',
      `code "${bad}" must be rejected`,
    )
  }
})

test('invite redemption requires authentication', async () => {
  const res = await fetch(`${base}/api/payment/invite/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'anything' }),
  })
  assert.equal(res.status, 401)
})

test('invite redemption is honestly unavailable without a database', async () => {
  const token = await registerUser()
  const res = await fetch(`${base}/api/payment/invite/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ token: 'some-invite-token' }),
  })
  assert.equal(res.status, 503)
})

test('invite mode counts as a REAL candidate for calibration; dummy/dev/admin_grant stay synthetic', () => {
  assert.ok(REAL_ENTITLEMENT_MODES.includes('paid'))
  assert.ok(REAL_ENTITLEMENT_MODES.includes('invite'))
  for (const syntheticMode of ['dummy', 'dev', 'admin_grant']) {
    assert.ok(!REAL_ENTITLEMENT_MODES.includes(syntheticMode), `${syntheticMode} must stay synthetic`)
  }
})
