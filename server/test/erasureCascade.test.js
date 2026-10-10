// PROD-READY Phase 2 (SECURITY_REVIEW S8): the account erasure cascade on the
// non-database path — the JSON v1 store and the campus memory store — plus the
// self-service route wiring, the resumable ledger, legal holds and the
// intervention-membership exit hooks. The PostgreSQL path is covered table by
// table in erasureCascade.db.test.js.
import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'phase2-erasure-test-secret'
delete process.env.PRISM_PG_STORE
delete process.env.DATABASE_URL

const store = await import('../lib/store.js')
const userDb = await import('../lib/db.js')
const { createMemoryCampusRepos } = await import('../domain/campusStore/index.js')
const { createCampusContext } = await import('../domain/campusStore/context.js')
const {
  createErasureCascade, createMemoryLedger, pseudonymFor, subjectRef, ERASED_TEXT, eraseUserFromMemoryDb,
} = await import('../domain/privacy/erasureCascade.js')
const { sessionRef } = await import('../lib/campusErasure.js')
const { buildApp } = await import('../app.js')

const CLOCK = () => new Date('2026-10-10T10:00:00Z')

// Every account- and session-keyed memory collection gets one row per person.
function seedPerson(db, { uid, email, sid, orgId, cohortId, interventionId }) {
  const at = CLOCK().toISOString()
  db.organizations.set(orgId, db.organizations.get(orgId) || { id: orgId, name: 'Synthetic College', slug: `s-${orgId}`, organizationType: 'COLLEGE', status: 'ACTIVE' })
  db.cohorts.set(cohortId, db.cohorts.get(cohortId) || { id: cohortId, organizationId: orgId, name: 'Cohort', status: 'ACTIVE', ownerUserId: null })
  db.interventions.set(interventionId, db.interventions.get(interventionId) || { id: interventionId, organizationId: orgId, cohortId, name: 'Intervention', status: 'ACTIVE', missionIds: ['M-1'] })
  db.cohortMembers.set(`${cohortId}:${uid}`, { cohortId, userId: uid, status: 'ACTIVE', addedBy: 'staff-1', addedAt: at })
  const mid = randomUUID()
  db.memberships.set(mid, { id: mid, organizationId: orgId, userId: uid, role: 'STUDENT', status: 'ACTIVE', scope: {}, invitedBy: 'staff-1' })
  const wid = randomUUID()
  db.workspaces.set(wid, { id: wid, type: 'CAMPUS_STUDENT', ownerUserId: uid, organizationId: orgId, name: 'W', status: 'ACTIVE' })
  const iid = randomUUID()
  db.invites.set(iid, { id: iid, organizationId: orgId, email, role: 'STUDENT', status: 'ACCEPTED', invitedBy: 'staff-1', acceptedBy: uid })
  const eid = randomUUID()
  db.entitlements.set(eid, { id: eid, userId: uid, organizationId: null, sourceType: 'PERSONAL_PURCHASE', status: 'ACTIVE', quantity: 2, consumedQuantity: 1, metadata: {} })
  const spare = randomUUID()
  db.entitlements.set(spare, { id: spare, userId: uid, organizationId: null, sourceType: 'PROMO', status: 'ACTIVE', quantity: 1, consumedQuantity: 0, metadata: {} })
  db.consumptions.push(Object.freeze({ id: randomUUID(), entitlementId: eid, userId: uid, organizationId: null, sessionId: sid, event: 'RESERVED', idempotencyKey: `reserve:${uid}:k1`, createdAt: at }))
  db.consents.push({ id: randomUUID(), userId: uid, organizationId: orgId, consentType: 'CAMPUS_ASSESSMENT_DISCLOSURE', copyVersion: 'v1', grantedAt: at })
  const gid = randomUUID()
  db.shareGrants.set(gid, { id: gid, ownerUserId: uid, recipientType: 'ORGANIZATION', recipientOrganizationId: orgId, revokedAt: null })
  db.shareGrantResources.push({ shareGrantId: gid, resourceType: 'ASSESSMENT_REPORT', resourceId: sid, disclosureLevel: 'SUMMARY' })
  db.dataAccessEvents.push(Object.freeze({ id: randomUUID(), actorUserId: 'staff-1', organizationId: orgId, subjectUserId: uid, resourceType: 'REPORT', resourceId: sid, action: 'READ' }))
  db.dataAccessEvents.push(Object.freeze({ id: randomUUID(), actorUserId: uid, organizationId: orgId, subjectUserId: uid, resourceType: 'REPORT', resourceId: sid, action: 'READ' }))
  db.sessionScopes.set(sid, { sessionId: sid, ownerUserId: uid, sponsorType: 'INSTITUTION', sponsorOrganizationId: orgId, workspaceId: wid, createdBy: uid })
  const aid = `pa_${randomUUID().replace(/-/g, '')}`
  db.assignments.set(aid, { id: aid, sponsorType: 'PERSONAL', personalKey: aid, createdBy: 'SYSTEM', status: 'ACTIVE' })
  db.assignmentStudents.set(`${aid}:${uid}`, { assignmentId: aid, userId: uid, status: 'COMPLETED', sessionId: sid })
  db.assignmentTargets.push({ assignmentId: aid, targetType: 'USER', targetId: uid })
  db.preferences.set(uid, { userId: uid, reducedMotion: false, largerText: true, displayName: 'Synthetic' })
  db.productEvents.push({ id: randomUUID(), event: 'report_viewed', actorHash: `hash-${uid}`, props: {} })
  db.clientEvents.set(`${sid}\u0000c1`, { sessionId: sid, clientEventId: 'c1', kind: 'MESSAGE', response: { text: 'my words' } })
  db.artifactVersions.push({ sessionId: sid, artifactId: 'a', version: 1, content: { text: 'my plan' }, savedBy: uid })
  db.candidateActions.set(`${sid}\u0000c1`, { sessionId: sid, clientEventId: 'c1', payload: { text: 'my words' } })
  db.runTiming.set(sid, { sessionId: sid })
  db.opportunities.set(`${sid}\u0000o1`, { sessionId: sid, opportunityId: 'o1' })
  db.reportVersions.push({ sessionId: sid, version: 1, contentHash: `h-${sid}`, report: { quote: 'my words' } })
  db.reportVersions.push({ sessionId: sid, version: 2, contentHash: `h2-${sid}`, report: { quote: 'my words again' } })
  const rid = randomUUID()
  db.reportReviewRequests.push({ id: rid, sessionId: sid, version: 1, userId: uid, category: 'OTHER', momentId: 'm1', reason: 'I said something different here', state: 'RESOLVED' })
  db.reportReviewDecisions.push(Object.freeze({ id: randomUUID(), reviewId: rid, reviewerId: 'reviewer-1', decision: 'UPHOLD', reason: 'Learner quote reviewed and upheld', correction: null }))
  db.reportReviewRequests.push({ id: randomUUID(), sessionId: sid, version: 2, userId: uid, category: 'OTHER', momentId: null, reason: 'Second thoughts on this one', state: 'OPEN' })
  db.importRows.push({ jobId: 'job-1', rowNumber: db.importRows.length + 1, raw: { email, name: 'Synthetic' }, normalized: { email }, errors: [], action: 'INVITE', outcome: 'INVITED' })
  db.notifications.push({ id: randomUUID(), userId: uid, organizationId: orgId, kind: 'ASSIGNMENT_LAUNCHED', payload: {} })
  db.orgAudit.push(Object.freeze({ id: randomUUID(), organizationId: orgId, actorUserId: uid, action: 'cohort.created', targetType: 'COHORT', targetId: cohortId, details: {} }))
  db.orgAudit.push(Object.freeze({ id: randomUUID(), organizationId: orgId, actorUserId: 'staff-1', action: 'member.removed', targetType: 'MEMBERSHIP', targetId: uid, details: {} }))
  db.interventionMembers.set(`${interventionId}:${uid}`, { interventionId, userId: uid, addedAt: at })
  const attempt = randomUUID()
  db.missionAttempts.set(attempt, { id: attempt, userId: uid, missionId: 'M-1', work: { text: 'my practice' } })
  db.practiceUnits.push(Object.freeze({ id: randomUUID(), attemptId: attempt, userId: uid, excerpt: 'my quote' }))
  const plan = randomUUID()
  db.developmentPlans.set(plan, { id: plan, userId: uid, sourceSessionId: sid })
  db.planItems.push({ planId: plan, capabilityId: 'C1', position: 1 })
  db.growthSnapshots.push(Object.freeze({ id: randomUUID(), userId: uid, baselineSessionId: sid, reassessmentSessionId: `${sid}-b` }))
  db.practiceAllowances.set(randomUUID(), { id: randomUUID(), userId: uid, total: 3, used: 1 })
  const prep = randomUUID()
  db.preparationAttempts.set(prep, { id: prep, userId: uid, intent: { text: 'interview' } })
  db.preparationTurns.push({ id: randomUUID(), attemptId: prep, actor: 'CANDIDATE', text: 'my rehearsal' })
  db.actionCards.set(prep, { id: randomUUID(), attemptId: prep, userId: uid, card: {} })
  db.applicationCheckins.push({ id: randomUUID(), userId: uid, whatTried: 'x', outcome: 'y' })
  db.productGrants.set(randomUUID(), { id: randomUUID(), userId: uid, productCode: 'FREE_FIRST_EXPERIENCE' })
  db.previewAttempts.set(randomUUID(), { id: randomUUID(), tokenHash: 't', payload: { answer: 'guest words' }, claimedUserId: uid })
  const rated = randomUUID()
  db.ratingItems.set(rated, { id: rated, evidenceRef: 'e'.repeat(64), sessionRef: sessionRef(sid), excerpt: '{{candidate}} said my words', enqueuedBy: 'system:x' })
  db.unitRatings.push(Object.freeze({ id: randomUUID(), itemId: rated, raterId: 'rater-1', level: 3, cannotRate: false }))
  const unrated = randomUUID()
  db.ratingItems.set(unrated, { id: unrated, evidenceRef: 'f'.repeat(64), sessionRef: sessionRef(sid), excerpt: 'more words', enqueuedBy: 'system:x' })
  return { rated, unrated, mid }
}

