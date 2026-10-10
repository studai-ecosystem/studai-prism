// PROD-READY Phase 8 — under-18 guardian-consent path (AGE_GATING_POLICY_v1
// addendum). DARK behind PRISM_UNDER18_PATH (registered OFF):
//   * flag off: registration without the 18+ confirmation is refused exactly
//     as before (400 AGE_CONFIRMATION_REQUIRED, no account), the normal 18+
//     registration is unchanged, every guardian route answers 404;
//   * flag on: an under-18 registration creates the account WITHOUT a
//     declaration (commencement stays blocked), a guardian link is issued
//     (only its hash stored), the guardian agrees / declines / withdraws, and
//     the commencement gate follows the consent;
//   * data minimal (guardian email, copy version, state), erased with the
//     account; copy marked DRAFT pending HA-006 and HA-005.
// Synthetic accounts only; JSON user store in an isolated data directory.
import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import * as store from '../lib/store.js'
import * as userDb from '../lib/db.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'
import { createGuardianConsentRepo, eraseGuardianConsentsFromMemory } from '../domain/guardian/repository.js'
import { createGuardianConsentService, hashGuardianToken, normalizeGuardianEmail } from '../domain/guardian/service.js'
import { GUARDIAN_CONSENT_COPY, GUARDIAN_CONSENT_COPY_STATUS, GUARDIAN_CONSENT_PENDING_ON, GUARDIAN_DECLARATION_BASIS } from '../domain/guardian/copy.js'
import { registryEntry } from '../domain/privacy/personalDataRegistry.js'
import { USER_STATEMENTS } from '../domain/privacy/erasureCascade.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'p08-guardian-test-secret'
delete process.env.DATABASE_URL
delete process.env.PRISM_PG_STORE
delete process.env.PRISM_UNDER18_PATH
const FLAG = 'PRISM_UNDER18_PATH'

const { buildApp } = await import('../app.js')
const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

