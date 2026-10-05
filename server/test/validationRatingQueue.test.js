// C12.01 — blinded human double-rating of V3 evidence units: identity-free
// items (candidate words only, name tokenised, contact details stripped, ids
// hashed), the AI level never shown, two independent raters per item, the
// IRR training gate enforced, append-only ratings, descriptive agreement that
// fails closed and never unlocks a claim. Synthetic sessions and people only.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ratingItemFrom, pickNext, blindedView } from '../domain/validation/ratingQueue.js'
import { agreementReport } from '../domain/validation/agreement.js'
import { createValidationRaterRouter } from '../routes/validation.js'
import { createValidationAdminRouter } from '../routes/admin/validation.js'
import { createValidationService } from '../domain/validation/service.js'
import { ROLES } from '../lib/adminRbac.js'
import { methodHash } from '../domain/assessments/frozenMethod.js'

const NAME = 'Asha Synthetic'
const unit = (i, over = {}) => ({
  evidence_id: `evid-syn-${i}`, session_id: 'sess-syn-rating', capability_id: 'CAP-L1-REASONING', source_type: 'DIALOGUE_TURN',
  candidate_action_json: { dialogue_excerpt: `I, Asha, would first check the refund data (asha.synthetic@test.local, +91 98765 43210) before deciding ${i}.` },
  observable_behavior: 'AI description that must never reach a rater', rubric_level: 3, evidence_status: 'PROVISIONAL', legacy_row: false, ...over,
})

test('rating items: candidate words only, identity tokenised, contact details stripped, ids hashed; skips fail closed', () => {
  const { item } = ratingItemFrom(unit(1), { candidateName: NAME, salt: 's', enqueuedBy: 'admin:x' })
  assert.match(item.excerpt, /^I, \{\{candidate\}\}, would first check the refund data \(\[email\], \[number\]\)/)
  assert.ok(!/Asha|asha|98765|test\.local/.test(item.excerpt))
  assert.ok(!item.excerpt.includes('AI description'), 'the AI\'s reading never anchors the rater')
  assert.match(item.evidenceRef, /^[0-9a-f]{64}$/)
  assert.match(item.sessionRef, /^[0-9a-f]{64}$/)
  assert.ok(!JSON.stringify(item).includes('evid-syn-1') && !JSON.stringify(item).includes('sess-syn-rating'))
  assert.equal(item.aiLevel, 3)
  const view = blindedView({ ...item, id: 'i1' })
  assert.deepEqual(Object.keys(view).sort(), ['candidateToken', 'capabilityId', 'capabilityName', 'excerpt', 'itemId', 'rubricVersion', 'scale', 'sourceType'])
  for (const [u, reason] of [
    [unit(2, { legacy_row: true }), 'LEGACY_ROW'],
    [unit(3, { source_type: 'HUMAN_RATING' }), 'NOT_RATABLE_SOURCE'],
    [unit(4, { candidate_action_json: null }), 'NO_CANDIDATE_WORDS'],
    [unit(5, { candidate_action_json: { dialogue_excerpt: '   ' } }), 'NO_CANDIDATE_WORDS'],
  ]) assert.equal(ratingItemFrom(u, { candidateName: NAME, salt: 's', enqueuedBy: 'x' }).skip, reason)
})

test('queue order: two different raters per item, half-rated items first, never the same item twice', () => {
  const items = [{ id: 'a', createdAt: '1' }, { id: 'b', createdAt: '2' }]
  assert.equal(pickNext(items, [], 'r1').id, 'a')
  const ratings = [{ itemId: 'b', raterId: 'r1' }]
  assert.equal(pickNext(items, ratings, 'r2').id, 'b', 'complete the open pair first')
  assert.equal(pickNext(items, ratings, 'r1').id, 'a', 'r1 never rates b twice')
  assert.equal(pickNext(items, [...ratings, { itemId: 'b', raterId: 'r2' }, { itemId: 'a', raterId: 'r3' }, { itemId: 'a', raterId: 'r4' }], 'r5'), null)
})

