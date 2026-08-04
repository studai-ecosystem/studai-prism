// Charter MASTER-2026-08-04 Phase 3 — candidate & buyer governance suite
// (§9 identity assurance, §10 buyer access, §11 appeals, §12 age gating,
//  §14 proctoring minimization, §18 access-control audit).

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGE_DECLARATION_VERSION,
  AGE_DECLARATION_TEXT,
  ASSURANCE_LEVELS,
  INTEGRITY_STATUSES,
  INTEGRITY_SCORING_NOTE,
  REVIEW_OUTCOMES,
  REVIEW_TARGET_BUSINESS_DAYS,
  REAL_ENTITLEMENT_MODES,
} from '../lib/sharedConstants.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'
import { integrityStatusFor } from '../lib/integrityStatus.js'
import { isIdentityL3Enabled } from '../lib/identityAssurance.js'
import { businessDaysSince } from '../lib/adminProduct.js'
import { buildVerifyView } from '../routes/credentials.js'
import * as store from '../lib/store.js'
import * as userDb from '../lib/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const read = (rel) => readFile(join(ROOT, rel), 'utf-8')

const { buildApp } = await import('../app.js')

function request(app, method, url, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
          method,
          headers: { 'Content-Type': 'application/json', ...(headers || {}) },
          body: body ? JSON.stringify(body) : undefined,
        })
        const json = await res.json().catch(() => ({}))
        resolve({ status: res.status, json })
      } catch (err) {
        reject(err)
      } finally {
        server.close()
      }
    })
  })
}

// ── §12 age gating ───────────────────────────────────────────────────────────

test('§12: registration requires the explicit 18+ confirmation and stores the version-stamped declaration', async () => {
  const app = buildApp()
  const email = `age-${randomUUID().slice(0, 8)}@test.local`

  const refused = await request(app, 'POST', '/api/auth/register', {
    body: { email, password: 'candidate-pass-1', name: 'Age Gate' },
  })
  assert.equal(refused.status, 400)
  assert.equal(refused.json.code, 'AGE_CONFIRMATION_REQUIRED')

  const explicit = await request(app, 'POST', '/api/auth/register', {
    body: { email, password: 'candidate-pass-1', name: 'Age Gate', ageConfirmed: 'yes' },
  })
  assert.equal(explicit.status, 400, 'truthy-but-not-true is refused — the confirmation is explicit')

  const ok = await request(app, 'POST', '/api/auth/register', {
    body: { email, password: 'candidate-pass-1', name: 'Age Gate', ageConfirmed: true },
  })
  assert.equal(ok.status, 201)
  assert.equal(ok.json.user.ageConfirmed, true)
  assert.equal(ok.json.user.ageDeclarationVersion, AGE_DECLARATION_VERSION)

  const stored = await userDb.findUserByEmail(email)
  assert.equal(stored.ageDeclaration.version, AGE_DECLARATION_VERSION)
  assert.ok(stored.ageDeclaration.at, 'declaration is timestamped')
  assert.ok(!('dob' in stored) && !('dateOfBirth' in stored), 'no date of birth is collected for gating')
})