function world() {
  const repos = createMemoryCampusRepos({ clock: CLOCK })
  const db = repos.db
  const orgId = randomUUID()
  const cohortId = randomUUID()
  const interventionId = randomUUID()
  const a = { uid: `student-a-${randomUUID()}`, email: `a-${randomUUID()}@test.local`, sid: randomUUID(), orgId, cohortId, interventionId }
  const b = { uid: `student-b-${randomUUID()}`, email: `b-${randomUUID()}@test.local`, sid: randomUUID(), orgId, cohortId, interventionId }
  return { repos, db, a, b, seededA: seedPerson(db, a), seededB: seedPerson(db, b) }
}

const actorHasher = (uid) => `hash-${uid}`
const cascadeFor = (db, extra = {}) => createErasureCascade({
  isDbConfigured: () => false, memoryDb: () => db, ledger: createMemoryLedger(), actorHasher, holdCovering: async () => null, ...extra,
})

// Counts of every collection that mentions the person (by id or email, or,
// with `sessions`, by their session id).
function footprint(db, p, { sessions = true } = {}) {
  const json = (v) => JSON.stringify(v)
  const hits = {}
  const scan = (name, rows) => { hits[name] = [...rows].filter((r) => json(r).includes(p.uid) || json(r).includes(p.email) || (sessions && json(r).includes(p.sid))).length }
  for (const [name, v] of Object.entries(db)) {
    if (v instanceof Map) scan(name, v.values())
    else if (Array.isArray(v)) scan(name, v)
  }
  return hits
}

