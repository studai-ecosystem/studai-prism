// P8.3 — the free first experience is honest: the public scene carries no
// rubric or opportunity list; the observation is deterministic and quotes the
// learner's own sentence; exactly one retry; the claim token is scoped, signed,
// expiring and never logged; synthetic rows never emit product events.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { previewScene, observe, mintPreviewToken, verifyPreviewToken, hashToken, createPreviewService, PREVIEW_MAX_ATTEMPTS } from '../domain/commerce/preview.js'
import { DRAFT_CORE_TEAMREADY_A_HANDOVER } from '../domain/assessments/draftSegments.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { createV1Router } from '../routes/v1/index.js'
import { ApiError } from '../domain/http/errors.js'
import logger from '../lib/logger.js'

process.env.JWT_SECRET ||= 'preview-test-secret'
const NOW = new Date('2026-10-01T10:00:00Z')

const GOOD = 'Dev, before you go: Nia, can you take the invitation list by Tuesday? I will finalise and print the handouts on Thursday morning. Is there anything else I need to know about the room?'
const WEAK = 'Thanks everyone. Good luck with the workshop.'

test('P8.3: the public scene is briefing + one prompt; no rubric, opportunities, behaviour ids or conditional facts leak', () => {
  const scene = previewScene()
  assert.equal(scene.mode, 'PRACTICE')
  assert.equal(scene.contentStatus, 'DRAFT')
  assert.ok(scene.prompt.length > 20)
  assert.equal(scene.limits.attempts, 2)
  const text = JSON.stringify(scene)
  for (const banned of ['rubric', 'OPP-', 'BEH-', 'opportunit', 'behaviourId', 'revealWhen', 'conditionalFacts', 'knownLimitations', 'can take at most one extra task']) {
    assert.ok(!text.includes(banned), `scene leaks ${banned}`)
  }
  for (const fact of DRAFT_CORE_TEAMREADY_A_HANDOVER.publicFacts) assert.ok(scene.briefing.facts.includes(fact))
  assert.deepEqual(scene.briefing.participants.map((p) => p.name), ['Dev', 'Nia'])
  assert.ok(/not a formal assessment/i.test(scene.notice))
})

test('P8.3: the observation is deterministic, quotes the learner\u2019s own sentence, and says what was not found otherwise', () => {
  const a = observe(GOOD)
  const b = observe(GOOD)
  assert.deepEqual(a, b, 'same input → same observation')
  assert.equal(a.kind, 'OBSERVED')
  assert.ok(GOOD.includes(a.quote), 'the quote is the learner\u2019s own sentence')
  assert.ok(a.label && a.why && a.nextBehaviour)
  assert.ok(!('score' in a) && !('level' in a) && !('band' in a))
  const miss = observe(WEAK)
  assert.equal(miss.kind, 'NOT_FOUND')
  assert.equal(miss.quote, null)
  assert.match(miss.message, /We could not find .* in your reply \u2014 try again\./)
  assert.throws(() => observe('   '), (e) => e instanceof ApiError && e.code === 'VALIDATION_FAILED')
  assert.throws(() => observe('x'.repeat(1501)), (e) => e.code === 'VALIDATION_FAILED')
})

test('P8.3: the preview token is scoped to one attempt, signed, and expires after one hour', () => {
  const id = '11111111-2222-4333-8444-555555555555'
  const { token, expiresAt } = mintPreviewToken(id, NOW)
  assert.equal(expiresAt, new Date(NOW.getTime() + 3600000).toISOString())
  assert.deepEqual(verifyPreviewToken(token, NOW), { id, expiresAt })
  assert.throws(() => verifyPreviewToken(token, new Date(NOW.getTime() + 3600000)), (e) => e.status === 410)
  const [tid, exp, sig] = token.split('.')
  assert.throws(() => verifyPreviewToken(`${tid}.${Number(exp) + 99999}.${sig}`, NOW), (e) => e.code === 'VALIDATION_FAILED', 'extending expiry breaks the signature')
  assert.throws(() => verifyPreviewToken(`22222222-2222-4333-8444-555555555555.${exp}.${sig}`, NOW), (e) => e.code === 'VALIDATION_FAILED', 'another attempt id breaks the signature')
  assert.throws(() => verifyPreviewToken('nonsense', NOW), (e) => e.code === 'VALIDATION_FAILED')
  assert.notEqual(hashToken(token), token)
})

function service({ synthetic = false, clock } = {}) {
  let now = NOW
  const repos = createMemoryCampusRepos({ clock: () => now })
  const events = []
  const telemetry = { record: async (e) => { events.push(e) } }
  const svc = createPreviewService({ repos, clock: clock || (() => now), telemetry, synthetic: () => synthetic })
  return { repos, svc, events, setNow: (d) => { now = d } }
}

