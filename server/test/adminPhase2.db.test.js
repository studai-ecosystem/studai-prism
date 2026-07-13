// Control Centre Phase 2 — full-flow integration tests (database required).
//
//   set TEST_DATABASE_URL=postgres://user:pass@localhost:5432/prism_test
//
// Skips without a DB (repo convention). Setup mints admin sessions DIRECTLY
// through lib/adminAuth (the HTTP login+MFA dance is covered by
// adminConsole.db.test.js) and drives the REAL HTTP surface for:
// candidates, sessions, reports (dual-approved supersession + versions),
// disputes (9-state machine), payments, records (PII gates), search.
// Candidate data lives in the JSON store (temp DATA_DIR) while the admin
// plane uses Postgres — exactly the production topology.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase2-db-test-secret'
  process.env.PRISM_ADMIN_CONSOLE = 'true'
  process.env.PRISM_V2_TELEMETRY = 'true' // score-affecting actions must hit audit_log
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-admin-p2db-'))
  delete process.env.PRISM_PG_STORE // candidate store = JSON, admin plane = PG (prod topology)
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')
const { buildApp } = skip ? {} : await import('../app.js')
const adminAuth = skip ? {} : await import('../lib/adminAuth.js')
const { seedRbac } = skip ? {} : await import('../lib/adminRbac.js')
const store = skip ? {} : await import('../lib/store.js')
const userDb = skip ? {} : await import('../lib/db.js')

// Provision an admin with roles and an ACTIVE session, bypassing HTTP MFA.
async function mintAdmin(roleKeys) {
  const adminId = randomUUID()
  const email = `p2db-${roleKeys[0]}-${adminId.slice(0, 8)}@test.local`
  await query(
    `INSERT INTO admin_users (admin_id, email, name, password_hash, state)
     VALUES ($1,$2,$3,'x','active')`,
    [adminId, email, roleKeys[0]],
  )
  for (const rk of roleKeys) {
    await query(
      `INSERT INTO admin_user_roles (admin_id, role_id)
       SELECT $1, role_id FROM admin_roles WHERE role_key = $2`,
      [adminId, rk],
    )
  }
  const admin = { admin_id: adminId, email }
  const fakeReq = { ip: '10.77.0.1', get: () => 'phase2-tests' }
  const session = await adminAuth.createAdminSession(admin, fakeReq)
  return {
    adminId,
    email,
    token: adminAuth.signAccessToken(admin, session.sessionId),
    csrf: session.csrfToken,
  }
}

