// Control Centre Phase 6 — full-flow integration tests (database required).
//
//   set TEST_DATABASE_URL=postgres://user:pass@localhost:5432/prism_test
//
// Drives the real HTTP surface: privacy erasure pipeline (open → verify →
// dry-run plan → execute blocked without approval → dual approval → execute
// → receipt, store + telemetry empty, account deleted), access-package
// fulfilment (ledgered), correction resolution, reject, retention rules
// (documented basis, '*'-only), audit views (search, entity timeline, admin
// timeline, security summary, ledgered export), and the legacy-token
// retirement path on a migrated plane (/api/pilot/dashboard).

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
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase6-db-test-secret'
  process.env.PRISM_ADMIN_CONSOLE = 'true'
  process.env.ADMIN_TOKEN = 'p6-legacy-shared-token'
  delete process.env.PRISM_ADMIN_TOKEN_DISABLED
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-admin-p6db-'))
  delete process.env.PRISM_PG_STORE // candidate store = JSON, admin plane = PG (prod topology)
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')
const { buildApp } = skip ? {} : await import('../app.js')
const adminAuth = skip ? {} : await import('../lib/adminAuth.js')
const { seedRbac } = skip ? {} : await import('../lib/adminRbac.js')
const store = skip ? {} : await import('../lib/store.js')
const userDb = skip ? {} : await import('../lib/db.js')

async function mintAdmin(roleKeys) {
  const adminId = randomUUID()
  const email = `p6db-${roleKeys[0]}-${adminId.slice(0, 8)}@test.local`
  await query(
    `INSERT INTO admin_users (admin_id, email, name, password_hash, state) VALUES ($1,$2,$3,'x','active')`,
    [adminId, email, roleKeys[0]],
  )
  for (const rk of roleKeys) {
    await query(
      `INSERT INTO admin_user_roles (admin_id, role_id) SELECT $1, role_id FROM admin_roles WHERE role_key = $2`,
      [adminId, rk],
    )
  }
  const session = await adminAuth.createAdminSession(
    { admin_id: adminId, email }, { ip: '10.99.6.1', get: () => 'phase6-tests' },
  )
  return { adminId, email, token: adminAuth.signAccessToken({ admin_id: adminId, email }, session.sessionId), csrf: session.csrfToken }
}

async function seedCandidate(tag) {
  const email = `p6cand-${tag}-${randomUUID().slice(0, 8)}@test.local`
  const cand = await userDb.createUser({ email, name: `Cand P6 ${tag}`, college: 'X', year: '3', passwordHash: 'h' })
  const sid = randomUUID()
  await store.createSession(sid, { scenarioId: 'group-project', userId: cand.id, userEmail: email, exchangeCount: 3 })
  await store.saveReport(sid, {
    userId: cand.id,
    scores: { criticalThinking: 70, communication: 60, collaboration: 65, problemSolving: 60, aiDigitalFluency: 55, overall: 63 },
    feedback: {}, reliability: { level: 'moderate' },
  })
  await store.recordConsent(sid, ['data_processing'], { consentVersion: 'p6-test' })
  // Telemetry rows the cascade must find, count (dry run), then delete.
  await query(`INSERT INTO audit_log (session_id, event_type, payload) VALUES ($1,'p6_seed_event','{}')`, [sid])
  return { email, userId: cand.id, sid }
}