test('frozen-method items retain all anchors and action-time work context without exposing the model reading or identity', () => {
  const anchors = { 1: 'No question.', 2: 'Noticed uncertainty.', 3: 'Asked a relevant question.', 4: 'Explained the consequence.', 5: 'Bounded the next check.' }
  const provenance = {
    methodHash: 'synthetic-method-hash',
    resolvedRubric: { ref: 'synthetic-rubric-A', behaviourId: 'QUESTION_ASSUMPTION', anchors, anchorsHash: methodHash(anchors), contentHash: 'synthetic-rubric-hash' },
    evaluationContext: {
      situation: { applicableFacts: ['Asha Synthetic received a request at asha.synthetic@test.local.'] },
      stimulus: { messages: [{ speaker: 'Synthetic colleague', content: 'Which task will you take?' }] },
      workState: {
        before: { rows: [{ rowId: 'R1', task: 'Fixture work', owner: null, status: 'PLANNED' }] },
        after: { rows: [{ rowId: 'R1', task: 'Fixture work', owner: null, status: 'PLANNED' }], 'R1.owner': 'Sam', 'R1.status': 'PLANNED' },
      },
    },
  }
  const { item } = ratingItemFrom(unit(10, { source_type: 'WORK_ARTIFACT', provenance_json: provenance }), { candidateName: NAME, salt: 's', enqueuedBy: 'synthetic' })
  assert.equal(item.rubricVersion, 'synthetic-rubric-A')
  const view = blindedView({ ...item, id: 'synthetic-item' })
  assert.deepEqual(view.sourceMethod.anchors, anchors)
  assert.deepEqual(view.sourceMethod.workChanges, [{ rowId: 'R1', task: 'Fixture work', field: 'owner', before: null, after: 'Sam' }])
  assert.ok(!JSON.stringify(view).includes('AI description') && !JSON.stringify(view).includes('asha.synthetic@test.local'))
  assert.ok(!('aiLevel' in view) && !('aiLevel' in view.sourceMethod))
  provenance.resolvedRubric.anchors[3] = 'Corrupted current rubric.'
  assert.equal(ratingItemFrom(unit(11, { provenance_json: provenance }), { salt: 's' }).skip, 'PINNED_METHOD_UNAVAILABLE')
})

test('agreement: no coefficient below the minimum; perfect pairs give 1; claims stay PENDING', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, capabilityId: 'CAP-L1-REASONING', aiLevel: (i % 5) + 1 }))
  const r = (i, rater, level, t) => ({ id: `${rater}${i}`, itemId: `i${i}`, raterId: rater, level, cannotRate: false, createdAt: t })
  const few = agreementReport(items.slice(0, 29), items.slice(0, 29).flatMap((it, i) => [r(i, 'a', it.aiLevel, '1'), r(i, 'b', it.aiLevel, '2')]))
  assert.deepEqual([few.capabilities[0].humanHuman.kappa, few.capabilities[0].humanHuman.status], [null, 'INSUFFICIENT_DATA'])
  const all = agreementReport(items, items.flatMap((it, i) => [r(i, 'a', it.aiLevel, '1'), r(i, 'b', it.aiLevel, '2')]))
  assert.deepEqual([all.capabilities[0].humanHuman.kappa, all.capabilities[0].humanAi.kappa, all.claimStatus], [1, 1, 'PENDING'])
  const unsure = agreementReport(items, items.map((it, i) => ({ ...r(i, 'a', null, '1'), cannotRate: true })))
  assert.equal(unsure.capabilities[0].humanAi.pairs, 0, '"cannot rate" never counts')
})

