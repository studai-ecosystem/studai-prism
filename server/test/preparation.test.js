// P7 — private preparation, application check-ins and honest history
// (CH-34, CH-35, CH-36; T43, T44, T45, T07) through the real /api/v1 router
// with memory repositories and an injected deterministic AI gateway.
// Proves: dark unless PRISM_PREPARATION_V1; PERSONAL only (campus student
// workspace → NOT_FOUND); sanitization removes direct identifiers and needs
// confirmation before any model call; turns are stored with their actor and
// a generated suggestion is never a learner turn; finish produces a validated
// card or an explicit error with card null; check-ins are SELF_REPORT;
// history shows separate types; formal/practice stores are untouched; and no
// analytics or report code names the preparation tables.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { HistoryPageSchema } from '../domain/student/history.js'
import { ActionCardSchema, sanitizeIntentText, SITUATION_TYPES } from '../domain/preparation/service.js'
import { ApiError } from '../domain/http/errors.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_PREPARATION_V1 = 'true'

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-10-02T10:00:00Z')
const USERS = {
  student: { id: 'student-p7', email: 'student@test.local', name: 'Synthetic Student' },
  other: { id: 'student-o7', email: 'other@test.local', name: 'Other Student' },
}

const GOOD_CARD = {
  situation: 'You are preparing to negotiate a deadline with a colleague.',
  plan: ['State the constraint.', 'Offer one alternative.', 'Agree ownership and the next check-in.'],
  keyMessage: 'I want a date we can both hold, so here is my constraint.',
  risks: ['They may ask for a detail you have not prepared.'],
  checkpoint: 'Ownership and the next check-in are agreed before the end.',
}

// Deterministic gateway: records every call; behaviour per task is scripted.
function fakeGateway(script = {}) {
  const calls = []
  const complete = async (params, options) => {
    calls.push({ params, options })
    const task = options?.task
    const handler = script[task]
    if (handler instanceof Error) throw handler
    const content = typeof handler === 'function' ? handler(params) : handler
    if (content === undefined) {
      if (task === 'preparation_participant') return { choices: [{ message: { content: 'Before I agree, who owns the next step?' } }] }
      if (task === 'preparation_action_card') return { choices: [{ message: { content: JSON.stringify(GOOD_CARD) } }] }
    }
    return { choices: [{ message: { content } }] }
  }
  return { complete, calls }
}