test('memory path: every campus row of the person is deleted or pseudonymised; nothing of theirs remains readable', async () => {
  const { db, a, b, seededA } = world()
  const beforeB = footprint(db, b)
  const receipt = await cascadeFor(db).run({ userId: a.uid, email: a.email })
  assert.equal(receipt.status, 'COMPLETED')
  assert.equal(receipt.sessionCount, 1)
  // Nothing anywhere mentions the account id or email any more.
  for (const [name, n] of Object.entries(footprint(db, a, { sessions: false }))) assert.equal(n, 0, `${name} still mentions the erased student`)
  // The opaque session id survives only where the registry RETAINs it: the
  // erasure tombstone, the billing ledger, and the scrubbed version/request a
  // reviewer decision still references.
  for (const [name, n] of Object.entries(footprint(db, a))) {
    if (['erasureMarkers', 'consumptions', 'reportVersions', 'reportReviewRequests'].includes(name)) continue
    assert.equal(n, 0, `${name} still mentions the erased session`)
  }
  assert.ok(![...db.consumptions].some((x) => x.userId === a.uid || String(x.idempotencyKey).includes(a.uid)), 'ledger rows are pseudonymised')
  const pseudo = pseudonymFor(a.uid)
  assert.equal(db.consumptions.filter((x) => x.userId === pseudo).length, 1, 'the seat event stays (billing evidence) under the pseudonym')
  assert.ok(Object.isFrozen(db.consumptions.find((x) => x.userId === pseudo)), 'append-only rows stay frozen')
  assert.equal([...db.entitlements.values()].filter((e) => e.userId === pseudo && e.status === 'REVOKED').length, 1, 'a ledgered entitlement is kept, pseudonymised and revoked')
  assert.equal(db.orgAudit.filter((e) => e.actorUserId === pseudo).length, 1, 'audit actor pseudonymised, event kept')
  assert.equal(db.orgAudit.filter((e) => e.targetId === pseudo).length, 1, 'audit target pseudonymised, event kept')
  assert.equal(db.dataAccessEvents.filter((e) => e.subjectUserId === pseudo).length, 2)
  const kept = db.reportReviewRequests.filter((r) => r.userId === pseudo)
  const decisionOf = (r) => db.reportReviewDecisions.find((d) => d.reviewId === r.id)
  assert.equal(decisionOf(kept[0]).reason, ERASED_TEXT, 'the reviewer text about the erased report is replaced')
  assert.ok(Object.isFrozen(decisionOf(kept[0])), 'the decision row stays append-only')
  assert.equal(db.reportReviewDecisions.filter((d) => d.reason === 'Learner quote reviewed and upheld').length, 1, 'the other student\'s decision is untouched')
  assert.equal(kept.length, 1, 'a reviewed request stays pseudonymised; the undecided one is deleted')
  assert.equal(kept[0].reason, ERASED_TEXT)
  assert.deepEqual(db.reportVersions.filter((v) => v.contentHash === 'erased:v1').map((v) => v.report), [{ erased: true }], 'the referenced report version is scrubbed, not kept readable')
  assert.equal(db.ratingItems.has(seededA.unrated), false, 'an unrated queue item is deleted')
  const shell = db.ratingItems.get(seededA.rated)
  assert.equal(shell.excerpt, ERASED_TEXT, 'a rated queue item is detached and emptied')
  assert.notEqual(shell.sessionRef, sessionRef(a.sid))
  assert.equal(db.unitRatings.filter((r) => r.itemId === seededA.rated).length, 1, 'append-only ratings survive')
  assert.equal(db.erasureMarkers.has(a.sid), true)
  assert.equal([...db.productGrants.values()].filter((g) => g.userId === pseudo).length, 1, 'finance grant pseudonymised, not deleted')
  assert.equal(db.productEvents.filter((e) => e.actorHash === `hash-${a.uid}`).length, 0)
  // Another student is untouched.
  assert.deepEqual(footprint(db, b), beforeB, 'the other student\'s rows are untouched')
})