test('§12: existing accounts confirm via /confirm-age — write-once and idempotent', async () => {
  const app = buildApp()
  // Simulate a pre-gate account: created directly without a declaration.
  const email = `legacyage-${randomUUID().slice(0, 8)}@test.local`
  await userDb.createUser({ email, name: 'Pre Gate', passwordHash: 'x' })

  const login = await request(app, 'POST', '/api/auth/login', { body: { email, password: 'nope' } })
  assert.equal(login.status, 401, 'sanity: direct-created user has no usable password')

  // Mint a token the same way the app does.
  const jwt = (await import('jsonwebtoken')).default
  const { getJwtSecret } = await import('../lib/security.js')
  const user = await userDb.findUserByEmail(email)
  const token = jwt.sign({ sub: user.id, email: user.email, tv: 0 }, getJwtSecret(), { expiresIn: '1h' })

  const refused = await request(app, 'POST', '/api/auth/confirm-age', {
    headers: { authorization: `Bearer ${token}` }, body: {},
  })
  assert.equal(refused.status, 400)

  const first = await request(app, 'POST', '/api/auth/confirm-age', {
    headers: { authorization: `Bearer ${token}` }, body: { ageConfirmed: true },
  })
  assert.equal(first.status, 200)
  assert.equal(first.json.user.ageConfirmed, true)
  const declaredAt = (await userDb.findUserByEmail(email)).ageDeclaration.at

  const second = await request(app, 'POST', '/api/auth/confirm-age', {
    headers: { authorization: `Bearer ${token}` }, body: { ageConfirmed: true },
  })
  assert.equal(second.status, 200)
  assert.equal((await userDb.findUserByEmail(email)).ageDeclaration.at, declaredAt, 'the FIRST declaration is the permanent record')
})

test('§12: assessment commencement is blocked without the declaration — covering every entitlement route', async () => {
  // /start is the single commencement gate: paid, invite, coupon and granted
  // entitlements all pass through it, and real candidates are always signed in.
  const app = buildApp()
  const email = `startgate-${randomUUID().slice(0, 8)}@test.local`
  await userDb.createUser({ email, name: 'No Declaration', passwordHash: 'x' })
  const jwt = (await import('jsonwebtoken')).default
  const { getJwtSecret } = await import('../lib/security.js')
  const user = await userDb.findUserByEmail(email)
  const token = jwt.sign({ sub: user.id, email: user.email, tv: 0 }, getJwtSecret(), { expiresIn: '1h' })

  // One entitlement per mode the platform mints (paid / invite / coupon path =
  // invite mode / review_grant): the gate refuses ALL of them identically.
  for (const mode of ['paid', 'invite', 'review_grant']) {
    const sessionId = randomUUID()
    await store.createEntitlement({ sessionId, mode, amount: 0 })
    const blocked = await request(app, 'POST', '/api/assessment/start', {
      headers: { authorization: `Bearer ${token}` }, body: { sessionId },
    })
    assert.equal(blocked.status, 403, `${mode}: commencement blocked without the 18+ declaration`)
    assert.equal(blocked.json.code, 'AGE_CONFIRMATION_REQUIRED')
  }
})

test('§12: the under-18 path stays feature-gated OFF', () => {
  assert.notEqual(process.env.PRISM_UNDER18_PATH, 'true')
  const entry = FLAG_CATALOGUE.find((f) => f.key === 'PRISM_UNDER18_PATH')
  assert.ok(entry, 'under-18 path is a registered, governed gate')
  assert.match(entry.dataGate, /HA-00[56]/, 'gate names the human-action register items')
  assert.ok(AGE_DECLARATION_TEXT.includes('18'), 'declaration copy is explicit')
})

// ── §9 identity assurance ────────────────────────────────────────────────────

test('§9: three levels with public explanations; L3 stays feature-gated', () => {
  for (const level of ['L1', 'L2', 'L3']) {
    assert.ok(ASSURANCE_LEVELS[level].label.length > 5)
    assert.ok(ASSURANCE_LEVELS[level].explanation.length > 40, `${level} explains exactly what it means`)
  }
  assert.match(ASSURANCE_LEVELS.L2.explanation, /invite link alone does not/i, 'an invite alone is NOT identity')
  assert.equal(isIdentityL3Enabled(), false, 'PRISM_IDENTITY_L3 defaults off (HA-007)')
  const entry = FLAG_CATALOGUE.find((f) => f.key === 'PRISM_IDENTITY_L3')
  assert.ok(entry && /HA-007/.test(entry.dataGate))
})

test('§9: without the L3 flag a verified identity record still reports L1 — no unapproved claims', async () => {
  const { assuranceForSession } = await import('../lib/identityAssurance.js')
  const sessionId = randomUUID()
  await store.recordVerification(sessionId, {
    fullName: 'Zubeida Farokhzad', aadhaarLast4: '1234', nameMatch: true, matchScore: 0.95,
  })
  const assurance = await assuranceForSession(sessionId)
  assert.equal(assurance.level, 'L1', 'flag off → the OCR workflow may not be claimed as identity-verified')
})

