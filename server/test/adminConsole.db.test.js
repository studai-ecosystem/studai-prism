// Admin Control Centre — full-flow integration tests (database required).
//
//   set TEST_DATABASE_URL=postgres://user:pass@localhost:5432/prism_test
//
// Skips entirely when unset (storePg.db.test.js convention). Exercises the
// REAL HTTP surface: bootstrap → login → mandatory MFA enrolment → session →
// forced password change → RBAC enforcement → CSRF → audit immutability →
// dual-approval → session revocation → break-glass gating.

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-console-test-secret'
  process.env.PRISM_ADMIN_CONSOLE = 'true'
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')
const { buildApp } = skip ? {} : await import('../app.js')
const adminAuth = skip ? {} : await import('../lib/adminAuth.js')
const { seedRbac } = skip ? {} : await import('../lib/adminRbac.js')

// Minimal HTTP client that tracks the admin refresh cookie like a browser.
// Each actor gets a distinct forwarded IP so per-IP rate limits apply per
// simulated administrator (app runs behind trust proxy 1, as in production).
let clientSeq = 0
function makeClient(baseUrl) {
  let cookie = null
  const ip = `10.99.${Math.floor(clientSeq / 250)}.${(clientSeq++ % 250) + 1}`
  return {
    async call(method, path, { body, headers = {} } = {}) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': ip,
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const setCookie = res.headers.get('set-cookie')
      if (setCookie && setCookie.includes('prism_admin_rt=')) {
        cookie = setCookie.split(';')[0]
      }
      let json = null
      try { json = await res.json() } catch { /* empty */ }
      return { status: res.status, json, headers: res.headers, rawCookie: setCookie }
    },
    getCookie: () => cookie,
  }
}