test('Phase 6 privacy/audit/legacy-retirement end-to-end', { skip }, async (t) => {
  await migrateUp()
  await seedRbac()

  const app = buildApp()
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    server.close()
    delete process.env.PRISM_ADMIN_TOKEN_DISABLED
    await closePool()
  })

  const call = async (method, path, actor, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
        ...(actor && method !== 'GET' ? { 'x-admin-csrf': actor.csrf } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    let json = null
    try { json = await res.json() } catch { /* empty */ }
    return { status: res.status, json }
  }

  const superA = await mintAdmin(['super_admin'])
  const superB = await mintAdmin(['super_admin'])
  const privacyAdmin = await mintAdmin(['privacy_admin'])
  const supportAdmin = await mintAdmin(['support_admin'])
  const financeAdmin = await mintAdmin(['finance_admin'])
  const psychAdmin = await mintAdmin(['psychometric_admin'])

  const approve = async (action, entityId) => {
    const reqA = await call('POST', '/api/admin/admins/approvals', superA, {
      action, entityId, reason: `p6 e2e approval for ${action}`,
    })
    assert.equal(reqA.status, 201)
    const dec = await call('POST', `/api/admin/admins/approvals/${reqA.json.approvalId}/decide`, superB, {
      decision: 'approved', reason: 'p6 e2e second pair of eyes',
    })
    assert.equal(dec.status, 200)
  }

  // ── Erasure pipeline ───────────────────────────────────────────────────────
  const erased = await seedCandidate('erase')

  // Support can OPEN a request (privacy:create) but cannot operate it.
  const badKind = await call('POST', '/api/admin/privacy', supportAdmin, {
    kind: 'obliterate', scope: 'candidate', candidateEmail: erased.email, details: 'p6 e2e invalid kind',
  })
  assert.equal(badKind.status, 400)
  const opened = await call('POST', '/api/admin/privacy', supportAdmin, {
    kind: 'erasure', scope: 'candidate', candidateEmail: erased.email,
    details: 'p6 e2e: candidate emailed dpo@ requesting full erasure',
  })
  assert.equal(opened.status, 201)
  const requestId = opened.json.requestId
  assert.equal((await call('POST', `/api/admin/privacy/${requestId}/verify`, supportAdmin, {})).status, 403,
    'support cannot operate the workflow')
  assert.equal((await call('GET', '/api/admin/privacy', financeAdmin)).status, 403, 'finance cannot even read')

  // List shows the request + retention rules seeded in the undecided state.
  const list = await call('GET', '/api/admin/privacy', privacyAdmin)
  assert.equal(list.status, 200)
  assert.ok(list.json.requests.some((r) => r.request_id === requestId))
  assert.ok(list.json.retention.length >= 7, 'retention entities seeded')
  assert.ok(list.json.retention.every((r) => 'state' in r))

  // Execute before ANY dry run → refused by state machine.
  const tooEarly = await call('POST', `/api/admin/privacy/${requestId}/execute`, privacyAdmin, {})
  assert.equal(tooEarly.status, 409)

  // Verify resolves the candidate account.
  const verified = await call('POST', `/api/admin/privacy/${requestId}/verify`, privacyAdmin, {})
  assert.equal(verified.status, 200)

  // Dry run: counts everything, deletes nothing.
  const dry = await call('POST', `/api/admin/privacy/${requestId}/dry-run`, privacyAdmin, {})
  assert.equal(dry.status, 200)
  assert.equal(dry.json.status, 'awaiting_approval')
  const plan = dry.json.plan
  assert.equal(plan.sessions.length, 1)
  assert.equal(plan.sessions[0].sessionId, erased.sid)
  assert.equal(plan.sessions[0].store.report, true, 'plan sees the stored report')
  assert.equal(plan.sessions[0].telemetry.audit_log, 1, 'plan counts the telemetry row')
  assert.equal(plan.accountRecordWillBeDeleted, true)
  assert.ok(Array.isArray(plan.preserved) && plan.preserved.length, 'plan names what is PRESERVED')
  assert.ok(await store.getReport(erased.sid), 'dry run mutated nothing')

  // Execute without approval → APPROVAL_REQUIRED.
  const noApproval = await call('POST', `/api/admin/privacy/${requestId}/execute`, privacyAdmin, {})
  assert.equal(noApproval.status, 409)
  assert.equal(noApproval.json.code, 'APPROVAL_REQUIRED')

  // Dual approval by two OTHER admins, then execute.
  await approve('privacy_erasure', requestId)
  const executed = await call('POST', `/api/admin/privacy/${requestId}/execute`, privacyAdmin, {})
  assert.equal(executed.status, 200)
  assert.equal(executed.json.status, 'completed')
  assert.equal(executed.json.receipt.sessions.length, 1)
  assert.equal(executed.json.receipt.accountDeleted, true)

  // The data is really gone: store, telemetry, account.
  assert.ok(!(await store.getReport(erased.sid)), 'report erased')
  assert.ok(!(await store.getSession(erased.sid)), 'session erased')
  const telemetryLeft = await query('SELECT COUNT(*) FROM audit_log WHERE session_id = $1', [erased.sid])
  assert.equal(Number(telemetryLeft.rows[0].count), 0, 'telemetry erased')
  assert.ok(!(await userDb.findUserByEmail(erased.email)), 'account record deleted')

  // Receipt is on the request row.
  const closedReq = await call('GET', `/api/admin/privacy/${requestId}`, privacyAdmin)
  assert.equal(closedReq.json.request.status, 'completed')
  assert.ok(closedReq.json.request.receipt, 'receipt stored')
  assert.ok(closedReq.json.request.dry_run_plan, 'plan retained for the record')

  // ── Access package (the candidate's own data, ledgered) ───────────────────
  const accessCand = await seedCandidate('access')
  const accessReq = await call('POST', '/api/admin/privacy', privacyAdmin, {
    kind: 'access', scope: 'candidate', candidateEmail: accessCand.email,
    details: 'p6 e2e: DSAR received via support portal',
  })
  await call('POST', `/api/admin/privacy/${accessReq.json.requestId}/verify`, privacyAdmin, {})
  const fulfilled = await call('POST', `/api/admin/privacy/${accessReq.json.requestId}/fulfil`, privacyAdmin, {})
  assert.equal(fulfilled.status, 200)
  assert.equal(fulfilled.json.package.sessions.length, 1)
  assert.ok(fulfilled.json.package.sessions[0].report, 'package contains the candidate’s report')
  const pkgLedger = await query(
    `SELECT COUNT(*) FROM admin_exports WHERE entity_type = 'privacy_data_package'
      AND filters->>'requestId' = $1`,
    [accessReq.json.requestId],
  )
  assert.equal(Number(pkgLedger.rows[0].count), 1, 'package assembly is ledgered')

  // ── Correction: records the resolution, demands substance ─────────────────
  const corrReq = await call('POST', '/api/admin/privacy', privacyAdmin, {
    kind: 'correction', scope: 'candidate', candidateEmail: accessCand.email,
    details: 'p6 e2e: candidate reports a name spelling mistake',
  })
  await call('POST', `/api/admin/privacy/${corrReq.json.requestId}/verify`, privacyAdmin, {})
  assert.equal((await call('POST', `/api/admin/privacy/${corrReq.json.requestId}/fulfil`, privacyAdmin, { resolution: 'done' })).status, 400,
    'a thin resolution is refused')
  assert.equal((await call('POST', `/api/admin/privacy/${corrReq.json.requestId}/fulfil`, privacyAdmin, {
    resolution: 'name corrected through the governed profile-edit workflow, audit event attached',
  })).status, 200)

  // ── Reject: needs a reason; closed requests stay closed ───────────────────
  const rejReq = await call('POST', '/api/admin/privacy', privacyAdmin, {
    kind: 'erasure', scope: 'candidate', candidateEmail: accessCand.email,
    details: 'p6 e2e: duplicate of an earlier request',
  })
  assert.equal((await call('POST', `/api/admin/privacy/${rejReq.json.requestId}/reject`, privacyAdmin, { reason: 'no' })).status, 400)
  assert.equal((await call('POST', `/api/admin/privacy/${rejReq.json.requestId}/reject`, privacyAdmin, {
    reason: 'duplicate request — the erasure above already covers it',
  })).status, 200)
  assert.equal((await call('POST', `/api/admin/privacy/${rejReq.json.requestId}/reject`, privacyAdmin, {
    reason: 'rejecting twice must not work',
  })).status, 409)

  // ── Retention rules: documented basis, '*' only ────────────────────────────
  assert.equal((await call('PUT', '/api/admin/privacy/retention/job_applications', privacyAdmin, {
    retentionDays: 180, basis: 'hiring records kept 6 months after closure',
  })).status, 403, 'retention:manage is granted to no standing role — wildcard only')
  assert.equal((await call('PUT', '/api/admin/privacy/retention/job_applications', superA, {
    retentionDays: 180, basis: 'short',
  })).status, 400, 'a written basis is required')
  assert.equal((await call('PUT', '/api/admin/privacy/retention/job_applications', superA, {
    retentionDays: 180, basis: 'hiring records kept 6 months after role closure (policy DP-7)',
  })).status, 200)
  assert.equal((await call('PUT', '/api/admin/privacy/retention/nonexistent_entity', superA, {
    retentionDays: 30, basis: 'this entity does not exist in the registry',
  })).status, 404)
  const afterRet = await call('GET', '/api/admin/privacy', superA)
  const rule = afterRet.json.retention.find((r) => r.entity === 'job_applications')
  assert.equal(rule.retention_days, 180)

  // ── Audit views ────────────────────────────────────────────────────────────
  const search = await call('GET', '/api/admin/audit?action=privacy_erasure_executed', privacyAdmin)
  assert.equal(search.status, 200)
  assert.ok(search.json.total >= 1, 'the erasure left an immutable trace')
  assert.equal(search.json.rows[0].action, 'privacy_erasure_executed')
  assert.ok(search.json.rows[0].approval_id, 'the trace carries the dual approval')

  const timeline = await call('GET', `/api/admin/audit/entity/privacy_request/${requestId}`, privacyAdmin)
  assert.equal(timeline.status, 200)
  assert.ok(timeline.json.adminEvents.length >= 4, 'open → verify → dry-run → execute all on the timeline')

  const adminTl = await call('GET', `/api/admin/audit/admins/${privacyAdmin.adminId}/timeline`, superA)
  assert.equal(adminTl.status, 200)
  assert.ok(adminTl.json.rows.length >= 3, 'per-admin activity timeline')

  const security = await call('GET', '/api/admin/audit/security', superA)
  assert.equal(security.status, 200)
  assert.ok(Array.isArray(security.json.watched) && security.json.watched.includes('break_glass_activated'))
  assert.ok('lockedAdminAccounts' in security.json && 'openIncidents' in security.json)

  assert.equal((await call('GET', '/api/admin/audit', financeAdmin)).status, 403, 'audit:read required')

  // Export: returns rows AND ledgers itself AND audits itself.
  const exp = await call('GET', '/api/admin/audit/export?action=privacy_erasure_executed&purpose=p6+e2e+export', superA)
  assert.equal(exp.status, 200)
  assert.ok(exp.json.rows >= 1)
  const expLedger = await query(
    `SELECT COUNT(*) FROM admin_exports WHERE entity_type = 'admin_audit_events' AND admin_id = $1`,
    [superA.adminId],
  )
  assert.equal(Number(expLedger.rows[0].count), 1, 'audit export is ledgered')
  const expTrace = await call('GET', '/api/admin/audit?action=audit_trail_exported', superA)
  assert.ok(expTrace.json.total >= 1, 'the export itself is audited')

  // ── Legacy plane migration: /api/pilot/dashboard ───────────────────────────
  // 1. Console session with the plane's permission → in, attributably.
  assert.equal((await call('GET', '/api/pilot/dashboard', psychAdmin)).status, 200,
    'psychometric admin console session works on the legacy plane')
  // 2. Console session WITHOUT the permission → 403.
  assert.equal((await call('GET', '/api/pilot/dashboard', financeAdmin)).status, 403,
    'finance admin has no psychometrics:read')
  // 3. Legacy shared token still works while the switch is off — and is audited.
  const legacyOk = await fetch(`${base}/api/pilot/dashboard`, { headers: { 'x-admin-token': 'p6-legacy-shared-token' } })
  assert.equal(legacyOk.status, 200, 'legacy token accepted while PRISM_ADMIN_TOKEN_DISABLED is off')
  const legacyBad = await fetch(`${base}/api/pilot/dashboard`, { headers: { 'x-admin-token': 'wrong-token' } })
  assert.equal(legacyBad.status, 401)
  // Legacy-token use lands in the audit trail (fire-and-forget → poll briefly).
  let legacyAudited = 0
  for (let i = 0; i < 20 && !legacyAudited; i += 1) {
    const r = await query(`SELECT COUNT(*) FROM admin_audit_events WHERE action = 'admin_legacy_token_used'`)
    legacyAudited = Number(r.rows[0].count)
    if (!legacyAudited) await new Promise((resolve) => { setTimeout(resolve, 100) })
  }
  assert.ok(legacyAudited >= 1, 'legacy-token usage is measured in the audit trail')

  // 4. The migrated human-rating plane accepts the token (400 = past the guard).
  const hr = await fetch(`${base}/api/assessment/human-rating`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': 'p6-legacy-shared-token' },
    body: JSON.stringify({}),
  })
  assert.equal(hr.status, 400, 'valid token passes the guard; body validation answers')

  // 5. THE RETIREMENT: flip the kill switch → the shared token dies everywhere
  //    at once, while console sessions keep working.
  process.env.PRISM_ADMIN_TOKEN_DISABLED = 'true'
  const retired = await fetch(`${base}/api/pilot/dashboard`, { headers: { 'x-admin-token': 'p6-legacy-shared-token' } })
  assert.equal(retired.status, 401)
  assert.equal((await retired.json()).code, 'LEGACY_TOKEN_RETIRED')
  const retiredHr = await fetch(`${base}/api/assessment/human-rating`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': 'p6-legacy-shared-token' },
    body: JSON.stringify({}),
  })
  assert.equal(retiredHr.status, 401, 'retirement covers every migrated plane at once')
  assert.equal((await call('GET', '/api/pilot/dashboard', psychAdmin)).status, 200,
    'console access unaffected by the retirement')
  delete process.env.PRISM_ADMIN_TOKEN_DISABLED

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await store.eraseSession(accessCand.sid)
  await query('DELETE FROM audit_log WHERE session_id = $1', [accessCand.sid])
  await userDb.deleteUser(accessCand.userId)
  await query(`DELETE FROM privacy_requests WHERE details LIKE 'p6 e2e%'`)
  await query(`UPDATE data_retention_rules SET retention_days = NULL, basis = '', updated_by = NULL WHERE entity = 'job_applications'`)
  await query(`DELETE FROM admin_approvals WHERE requested_reason LIKE 'p6 e2e approval%'`)
  await query(`DELETE FROM admin_exports WHERE admin_id IN (SELECT admin_id FROM admin_users WHERE email LIKE 'p6db-%')`)
  await query(`DELETE FROM admin_users WHERE email LIKE 'p6db-%'`)
})