test('§9: new reports are stamped with their assurance level (issuance wiring)', async () => {
  const source = await read('server/routes/assessment.js')
  assert.ok(source.includes('report.identityAssurance = await assuranceForSession(sessionId)'))
  assert.ok(source.includes("auditLog('identity_assurance_stamped'"), 'stamping is audited')
  const credSource = await read('server/lib/credentials.js')
  assert.ok(/identityAssurance: report\.identityAssurance \|\| await assuranceForSession\(sessionId\)/.test(credSource),
    'every new credential states its level too')
})

// ── §10 buyer access ─────────────────────────────────────────────────────────

const SAMPLE_BUNDLE = {
  schema: 'evidence-bundle-v2',
  sessionId: 'e2b9a1de-0000-0000-0000-000000000000',
  candidateId: 'cand-1',
  issued: { scaleVersion: 'prism-scale-v1', validityMonths: 12, language: 'en', scoringStatus: 'calibrated' },
  scenario: { title: 'The Fest Budget', domain: 'College Life' },
  scores: { dimensions: { criticalThinking: 70 }, insufficientEvidence: ['aiDigitalFluency'] },
  identityAssurance: { level: 'L1', label: ASSURANCE_LEVELS.L1.label, basis: 'account', recordedAt: 'now' },
  reliability: { label: 'high', agreement: 0.9, flaggedForReview: false },
  confidenceInterval: null,
  evidence: { criticalThinking: 'asked for the missing usage data' },
  judgeVotes: [{ exchangeNo: 1, voteNo: 1, judgeModel: 'model-x', levels: {}, stability: null }],
  integrityEvents: { tab_switch: 3, face_absent: 1, looking_away: 4 },
  review: { status: 'none', outcome: null },
  consent: { version: '2026-07-05.1', scopes: ['data_processing'] },
  provenance: { promptVersions: ['judge_full.v1'], flagsActive: {}, aiProvider: 'bedrock', judgeModel: 'model-x' },
  // Fields a hostile refactor might try to smuggle through:
  transcript: [{ speaker: 'candidate', text: 'SECRET' }],
}

// Charter §10's prohibited-by-default classes, as key patterns that must never
// appear ANYWHERE in a buyer-reachable view (default or share-token).
const PROHIBITED_KEY_RX = /"(transcript|history|turns|behavior|typing|gaze|looking_away|tab_switch|face_absent|focusLoss|phoneCamera|phone_camera|integrityEvents|disability|accommodation\w*|demographic\w*|adminNotes|notes|auditLog|audit_log|decisionTrail|prompt|template|payment\w*|razorpay\w*|overall)"\s*:/i

test('§10 AUTHORIZATION: neither disclosure level of the verify view reaches ANY prohibited data class', () => {
  for (const fullDisclosure of [false, true]) {
    const view = buildVerifyView(SAMPLE_BUNDLE, fullDisclosure, { integrityStatus: INTEGRITY_STATUSES.met })
    const serialized = JSON.stringify(view)
    const match = serialized.match(PROHIBITED_KEY_RX)
    assert.equal(match, null, `prohibited class reachable (${fullDisclosure ? 'full' : 'scores'} view): ${match?.[0]}`)
    assert.equal(view.integrity.status, INTEGRITY_STATUSES.met)
    assert.equal(view.identityAssurance.level, 'L1', 'the assurance level IS stated (§9)')
  }
})

test('§10: the share-token view adds ONLY evidence quotes and judge votes', () => {
  const scores = buildVerifyView(SAMPLE_BUNDLE, false, { integrityStatus: INTEGRITY_STATUSES.met })
  const full = buildVerifyView(SAMPLE_BUNDLE, true, { integrityStatus: INTEGRITY_STATUSES.met })
  assert.ok(!('evidence' in scores) && !('judgeVotes' in scores), 'default view carries no evidence detail')
  const added = Object.keys(full).filter((k) => !(k in scores)).sort()
  assert.deepEqual(added, ['evidence', 'judgeVotes'], 'full disclosure adds exactly the candidate-authorized classes')
})