async function world({ gateway = fakeGateway(), flag = 'true' } = {}) {
  process.env.PRISM_PREPARATION_V1 = flag
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u7', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.student.id, role: 'STUDENT', status: 'ACTIVE' })
  const legacy = { ...EMPTY_LEGACY_SOURCES, listSessionIds: async () => [], adminState: async () => null }
  const campus = createCampusContext({
    repos, campusStoreAvailable: () => true, clock: () => NOW, legacy, audit: () => {},
    scenarioSource: async () => ({ generalScenarios: [], bankScenarios: {} }), evidence: { units: async () => [] },
    preparationComplete: gateway.complete,
  })
  const requireUser = (req, _res, next) => {
    const user = USERS[req.get('x-test-user')]
    if (!user) return next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.'))
    req.user = user
    return next()
  }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = async (who, method, path, body, headers = {}) => {
    const r = await fetch(`${base}${path}`, {
      method, headers: { 'content-type': 'application/json', ...(who ? { 'x-test-user': who } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const campusWs = (await campus.workspaceService.listWorkspaces(USERS.student)).find((w) => w.type === 'CAMPUS_STUDENT')
  return { repos, org, campus, call, gateway, campusWs, close: () => new Promise((r) => server.close(r)) }
}

const INTENT = {
  situationType: 'NEGOTIATE_DEADLINE',
  audience: 'My project lead, reach them at lead@example.com or +91 98765 43210, see https://example.com/brief',
  goal: 'Agree a realistic delivery date without dropping the review step.',
  constraints: 'The vendor cannot start before Monday.',
}

test('P7: dark — flag off → every preparation route is NOT_FOUND', async () => {
  const w = await world({ flag: 'false' })
  try {
    for (const [m, p, b] of [['POST', '/preparation', INTENT], ['GET', '/preparation'], ['GET', '/checkins'], ['POST', '/checkins', { sourceType: 'REPORT', whatTried: 'x', outcome: 'y' }]]) {
      const r = await w.call('student', m, p, b)
      assert.equal(r.status, 404, `${m} ${p}`)
      assert.equal(r.body.error.code, 'NOT_FOUND')
    }
  } finally { await w.close(); process.env.PRISM_PREPARATION_V1 = 'true' }
})

test('P7: sanitization strips emails, phones and links, caps length, and the server fixes mode and scope', () => {
  const s = sanitizeIntentText(INTENT.audience)
  assert.equal(s.changed, true)
  assert.doesNotMatch(s.text, /example\.com|@|98765|https?:/)
  assert.match(s.text, /\[email removed\]/)
  assert.match(s.text, /\[number removed\]/)
  assert.match(s.text, /\[link removed\]/)
  const long = sanitizeIntentText('a'.repeat(5000))
  assert.equal(long.text.length, 2000)
  assert.equal(long.changed, false)
  assert.equal(sanitizeIntentText('plain goal').changed, false)
  assert.ok(SITUATION_TYPES.length === 6)
})

test('P7 (T43, T44): intent → confirm → rehearsal turns with actor → finish → validated card; PERSONAL only', async () => {
  const w = await world()
  try {
    // Intent: a DRAFT that needs confirmation; no model call yet.
    const created = await w.call('student', 'POST', '/preparation', INTENT)
    assert.equal(created.status, 201)
    const { attemptId, sanitizedIntent, needsConfirmation, sanitizedChanged } = created.body.data
    assert.equal(needsConfirmation, true)
    assert.equal(sanitizedChanged, true)
    assert.doesNotMatch(JSON.stringify(sanitizedIntent), /lead@example\.com|98765|https:\/\//)
    assert.equal(w.gateway.calls.length, 0, 'no model call before the learner confirms')

    // Rehearsal cannot start before confirmation.
    const early = await w.call('student', 'POST', `/preparation/${attemptId}/turns`, { text: 'Hello' })
    assert.equal(early.status, 409)

    // A mode/scope the client sends is rejected (strict schema).
    const tamper = await w.call('student', 'POST', '/preparation', { ...INTENT, mode: 'FORMAL' })
    assert.equal(tamper.status, 422)
    const unknownType = await w.call('student', 'POST', '/preparation', { ...INTENT, situationType: 'THERAPY' })
    assert.equal(unknownType.status, 422)

    // Confirm with an edit; the edit is sanitized again.
    const confirmed = await w.call('student', 'POST', `/preparation/${attemptId}/confirm`, { edits: { constraints: 'Vendor starts Monday; call me on 044 2345 6789.' } })
    assert.equal(confirmed.status, 200)
    assert.equal(confirmed.body.data.state, 'REHEARSING')
    assert.equal(confirmed.body.data.mode, 'PREPARATION')
    assert.equal(confirmed.body.data.scope, 'PERSONAL')
    assert.doesNotMatch(confirmed.body.data.intent.constraints, /2345/)
    assert.equal(confirmed.body.data.turns[0].actor, 'SYSTEM')
    const again = await w.call('student', 'POST', `/preparation/${attemptId}/confirm`, {})
    assert.equal(again.status, 409, 'confirm is one-way')

    // Turns: the learner's words are CANDIDATE, the generated reply is AI_PARTICIPANT.
    const t1 = await w.call('student', 'POST', `/preparation/${attemptId}/turns`, { text: 'I need to move the date because the review step cannot be skipped.' })
    assert.equal(t1.status, 201)
    const actors = t1.body.data.turns.map((t) => t.actor)
    assert.deepEqual(actors, ['SYSTEM', 'CANDIDATE', 'AI_PARTICIPANT'])
    assert.equal(t1.body.data.replyError, null)
    const participantCall = w.gateway.calls.find((c) => c.options.task === 'preparation_participant')
    assert.ok(participantCall, 'participant prompt was used')
    const sys = participantCall.params.messages[0].content
    assert.match(sys, /<candidate_transcript>/, 'learner text is delimited as data')
    assert.match(sys, /NOT an assessment/)
    assert.doesNotMatch(sys, /lead@example\.com/, 'redacted intent reaches the model')
    assert.equal(participantCall.params.json_schema, undefined)

    // Finish: card validated and labelled AI assistance; attempt COMPLETED.
    const done = await w.call('student', 'POST', `/preparation/${attemptId}/finish`)
    assert.equal(done.status, 200)
    assert.equal(done.body.data.state, 'COMPLETED')
    assert.equal(done.body.data.cardError, null)
    assert.equal(done.body.data.card.generatedBy, 'AI_ASSISTANCE')
    const { generatedBy: _g, createdAt, ...cardBody } = done.body.data.card
    assert.ok(createdAt)
    assert.ok(ActionCardSchema.safeParse(cardBody).success)
    assert.equal(done.body.data.completedAt, NOW.toISOString())
    // Idempotent and no further model call.
    const callsBefore = w.gateway.calls.length
    const twice = await w.call('student', 'POST', `/preparation/${attemptId}/finish`)
    assert.equal(twice.status, 200)
    assert.equal(w.gateway.calls.length, callsBefore)
    const late = await w.call('student', 'POST', `/preparation/${attemptId}/turns`, { text: 'one more' })
    assert.equal(late.status, 409)

    // Lists and reads: own only.
    const list = await w.call('student', 'GET', '/preparation')
    assert.equal(list.body.data.items.length, 1)
    assert.equal(list.body.data.items[0].mode, 'PREPARATION')
    const foreign = await w.call('other', 'GET', `/preparation/${attemptId}`)
    assert.equal(foreign.status, 404, 'another user cannot read it')
    const bad = await w.call('student', 'GET', '/preparation/not-a-uuid')
    assert.equal(bad.status, 404)

    // Campus student workspace: indistinguishable from a missing route.
    const hdr = { 'x-prism-workspace': w.campusWs.id }
    for (const [m, p, b] of [['GET', '/preparation'], ['GET', `/preparation/${attemptId}`], ['POST', '/preparation', INTENT], ['GET', '/checkins'], ['POST', '/checkins', { sourceType: 'PREPARATION', sourceId: attemptId, whatTried: 'x', outcome: 'y' }]]) {
      const r = await w.call('student', m, p, b, hdr)
      assert.equal(r.status, 404, `campus ${m} ${p}`)
      assert.equal(r.body.error.code, 'NOT_FOUND')
    }

    // Formal and practice stores are untouched by all of this.
    assert.equal(w.repos.db.sessionScopes.size, 0)
    assert.equal((w.repos.db.missionAttempts?.size ?? 0) + (w.repos.db.practiceUnits?.length ?? 0), 0)
    assert.equal(w.repos.db.preparationAttempts.size, 1)
    assert.equal(w.repos.db.preparationAttempts.get(attemptId).workspaceType, 'PERSONAL')
    assert.equal(w.repos.db.preparationAttempts.get(attemptId).mode, 'PREPARATION')
  } finally { await w.close() }
})

test('P7: a failed or invalid card generation leaves card null with an explicit error; nothing is fabricated', async () => {
  const cases = [
    ['preparation_action_card', 'not json at all', 'UNPARSEABLE_OUTPUT'],
    ['preparation_action_card', JSON.stringify({ ...GOOD_CARD, plan: ['only one step'] }), 'UNPARSEABLE_OUTPUT'],
    ['preparation_action_card', JSON.stringify({ ...GOOD_CARD, keyMessage: 'x'.repeat(301) }), 'UNPARSEABLE_OUTPUT'],
    ['preparation_action_card', Object.assign(new Error('boom'), { code: 'PROVIDER_DOWN' }), 'PROVIDER_ERROR'],
  ]
  for (const [task, output, expected] of cases) {
    const w = await world({ gateway: fakeGateway({ [task]: output }) })
    try {
      const { attemptId } = (await w.call('student', 'POST', '/preparation', INTENT)).body.data
      await w.call('student', 'POST', `/preparation/${attemptId}/confirm`, {})
      await w.call('student', 'POST', `/preparation/${attemptId}/turns`, { text: 'I need to move the date.' })
      const done = await w.call('student', 'POST', `/preparation/${attemptId}/finish`)
      assert.equal(done.status, 200)
      assert.equal(done.body.data.state, 'COMPLETED', 'the rehearsal is kept')
      assert.equal(done.body.data.card, null)
      assert.equal(done.body.data.cardError, expected)
      assert.equal(w.repos.db.actionCards.size, 0)
    } finally { await w.close() }
  }
  // No learner turn at all → honest error, no model call for the card.
  const w = await world()
  try {
    const { attemptId } = (await w.call('student', 'POST', '/preparation', INTENT)).body.data
    await w.call('student', 'POST', `/preparation/${attemptId}/confirm`, {})
    const done = await w.call('student', 'POST', `/preparation/${attemptId}/finish`)
    assert.equal(done.body.data.cardError, 'NO_LEARNER_TURNS')
    assert.equal(w.gateway.calls.length, 0)
  } finally { await w.close() }
})

test('P7: a participant failure keeps the learner turn and reports the reason', async () => {
  const w = await world({ gateway: fakeGateway({ preparation_participant: Object.assign(new Error('timeout'), { code: 'TIMEOUT' }) }) })
  try {
    const { attemptId } = (await w.call('student', 'POST', '/preparation', INTENT)).body.data
    await w.call('student', 'POST', `/preparation/${attemptId}/confirm`, {})
    const t = await w.call('student', 'POST', `/preparation/${attemptId}/turns`, { text: 'Can we move the date?' })
    assert.equal(t.status, 201)
    assert.deepEqual(t.body.data.turns.map((x) => x.actor), ['SYSTEM', 'CANDIDATE'])
    assert.equal(t.body.data.replyError, 'TIMEOUT')
  } finally { await w.close() }
})

test('P7 (T45): check-ins are SELF_REPORT, personal, sanitized and listable; a foreign preparation source is NOT_FOUND', async () => {
  const w = await world()
  try {
    const { attemptId } = (await w.call('student', 'POST', '/preparation', INTENT)).body.data
    const c = await w.call('student', 'POST', '/checkins', { sourceType: 'PREPARATION', sourceId: attemptId, whatTried: 'I named the constraint first. Email me: me@example.com', outcome: 'We agreed a date.' })
    assert.equal(c.status, 201)
    assert.equal(c.body.data.mode, 'SELF_REPORT')
    assert.equal(c.body.data.scope, 'PERSONAL')
    assert.doesNotMatch(c.body.data.whatTried, /@/)
    const modeTamper = await w.call('student', 'POST', '/checkins', { sourceType: 'PREPARATION', sourceId: attemptId, whatTried: 'x', outcome: 'y', mode: 'FORMAL' })
    assert.equal(modeTamper.status, 422)
    const foreign = await w.call('other', 'POST', '/checkins', { sourceType: 'PREPARATION', sourceId: attemptId, whatTried: 'x', outcome: 'y' })
    assert.equal(foreign.status, 404)
    const noSource = await w.call('student', 'POST', '/checkins', { sourceType: 'REPORT', whatTried: 'Asked who owns the next step.', outcome: 'It worked.' })
    assert.equal(noSource.status, 201)
    const list = await w.call('student', 'GET', '/checkins')
    assert.equal(list.body.data.items.length, 2)
    assert.ok(list.body.data.items.every((i) => i.mode === 'SELF_REPORT'))
    const otherList = await w.call('other', 'GET', '/checkins')
    assert.equal(otherList.body.data.items.length, 0)
    assert.ok(w.repos.db.applicationCheckins.every((r) => r.mode === 'SELF_REPORT'))
  } finally { await w.close() }
})

test('P7 (T07, CH-36): history shows PREPARATION_ATTEMPT and SELF_REPORT as separate types in PERSONAL only; nothing in the campus workspace', async () => {
  const w = await world()
  try {
    const { attemptId } = (await w.call('student', 'POST', '/preparation', INTENT)).body.data
    await w.call('student', 'POST', `/preparation/${attemptId}/confirm`, {})
    await w.call('student', 'POST', '/checkins', { sourceType: 'PREPARATION', sourceId: attemptId, whatTried: 'x', outcome: 'y' })
    const res = await w.call('student', 'GET', '/me/history')
    assert.equal(res.status, 200)
    assert.ok(HistoryPageSchema.safeParse(res.body.data).success)
    const types = res.body.data.items.map((i) => [i.sourceType, i.mode, i.scope])
    assert.ok(types.some(([t, m, s]) => t === 'PREPARATION_ATTEMPT' && m === 'PREPARATION' && s === 'PERSONAL'))
    assert.ok(types.some(([t, m, s]) => t === 'SELF_REPORT' && m === 'SELF_REPORT' && s === 'PERSONAL'))
    assert.ok(!res.body.data.items.some((i) => i.mode === 'FORMAL'), 'no formal item was created by preparing')
    const prep = res.body.data.items.find((i) => i.sourceType === 'PREPARATION_ATTEMPT')
    assert.equal(prep.status, 'ACTIVE')
    assert.deepEqual(prep.permittedAction, { kind: 'RESUME', to: `/app/prepare/${attemptId}` })
    assert.equal(prep.title, 'Negotiate a deadline')

    const campusHistory = await w.call('student', 'GET', '/me/history', undefined, { 'x-prism-workspace': w.campusWs.id })
    assert.equal(campusHistory.status, 200)
    assert.deepEqual(campusHistory.body.data.items, [], 'campus workspace never lists personal preparation or notes')

    // Flag off → the projection hides them again (reversible).
    process.env.PRISM_PREPARATION_V1 = 'false'
    const dark = await w.call('student', 'GET', '/me/history')
    assert.equal(dark.body.data.items.length, 0)
  } finally { await w.close(); process.env.PRISM_PREPARATION_V1 = 'true' }
})

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) walk(abs, out)
    else if (/\.(m?js|cjs)$/.test(name)) out.push(abs)
  }
  return out
}

test('P7 (T43): no analytics, report, evidence, development or growth code names a preparation table or repository', () => {
  const dirs = ['domain/analytics', 'domain/reports', 'domain/evidence', 'domain/development', 'domain/growth', 'domain/campusAdmin', 'lib/evidenceGraph.js', 'lib/reportV2.js']
  const banned = /preparation_attempts|preparation_turns|action_cards|application_checkins|repos\.preparation|\.preparation\b/
  const offenders = []
  for (const d of dirs) {
    const abs = join(SERVER_ROOT, d)
    const files = statSync(abs).isDirectory() ? walk(abs) : [abs]
    for (const f of files) if (banned.test(readFileSync(f, 'utf8'))) offenders.push(relative(SERVER_ROOT, f))
  }
  assert.deepEqual(offenders, [])
})