test('P8.3: one answer, one retry, then ALLOWANCE_EXHAUSTED; the stored row holds a hash, not the token', async () => {
  const { repos, svc, events } = service()
  const first = await svc.start({ answer: WEAK })
  assert.equal(first.attemptsUsed, 1)
  assert.equal(first.attemptsRemaining, 1)
  assert.equal(first.observation.kind, 'NOT_FOUND')
  const row = await repos.commerce.getPreviewAttempt(first.previewToken.split('.')[0])
  assert.equal(row.tokenHash, hashToken(first.previewToken))
  assert.ok(!JSON.stringify(row).includes(first.previewToken))
  assert.equal(row.isSynthetic, false)
  const second = await svc.retry({ previewToken: first.previewToken, answer: GOOD })
  assert.equal(second.attemptsUsed, PREVIEW_MAX_ATTEMPTS)
  assert.equal(second.attemptsRemaining, 0)
  assert.equal(second.observation.kind, 'OBSERVED')
  await assert.rejects(svc.retry({ previewToken: first.previewToken, answer: GOOD }), (e) => e.code === 'ALLOWANCE_EXHAUSTED')
  const read = await svc.read({ previewToken: first.previewToken })
  assert.equal(read.observation.kind, 'OBSERVED')
  // Real preview use emits an event with outcome/count only — never text.
  assert.equal(events.length, 2)
  for (const e of events) {
    assert.equal(e.event, 'preview_completed')
    assert.equal(e.user, null)
    assert.ok(!JSON.stringify(e).includes('Nia'))
    assert.deepEqual(Object.keys(e.props).sort(), ['count', 'outcome'])
  }
})

test('P8.3: synthetic previews are flagged and never emit product events', async () => {
  const { repos, svc, events } = service({ synthetic: true })
  const r = await svc.start({ answer: GOOD })
  assert.equal((await repos.commerce.getPreviewAttempt(r.previewToken.split('.')[0])).isSynthetic, true)
  assert.equal(events.length, 0)
})

test('P8.3: claiming is explicit and verified; idempotent for the same account; refused for another; expired tokens are gone', async () => {
  const { repos, svc, setNow } = service()
  const r = await svc.start({ answer: GOOD })
  await assert.rejects(svc.claim({ previewToken: r.previewToken, user: null }), (e) => e.code === 'UNAUTHENTICATED')
  const claimed = await svc.claim({ previewToken: r.previewToken, user: { id: 'u-1' } })
  assert.equal(claimed.claimed, true)
  assert.equal(claimed.alreadyClaimed, false)
  const again = await svc.claim({ previewToken: r.previewToken, user: { id: 'u-1' } })
  assert.equal(again.alreadyClaimed, true)
  await assert.rejects(svc.claim({ previewToken: r.previewToken, user: { id: 'u-2' } }), (e) => e.code === 'CONFLICT')
  assert.equal((await svc.listForUser({ id: 'u-1' })).length, 1)
  assert.equal((await svc.listForUser({ id: 'u-2' })).length, 0)
  // Unclaimed previews expire with the token and are purged; claimed ones stay.
  const r2 = await svc.start({ answer: GOOD })
  setNow(new Date(NOW.getTime() + 3600001))
  await assert.rejects(svc.read({ previewToken: r2.previewToken }), (e) => e.status === 410)
  assert.equal(await svc.purgeExpired(), 1)
  assert.equal(await repos.commerce.getPreviewAttempt(r2.previewToken.split('.')[0]), null)
  assert.ok(await repos.commerce.getPreviewAttempt(r.previewToken.split('.')[0]))
})

test('P8.3: over /api/v1 the preview is public, the claim needs sign-in, and the token never reaches the log', async () => {
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const audits = []
  const campus = createCampusContext({ repos, clock: () => NOW, audit: (type, sid, payload) => audits.push({ type, sid, payload }) })
  const requireUser = (req, _res, next) => { const id = req.get('x-test-user'); if (!id) return next(new ApiError('UNAUTHENTICATED', 'Sign in.')); req.user = { id, email: `${id}@test.local` }; next() }
  const logged = []
  const spies = ['info', 'warn', 'error', 'debug'].map((level) => {
    const original = logger[level]
    logger[level] = (...args) => { logged.push(JSON.stringify(args)); return original?.apply(logger, args) }
    return () => { logger[level] = original }
  })
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = async (method, path, body, who) => {
    const res = await fetch(`${base}${path}`, { method, headers: { ...(who ? { 'x-test-user': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  try {
    const scene = await call('GET', '/preview/scene')
    assert.equal(scene.status, 200)
    assert.ok(!JSON.stringify(scene.body).includes('rubric'))
    assert.equal((await call('POST', '/preview/attempts', { answer: '' })).status, 422)
    const started = await call('POST', '/preview/attempts', { answer: GOOD })
    assert.equal(started.status, 201)
    const token = started.body.data.previewToken
    assert.ok(token)
    assert.equal((await call('POST', '/preview/attempts/retry', { previewToken: token, answer: WEAK })).status, 200)
    assert.equal((await call('POST', '/preview/attempts/retry', { previewToken: token, answer: WEAK })).status, 409)
    assert.equal((await call('POST', '/preview/claim', { previewToken: token })).status, 401)
    const claimed = await call('POST', '/preview/claim', { previewToken: token }, 'user-p')
    assert.equal(claimed.status, 200)
    assert.equal(claimed.body.data.claimed, true)
    assert.equal((await call('POST', '/preview/claim', { previewToken: token }, 'user-q')).status, 409)
    assert.equal((await call('GET', '/me/previews', null, 'user-p')).body.data.items.length, 1)
    assert.equal((await call('GET', '/me/previews', null)).status, 401)
    assert.ok(audits.some((a) => a.type === 'preview.claimed'))
    assert.ok(!logged.some((l) => l.includes(token)), 'the preview token never reaches the log')
    assert.ok(!JSON.stringify(audits).includes(token), 'nor the audit trail')
    assert.ok(!JSON.stringify(audits).includes('Nia'), 'nor the answer text')
  } finally {
    for (const restore of spies) restore()
    server.close()
  }
})
