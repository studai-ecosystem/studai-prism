// Control Centre Phase 3 — full-flow integration tests (database required).
//
//   set TEST_DATABASE_URL=postgres://user:pass@localhost:5432/prism_test
//
// Exercises the scientific administration plane over real HTTP:
// calibration freeze/apply with dual approvals (incl. one-applied-per-type
// supersession + the equating runtime contract), item retirement + bank
// freeze status, rater lifecycle (create/rotate/suspend/reset) + training
// reference draft→active→retired feeding the REAL rater training flow,
// studies (preregister → edit-before-activation → activate → immutable),
// external rating supersession chains, and the prompt registry
// (seed-from-files, drift, draft→testing→approved→dual-approved production,
// production immutability, rollback).

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
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase3-db-test-secret'
  process.env.PRISM_ADMIN_CONSOLE = 'true'
  process.env.PRISM_V2_TELEMETRY = 'true'
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-admin-p3db-'))
  delete process.env.PRISM_PG_STORE
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')
const { buildApp } = skip ? {} : await import('../app.js')
const adminAuth = skip ? {} : await import('../lib/adminAuth.js')
const { seedRbac } = skip ? {} : await import('../lib/adminRbac.js')
const { seedItems } = skip ? {} : await import('../db/seedItems.js')

async function mintAdmin(roleKeys) {
  const adminId = randomUUID()
  const email = `p3db-${roleKeys[0]}-${adminId.slice(0, 8)}@test.local`
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
    { admin_id: adminId, email }, { ip: '10.88.0.1', get: () => 'phase3-tests' },
  )
  return { adminId, email, token: adminAuth.signAccessToken({ admin_id: adminId, email }, session.sessionId), csrf: session.csrfToken }
}

