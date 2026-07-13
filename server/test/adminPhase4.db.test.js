// Control Centre Phase 4 — full-flow integration tests (database required).
//
//   set TEST_DATABASE_URL=postgres://user:pass@localhost:5432/prism_test
//
// Generates a REAL Ed25519 signing key for the test process, then drives the
// credential console end-to-end (issue → verify → revoke → reissue chain →
// bulk revoke with dual approval → signing-key hygiene), replays (flag +
// ledgered export), team-fit (consent gate, member removal preserving
// history, archive), and research exports (allowlist, ledger, large-export
// approval).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, generateKeyPairSync } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase4-db-test-secret'
  process.env.PRISM_ADMIN_CONSOLE = 'true'
  process.env.PRISM_V2_TELEMETRY = 'true'
  process.env.PRISM_GLASS_BOX = 'true'
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-admin-p4db-'))
  delete process.env.PRISM_PG_STORE
  delete process.env.PRISM_TEAMFIT // console manages team DATA without the simulation flag
  // Fresh Ed25519 key for this test process (PKCS8 DER, base64 — the prod format).
  const { privateKey } = generateKeyPairSync('ed25519')
  process.env.PRISM_CREDENTIAL_SIGNING_KEY = privateKey
    .export({ type: 'pkcs8', format: 'der' })
    .toString('base64')
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')
const { buildApp } = skip ? {} : await import('../app.js')
const adminAuth = skip ? {} : await import('../lib/adminAuth.js')
const { seedRbac } = skip ? {} : await import('../lib/adminRbac.js')
const store = skip ? {} : await import('../lib/store.js')

async function mintAdmin(roleKeys) {
  const adminId = randomUUID()
  const email = `p4db-${roleKeys[0]}-${adminId.slice(0, 8)}@test.local`
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
    { admin_id: adminId, email }, { ip: '10.99.4.1', get: () => 'phase4-tests' },
  )
  return { adminId, email, token: adminAuth.signAccessToken({ admin_id: adminId, email }, session.sessionId), csrf: session.csrfToken }
}