test('memory path: a failure mid-run leaves a FAILED ledger run; rerunning resumes and completes without repeating done steps', async () => {
  const { db, a } = world()
  const ledger = createMemoryLedger()
  const calls = []
  let fail = true
  const cascade = cascadeFor(db, {
    ledger,
    beforeStep: async (step) => {
      calls.push(step)
      if (step === 'campus_user' && fail) { fail = false; throw new Error('synthetic interruption') }
    },
  })
  await assert.rejects(cascade.run({ userId: a.uid, email: a.email }), /synthetic interruption/)
  const [run] = [...ledger.runs.values()]
  assert.equal(run.status, 'FAILED')
  assert.equal(run.subjectRef, subjectRef(a.uid))
  assert.ok(!JSON.stringify([...ledger.runs.values()].map((r) => ({ ...r, steps: [...r.steps.entries()] }))).includes(a.uid), 'the ledger never stores the account id')
  assert.equal(db.memberships.size, 2, 'the account step had not run yet')
  const sessionSteps = calls.filter((s) => s.startsWith('session:'))
  assert.equal(sessionSteps.length, 1)
  const receipt = await cascade.run({ userId: a.uid, email: a.email })
  assert.equal(receipt.status, 'COMPLETED')
  assert.equal(receipt.resumed, true)
  assert.equal(receipt.runId, run.id, 'the same run is resumed')
  assert.equal(calls.filter((s) => s === sessionSteps[0]).length, 1, 'the finished session step is not repeated')
  assert.equal(run.status, 'COMPLETED')
  assert.equal(run.pending, null, 'the work list is cleared on completion')
  assert.equal([...db.memberships.values()].filter((m) => m.userId === a.uid).length, 0)
})