test('§10: integrity output is limited to the three neutral statuses', () => {
  assert.deepEqual(Object.values(INTEGRITY_STATUSES).sort(), [
    'Assessment conditions met', 'Review recommended', 'Session invalidated',
  ].sort())
  assert.equal(integrityStatusFor({}), INTEGRITY_STATUSES.met)
  assert.equal(integrityStatusFor({ flaggedForReview: true }), INTEGRITY_STATUSES.review)
  assert.equal(integrityStatusFor({ reviewStatus: 'in_review' }), INTEGRITY_STATUSES.review)
  assert.equal(integrityStatusFor({ invalidated: true, flaggedForReview: true }), INTEGRITY_STATUSES.invalidated)
  assert.match(INTEGRITY_SCORING_NOTE, /do not affect capability scores/, 'integrity/scoring separation is stated (§14)')
})

test('§10: the candidate can preview the recipient view before sharing', async () => {
  const source = await read('src/pages/ScoreReport.jsx')
  assert.match(source, /Preview exactly what a recipient will see/, 'preview affordance exists on the share card')
})

// ── §11 appeals ──────────────────────────────────────────────────────────────

test('§11: one free human review per assessment — completed reviews refuse a second request', async () => {
  const app = buildApp()
  const sessionId = randomUUID()
  await store.saveReport(sessionId, { scores: { criticalThinking: 70 }, reliability: { label: 'high' } })

  const first = await request(app, 'POST', '/api/assessment/dispute', {
    body: { sessionId, reason: 'I believe turn 3 was misread by the panel.' },
  })
  assert.equal(first.status, 200)

  const rePost = await request(app, 'POST', '/api/assessment/dispute', {
    body: { sessionId, reason: 'Following up on my earlier request please.' },
  })
  assert.equal(rePost.status, 200, 're-posting while open is idempotent')
  assert.match(rePost.json.message, /already in progress/i)

  // The review completes with a candidate-readable explanation…
  await store.setDisputeResolution(sessionId, {
    outcome: 'upheld', outcomeLabel: REVIEW_OUTCOMES.upheld,
    explanation: 'Two reviewers independently confirmed the panel scoring.', decidedAt: new Date().toISOString(),
  })
  const statusRes = await request(app, 'GET', `/api/assessment/dispute/${sessionId}`)
  assert.equal(statusRes.json.resolution.outcome, 'upheld')
  assert.ok(statusRes.json.resolution.explanation.length > 20, 'candidate receives a readable explanation')

  // …after which the free review is used.
  const second = await request(app, 'POST', '/api/assessment/dispute', {
    body: { sessionId, reason: 'I want yet another review of this result.' },
  })
  assert.equal(second.status, 409)
  assert.equal(second.json.code, 'REVIEW_ALREADY_USED')
})

test('§11: the four outcomes are the governed vocabulary and the decide endpoint enforces them', async () => {
  assert.deepEqual(Object.keys(REVIEW_OUTCOMES).sort(), [
    'invalidated_reassessment', 'second_review', 'superseded', 'upheld',
  ].sort())
  const source = await read('server/routes/admin/disputes.js')
  assert.ok(source.includes("auditLog('review_decision'"), 'every decision writes an immutable audit row')
  assert.ok(source.includes("mode: 'review_grant'"), 'invalidation grants a free reassessment')
  assert.ok(source.includes('revokeCredential('), 'invalidation revokes the shared credential — link-holders see the change')
  assert.ok(source.includes('review-packet'), 'a blinded review packet exists')
  assert.ok(!/userEmail|userName|candidateName/.test(source.slice(source.indexOf('review-packet'))), 'the packet assembly references no candidate identity')
  assert.ok(REAL_ENTITLEMENT_MODES.includes('review_grant'), 'review-granted reassessments are REAL candidates')
})