test('enqueue fails closed: an identity lookup error, an unknown identity or a held session queues nothing', async () => {
  const repos = createMemoryCampusRepos()
  const evidence = { units: async () => [unit(1), unit(2)] }
  const svc = (over) => createValidationService({ repos, evidence, candidateNameFor: async () => NAME, ...over })
  await assert.rejects(svc({ candidateNameFor: async () => { throw new Error('user store down') } }).enqueueSession('sess-syn-rating', { enqueuedBy: 'x' }), /user store down/)
  await assert.rejects(svc({ candidateNameFor: async () => null }).enqueueSession('sess-syn-rating', { enqueuedBy: 'x' }), (e) => e.code === 'CONFLICT')
  await assert.rejects(svc({ sessionState: async () => ({ invalid: true }) }).enqueueSession('sess-syn-rating', { enqueuedBy: 'x' }), (e) => e.code === 'CONFLICT')
  await assert.rejects(svc({ sessionState: async () => ({ invalid: false, reviewState: 'held' }) }).enqueueSession('sess-syn-rating', { enqueuedBy: 'x' }), (e) => e.code === 'CONFLICT')
  assert.equal((await repos.validation.listItems()).length, 0, 'nothing reached the queue')
  assert.equal((await svc({}).enqueueSession('sess-syn-rating', { enqueuedBy: 'x' })).enqueued, 2)
})

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => new Date('2026-10-20T09:00:00Z') })
  const units = Array.from({ length: 3 }, (_, i) => unit(i))
  const campus = createCampusContext({
    repos, audit: () => {},
    evidence: { units: async (sid) => (sid === 'sess-syn-rating' ? [...units, unit(9, { legacy_row: true })] : []) },
    legacy: { getSession: async () => ({ userId: 'user-syn' }) },
    users: { findById: async () => ({ id: 'user-syn', name: NAME, email: 'asha.synthetic@test.local' }), findByEmail: async () => null },
  })
  const raters = { 'tok-a': { id: 'rater-a', status: 'qualified' }, 'tok-b': { id: 'rater-b', status: 'qualified' }, 'tok-c': { id: 'rater-c', status: 'qualified' }, 'tok-t': { id: 'rater-t', status: 'training' } }
  const audits = []
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const role = req.get('x-admin-role')
    if (role) req.admin = { id: `admin-${role}`, permissions: new Set(ROLES[role].permissions) }
    next()
  })
  app.use('/api/validation', createValidationRaterRouter({ campus, resolveRater: async (t) => raters[t] || null }))
  app.use('/api/admin/validation', createValidationAdminRouter({ campus, audit: async (_req, e) => { audits.push(e) } }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const call = async (method, path, { token, role, body } = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { ...(token ? { 'x-rater-token': token } : {}), ...(role ? { 'x-admin-role': role } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  return { repos, audits, call, close: () => server.close() }
}

test('rating queue API: dark by flag, staff queue identity-free items, qualified raters rate blind, ratings append-only', async () => {
  const w = await world()
  try {
    process.env.PRISM_V3_RATING_QUEUE = 'false'
    assert.equal((await w.call('GET', '/validation/rater/next', { token: 'tok-a' })).status, 404)
    assert.equal((await w.call('POST', '/admin/validation/enqueue', { role: 'psychometric_admin', body: { sessionId: 'sess-syn-rating', reason: 'Synthetic rating batch' } })).status, 404)
    process.env.PRISM_V3_RATING_QUEUE = 'true'

    assert.equal((await w.call('POST', '/admin/validation/enqueue', { role: 'product_admin', body: { sessionId: 'sess-syn-rating', reason: 'Synthetic rating batch' } })).status, 403)
    assert.equal((await w.call('POST', '/admin/validation/enqueue', { role: 'psychometric_admin', body: { sessionId: 'sess-syn-rating', reason: 'short' } })).status, 400)
    const q = await w.call('POST', '/admin/validation/enqueue', { role: 'psychometric_admin', body: { sessionId: 'sess-syn-rating', reason: 'Synthetic rating batch' } })
    assert.deepEqual([q.status, q.body.enqueued, q.body.skipped], [200, 3, { LEGACY_ROW: 1 }])
    assert.equal((await w.call('POST', '/admin/validation/enqueue', { role: 'psychometric_admin', body: { sessionId: 'sess-syn-rating', reason: 'Synthetic rating batch' } })).body.alreadyQueued, 3, 'queued once per unit')
    assert.equal(w.audits[0].action, 'evidence_rating_enqueued')
    assert.equal((await w.call('POST', '/admin/validation/enqueue', { role: 'psychometric_admin', body: { sessionId: 'sess-none', reason: 'Synthetic rating batch' } })).status, 404)

    assert.equal((await w.call('GET', '/validation/rater/next')).status, 401)
    assert.equal((await w.call('GET', '/validation/rater/next', { token: 'nope' })).status, 401)
    const training = await w.call('GET', '/validation/rater/next', { token: 'tok-t' })
    assert.deepEqual([training.status, training.body.code], [403, 'RATER_NOT_QUALIFIED'])

    const a = (await w.call('GET', '/validation/rater/next', { token: 'tok-a' })).body.item
    const text = JSON.stringify(a)
    assert.ok(!/aiLevel|aiStatus|evidenceRef|sessionRef|Asha|asha|sess-syn|evid-syn|user-syn/.test(text), `blinded: ${text}`)
    assert.equal(a.capabilityName !== undefined, true)
    assert.equal((await w.call('POST', `/validation/rater/items/${a.itemId}`, { token: 'tok-a', body: { level: 7 } })).status, 400)
    assert.equal((await w.call('POST', `/validation/rater/items/${a.itemId}`, { token: 'tok-a', body: { level: 3, cannotRate: true } })).status, 400)
    assert.equal((await w.call('POST', `/validation/rater/items/${a.itemId}`, { token: 'tok-a', body: { level: 4 } })).status, 201)
    assert.equal((await w.call('POST', `/validation/rater/items/${a.itemId}`, { token: 'tok-a', body: { level: 2 } })).status, 409, 'one rating per rater per item')
    assert.equal((await w.call('GET', '/validation/rater/next', { token: 'tok-b' })).body.item.itemId, a.itemId, 'the second rater completes the pair first')
    assert.equal((await w.call('POST', `/validation/rater/items/${a.itemId}`, { token: 'tok-b', body: { cannotRate: true } })).status, 201)
    assert.equal((await w.call('POST', `/validation/rater/items/${a.itemId}`, { token: 'tok-c', body: { level: 3 } })).status, 409, 'two ratings per item')
    assert.notEqual((await w.call('GET', '/validation/rater/next', { token: 'tok-a' })).body.item.itemId, a.itemId)
    assert.throws(() => { w.repos.db.unitRatings[0].level = 1 }, TypeError, 'ratings are immutable')

    assert.deepEqual((await w.call('GET', '/admin/validation/summary', { role: 'psychometric_admin' })).body, { items: 3, doubleRated: 1, singleRated: 0, unrated: 2 })
    const ag = await w.call('GET', '/admin/validation/agreement', { role: 'auditor' })
    assert.deepEqual([ag.status, ag.body.claimStatus, ag.body.capabilities[0].humanHuman.kappa], [200, 'PENDING', null])
  } finally {
    delete process.env.PRISM_V3_RATING_QUEUE
    w.close()
  }
})