test('memory path: an active legal hold blocks erasure and touches nothing', async () => {
  const { db, a } = world()
  const before = footprint(db, a)
  const ledger = createMemoryLedger()
  await assert.rejects(
    cascadeFor(db, { ledger, holdCovering: async ({ candidateRefs }) => (candidateRefs.includes(a.uid) ? { hold_id: 'hold-1' } : null) }).run({ userId: a.uid, email: a.email }),
    { code: 'LEGAL_HOLD_ACTIVE' },
  )
  assert.deepEqual(footprint(db, a), before)
  assert.equal(ledger.runs.size, 0, 'no run is opened under a hold')
})

test('JSON v1 store: sessions, entitlements and reports of the person are erased; the payment redemption is detached; others untouched', async () => {
  const uid = `json-${randomUUID()}`
  const other = `json-other-${randomUUID()}`
  const [sid, unstarted, otherSid] = [randomUUID(), randomUUID(), randomUUID()]
  await store.createSession(sid, { userId: uid, userEmail: 'x@test.local', scenarioId: 's' })
  await store.saveReport(sid, { userId: uid, overall: 50 })
  await store.redeemPayment({ paymentId: `pay_${randomUUID()}`, orderId: 'o', sessionId: unstarted, amount: 1, userId: uid, userEmail: 'x@test.local' })
  await store.createSession(otherSid, { userId: other, scenarioId: 's' })
  const db = createMemoryCampusRepos({ clock: CLOCK }).db
  const receipt = await cascadeFor(db).run({ userId: uid, email: 'x@test.local' })
  assert.equal(receipt.sessionCount, 2, 'the unstarted paid entitlement is part of the erasure')
  assert.equal(await store.getSession(sid), null)
  assert.equal(await store.getReport(sid), null)
  assert.equal(await store.getEntitlement(unstarted), null)
  assert.deepEqual(await store.getSessionIdsByUser(uid), [])
  assert.deepEqual(await store.listEntitlementsByUser(uid), [])
  assert.notEqual(await store.getSession(otherSid), null)
  assert.equal(await store.detachPaymentRedemptionsForUser(uid), 0, 'nothing left to detach')
})