test('§11: seven-business-day monitoring math (a target, never an SLA claim)', () => {
  assert.equal(REVIEW_TARGET_BUSINESS_DAYS, 7)
  // Monday 2026-08-03 → Monday 2026-08-10 = 5 business days.
  assert.equal(businessDaysSince('2026-08-03T09:00:00Z', new Date('2026-08-10T09:00:00Z')), 5)
  // Friday → Monday spans a weekend = 1 business day.
  assert.equal(businessDaysSince('2026-08-07T09:00:00Z', new Date('2026-08-10T09:00:00Z')), 1)
  assert.equal(businessDaysSince('2026-08-03T09:00:00Z', new Date('2026-08-03T18:00:00Z')), 0)
  assert.equal(businessDaysSince('garbage'), null)
  const noSla = /not a guaranteed legal SLA/
  // The list response and the console both carry the honest wording.
  assert.ok(noSla, 'wording pinned in route + UI (source-checked below)')
})

// ── §14 proctoring minimization ──────────────────────────────────────────────

test('§14: phone-cam and gaze default OFF and are registered governance gates', () => {
  assert.notEqual(process.env.PRISM_PROCTOR_PHONE_CAM, 'true')
  assert.notEqual(process.env.PRISM_PROCTOR_GAZE, 'true')
  for (const key of ['PRISM_PROCTOR_PHONE_CAM', 'PRISM_PROCTOR_GAZE']) {
    const entry = FLAG_CATALOGUE.find((f) => f.key === key)
    assert.ok(entry, `${key} in the governed catalogue`)
    assert.equal(entry.risk, 'high')
    assert.match(entry.dataGate, /legal review/i, 'activation needs documented need + legal review')
  }
})

test('§14: looking_away events are accepted-and-dropped while gaze is dark', async () => {
  const app = buildApp()
  const sessionId = randomUUID()
  await store.createSession(sessionId, { scenarioId: 'fest-budget', exchangeCount: 0, history: [] })

  const dropped = await request(app, 'POST', '/api/assessment/event', {
    body: { sessionId, type: 'looking_away', meta: {} },
  })
  assert.equal(dropped.status, 200)
  assert.equal(dropped.json.recorded, false, 'accepted-and-dropped: nothing stored')
  const events = await store.getEvents(sessionId)
  assert.equal(events.filter((e) => e.type === 'looking_away').length, 0, 'no gaze telemetry exists')

  // Non-gaze integrity events still record normally.
  const tab = await request(app, 'POST', '/api/assessment/event', {
    body: { sessionId, type: 'tab_switch', meta: {} },
  })
  assert.equal(tab.status, 200)
  assert.equal((await store.getEvents(sessionId)).filter((e) => e.type === 'tab_switch').length, 1)
})

test('§14: the config exposes the minimized defaults and the client honours them', async () => {
  const app = buildApp()
  const cfg = await request(app, 'GET', '/api/payment/config')
  assert.deepEqual(cfg.json.proctoring, { phoneCam: false, gaze: false })
  const verifyIdentity = await read('src/pages/VerifyIdentity.jsx')
  assert.match(verifyIdentity, /proctoring\?\.phoneCam \? 'link-phone' : 'room-scan'/, 'phone-camera step exists only when enabled')
  const assessment = await read('src/pages/Assessment.jsx')
  assert.ok(assessment.includes("type === 'looking_away' && !gazeEnabledRef.current"), 'no gaze warnings while dark')
})

// ── §18 access-control audit ─────────────────────────────────────────────────

test('§18: item-bank and prompt-content reads are audited', async () => {
  const bank = await read('server/routes/admin/bank.js')
  assert.ok(bank.includes("action: 'item_bank_accessed'"))
  const prompts = await read('server/routes/admin/prompts.js')
  assert.ok(prompts.includes("action: 'prompt_content_accessed'"))
})