test('Phase 3 scientific administration end-to-end', { skip }, async (t) => {
  await migrateUp()
  await seedRbac()
  await seedItems()

  const app = buildApp()
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { server.close(); await closePool() })

  const call = async (method, path, actor, body, extraHeaders = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${actor.token}`,
        ...(method !== 'GET' ? { 'x-admin-csrf': actor.csrf } : {}),
        ...extraHeaders,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    let json = null
    try { json = await res.json() } catch { /* empty */ }
    return { status: res.status, json }
  }

  // telemetry auditLog() is fire-and-forget by design — poll briefly for
  // decision-trail rows instead of asserting on the same tick.
  const trailCount = async (eventType, atLeast) => {
    for (let i = 0; i < 20; i++) {
      const r = await query('SELECT COUNT(*) FROM audit_log WHERE event_type = $1', [eventType])
      const n = Number(r.rows[0].count)
      if (n >= atLeast) return n
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return Number((await query('SELECT COUNT(*) FROM audit_log WHERE event_type = $1', [eventType])).rows[0].count)
  }

  const psy = await mintAdmin(['psychometric_admin'])
  const psy2 = await mintAdmin(['psychometric_admin', 'super_admin']) // approver
  const research = await mintAdmin(['research_admin'])
  const raterMgr = await mintAdmin(['rater_manager'])
  const auditor = await mintAdmin(['auditor'])

  const approve = async (action, entityId, requester) => {
    const req1 = await call('POST', '/api/admin/admins/approvals', psy2, {
      action, entityType: 'x', entityId, reason: `e2e approval request for ${action}`,
    })
    // psy2 raises; a DIFFERENT admin must decide — use requester's counterpart.
    assert.equal(req1.status, 201)
    const decide = await call('POST', `/api/admin/admins/approvals/${req1.json.approvalId}/decide`, requester, {
      decision: 'approved', reason: 'reviewed in e2e',
    })
    assert.equal(decide.status, 200, `approval decide for ${action}: ${JSON.stringify(decide.json)}`)
    return req1.json.approvalId
  }
  const superDecider = await mintAdmin(['super_admin'])

  // ── Bank: scenarios grouped + freeze status + item retire ─────────────────
  const scen = await call('GET', '/api/admin/bank/scenarios', psy)
  assert.equal(scen.status, 200)
  assert.ok(scen.json.scenarios.length >= 8, 'seeded bank visible')
  assert.equal(scen.json.freeze.bankFrozen, true, 'bank frozen before any frozen IRT run')

  const items = await call('GET', '/api/admin/bank/items?kind=probe&status=provisional', psy)
  assert.ok(items.json.items.length > 0)
  const victim = items.json.items[0]

  const retireShort = await call('POST', `/api/admin/bank/items/${victim.item_id}/retire`, psy, { reason: 'short' })
  assert.equal(retireShort.status, 400, 'retire demands a substantive reason')
  const retire = await call('POST', `/api/admin/bank/items/${victim.item_id}/retire`, psy, {
    reason: 'e2e retirement of a duplicate probe item',
  })
  assert.equal(retire.status, 200)
  const reRetire = await call('POST', `/api/admin/bank/items/${victim.item_id}/retire`, psy, {
    reason: 'attempting to retire twice here',
  })
  assert.equal(reRetire.status, 409)
  assert.ok((await trailCount('item_retired', 1)) >= 1, 'item retirement hits the decision trail')

  // Auditor: read yes, mutate no.
  assert.equal((await call('GET', '/api/admin/bank/items', auditor)).status, 200)
  assert.equal((await call('POST', `/api/admin/bank/items/${victim.item_id}/retire`, auditor, { reason: 'auditor cannot do this' })).status, 403)

  // ── Calibrations: freeze (dual) → apply (dual) → supersede → equating ─────
  const mkRun = async (runType, outputs) => {
    const runId = randomUUID()
    await query(
      `INSERT INTO calibration_runs (run_id, run_type, inputs_summary, outputs) VALUES ($1,$2,$3,$4)`,
      [runId, runType, JSON.stringify({ e2e: true }), JSON.stringify(outputs)],
    )
    return runId
  }
  const equateA = await mkRun('equate', { constants: { 'group-project': 1.5 } })
  const equateB = await mkRun('equate', { constants: { 'group-project': -0.5 } })
  const appliedTrailBefore = await trailCount('calibration_applied', 0)

  // Apply refuses unfrozen runs.
  const applyUnfrozen = await call('POST', `/api/admin/calibrations/${equateA}/apply`, psy, { reason: 'trying to apply before freezing' })
  assert.equal(applyUnfrozen.status, 409)
  assert.equal(applyUnfrozen.json.code, 'NOT_FROZEN')

  // Freeze requires dual approval.
  const freezeNoAp = await call('POST', `/api/admin/calibrations/${equateA}/freeze`, psy, { reason: 'reviewed the e2e outputs fully' })
  assert.equal(freezeNoAp.status, 409)
  assert.equal(freezeNoAp.json.code, 'APPROVAL_REQUIRED')
  await approve('freeze_calibration', equateA, superDecider)
  const freezeA = await call('POST', `/api/admin/calibrations/${equateA}/freeze`, psy, { reason: 'reviewed the e2e outputs fully' })
  assert.equal(freezeA.status, 200)

  // Apply requires its own approval; then it is THE applied run for the type.
  await approve('apply_calibration', equateA, superDecider)
  const applyA = await call('POST', `/api/admin/calibrations/${equateA}/apply`, psy, { reason: 'activating e2e equating constants' })
  assert.equal(applyA.status, 200)

  // Equating runtime contract: the applied run is what scoring reads.
  const live = await query(
    `SELECT run_id FROM calibration_runs WHERE run_type = 'equate' AND frozen = TRUE AND applied = TRUE`,
  )
  assert.equal(live.rows.length, 1)
  assert.equal(live.rows[0].run_id, equateA)

  // Applying B supersedes A atomically (one applied per type).
  await approve('freeze_calibration', equateB, superDecider)
  await call('POST', `/api/admin/calibrations/${equateB}/freeze`, psy, { reason: 'second run reviewed for supersession' })
  await approve('apply_calibration', equateB, superDecider)
  const applyB = await call('POST', `/api/admin/calibrations/${equateB}/apply`, psy, { reason: 'superseding the first e2e run' })
  assert.equal(applyB.status, 200)
  assert.equal(applyB.json.supersededRunId, equateA)
  const after = await query(`SELECT run_id, applied, superseded_by FROM calibration_runs WHERE run_id = ANY($1::uuid[])`, [[equateA, equateB]])
  const rowA = after.rows.find((r) => r.run_id === equateA)
  const rowB = after.rows.find((r) => r.run_id === equateB)
  assert.equal(rowA.applied, false)
  assert.equal(rowA.superseded_by, equateB)
  assert.equal(rowB.applied, true)
  // The applied run cannot be rejected — supersession is the only path.
  assert.equal((await call('POST', `/api/admin/calibrations/${equateB}/reject`, psy, { reason: 'trying to reject the live one' })).status, 409)
  // Decision trail carries both applications (delta — audit rows persist across reruns).
  assert.equal(await trailCount('calibration_applied', appliedTrailBefore + 2), appliedTrailBefore + 2)

  // Bank unfreezes only via a FROZEN IRT run.
  const irtRun = await mkRun('irt', { items: [] })
  await approve('freeze_calibration', irtRun, superDecider)
  await call('POST', `/api/admin/calibrations/${irtRun}/freeze`, psy, { reason: 'first IRT calibration frozen in e2e' })
  const scen2 = await call('GET', '/api/admin/bank/scenarios', psy)
  assert.equal(scen2.json.freeze.bankFrozen, false, 'frozen IRT run lifts the bank freeze status')

  // ── Raters: lifecycle + training refs drive the real rater flow ───────────
  const created = await call('POST', '/api/admin/raters', raterMgr, { handle: `e2e-p3-${randomUUID().slice(0, 6)}` })
  assert.equal(created.status, 201)
  assert.ok(created.json.token, 'token shown once')
  const raterId = created.json.raterId
  const raterToken = created.json.token

  const rotated = await call('POST', `/api/admin/raters/${raterId}/rotate-token`, raterMgr, { reason: 'e2e rotation' })
  assert.equal(rotated.status, 200)
  const oldTokenPing = await fetch(`${base}/api/studies/rater/me`, { headers: { 'x-rater-token': raterToken } })
  assert.equal(oldTokenPing.status, 401, 'old rater token dies on rotation')
  const newToken = rotated.json.token
  const newTokenPing = await fetch(`${base}/api/studies/rater/me`, { headers: { 'x-rater-token': newToken } })
  assert.equal(newTokenPing.status, 200)

  // Training reference: draft is INVISIBLE to raters until activated.
  const refCreate = await call('POST', '/api/admin/raters/training-refs', raterMgr, {
    transcript: [{ speaker: 'avatar', text: 'What went wrong?' }, { speaker: 'candidate', text: 'We shipped late because I under-scoped.' }],
    referenceLevels: { criticalThinking: 3, communication: 2, collaboration: 2, problemSolving: 3, aiDigitalFluency: 1 },
  })
  assert.equal(refCreate.status, 201)
  assert.equal(refCreate.json.status, 'draft')
  const refId = refCreate.json.refId

  const meBefore = await (await fetch(`${base}/api/studies/rater/me`, { headers: { 'x-rater-token': newToken } })).json()
  const activate = await call('POST', `/api/admin/raters/training-refs/${refId}/status`, raterMgr, { status: 'active', reason: 'rubric owner reviewed in e2e' })
  assert.equal(activate.status, 200)
  const meAfter = await (await fetch(`${base}/api/studies/rater/me`, { headers: { 'x-rater-token': newToken } })).json()
  assert.equal(meAfter.trainingTotal, meBefore.trainingTotal + 1, 'activated ref enters the training set')

  const retireRef = await call('POST', `/api/admin/raters/training-refs/${refId}/status`, raterMgr, { status: 'retired', reason: 'superseded by better reference' })
  assert.equal(retireRef.status, 200)
  const meRetired = await (await fetch(`${base}/api/studies/rater/me`, { headers: { 'x-rater-token': newToken } })).json()
  assert.equal(meRetired.trainingTotal, meBefore.trainingTotal, 'retired ref leaves the training set')
  assert.equal((await call('POST', `/api/admin/raters/training-refs/${refId}/status`, raterMgr, { status: 'active', reason: 'cannot resurrect' })).status, 409)

  // Suspend / reset-training.
  const suspend = await call('POST', `/api/admin/raters/${raterId}/state`, raterMgr, { state: 'suspended', reason: 'e2e suspension' })
  assert.equal(suspend.status, 200)
  const suspendedPing = await fetch(`${base}/api/studies/rater/me`, { headers: { 'x-rater-token': newToken } })
  assert.equal(suspendedPing.status, 403, 'suspended raters are locked out of the workbench')
  const reactivate = await call('POST', `/api/admin/raters/${raterId}/state`, raterMgr, { state: 'reactivate', reason: 'e2e reactivation' })
  assert.equal(reactivate.status, 200)
  assert.equal(reactivate.json.status, 'training', 'no kappa → back to training, not qualified')
  const reset = await call('POST', `/api/admin/raters/${raterId}/reset-training`, raterMgr, { reason: 'fresh start in e2e' })
  assert.equal(reset.status, 200)

  // Rater manager cannot touch calibrations (role isolation).
  assert.equal((await call('GET', '/api/admin/calibrations', raterMgr)).status, 403)

  // ── Studies: preregister → edit → activate → immutable ────────────────────
  const key = `e2e_p3_${randomUUID().slice(0, 6)}`
  const missing = await call('POST', '/api/admin/studies', research, { studyKey: key, title: 'T' })
  assert.equal(missing.status, 400, 'preregistration demands every scientific field')
  const preReg = await call('POST', '/api/admin/studies', research, {
    studyKey: key, title: 'E2E study', hypothesis: 'H1: e2e works',
    preregisteredMetric: 'pass_rate', protocolDoc: 'docs/studies/e2e.md',
  })
  assert.equal(preReg.status, 201)

  const edit = await call('PATCH', `/api/admin/studies/${key}`, research, { title: 'E2E study (amended)', reason: 'typo fix pre-activation' })
  assert.equal(edit.status, 200)
  const badEdit = await call('PATCH', `/api/admin/studies/${key}`, research, { studyKey: 'nope' })
  assert.equal(badEdit.status, 400, 'study key is never editable')

  const activateStudy = await call('POST', `/api/admin/studies/${key}/status`, research, { status: 'active', reason: 'cohort starts' })
  assert.equal(activateStudy.status, 200)
  const editAfter = await call('PATCH', `/api/admin/studies/${key}`, research, { title: 'sneaky change' })
  assert.equal(editAfter.status, 409, 'active studies are immutable')
  assert.equal(editAfter.json.code, 'IMMUTABLE_AFTER_ACTIVATION')
  const badTransition = await call('POST', `/api/admin/studies/${key}/status`, research, { status: 'preregistered', reason: 'rewind attempt' })
  assert.equal(badTransition.status, 409, 'no rewinding the study lifecycle')

  // Compute is wired only for steering_ab; others point at their Python jobs.
  assert.equal((await call('POST', `/api/admin/studies/${key}/compute`, research, {})).status, 501)

  // ── External ratings: append-only supersession chain ──────────────────────
  const sid = randomUUID()
  const r1 = await call('POST', '/api/admin/studies/external-ratings', research, {
    sessionId: sid, sourceOrg: 'Partner College', exerciseType: 'group_discussion', raterRole: 'faculty', score: 72,
  })
  assert.equal(r1.status, 201)
  const r2 = await call('POST', '/api/admin/studies/external-ratings', research, {
    sessionId: sid, sourceOrg: 'Partner College', exerciseType: 'group_discussion', raterRole: 'faculty',
    score: 78, supersedes: r1.json.ratingId, notes: 'transcription error corrected',
  })
  assert.equal(r2.status, 201)
  const chain = await call('GET', `/api/admin/studies/external-ratings/list?sessionId=${sid}`, research)
  assert.equal(chain.json.ratings.length, 2)
  const first = chain.json.ratings.find((r) => r.rating_id === r1.json.ratingId)
  assert.equal(first.superseded, true, 'superseded rating marked, never edited')
  await assert.rejects(
    () => query(`UPDATE external_ratings SET score = 1 WHERE rating_id = $1`, [r1.json.ratingId]),
    /append-only/,
    'external ratings remain trigger-protected',
  )

  // ── Prompt registry: seed, lifecycle, dual-approved publish, rollback ─────
  const list = await call('GET', '/api/admin/prompts', psy)
  assert.equal(list.status, 200)
  assert.ok(list.json.prompts.length >= 8, 'file bank seeded into the registry')
  assert.equal(list.json.drift.length, 0, 'no drift right after seeding')
  assert.match(list.json.runtime, /files/, 'runtime stays file-based by default')

  const detail = await call('GET', '/api/admin/prompts/judge_full', psy)
  assert.equal(detail.status, 200)
  const prodV1 = detail.json.versions.find((v) => v.language === 'en' && v.status === 'production')
  assert.ok(prodV1, 'judge_full v1 en imported as production')

  // Production is immutable in place.
  const editProd = await call('PATCH', `/api/admin/prompts/versions/${prodV1.version_id}`, psy, { template: 'hacked' })
  assert.equal(editProd.status, 409)
  assert.equal(editProd.json.code, 'IMMUTABLE_VERSION')

  // Draft → testing → approved → (dual-approved) production.
  const draft = await call('POST', '/api/admin/prompts/judge_full/versions', psy, {
    version: 'v2', template: 'You are a careful judge. {{TRANSCRIPT}} {{RUBRIC}}',
  })
  assert.equal(draft.status, 201)
  const draftId = draft.json.versionId
  const dup = await call('POST', '/api/admin/prompts/judge_full/versions', psy, { version: 'v2', template: 'x' })
  assert.equal(dup.status, 409, 'version identifiers are immutable — no overwrites')

  const editDraft = await call('PATCH', `/api/admin/prompts/versions/${draftId}`, psy, {
    template: 'You are a careful, evidence-first judge. {{TRANSCRIPT}} {{RUBRIC}}',
  })
  assert.equal(editDraft.status, 200)

  const skipToProd = await call('POST', `/api/admin/prompts/versions/${draftId}/status`, psy, { status: 'production', reason: 'shortcut attempt xx' })
  assert.equal(skipToProd.status, 409, 'draft cannot jump to production')
  assert.equal((await call('POST', `/api/admin/prompts/versions/${draftId}/status`, psy, { status: 'testing' })).status, 200)
  assert.equal((await call('POST', `/api/admin/prompts/versions/${draftId}/status`, psy, { status: 'approved', testResults: { cases: 5, pass: 5 } })).status, 200)

  const pubNoAp = await call('POST', `/api/admin/prompts/versions/${draftId}/status`, psy, { status: 'production', reason: 'panel-reviewed judge wording v2' })
  assert.equal(pubNoAp.status, 409)
  assert.equal(pubNoAp.json.code, 'APPROVAL_REQUIRED')
  await approve('publish_prompt', draftId, superDecider)
  const pub = await call('POST', `/api/admin/prompts/versions/${draftId}/status`, psy, { status: 'production', reason: 'panel-reviewed judge wording v2' })
  assert.equal(pub.status, 200)
  assert.ok(pub.json.demoted.some((d) => d.version_id === prodV1.version_id), 'previous production deprecated')

  // Drift now visible: the file still carries v1 as production content.
  const listAfter = await call('GET', '/api/admin/prompts', psy)
  assert.ok(Array.isArray(listAfter.json.drift), 'drift report present after publish')

  // Rollback: explicit target, deterministic.
  const rollback = await call('POST', `/api/admin/prompts/versions/${draftId}/rollback`, psy, {
    toVersionId: prodV1.version_id, reason: 'v2 regressed on evaluation set',
  })
  assert.equal(rollback.status, 200)
  const detail2 = await call('GET', '/api/admin/prompts/judge_full', psy)
  const nowProd = detail2.json.versions.find((v) => v.language === 'en' && v.status === 'production')
  assert.equal(nowProd.version_id, prodV1.version_id, 'v1 restored to production')
  assert.equal(
    detail2.json.versions.find((v) => v.version_id === draftId).status,
    'rolled_back',
  )

  // ── Psychometrics dashboard ────────────────────────────────────────────────
  const dash = await call('GET', '/api/admin/psychometrics', psy)
  assert.equal(dash.status, 200)
  assert.ok(dash.json.gates.realSessions.target > 0)
  assert.ok(dash.json.judgeDrift.status)
  assert.ok(dash.json.runs.equate.applied, 'applied equate run visible on the dashboard')

  // ── Cleanup (e2e artifacts; audit + immutable rows remain by design) ──────
  await query(`DELETE FROM external_ratings WHERE session_id = $1::uuid AND supersedes IS NOT NULL`, [sid])
  await query(`DELETE FROM external_ratings WHERE session_id = $1::uuid`, [sid])
  await query(`DELETE FROM raters WHERE rater_id = $1`, [raterId])
  await query(`DELETE FROM rater_training_refs WHERE ref_id = $1`, [refId])
  await query(`DELETE FROM studies WHERE study_key = $1`, [key])
  await query(`UPDATE items SET status = 'provisional' WHERE item_id = $1`, [victim.item_id])
  await query(`DELETE FROM calibration_runs WHERE run_id = ANY($1::uuid[])`, [[equateA, equateB, irtRun]])
  await query(`DELETE FROM prompt_versions WHERE version_id = $1`, [draftId])
  await query(`UPDATE prompt_versions SET status = 'production' WHERE version_id = $1`, [prodV1.version_id])
  await query(`DELETE FROM admin_approvals WHERE requested_reason LIKE 'e2e approval request%'`)
  await query(`DELETE FROM admin_users WHERE email LIKE 'p3db-%'`)
})