test('Phase 4 credentials/replays/teamfit/exports end-to-end', { skip }, async (t) => {
  await migrateUp()
  await seedRbac()

  const app = buildApp()
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { server.close(); await closePool() })

  const call = async (method, path, actor, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${actor.token}`,
        ...(method !== 'GET' ? { 'x-admin-csrf': actor.csrf } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    let json = null
    try { json = await res.json() } catch { /* empty */ }
    return { status: res.status, json }
  }

  const credAdmin = await mintAdmin(['credential_admin'])
  const opsAdmin = await mintAdmin(['assessment_ops'])
  const research = await mintAdmin(['research_admin'])
  const superA = await mintAdmin(['super_admin'])
  const superB = await mintAdmin(['super_admin'])
  const auditor = await mintAdmin(['auditor'])

  const approve = async (action, entityId) => {
    const reqA = await call('POST', '/api/admin/admins/approvals', superA, {
      action, entityId, reason: `p4 e2e approval for ${action}`,
    })
    assert.equal(reqA.status, 201)
    const dec = await call('POST', `/api/admin/admins/approvals/${reqA.json.approvalId}/decide`, superB, {
      decision: 'approved', reason: 'reviewed in p4 e2e',
    })
    assert.equal(dec.status, 200)
  }

  // ── Fixture: a completed report to certify ─────────────────────────────────
  const sid = randomUUID()
  await store.createEntitlement({ sessionId: sid, mode: 'paid', amount: 49900 })
  await store.createSession(sid, { scenarioId: 'group-project', userId: 'u-p4', userEmail: 'p4@test.local', exchangeCount: 3 })
  await store.saveReport(sid, {
    userId: 'u-p4',
    scores: { criticalThinking: 74, communication: 68, collaboration: 70, problemSolving: 66, aiDigitalFluency: 60, overall: 69 },
    feedback: {}, reliability: { level: 'moderate' },
    scenario: { title: 'Group Project' },
  })

  // ── Signing key: public parts only ─────────────────────────────────────────
  const keyInfo = await call('GET', '/api/admin/credentials/signing-key', credAdmin)
  assert.equal(keyInfo.status, 200)
  assert.equal(keyInfo.json.configured, true)
  assert.ok(keyInfo.json.keyId)
  assert.match(keyInfo.json.publicKeyPem, /BEGIN PUBLIC KEY/)
  const rawBody = JSON.stringify(keyInfo.json)
  assert.ok(!rawBody.includes(process.env.PRISM_CREDENTIAL_SIGNING_KEY), 'private key never leaves the server')
  assert.ok(!/PRIVATE KEY/.test(rawBody))

  // ── Issue → detail/chain → revoke → reissue ───────────────────────────────
  const issued = await call('POST', `/api/admin/credentials/session/${sid}/issue`, credAdmin, {})
  assert.equal(issued.status, 201)
  assert.ok(issued.json.shareToken, 'share token returned exactly once')
  const credId = issued.json.credentialId

  const dupIssue = await call('POST', `/api/admin/credentials/session/${sid}/issue`, credAdmin, {})
  assert.equal(dupIssue.status, 409, 'active credential exists → reissue is the correct verb')
  assert.equal(dupIssue.json.code, 'ACTIVE_EXISTS')

  const detail = await call('GET', `/api/admin/credentials/${credId}`, credAdmin)
  assert.equal(detail.status, 200)
  assert.equal(detail.json.integrity.verified, true, 'signature verifies against the stored bundle')
  assert.equal(detail.json.chain.length, 1)
  assert.ok(!('bundle' in detail.json.credential), 'console shows integrity, not the disclosure bundle')

  const revokeShort = await call('POST', `/api/admin/credentials/${credId}/revoke`, credAdmin, { reason: 'short' })
  assert.equal(revokeShort.status, 400)
  const revoke = await call('POST', `/api/admin/credentials/${credId}/revoke`, credAdmin, {
    reason: 'identity mismatch found during p4 e2e review',
  })
  assert.equal(revoke.status, 200)
  const reRevoke = await call('POST', `/api/admin/credentials/${credId}/revoke`, credAdmin, {
    reason: 'attempting a second revocation',
  })
  assert.equal(reRevoke.status, 409, 'only active credentials revoke')

  const reissue = await call('POST', `/api/admin/credentials/${credId}/reissue`, credAdmin, {
    reason: 'reissuing after the dispute was settled',
  })
  assert.equal(reissue.status, 201)
  assert.equal(reissue.json.supersedes, credId)
  const chain2 = await call('GET', `/api/admin/credentials/${reissue.json.credentialId}`, credAdmin)
  assert.equal(chain2.json.chain.length, 2, 'both credentials visible in the chain forever')

  // DB trigger still guards signed contents.
  await assert.rejects(
    () => query(`UPDATE credentials SET bundle_hash = 'tampered' WHERE credential_id = $1`, [credId]),
    /immutable/,
  )

  // Auditor reads; auditor cannot revoke. Ops cannot issue.
  assert.equal((await call('GET', '/api/admin/credentials', auditor)).status, 200)
  assert.equal((await call('POST', `/api/admin/credentials/${reissue.json.credentialId}/revoke`, auditor, { reason: 'auditor tries to revoke' })).status, 403)
  assert.equal((await call('POST', `/api/admin/credentials/session/${sid}/issue`, opsAdmin, {})).status, 403)

  // ── Bulk revoke: dual-approved, single-use ─────────────────────────────────
  const bulkNoAp = await call('POST', '/api/admin/credentials/bulk-revoke', credAdmin, {
    credentialIds: [reissue.json.credentialId], reason: 'bulk revocation without approval',
  })
  assert.equal(bulkNoAp.status, 409)
  assert.equal(bulkNoAp.json.code, 'APPROVAL_REQUIRED')
  await approve('bulk_revoke_credentials', 'batch')
  const bulk = await call('POST', '/api/admin/credentials/bulk-revoke', credAdmin, {
    credentialIds: [reissue.json.credentialId, credId], reason: 'signing incident drill in p4 e2e',
  })
  assert.equal(bulk.status, 200)
  assert.deepEqual(bulk.json.revoked, [reissue.json.credentialId], 'already-revoked ids are skipped, not errored')
  assert.deepEqual(bulk.json.skipped, [credId])

  // ── Auditor package export is ledgered ─────────────────────────────────────
  const auditExport = await call('GET', '/api/admin/credentials/audit-export?limit=5', credAdmin)
  assert.equal(auditExport.status, 200)
  const ledger1 = await query(
    `SELECT COUNT(*) FROM admin_exports WHERE entity_type = 'credential_audit_export' AND admin_id = $1`,
    [credAdmin.adminId],
  )
  assert.equal(Number(ledger1.rows[0].count), 1, 'credential export ledgered')

  // ── Replays: list, flag (incident), ledgered export ────────────────────────
  const replayId = randomUUID()
  await query(
    `INSERT INTO practice_replays (replay_id, source_session_id, exchange_no, moment, turns)
     VALUES ($1,$2,2,$3,$4)`,
    [replayId, sid, JSON.stringify({ dimension: 'communication', kind: 'theta_drop' }),
     JSON.stringify([{ speaker: 'candidate', text: 'practice turn' }])],
  )
  const replays = await call('GET', '/api/admin/replays', opsAdmin)
  assert.equal(replays.status, 200)
  const listed = replays.json.replays.find((r) => r.replay_id === replayId)
  assert.ok(listed)
  assert.equal(listed.flagged, false)

  const flag = await call('POST', `/api/admin/replays/${replayId}/flag`, opsAdmin, {
    reason: 'suspicious scripted replay pattern in e2e',
  })
  assert.equal(flag.status, 201)
  const replays2 = await call('GET', '/api/admin/replays', opsAdmin)
  assert.equal(replays2.json.replays.find((r) => r.replay_id === replayId).flagged, true)
  // research_admin has no replays:flag.
  assert.equal((await call('POST', `/api/admin/replays/${replayId}/flag`, research, { reason: 'research cannot flag this' })).status, 403)

  const replayExport = await call('GET', '/api/admin/replays/export?limit=10', research)
  assert.equal(replayExport.status, 200)
  assert.ok(replayExport.json.rows >= 1)

  // ── Team-fit: consent gate → team → member ops → archive ───────────────────
  const memberA = randomUUID()
  const memberB = randomUUID()
  for (const m of [memberA, memberB]) {
    await store.createSession(m, { scenarioId: 'group-project', userId: `u-${m.slice(0, 6)}` })
    await store.saveReport(m, { userId: `u-${m.slice(0, 6)}`, scores: { overall: 60 }, feedback: {} })
  }
  // Consent missing → 409 with the missing list.
  const noConsent = await call('POST', '/api/admin/teamfit/teams', opsAdmin, {
    name: 'E2E Team', memberSessionIds: [memberA, memberB],
  })
  assert.equal(noConsent.status, 409)
  assert.equal(noConsent.json.missingConsent.length, 2)

  await store.recordConsent(memberA, ['data_processing', 'teamfit_profile_use'], { consentVersion: 'p4' })
  await store.recordConsent(memberB, ['data_processing', 'teamfit_profile_use'], { consentVersion: 'p4' })
  const team = await call('POST', '/api/admin/teamfit/teams', opsAdmin, {
    name: 'E2E Team', memberSessionIds: [memberA, memberB],
  })
  assert.equal(team.status, 201)
  const teamId = team.json.teamId

  // Simulated history, then member removal — history must remain.
  const teamfitId = randomUUID()
  await query(
    `INSERT INTO teamfit_sessions (teamfit_id, team_id, turns, observations)
     VALUES ($1,$2,$3,$4)`,
    [teamfitId, teamId, JSON.stringify([{ speaker: 'twin', text: 'hello' }]),
     JSON.stringify({ observations: [{ theme: 'clarifying questions', evidence: 'asked twice' }] })],
  )
  const removeRes = await fetch(`${base}/api/admin/teamfit/teams/${teamId}/members/${memberB}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opsAdmin.token}`, 'x-admin-csrf': opsAdmin.csrf },
    body: JSON.stringify({ reason: 'left the organisation' }),
  })
  assert.equal(removeRes.status, 200)
  const simAfter = await call('GET', `/api/admin/teamfit/sessions/${teamfitId}`, opsAdmin)
  assert.equal(simAfter.status, 200)
  assert.equal(simAfter.json.session.turns.length, 1, 'historical simulation untouched by member removal')

  const archive = await call('POST', `/api/admin/teamfit/teams/${teamId}/archive`, opsAdmin, { reason: 'pilot ended' })
  assert.equal(archive.status, 200)
  const addAfterArchive = await call('POST', `/api/admin/teamfit/teams/${teamId}/members`, opsAdmin, { memberSessionId: memberA })
  assert.equal(addAfterArchive.status, 409, 'archived teams are read-only')

  // ── Research exports: allowlist + ledger + large-export approval ───────────
  const badDataset = await call('POST', '/api/admin/exports/research', research, {
    dataset: 'v1_users', purpose: 'trying to export the PII store',
  })
  assert.equal(badDataset.status, 400, 'PII stores are never exportable')

  const exp = await call('POST', '/api/admin/exports/research', research, {
    dataset: 'timeline', purpose: 'reliability sample for the e2e run',
  })
  assert.equal(exp.status, 200)
  const largeNoAp = await call('POST', '/api/admin/exports/research', research, {
    dataset: 'item_responses', rowLimit: 5000, purpose: 'large pull without approval',
  })
  assert.equal(largeNoAp.status, 409)
  assert.equal(largeNoAp.json.code, 'APPROVAL_REQUIRED')
  await approve('large_export', 'item_responses')
  const large = await call('POST', '/api/admin/exports/research', research, {
    dataset: 'item_responses', rowLimit: 5000, purpose: 'approved large pull in e2e',
  })
  assert.equal(large.status, 200)

  const ledger = await call('GET', '/api/admin/exports', research)
  assert.equal(ledger.status, 200)
  assert.ok(ledger.json.exports.length >= 3, 'every export appears on the ledger')
  assert.ok(ledger.json.exports.every((e) => e.exported_by && e.purpose), 'ledger rows carry who and why')

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await store.eraseSession(sid)
  await store.eraseSession(memberA)
  await store.eraseSession(memberB)
  await query('DELETE FROM credentials WHERE session_id = $1::uuid', [sid])
  await query('DELETE FROM practice_replays WHERE replay_id = $1', [replayId])
  await query('DELETE FROM teamfit_sessions WHERE teamfit_id = $1', [teamfitId])
  await query('DELETE FROM teams WHERE team_id = $1', [teamId])
  await query(`DELETE FROM admin_incidents WHERE detail->>'replayId' = $1`, [replayId])
  await query(`DELETE FROM admin_exports WHERE admin_id IN (SELECT admin_id FROM admin_users WHERE email LIKE 'p4db-%')`)
  await query(`DELETE FROM admin_approvals WHERE requested_reason LIKE 'p4 e2e approval%'`)
  await query(`DELETE FROM admin_users WHERE email LIKE 'p4db-%'`)
})