test('admin console end-to-end: bootstrap → MFA → RBAC → audit → dual approval', { skip }, async (t) => {
  await migrateUp()
  await seedRbac()

  const app = buildApp()
  const server = app.listen(0)
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    server.close()
    await closePool()
  })

  const suffix = randomUUID().slice(0, 8)
  const superEmail = `e2e-super-${suffix}@test.local`
  const opsEmail = `e2e-ops-${suffix}@test.local`
  const password = 'a-strong-test-password-1'

  // ── Bootstrap a super admin directly (seedAdmin.js path, minus CLI) ────────
  const superId = randomUUID()
  await query(
    `INSERT INTO admin_users (admin_id, email, name, password_hash, state, must_change_password)
     VALUES ($1,$2,'E2E Super',$3,'invited',FALSE)`,
    [superId, superEmail, await adminAuth.hashPassword(password)],
  )
  await query(
    `INSERT INTO admin_user_roles (admin_id, role_id)
     SELECT $1, role_id FROM admin_roles WHERE role_key = 'super_admin'`,
    [superId],
  )

  const client = makeClient(baseUrl)

  // NOTE: the strict credential limiter allows 5 requests/min/IP across
  // login + mfa/* + password/* + break-glass. This actor uses exactly 5
  // (wrong login, login, mfa setup, bad confirm, confirm) — if you add a
  // strict-limited call for this client, give it a fresh makeClient().

  // ── Login: password alone NEVER yields a session (mandatory MFA) ──────────
  const wrong = await client.call('POST', '/api/admin/auth/login', {
    body: { email: superEmail, password: 'wrong-password-123' },
  })
  assert.equal(wrong.status, 401)

  const login1 = await client.call('POST', '/api/admin/auth/login', {
    body: { email: superEmail, password },
  })
  assert.equal(login1.status, 200)
  assert.equal(login1.json.mfaSetupRequired, true, 'first login must demand MFA enrolment')
  assert.ok(login1.json.mfaToken)
  assert.ok(!login1.json.accessToken, 'no access token before MFA')

  // The MFA token grants no API access.
  const sneak = await client.call('GET', '/api/admin/dashboard', {
    headers: { authorization: `Bearer ${login1.json.mfaToken}` },
  })
  assert.equal(sneak.status, 401, 'mfa token audience must be rejected by the API')

  // ── Enrol TOTP ─────────────────────────────────────────────────────────────
  const setup = await client.call('POST', '/api/admin/auth/mfa/setup', {
    body: { mfaToken: login1.json.mfaToken },
  })
  assert.equal(setup.status, 200)
  assert.ok(setup.json.secret)
  assert.ok(setup.json.otpauthUri.startsWith('otpauth://totp/'))

  const badConfirm = await client.call('POST', '/api/admin/auth/mfa/confirm', {
    body: { mfaToken: login1.json.mfaToken, code: '000000' },
  })
  assert.ok([401].includes(badConfirm.status), 'wrong TOTP rejected')

  const confirm = await client.call('POST', '/api/admin/auth/mfa/confirm', {
    body: { mfaToken: login1.json.mfaToken, code: adminAuth.totpCode(setup.json.secret) },
  })
  assert.equal(confirm.status, 200)
  const session1 = confirm.json
  assert.ok(session1.accessToken)
  assert.ok(session1.csrfToken)
  assert.ok(client.getCookie(), 'refresh cookie set')
  assert.match(confirm.rawCookie, /HttpOnly/i)
  assert.match(confirm.rawCookie, /SameSite=Strict/i)
  assert.match(confirm.rawCookie, /Path=\/api\/admin/i)

  // Secret is stored encrypted, never plaintext.
  const storedMfa = await query('SELECT secret_encrypted FROM admin_mfa_methods WHERE admin_id = $1', [superId])
  assert.ok(!storedMfa.rows[0].secret_encrypted.includes(setup.json.secret))

  const authed = (token) => ({ authorization: `Bearer ${token}` })
  const mutating = (token, csrf) => ({ authorization: `Bearer ${token}`, 'x-admin-csrf': csrf })

  // ── /me + dashboard ────────────────────────────────────────────────────────
  const me = await client.call('GET', '/api/admin/auth/me', { headers: authed(session1.accessToken) })
  assert.equal(me.status, 200)
  assert.deepEqual(me.json.admin.roles, ['super_admin'])
  assert.ok(me.json.admin.permissions.includes('*'))

  const dash = await client.call('GET', '/api/admin/dashboard', { headers: authed(session1.accessToken) })
  assert.equal(dash.status, 200)
  assert.ok(dash.json.metrics)
  assert.ok(typeof dash.json.metrics.adminsActive === 'number')

  // ── Audit trail: login + MFA enrolment recorded; trail immutable ──────────
  const audit = await query(
    `SELECT action FROM admin_audit_events WHERE admin_id = $1 ORDER BY event_id`,
    [superId],
  )
  const actions = audit.rows.map((r) => r.action)
  assert.ok(actions.includes('admin_login_failed'))
  assert.ok(actions.includes('admin_mfa_enrolled'))
  assert.ok(actions.includes('admin_login'))
  await assert.rejects(
    () => query(`UPDATE admin_audit_events SET action = 'tampered' WHERE admin_id = $1`, [superId]),
    /immutable/,
    'audit UPDATE blocked by trigger',
  )
  await assert.rejects(
    () => query(`DELETE FROM admin_audit_events WHERE admin_id = $1`, [superId]),
    /immutable/,
    'audit DELETE blocked by trigger',
  )

  // ── CSRF: mutation without the header is rejected ──────────────────────────
  const noCsrf = await client.call('POST', '/api/admin/admins', {
    headers: authed(session1.accessToken),
    body: { email: opsEmail, roleKeys: [], temporaryPassword: password },
  })
  assert.equal(noCsrf.status, 403)
  assert.equal(noCsrf.json.code, 'CSRF')

  // ── Invite a scoped admin (assessment_ops) ─────────────────────────────────
  const invite = await client.call('POST', '/api/admin/admins', {
    headers: mutating(session1.accessToken, session1.csrfToken),
    body: { email: opsEmail, name: 'E2E Ops', roleKeys: ['assessment_ops'], temporaryPassword: password },
  })
  assert.equal(invite.status, 201)
  const opsId = invite.json.adminId

  // super_admin cannot be granted at invite.
  const inviteSuper = await client.call('POST', '/api/admin/admins', {
    headers: mutating(session1.accessToken, session1.csrfToken),
    body: { email: `e2e-x-${suffix}@test.local`, roleKeys: ['super_admin'], temporaryPassword: password },
  })
  assert.equal(inviteSuper.status, 400)

  // ── Ops admin signs in (own MFA), then RBAC boundaries are enforced ───────
  const ops = makeClient(baseUrl)
  const opsLogin = await ops.call('POST', '/api/admin/auth/login', { body: { email: opsEmail, password } })
  assert.equal(opsLogin.json.mfaSetupRequired, true)
  const opsSetup = await ops.call('POST', '/api/admin/auth/mfa/setup', { body: { mfaToken: opsLogin.json.mfaToken } })
  const opsConfirm = await ops.call('POST', '/api/admin/auth/mfa/confirm', {
    body: { mfaToken: opsLogin.json.mfaToken, code: adminAuth.totpCode(opsSetup.json.secret) },
  })
  assert.equal(opsConfirm.status, 200)
  const opsSession = opsConfirm.json
  assert.equal(opsSession.admin.mustChangePassword, true, 'invited admins must change the temp password')

  // Forced password change blocks the protected plane…
  const blocked = await ops.call('GET', '/api/admin/dashboard', { headers: authed(opsSession.accessToken) })
  assert.equal(blocked.status, 403)
  assert.equal(blocked.json.code, 'PASSWORD_CHANGE_REQUIRED')

  // …until the password is changed (re-auth + TOTP required).
  const newPassword = 'another-strong-password-2'
  const change = await ops.call('POST', '/api/admin/auth/password/change', {
    headers: mutating(opsSession.accessToken, opsSession.csrfToken),
    body: { current: password, next: newPassword, code: adminAuth.totpCode(opsSetup.json.secret) },
  })
  assert.equal(change.status, 200)

  const opsDash = await ops.call('GET', '/api/admin/dashboard', { headers: authed(opsSession.accessToken) })
  assert.equal(opsDash.status, 200, 'dashboard:read granted to assessment_ops')

  // Role isolation: assessment_ops cannot manage admins.
  const opsForbidden = await ops.call('GET', '/api/admin/admins', { headers: authed(opsSession.accessToken) })
  assert.equal(opsForbidden.status, 403)
  assert.equal(opsForbidden.json.code, 'FORBIDDEN')

  // ── Dual approval: super_admin grant requires a second decider ────────────
  const grantNoApproval = await client.call('POST', `/api/admin/admins/${opsId}/roles`, {
    headers: mutating(session1.accessToken, session1.csrfToken),
    body: { roleKey: 'super_admin', reason: 'elevation attempt without approval' },
  })
  assert.equal(grantNoApproval.status, 409)
  assert.equal(grantNoApproval.json.code, 'APPROVAL_REQUIRED')

  const approvalReq = await client.call('POST', '/api/admin/admins/approvals', {
    headers: mutating(session1.accessToken, session1.csrfToken),
    body: {
      action: 'grant_role:super_admin', entityType: 'admin_user', entityId: opsId,
      reason: 'e2e elevation request',
    },
  })
  assert.equal(approvalReq.status, 201)
  const approvalId = approvalReq.json.approvalId

  // The requester cannot decide their own request (DB CHECK).
  const selfDecide = await client.call('POST', `/api/admin/admins/approvals/${approvalId}/decide`, {
    headers: mutating(session1.accessToken, session1.csrfToken),
    body: { decision: 'approved', reason: 'self-approval attempt' },
  })
  assert.equal(selfDecide.status, 403)
  assert.equal(selfDecide.json.code, 'DUAL_CONTROL')

  // A second super admin approves.
  const super2Id = randomUUID()
  const super2Email = `e2e-super2-${suffix}@test.local`
  await query(
    `INSERT INTO admin_users (admin_id, email, name, password_hash, state)
     VALUES ($1,$2,'E2E Super 2',$3,'active')`,
    [super2Id, super2Email, await adminAuth.hashPassword(password)],
  )
  await query(
    `INSERT INTO admin_user_roles (admin_id, role_id)
     SELECT $1, role_id FROM admin_roles WHERE role_key = 'super_admin'`,
    [super2Id],
  )
  const s2 = makeClient(baseUrl)
  const s2Login = await s2.call('POST', '/api/admin/auth/login', { body: { email: super2Email, password } })
  const s2Setup = await s2.call('POST', '/api/admin/auth/mfa/setup', { body: { mfaToken: s2Login.json.mfaToken } })
  const s2Confirm = await s2.call('POST', '/api/admin/auth/mfa/confirm', {
    body: { mfaToken: s2Login.json.mfaToken, code: adminAuth.totpCode(s2Setup.json.secret) },
  })
  const s2Session = s2Confirm.json
  const decide = await s2.call('POST', `/api/admin/admins/approvals/${approvalId}/decide`, {
    headers: mutating(s2Session.accessToken, s2Session.csrfToken),
    body: { decision: 'approved', reason: 'verified request in e2e' },
  })
  assert.equal(decide.status, 200)

  const grantWithApproval = await client.call('POST', `/api/admin/admins/${opsId}/roles`, {
    headers: mutating(session1.accessToken, session1.csrfToken),
    body: { roleKey: 'super_admin', reason: 'approved elevation' },
  })
  assert.equal(grantWithApproval.status, 200)

  // The approval is single-use.
  const replay = await client.call('POST', `/api/admin/admins/${opsId}/roles`, {
    headers: mutating(session1.accessToken, session1.csrfToken),
    body: { roleKey: 'super_admin', reason: 'replay attempt' },
  })
  assert.equal(replay.status, 409, 'consumed approvals cannot be replayed')

  // ── Refresh rotation: old refresh token dies after use ────────────────────
  const oldCookie = client.getCookie()
  const refresh1 = await client.call('POST', '/api/admin/auth/refresh')
  assert.equal(refresh1.status, 200)
  assert.ok(refresh1.json.accessToken)
  const stale = await fetch(`${baseUrl}/api/admin/auth/refresh`, {
    method: 'POST', headers: { cookie: oldCookie },
  })
  assert.equal(stale.status, 401, 'rotated refresh tokens are single-use')

  // ── Session revocation kills access tokens immediately ────────────────────
  const sessions = await client.call('GET', '/api/admin/auth/sessions', {
    headers: authed(refresh1.json.accessToken),
  })
  assert.equal(sessions.status, 200)
  const current = sessions.json.sessions.find((s) => s.current)
  assert.ok(current)

  const logout = await client.call('POST', '/api/admin/auth/logout', {
    headers: mutating(refresh1.json.accessToken, refresh1.json.csrfToken),
  })
  assert.equal(logout.status, 200)
  const afterLogout = await client.call('GET', '/api/admin/auth/me', {
    headers: authed(refresh1.json.accessToken),
  })
  assert.equal(afterLogout.status, 401, 'revoked session dies within one request')

  // ── Break-glass accounts cannot use the normal login door ─────────────────
  const bgId = randomUUID()
  const bgEmail = `e2e-bg-${suffix}@test.local`
  await query(
    `INSERT INTO admin_users (admin_id, email, name, password_hash, state, is_break_glass)
     VALUES ($1,$2,'E2E BreakGlass',$3,'active',TRUE)`,
    [bgId, bgEmail, await adminAuth.hashPassword(password)],
  )
  const bgLogin = await makeClient(baseUrl).call('POST', '/api/admin/auth/login', {
    body: { email: bgEmail, password },
  })
  assert.equal(bgLogin.status, 403)
  assert.equal(bgLogin.json.code, 'BREAK_GLASS_ONLY')

  const bgNoReason = await makeClient(baseUrl).call('POST', '/api/admin/auth/break-glass/activate', {
    body: { email: bgEmail, password, code: '123456', reason: 'short' },
  })
  assert.equal(bgNoReason.status, 400, 'break-glass demands a substantive reason')

  // ── Brute-force limiter: 6th credential attempt from one IP → 429 ─────────
  const attacker = makeClient(baseUrl)
  let last = null
  for (let i = 0; i < 6; i++) {
    last = await attacker.call('POST', '/api/admin/auth/login', {
      body: { email: superEmail, password: `guess-${i}-padpadpad` },
    })
  }
  assert.equal(last.status, 429, 'admin login brute force is rate limited')

  // ── Cleanup (e2e artifacts only; audit rows are immutable and stay) ────────
  await query(`DELETE FROM admin_approvals WHERE requested_by IN (SELECT admin_id FROM admin_users WHERE email LIKE 'e2e-%' || $1 || '%')`, [suffix])
  await query(`DELETE FROM admin_incidents WHERE opened_by IN (SELECT admin_id FROM admin_users WHERE email LIKE 'e2e-%' || $1 || '%')`, [suffix])
  await query(`DELETE FROM admin_users WHERE email LIKE 'e2e-%' || $1 || '%'`, [suffix])
})