test('DELETE /api/assessment/candidate-data runs the cascade (memory campus store); signed out → 401; legal hold → 409', async () => {
  const repos = createMemoryCampusRepos({ clock: CLOCK })
  const campus = createCampusContext({ repos, clock: CLOCK })
  let held = false
  const cascade = createErasureCascade({ isDbConfigured: () => false, memoryDb: () => repos.db, ledger: createMemoryLedger(), holdCovering: async () => (held ? { hold_id: 'h' } : null) })
  const app = buildApp({ campus, erasureCascade: cascade })
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const record = await userDb.createUser({ email: `erase-${randomUUID()}@test.local`, name: 'Synthetic', passwordHash: 'x', ageDeclaration: { version: 'test', at: CLOCK().toISOString() } })
    const token = jwt.sign({ sub: record.id, email: record.email, tv: 0 }, process.env.JWT_SECRET)
    const p = { uid: record.id, email: record.email, sid: randomUUID(), orgId: randomUUID(), cohortId: randomUUID(), interventionId: randomUUID() }
    seedPerson(repos.db, p)
    await store.createSession(p.sid, { userId: record.id, scenarioId: 's' })

    const anon = await fetch(`${base}/api/assessment/candidate-data`, { method: 'DELETE' })
    assert.equal(anon.status, 401)
    assert.deepEqual(await anon.json(), { error: 'Sign in to erase your data.' })

    held = true
    const blocked = await fetch(`${base}/api/assessment/candidate-data`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    assert.equal(blocked.status, 409)
    assert.equal((await blocked.json()).code, 'LEGAL_HOLD_ACTIVE')
    assert.notEqual(await store.getSession(p.sid), null, 'nothing erased under a hold')

    held = false
    const res = await fetch(`${base}/api/assessment/candidate-data`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.erasedSessions, 1)
    assert.equal(body.results[0].sessionId, p.sid)
    assert.equal(body.erasure.status, 'COMPLETED')
    assert.equal(await store.getSession(p.sid), null)
    assert.equal([...repos.db.memberships.values()].filter((m) => m.userId === record.id).length, 0, 'campus membership erased')
    assert.equal(repos.db.preferences.has(record.id), false)
    assert.notEqual(await userDb.findUserById(record.id), null, 'self-service data erasure keeps the login (P24)')
  } finally {
    server.close()
  }
})

test('leaving a cohort or the organization removes intervention memberships (memory repos)', async () => {
  const { repos, db, a, b, seededA } = world()
  const admin = repos.campusAdmin
  assert.equal(db.interventionMembers.has(`${a.interventionId}:${a.uid}`), true)
  await admin.removeCohortMember(a.cohortId, a.uid)
  assert.equal(db.interventionMembers.has(`${a.interventionId}:${a.uid}`), false, 'cohort exit ends the intervention membership')
  assert.equal(db.interventionMembers.has(`${b.interventionId}:${b.uid}`), true, 'other members stay')
  db.interventionMembers.set(`${a.interventionId}:${a.uid}`, { interventionId: a.interventionId, userId: a.uid })
  await admin.setMembershipStatus(seededA.mid, 'REMOVED')
  assert.equal(db.interventionMembers.has(`${a.interventionId}:${a.uid}`), false, 'organization exit ends the intervention membership')
  assert.equal(db.interventionMembers.has(`${b.interventionId}:${b.uid}`), true)
})

test('memory erasure is idempotent: a second pass changes nothing', async () => {
  const { db, a } = world()
  const ctx = { uid: a.uid, pseudo: pseudonymFor(a.uid), email: a.email, actorHash: `hash-${a.uid}` }
  eraseUserFromMemoryDb(db, ctx)
  const snapshot = JSON.stringify([...Object.entries(db)].filter(([, v]) => v instanceof Map || Array.isArray(v)).map(([k, v]) => [k, v instanceof Map ? [...v.entries()] : v]))
  eraseUserFromMemoryDb(db, ctx)
  const again = JSON.stringify([...Object.entries(db)].filter(([, v]) => v instanceof Map || Array.isArray(v)).map(([k, v]) => [k, v instanceof Map ? [...v.entries()] : v]))
  assert.equal(again, snapshot)
})