async function call(method, path, { body, token } = {}) {
  const r = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
async function withFlag(on, fn) {
  const prev = process.env[FLAG]
  if (on) process.env[FLAG] = 'true'
  else delete process.env[FLAG]
  try { return await fn() } finally { if (prev === undefined) delete process.env[FLAG]; else process.env[FLAG] = prev }
}
const email = (p) => `${p}-${randomUUID().slice(0, 8)}@test.local`
const under18 = (e, guardianEmail = email('guardian')) => ({ name: 'Synthetic Learner', email: e, password: 'synthetic-pass', under18: true, guardianEmail })

// The frozen router's commencement gate (/api/assessment/start).
async function startGate(token) {
  const sessionId = randomUUID()
  await store.createEntitlement({ sessionId, mode: 'invite', amount: 0 })
  const r = await call('POST', '/api/assessment/start', { token, body: { sessionId } })
  return r.json.code || r.status
}

test('the flag is registered OFF and names HA-005 / HA-006; copy is DRAFT', () => {
  const f = FLAG_CATALOGUE.find((x) => x.key === FLAG)
  assert.ok(f)
  assert.match(f.dataGate, /HA-005/)
  assert.match(f.dataGate, /HA-006/)
  assert.notEqual(process.env[FLAG], 'true')
  assert.equal(GUARDIAN_CONSENT_COPY_STATUS, 'DRAFT')
  assert.deepEqual([...GUARDIAN_CONSENT_PENDING_ON], ['HA-006', 'HA-005'])
  assert.equal(GUARDIAN_CONSENT_COPY.status, 'DRAFT')
  assert.match(GUARDIAN_CONSENT_COPY.version, /draft/)
  assert.match(GUARDIAN_CONSENT_COPY.draftNotice, /Draft/)
})

test('flag off: today\'s behaviour is unchanged and every guardian route is 404', async () => {
  await withFlag(false, async () => {
    const e = email('off')
    const refused = await call('POST', '/api/auth/register', { body: under18(e) })
    assert.equal(refused.status, 400)
    assert.equal(refused.json.code, 'AGE_CONFIRMATION_REQUIRED')
    assert.equal(await userDb.findUserByEmail(e), null, 'no account is created')
    const adult = await call('POST', '/api/auth/register', { body: { name: 'Synthetic Adult', email: email('adult'), password: 'synthetic-pass', ageConfirmed: true } })
    assert.equal(adult.status, 201)
    assert.equal(adult.json.user.ageConfirmed, true)
    assert.equal(adult.json.guardianConsent, undefined, 'the 18+ response shape is unchanged')
    assert.equal((await call('GET', '/api/auth/guardian-consent', { token: adult.json.token })).status, 404)
    assert.equal((await call('POST', '/api/auth/guardian-consent/resend', { token: adult.json.token })).status, 404)
    assert.equal((await call('GET', '/api/guardian-consent/some-token')).status, 404)
    assert.equal((await call('POST', '/api/guardian-consent/some-token', { body: { decision: 'GRANT' } })).status, 404)
    assert.equal((await call('POST', '/api/guardian-consent/some-token/withdraw')).status, 404)
  })
})

test('flag on: under-18 registration → guardian agrees → start allowed → withdraws → blocked again', async () => {
  await withFlag(true, async () => {
    const e = email('minor')
    // (Address validation is covered on the service; the auth rate limit is 5/min.)
    assert.throws(() => normalizeGuardianEmail('not-an-email', e), (err) => err.code === 'GUARDIAN_EMAIL_INVALID')
    assert.throws(() => normalizeGuardianEmail(e.toUpperCase(), e), (err) => err.code === 'GUARDIAN_EMAIL_SAME')
    const reg = await call('POST', '/api/auth/register', { body: under18(e) })
    assert.equal(reg.status, 201)
    assert.equal(reg.json.user.ageConfirmed, false, 'no declaration until a guardian agrees')
    assert.equal(reg.json.guardianConsent.status, 'PENDING')
    assert.equal(reg.json.guardianConsent.emailSent, false, 'mail is not configured in tests: reported, never claimed')
    assert.equal(reg.json.guardianConsent.guardianEmail, undefined, 'the learner response never echoes the guardian address')
    const token = reg.json.token
    assert.equal(await startGate(token), 'AGE_CONFIRMATION_REQUIRED', 'pending consent: commencement blocked')
    const status = await call('GET', '/api/auth/guardian-consent', { token })
    assert.equal(status.json.consent.status, 'PENDING')
    assert.equal(status.json.consent.tokenHash, undefined)

    // A known link: a second service on the same store issues a fresh one.
    const user = await userDb.findUserByEmail(e)
    const linkToken = `syn-link-${randomUUID()}`
    const svc = createGuardianConsentService({ repo: createGuardianConsentRepo(), users: userDb, tokenFactory: () => linkToken })
    await svc.resend(user)
    const view = await call('GET', `/api/guardian-consent/${linkToken}`)
    assert.equal(view.status, 200)
    assert.equal(view.json.consent.status, 'PENDING')
    assert.equal(view.json.copy.status, 'DRAFT')
    assert.equal(view.json.learnerName, 'Synthetic Learner')
    assert.equal((await call('POST', `/api/guardian-consent/${linkToken}`, { body: { decision: 'MAYBE' } })).status, 400)
    const granted = await call('POST', `/api/guardian-consent/${linkToken}`, { body: { decision: 'GRANT' } })
    assert.equal(granted.status, 200)
    assert.equal(granted.json.consent.status, 'VERIFIED')
    assert.equal((await call('POST', `/api/guardian-consent/${linkToken}`, { body: { decision: 'GRANT' } })).status, 409, 'single decision per link')
    const declared = (await userDb.findUserByEmail(e)).ageDeclaration
    assert.equal(declared.basis, GUARDIAN_DECLARATION_BASIS, 'the declaration names the guardian consent, not an 18+ confirmation')
    assert.match(declared.version, /guardian-consent-u18/)
    assert.notEqual(await startGate(token), 'AGE_CONFIRMATION_REQUIRED', 'consent verified: the age gate passes')

    const withdrawn = await call('POST', `/api/guardian-consent/${linkToken}/withdraw`)
    assert.equal(withdrawn.json.consent.status, 'WITHDRAWN')
    assert.equal((await userDb.findUserByEmail(e)).ageDeclaration, null)
    assert.equal(await startGate(token), 'AGE_CONFIRMATION_REQUIRED', 'withdrawn: blocked again')
    assert.equal((await call('POST', `/api/guardian-consent/${linkToken}/withdraw`)).status, 409)
    assert.equal((await call('GET', '/api/guardian-consent/unknown-token')).status, 404)
  })
})

test('decline, expiry and a learner\'s own 18+ declaration are handled without guessing', async () => {
  let now = new Date('2026-10-10T10:00:00Z')
  const users = new Map()
  const fakeUsers = {
    findById: async (id) => users.get(id) || null,
    recordAgeDeclaration: async (id, d) => { const u = users.get(id); if (!u.ageDeclaration) u.ageDeclaration = d; return u },
    clearGuardianAgeDeclaration: async (id) => { const u = users.get(id); if (u.ageDeclaration?.basis !== 'GUARDIAN_CONSENT') return false; u.ageDeclaration = null; return true },
  }
  let n = 0
  const svc = createGuardianConsentService({ repo: createGuardianConsentRepo(), users: fakeUsers, clock: () => now, tokenFactory: () => `syn-t-${(n += 1)}-${randomUUID()}` })
  const u1 = { id: `syn-u1-${randomUUID()}`, email: 'syn-u1@test.local', name: 'Synthetic One' }
  users.set(u1.id, { ...u1 })
  const issued = []
  const svc2 = createGuardianConsentService({ repo: createGuardianConsentRepo(), users: fakeUsers, clock: () => now, tokenFactory: () => { const t = `syn-k-${randomUUID()}`; issued.push(t); return t } })
  await svc2.request(u1, 'guardian-one@test.local')
  assert.equal((await svc2.decide(issued[0], 'DECLINE')).status, 'DECLINED')
  assert.equal(users.get(u1.id).ageDeclaration, undefined, 'a decline writes nothing to the account')
  // Expiry: a link older than 14 days cannot decide.
  await svc2.resend(u1)
  now = new Date(now.getTime() + 15 * 864e5)
  await assert.rejects(svc2.decide(issued[1], 'GRANT'), (e) => e.status === 410)
  assert.equal((await svc2.view(issued[1])).consent.status, 'EXPIRED')
  // A learner's own declaration is never removed by a guardian withdrawal.
  await svc2.resend(u1)
  await svc2.decide(issued[2], 'GRANT')
  users.get(u1.id).ageDeclaration = { version: 'age-18plus-v1', at: now.toISOString() }
  await svc2.withdraw(issued[2])
  assert.equal(users.get(u1.id).ageDeclaration.version, 'age-18plus-v1')
  assert.equal(hashGuardianToken('a'), hashGuardianToken('a'))
  assert.ok(svc)
})

test('erasure and retention: guardian data is registered, cascaded and erased with the account', async () => {
  assert.equal(registryEntry('guardian_consents', 'guardian_email').action, 'DELETE')
  assert.equal(registryEntry('guardian_consents', 'user_id').action, 'DELETE')
  assert.ok(USER_STATEMENTS.some(([t]) => t === 'guardian_consents'), 'the account cascade deletes the rows')
  const { RETENTION_DEFAULTS } = await import('../lib/retentionEnforcement.js')
  const rule = RETENTION_DEFAULTS.find((r) => r.entity === 'guardian_consents_unverified')
  assert.ok(rule && rule.retentionDays === 30 && /PROVISIONAL/.test(rule.basis))
  const repo = createGuardianConsentRepo()
  const uid = `syn-erase-${randomUUID()}`
  await repo.create({ userId: uid, guardianEmail: 'g@test.local', copyVersion: 'v', tokenHash: hashGuardianToken(uid), expiresAt: new Date(Date.now() + 864e5), now: new Date() })
  assert.ok(await repo.latestForUser(uid))
  assert.equal(eraseGuardianConsentsFromMemory(uid), 1)
  assert.equal(await repo.latestForUser(uid), null)
})