function headers(actor, mutating = false) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${actor.token}`,
    ...(mutating ? { 'x-admin-csrf': actor.csrf } : {}),
  }
}

test('Phase 2 admin plane end-to-end', { skip }, async (t) => {
  await migrateUp()
  await seedRbac()

  const app = buildApp()
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    server.close()
    await closePool()
  })
  const call = async (method, path, actor, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: headers(actor, method !== 'GET'),
      body: body != null ? JSON.stringify(body) : undefined,
    })
    let json = null
    try { json = await res.json() } catch { /* empty */ }
    return { status: res.status, json }
  }

  const superAdmin = await mintAdmin(['super_admin'])
  const secondSuper = await mintAdmin(['super_admin'])
  const opsAdmin = await mintAdmin(['assessment_ops'])
  const financeAdmin = await mintAdmin(['finance_admin'])
  const auditor = await mintAdmin(['auditor'])

  // ── Fixture: candidate + session + report + dispute + events ──────────────
  const email = `p2db-cand-${randomUUID().slice(0, 8)}@test.local`
  const cand = await userDb.createUser({ email, name: 'Cand P2', college: 'X', year: '2', passwordHash: 'h' })
  const sid = randomUUID()
  await store.createEntitlement({ sessionId: sid, mode: 'paid', amount: 49900, paymentId: 'pay_p2db', orderId: 'order_p2db' })
  await store.createSession(sid, { scenarioId: 'group-project', userId: cand.id, userEmail: email, exchangeCount: 3 })
  await store.saveReport(sid, {
    userId: cand.id,
    scores: { criticalThinking: 70, communication: 60, collaboration: 65, problemSolving: 60, aiDigitalFluency: 55, overall: 63 },
    feedback: {}, reliability: { level: 'moderate' },
  })
  await store.createDispute(sid, 'I believe my collaboration score is wrong', email)
  await store.recordEvent(sid, 'tab_switch', { n: 2 })
  await store.recordConsent(sid, ['data_processing'], { consentVersion: 'p2-test' })
  await store.recordVerification(sid, { fullName: 'Cand P2 Real', fathersName: 'F', dob: '2001-02-03', aadhaarLast4: '4321', nameMatch: true })

  // ── Candidates: list masked vs PII, detail, edit allowlist, suspend ───────
  const opsList = await call('GET', `/api/admin/users?q=${encodeURIComponent(email)}`, opsAdmin)
  assert.equal(opsList.status, 200)
  assert.equal(opsList.json.rows.length, 1)
  assert.ok(!opsList.json.rows[0].email.includes('p2db-cand'), 'assessment_ops sees masked email')
  const superList = await call('GET', `/api/admin/users?q=${encodeURIComponent(email)}`, superAdmin)
  assert.equal(superList.json.rows[0].email, email, 'super admin (wildcard) sees PII')

  const detail = await call('GET', `/api/admin/users/${cand.id}`, superAdmin)
  assert.equal(detail.status, 200)
  assert.equal(detail.json.sessions.length, 1)
  assert.equal(detail.json.reports[0].overall, 63)
  assert.ok(detail.json.perSession[sid].consent)

  const badPatch = await call('PATCH', `/api/admin/users/${cand.id}`, superAdmin, { email: 'evil@x.com' })
  assert.equal(badPatch.status, 400, 'email is not an editable field')
  const goodPatch = await call('PATCH', `/api/admin/users/${cand.id}`, superAdmin, { college: 'New College', reason: 'typo fix' })
  assert.equal(goodPatch.status, 200)
  assert.equal(goodPatch.json.user.college, 'New College')

  const suspend = await call('POST', `/api/admin/users/${cand.id}/state`, superAdmin, { state: 'suspended', reason: 'e2e suspension' })
  assert.equal(suspend.status, 200)
  const suspendedUser = await userDb.findUserById(cand.id)
  assert.equal(suspendedUser.accountState, 'suspended')
  assert.equal(suspendedUser.tokenVersion, 1, 'suspension bumps token version')
  await call('POST', `/api/admin/users/${cand.id}/state`, superAdmin, { state: 'active', reason: 'e2e reactivate' })

  // Ops admin lacks users:suspend? assessment_ops has no users:suspend — verify.
  const opsSuspend = await call('POST', `/api/admin/users/${cand.id}/state`, opsAdmin, { state: 'suspended', reason: 'nope' })
  assert.equal(opsSuspend.status, 403, 'assessment_ops cannot suspend accounts')

  // ── Sessions: list overlay + review hold + invalidate ─────────────────────
  const sessList = await call('GET', `/api/admin/sessions?userId=${cand.id}`, opsAdmin)
  assert.equal(sessList.status, 200)
  assert.equal(sessList.json.rows[0].overall, 63)

  const hold = await call('POST', `/api/admin/sessions/${sid}/review`, opsAdmin, { action: 'hold', reason: 'needs a second look' })
  assert.equal(hold.status, 200)
  const sessDetail = await call('GET', `/api/admin/sessions/${sid}`, opsAdmin)
  assert.equal(sessDetail.status, 200)
  assert.equal(sessDetail.json.adminState.reviewState, 'held')
  assert.equal(sessDetail.json.summary.consentVersion, 'p2-test')
  assert.equal(sessDetail.json.integrity.events.length, 1)

  // Score-affecting decisions land in the assessment audit_log too.
  const trailHold = await query(
    `SELECT COUNT(*) FROM audit_log WHERE event_type = 'session_review_hold' AND session_id = $1::uuid`,
    [sid],
  )
  assert.equal(Number(trailHold.rows[0].count), 1, 'review hold recorded in the decision trail')

  const inval = await call('POST', `/api/admin/sessions/${sid}/invalidate`, opsAdmin, { reason: 'confirmed impersonation during review' })
  assert.equal(inval.status, 200)
  assert.equal(inval.json.excludedFromCalibration, true, 'invalidation also excludes from calibration')

  // ── Reports: hold blocks resend; supersession is dual-approved ────────────
  const rHold = await call('POST', `/api/admin/reports/${sid}/hold`, opsAdmin, { reason: 'under dispute' })
  assert.equal(rHold.status, 200)
  const resendHeld = await call('POST', `/api/admin/reports/${sid}/resend`, opsAdmin, { reason: 'candidate asked' })
  assert.equal(resendHeld.status, 409, 'held reports cannot be resent')
  await call('POST', `/api/admin/reports/${sid}/release`, opsAdmin, { reason: 'dispute resolved path' })

  // No approval yet → 409.
  const correctionScores = { criticalThinking: 70, communication: 60, collaboration: 75, problemSolving: 60, aiDigitalFluency: 55 }
  const noApproval = await call('POST', `/api/admin/reports/${sid}/supersede`, superAdmin, {
    scores: correctionScores, reason: 'collaboration rubric misapplied on turn 3',
  })
  assert.equal(noApproval.status, 409)
  assert.equal(noApproval.json.code, 'APPROVAL_REQUIRED')

  // Raise + cross-approve + execute.
  const apReq = await call('POST', '/api/admin/admins/approvals', superAdmin, {
    action: 'supersede_report', entityType: 'report', entityId: sid, reason: 'reviewed correction request',
  })
  assert.equal(apReq.status, 201)
  const apDecide = await call('POST', `/api/admin/admins/approvals/${apReq.json.approvalId}/decide`, secondSuper, {
    decision: 'approved', reason: 'reviewed the transcript, correction justified',
  })
  assert.equal(apDecide.status, 200)

  const supersede = await call('POST', `/api/admin/reports/${sid}/supersede`, superAdmin, {
    scores: correctionScores, reason: 'collaboration rubric misapplied on turn 3',
  })
  assert.equal(supersede.status, 200)
  assert.equal(supersede.json.version, 2)
  // Server recomputed overall from canonical weights — not caller-supplied.
  const expectedOverall = Math.round(70 * 0.25 + 60 * 0.25 + 75 * 0.2 + 60 * 0.2 + 55 * 0.1)
  assert.equal(supersede.json.scores.overall, expectedOverall)

  const reportDetail = await call('GET', `/api/admin/reports/${sid}`, auditor)
  assert.equal(reportDetail.status, 200, 'auditor can read reports')
  assert.equal(reportDetail.json.versions.length, 2, 'initial + correction versions retained')
  assert.equal(reportDetail.json.versions[0].kind, 'initial')
  assert.equal(reportDetail.json.versions[1].kind, 'correction')
  assert.equal(reportDetail.json.report.correction.previousOverall, 63)

  const trailSup = await query(
    `SELECT COUNT(*) FROM audit_log WHERE event_type = 'report_superseded' AND session_id = $1::uuid`,
    [sid],
  )
  assert.equal(Number(trailSup.rows[0].count), 1, 'supersession recorded in the decision trail')

  // Auditor is structurally read-only on this plane.
  const auditorMutation = await call('POST', `/api/admin/reports/${sid}/hold`, auditor, { reason: 'x' })
  assert.equal(auditorMutation.status, 403)

  // ── Disputes: machine enforcement ──────────────────────────────────────────
  const dList = await call('GET', '/api/admin/disputes', opsAdmin)
  assert.ok(dList.json.rows.some((d) => d.sessionId === sid))

  const badJump = await call('POST', `/api/admin/disputes/${sid}/transition`, opsAdmin, { state: 'resolved', reason: 'skip everything', decision: 'because I said so OK' })
  assert.equal(badJump.status, 409, 'open→resolved is not a legal transition')

  const assign = await call('POST', `/api/admin/disputes/${sid}/assign`, opsAdmin, { adminId: opsAdmin.adminId, reason: 'taking it' })
  assert.equal(assign.status, 200)
  for (const [state, decision] of [['human_review', null], ['decision_proposed', null], ['resolved', 'Collaboration score corrected via approved supersession; dispute upheld.']]) {
    const tr = await call('POST', `/api/admin/disputes/${sid}/transition`, opsAdmin, {
      state, reason: `moving to ${state}`, ...(decision ? { decision } : {}),
    })
    assert.equal(tr.status, 200, `transition to ${state}`)
  }
  const storeDispute = await store.getDispute(sid)
  assert.equal(storeDispute.status, 'resolved', 'coarse store status synced')
  assert.equal(storeDispute.reason, 'I believe my collaboration score is wrong', 'candidate statement untouched')

  const noDecision = await call('POST', `/api/admin/disputes/${sid}/transition`, opsAdmin, { state: 'reopened', reason: 'candidate replied' })
  assert.equal(noDecision.status, 200, 'terminal states can reopen')

  // ── Payments: grant + revoke ───────────────────────────────────────────────
  const grant = await call('POST', '/api/admin/payments/grant', financeAdmin, { reason: 'goodwill re-take' })
  assert.equal(grant.status, 201)
  assert.equal(grant.json.entitlement.mode, 'admin_grant')
  const grantedSid = grant.json.entitlement.sessionId

  const revoke = await call('POST', `/api/admin/payments/${grantedSid}/revoke`, financeAdmin, { reason: 'granted in error' })
  assert.equal(revoke.status, 200)
  const reRevoke = await call('POST', `/api/admin/payments/${grantedSid}/revoke`, financeAdmin, { reason: 'again' })
  assert.equal(reRevoke.status, 409, 'consumed/revoked entitlements cannot be re-revoked')

  const metrics = await call('GET', '/api/admin/payments/metrics', financeAdmin)
  assert.equal(metrics.status, 200)
  assert.ok(metrics.json.revenue >= 49900)

  // Finance cannot read sessions (role isolation across namespaces).
  const finSessions = await call('GET', '/api/admin/sessions', financeAdmin)
  assert.equal(finSessions.status, 403)

  // ── Records: verification PII gate + integrity review ─────────────────────
  const vMaskedList = await call('GET', '/api/admin/records/verifications', opsAdmin)
  assert.equal(vMaskedList.status, 200)
  const row = vMaskedList.json.rows.find((v) => v.sessionId === sid)
  assert.equal(row.pii, 'masked')
  assert.ok(!('fullName' in row))

  const vOps = await call('GET', `/api/admin/records/verifications/${sid}`, opsAdmin)
  assert.equal(vOps.json.verification.pii, 'masked', 'ops sees masked verification detail')
  const vSuper = await call('GET', `/api/admin/records/verifications/${sid}`, superAdmin)
  assert.equal(vSuper.json.pii, 'unmasked')
  assert.equal(vSuper.json.verification.fullName, 'Cand P2 Real')
  const piiAudit = await query(
    `SELECT COUNT(*) FROM admin_audit_events WHERE action = 'verification_viewed' AND entity_id = $1`,
    [sid],
  )
  assert.ok(Number(piiAudit.rows[0].count) >= 1, 'unmasked PII access is audited')

  const evList = await call('GET', `/api/admin/records/events?sessionId=${sid}`, opsAdmin)
  assert.equal(evList.json.rows.length, 1)
  const ev = evList.json.rows[0]
  const evReview = await call('POST', '/api/admin/records/events/review', opsAdmin, {
    sessionId: sid, eventType: ev.type, eventAt: ev.at, decision: 'false_positive', note: 'phone rang, verified on video',
  })
  assert.equal(evReview.status, 200)
  const evList2 = await call('GET', `/api/admin/records/events?sessionId=${sid}`, opsAdmin)
  assert.equal(evList2.json.rows[0].review.decision, 'false_positive')

  // ── Global search: permission-scoped groups ────────────────────────────────
  const superSearch = await call('GET', `/api/admin/search?q=${encodeURIComponent(email)}`, superAdmin)
  assert.equal(superSearch.status, 200)
  assert.equal(superSearch.json.results.users.length, 1)
  const finSearch = await call('GET', `/api/admin/search?q=pay_p2db`, financeAdmin)
  assert.ok(finSearch.json.results.payments.length === 1, 'finance finds payments by ref')
  assert.ok(!('sessions' in finSearch.json.results), 'finance gets no sessions group at all')
  const shortQ = await call('GET', '/api/admin/search?q=ab', superAdmin)
  assert.equal(shortQ.status, 400)

  // ── Every mutation above landed in the immutable admin trail ──────────────
  const trail = await query(
    `SELECT DISTINCT action FROM admin_audit_events WHERE created_at > now() - interval '10 minutes'`,
  )
  const actions = new Set(trail.rows.map((r) => r.action))
  for (const expected of [
    'user_profile_updated', 'user_suspended', 'user_reactivated',
    'session_review_hold', 'session_marked_invalid',
    'report_held', 'report_released', 'report_superseded',
    'dispute_assigned', 'dispute_state_changed',
    'entitlement_granted', 'entitlement_revoked',
    'verification_viewed', 'integrity_event_reviewed',
  ]) {
    assert.ok(actions.has(expected), `admin trail missing ${expected}`)
  }

  // ── Cleanup (approvals reference admins via FK; audit rows stay) ──────────
  await store.eraseSession(sid)
  await store.eraseSession(grantedSid)
  await query(`DELETE FROM admin_approvals WHERE entity_id = $1`, [sid])
  await query(`DELETE FROM admin_session_states WHERE session_id = $1`, [sid])
  await query(`DELETE FROM admin_dispute_workflow WHERE session_id = $1`, [sid])
  await query(`DELETE FROM report_versions WHERE session_id = $1`, [sid])
  await query(`DELETE FROM report_admin_states WHERE session_id = $1`, [sid])
  await query(`DELETE FROM integrity_reviews WHERE session_id = $1`, [sid])
  await query(`DELETE FROM admin_notes WHERE entity_id IN ($1, $2)`, [sid, cand.id])
  await query(`DELETE FROM admin_users WHERE email LIKE 'p2db-%'`)
})
