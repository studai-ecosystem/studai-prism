// P2.9 Layer B — the action → evidence → report → practice chain on a real,
// self-owned disposable PostgreSQL (node scripts/run-experience-baseline-tests.mjs p2).
// Real buildApp() HTTP routes, the real PG campus store and legacy store, the
// in-process evaluation worker, the strict evidence writer and V3
// publication. ONLY the external model provider is stubbed: NODE_ENV=test +
// PRISM_AUDIT_AI=true route every call to services/ai/auditConverse.js, and
// faults are injected there through PRISM_AUDIT_AI_FAULT. No evidence,
// report or job row is ever inserted by this test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const isolated = process.env.PRISM_P0_ISOLATED_DATABASE === 'true'
const skip = !isolated || !process.env.TEST_DATABASE_URL
const evidence = { layer: 'B', modelBoundary: 'AUDIT_PROVIDER_STUB_ONLY', checks: [] }

const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-p2-consent' }
// Synthetic learner words for the universal DRAFT form's opportunities.
const ANSWERS = {
  'OPP-REASON-FACTS-ASSUMPTIONS': 'Is 24 the confirmed number or the sign-ups? And can we print the handouts on the morning if needed?',
  'OPP-REASON-OPTIONS': 'One session for all 24 reaches everyone at once; two smaller sessions support people better but double the setup. With two days I would run one session and keep materials minimal.',
  'OPP-COMM-PLAN-EXPLAIN': 'Plan: Sam sets up the room Day 1 morning, I confirm the list today, Priya prepares the materials Day 2. Sam, I need the seat count from you first.',
  'OPP-COLLAB-PUSHBACK': 'I hear that the room matters most and I agree it comes first. I still think a one-page agenda is worth it; can we do that instead of a full pack?',
  'OPP-ADAPT-REPLAN': 'Sam is out Day 1 afternoon, so room setup moves to Day 1 morning and I take the materials myself. Priya, can you cover the list if I run short?',
}
const GENERIC = 'I would confirm who owns each open task and by when, then tell the team in one short message.'
const BOARD_PATCH = { 'R2.rationale': 'Materials wait for the confirmed list so we print the right number.', 'R2.owner': 'Priya', 'R3.owner': 'You', 'R3.due': 'Day 1 morning', 'R2.dependency': 'R3' }
const GOOD_WORK = {
  BOARD: { rows: [{ id: 'quotes', owner: 'Sam' }, { id: 'checklist', owner: 'Ask Priya to decide by Wednesday' }] },
  MESSAGE: { text: 'Sam, two tasks have no owner yet: the vendor quotes (due Thursday) and the launch checklist (due Friday). Please call the venue to confirm the quote first.' },
  PLAN: { fields: { first_step: 'Call the venue to confirm the quote before anything else.', checkpoint: 'Thursday 10:30 am' } },
}
const PARTIAL_WORK = {
  BOARD: { rows: [{ id: 'quotes', owner: 'Sam' }, { id: 'checklist', owner: null }] },
  MESSAGE: { text: 'Sam, please look after the vendor quotes while I am away.' },
  PLAN: { fields: { first_step: 'Read the plan.', checkpoint: 'soon' } },
}

test('P2.9 Layer B: action → strict evidence → stable V3 report → separate practice, with fault injection, on real PostgreSQL', {
  skip: skip ? 'Run node scripts/run-experience-baseline-tests.mjs p2 for a newly provisioned throwaway DB.' : false,
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.NODE_ENV = 'test'
  process.env.PRISM_PG_STORE = 'true'
  process.env.PRISM_AUDIT_AI = 'true'
  process.env.PRISM_DRAFT_CONTENT = 'true'
  process.env.PRISM_DUMMY_PAYMENTS = 'false'
  process.env.PRISM_SKIP_VERIFICATION = 'true'
  process.env.PRISM_APP_SHELL_V3 = 'true'
  process.env.PRISM_ASSESSMENT_WORKSPACE_V3 = 'true'
  process.env.PRISM_STUDENT_REPORT_V3 = 'true'
  process.env.PRISM_DEVELOPMENT_V2 = 'true'
  process.env.PRISM_EVIDENCE_FAIL_CLOSED = 'true'
  process.env.JWT_SECRET = 'isolated-p2-test-secret-never-production'
  process.env.ADMIN_TOKEN = 'isolated-p2-test-admin-never-production'
  delete process.env.PRISM_AUDIT_AI_FAULT
  const { migrateUp } = await import('../db/migrate.js')
  const { closePool, query, getPool, getSessionLockPool } = await import('../db/pool.js')
  t.after(closePool)
  await migrateUp()
  const { createDefaultCampusContext } = await import('../domain/campusStore/defaultContext.js')
  const { createPgCampusRepos } = await import('../domain/campusStore/index.js')
  const { buildApp } = await import('../app.js')
  const { evaluateJobKey, DRAFT_EVALUATE_JOB_KIND, draftBankScenarios } = await import('../domain/assessments/draftSegments.js')
  const { CORE_TEAMREADY_A_ID, BOARD_ARTIFACT_ID } = await import('../domain/assessments/universalForm.js')
  // The app's own campus context (real PG wiring), so the test can also drive
  // the same worker the finish route drives. Repositories are used for
  // READS and for the worker's own claim/complete operations only.
  const campus = createDefaultCampusContext()
  const repos = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
  const io = repos.sessionIo
  const app = buildApp({ campus })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(method, path, token, body, headers = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, payload: await response.json().catch(() => null) }
  }
  const fault = (mode) => { if (mode) process.env.PRISM_AUDIT_AI_FAULT = mode; else delete process.env.PRISM_AUDIT_AI_FAULT }
  t.after(() => fault(null))

  const account = await request('POST', '/api/auth/register', null, { name: 'Synthetic P2 learner', email: 'p2-learner@test.local', password: 'synthetic-p2-password', ageConfirmed: true })
  assert.equal(account.status, 201)
  const token = account.payload.token
  const userId = account.payload.user.id
  const other = await request('POST', '/api/auth/register', null, { name: 'Synthetic other learner', email: 'p2-other@test.local', password: 'synthetic-p2-password', ageConfirmed: true })
  assert.equal(other.status, 201)

  // A run on the DRAFT form through the real routes only: a dev entitlement,
  // the derived personal assignment (server-pinned to the DRAFT form), start.
  let runs = 0
  async function newRun() {
    runs += 1
    const minted = await request('POST', '/api/payment/dev-session', token, {})
    assert.equal(minted.status, 200, JSON.stringify(minted.payload))
    const list = await request('GET', '/api/v1/me/assessments', token)
    assert.equal(list.status, 200, JSON.stringify(list.payload))
    const card = list.payload.data.active.find((c) => c.definitionId === CORE_TEAMREADY_A_ID && c.status === 'NOT_STARTED')
    assert.ok(card, 'the dev entitlement is offered the DRAFT form (server-side pinning)')
    const started = await request('POST', `/api/v1/assessment-assignments/${card.id}/start`, token, { consent: CONSENT }, { 'Idempotency-Key': `p2-start-${runs}` })
    assert.equal(started.status, 201, JSON.stringify(started.payload))
    const sid = started.payload.data.sessionId
    assert.equal(sid, minted.payload.sessionId)
    // A request body cannot pick or swap the form.
    const swap = await request('POST', `/api/v1/assessment-assignments/${card.id}/start`, token, { consent: CONSENT, scenarioId: 'prism-sim-mkt-l1' }, { 'Idempotency-Key': `p2-swap-${runs}` })
    assert.ok(swap.status >= 400 && swap.status < 500, JSON.stringify(swap.payload))
    assert.equal((await query('SELECT scenario_id FROM v1_sessions WHERE session_id=$1', [sid])).rows[0].scenario_id, CORE_TEAMREADY_A_ID)
    return { sid, assignmentId: card.id }
  }
  const presented = async (sid) => (await io.listOpportunities(sid)).find((r) => r.state === 'PRESENTED') || null
  let seq = 0
  async function answer(sid, row, text = null) {
    seq += 1
    const opp = row.opportunityId
    if (!text && /BOARD/.test(opp)) {
      const version = (await io.latestArtifactVersion(sid, BOARD_ARTIFACT_ID))?.version || 0
      const r = await request('PATCH', `/api/v1/assessment-sessions/${sid}/artifacts/${BOARD_ARTIFACT_ID}`, token, { updates: BOARD_PATCH, clientEventId: `p2-art-${String(seq).padStart(4, '0')}` }, { 'If-Match': String(version) })
      assert.equal(r.status, 200, JSON.stringify(r.payload))
      return r
    }
    const r = await request('POST', `/api/v1/assessment-sessions/${sid}/messages`, token, { clientEventId: `p2-msg-${String(seq).padStart(4, '0')}`, text: text || ANSWERS[opp] || GENERIC })
    assert.equal(r.status, 201, JSON.stringify(r.payload))
    return r
  }
  const begin = (sid, key) => request('POST', `/api/v1/assessment-sessions/${sid}/begin`, token, {}, { 'Idempotency-Key': key })
  const finish = (sid) => request('POST', `/api/v1/assessment-sessions/${sid}/finish`, token, { early: true })
  // Begin, then answer until the learner has written a board owner change and one more message.
  async function act(sid) {
    assert.equal((await begin(sid, `p2-begin-${sid}`)).status, 200)
    let boardDone = false
    for (let i = 0; i < 12; i += 1) {
      const row = await presented(sid)
      if (!row) break
      await answer(sid, row)
      if (/BOARD/.test(row.opportunityId)) boardDone = true
      else if (boardDone) break
    }
    assert.ok(boardDone, 'the Director presented the board opportunity')
  }
  const units = async (sid) => (await query('SELECT * FROM behavioral_evidence_units WHERE session_id=$1 AND NOT legacy_row ORDER BY source_turn, created_at', [sid])).rows
  const job = (sid) => io.getJob(evaluateJobKey(sid))

  // ── Main chain ───────────────────────────────────────────────────────────────
  const main = await newRun()
  const sid = main.sid
  await t.test('start: draft run created via the legacy store, pinned, no model history, untimed until Begin', async () => {
    const session = (await query('SELECT user_id, scenario_id, data FROM v1_sessions WHERE session_id=$1', [sid])).rows[0]
    assert.equal(session.user_id, userId)
    assert.equal(session.scenario_id, CORE_TEAMREADY_A_ID)
    assert.deepEqual(session.data.history, [], 'no LLM opening was generated')
    const pin = (await io.getClientEvent(sid, 'start')).response.runPin
    assert.equal(pin.scenarioId, CORE_TEAMREADY_A_ID)
    assert.ok(pin.snapshotHash && pin.methodVersion && pin.rubricRef)
    const timing = await io.getRunTiming(sid)
    assert.equal(timing.timedStartedAt, null)
    assert.notEqual(timing.policyVersion, 'legacy')
    const intro = await request('GET', `/api/v1/assessment-sessions/${sid}`, token)
    assert.equal(intro.status, 200, JSON.stringify(intro.payload))
    assert.equal(intro.payload.data.status, 'ALLOCATED')
    assert.deepEqual(intro.payload.data.messages, [])
    assert.equal((await request('GET', `/api/v1/assessment-sessions/${sid}`, other.payload.token)).status, 404)
    const b1 = await begin(sid, `p2-begin-${sid}`)
    const b2 = await begin(sid, `p2-begin-other-key-${sid}`)
    assert.equal(b1.status, 200)
    assert.equal(b2.status, 200)
    assert.equal(b2.payload.data.replayed, true)
    assert.equal(b2.payload.data.startedAt, b1.payload.data.startedAt, 'Begin is idempotent at the store')
    assert.ok(new Date(b1.payload.data.deadlineAt) > new Date(b1.payload.data.startedAt))
    evidence.checks.push({ id: 'P2.1/P3.8', status: 'PASS', draftSessionViaLegacyStore: true, noModelHistory: true, beginIdempotent: true })
  })

  await t.test('actions: meaningful message + learner board owner patch are durable, authored stimulus only', async () => {
    let boardDone = false
    for (let i = 0; i < 12; i += 1) {
      const row = await presented(sid)
      if (!row) break
      const r = await answer(sid, row)
      if (/BOARD/.test(row.opportunityId)) { boardDone = true; assert.equal(r.payload.data.data['R2.owner'], 'Priya') } else if (boardDone) break
    }
    assert.ok(boardDone)
    const actions = await io.listActions(sid)
    assert.ok(actions.length >= 3)
    assert.ok(actions.every((a) => a.state === 'APPLIED' && a.actorKind === 'CANDIDATE'))
    const board = actions.find((a) => a.kind === 'ARTIFACT')
    assert.equal(board.payload.updates['R2.owner'], 'Priya')
    const version = await io.latestArtifactVersion(sid, BOARD_ARTIFACT_ID)
    assert.equal(version.savedBy, 'CANDIDATE')
    // T26 repeated client key: same payload replays, changed payload conflicts.
    const firstMsg = actions.find((a) => a.kind === 'MESSAGE')
    const replay = await request('POST', `/api/v1/assessment-sessions/${sid}/messages`, token, { clientEventId: firstMsg.clientEventId, text: firstMsg.payload.text })
    assert.equal(replay.status, 200)
    assert.equal(replay.payload.data.replayed, true)
    const changed = await request('POST', `/api/v1/assessment-sessions/${sid}/messages`, token, { clientEventId: firstMsg.clientEventId, text: `${firstMsg.payload.text} (edited)` })
    assert.equal(changed.status, 409)
    assert.equal((await io.listActions(sid)).length, actions.length, 'no duplicate action')
    const ledger = await io.listOpportunities(sid)
    assert.ok(ledger.filter((r) => r.state === 'ACTION_RECEIVED').length >= 2)
    evidence.checks.push({ id: 'T25/T26/T28', status: 'PASS', durableActions: actions.length, boardOwnerPatch: true, replaySameKey: 200, changedPayload: 409 })
  })

  let issued
  await t.test('finish → EVALUATE_RUN job DONE via worker → strict units with provenance, never non-candidate text (T24/T27/T35)', async () => {
    const fin = await finish(sid)
    assert.equal(fin.status, 200, JSON.stringify(fin.payload))
    assert.equal(fin.payload.data.state, 'COMPLETE')
    const j = await job(sid)
    assert.equal(j.kind, DRAFT_EVALUATE_JOB_KIND)
    assert.equal(j.state, 'DONE')
    assert.equal(j.resultState, 'DONE')
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM v1_reports WHERE session_id=$1', [sid])).rows[0].n, 0, 'no legacy score was manufactured')
    const rows = await units(sid)
    assert.ok(rows.length >= 2)
    const pin = (await io.getClientEvent(sid, 'start')).response.runPin
    const actions = new Map((await io.listActions(sid)).map((a) => [a.actionId, a]))
    const ledger = await io.listOpportunities(sid)
    const stimulusText = ledger.flatMap((r) => (r.stimulus?.messages || []).map((m) => m.content)).join('\n')
    const template = JSON.stringify(draftBankScenarios()[CORE_TEAMREADY_A_ID].interactiveArtifacts)
    let quoted = 0
    for (const u of rows) {
      const p = u.provenance_json
      for (const k of ['actionId', 'opportunityId', 'rubricRef', 'methodVersion', 'snapshotHash']) assert.ok(p[k], `provenance.${k}`)
      assert.equal(p.snapshotHash, pin.snapshotHash)
      assert.equal(p.methodVersion, pin.methodVersion)
      assert.equal(p.rubricRef, pin.rubricRef)
      const a = actions.get(p.actionId)
      assert.ok(a && a.actorKind === 'CANDIDATE' && a.state === 'APPLIED', 'unit links an accepted candidate action')
      assert.ok(ledger.some((r) => r.opportunityId === p.opportunityId && (r.actionIds || []).includes(p.actionId)), 'unit links the opportunity the action answered')
      const excerpt = u.candidate_action_json?.dialogue_excerpt
      if (excerpt) {
        quoted += 1
        const own = a.kind === 'MESSAGE' ? [a.payload.text] : Object.values(a.payload.updates || {}).map(String)
        assert.ok(own.some((x) => x.includes(excerpt)), 'excerpt is the learner\'s verbatim text')
        assert.equal(stimulusText.includes(excerpt), false, 'never SYSTEM/AI participant text')
        assert.equal(template.includes(excerpt), false, 'never TEMPLATE board text')
        assert.equal(u.evidence_status, 'PROVISIONAL')
      }
    }
    assert.ok(quoted >= 2)
    assert.ok(rows.some((u) => u.source_type === 'WORK_ARTIFACT' && u.source_artifact_id === BOARD_ARTIFACT_ID && u.candidate_action_json?.dialogue_excerpt), 'the learner board patch is interpreted evidence (T28)')
    assert.ok(rows.some((u) => u.source_type === 'DIALOGUE_TURN'))
    evidence.checks.push({ id: 'T24/T27/T28/T35/CH-21', status: 'PASS', strictUnits: rows.length, quotedUnits: quoted, legacyReportRows: 0, jobState: j.state })
  })

  await t.test('report: purged history, two GETs serve the same stored version and evidence-set hash; verified quote (T32/T36)', async () => {
    await query("UPDATE v1_sessions SET data = jsonb_set(data, '{history}', '[]'::jsonb) WHERE session_id=$1", [sid])
    const r1 = await request('GET', `/api/v1/assessment-sessions/${sid}/report`, token)
    assert.equal(r1.status, 200, JSON.stringify(r1.payload))
    const r2 = await request('GET', `/api/v1/assessment-sessions/${sid}/report`, token)
    assert.equal(r2.status, 200)
    assert.equal(r2.payload.data.version.number, r1.payload.data.version.number)
    assert.deepEqual(r2.payload.data.report, r1.payload.data.report)
    const stored = (await query('SELECT version, evidence_set_hash, issued_at, reason FROM student_report_versions WHERE session_id=$1', [sid])).rows
    assert.equal(stored.length, 1)
    assert.ok(stored[0].evidence_set_hash)
    assert.equal(stored[0].reason, 'INITIAL')
    const report = r1.payload.data.report
    const own = (await io.listActions(sid)).flatMap((a) => (a.kind === 'MESSAGE' ? [a.payload.text] : Object.values(a.payload?.updates || {}).map(String)))
    const shown = [...(report.boundedObservations || []), ...(report.moments || [])]
    assert.ok(shown.length >= 1, 'a bounded observation / moment is shown')
    for (const o of shown) assert.ok(own.some((x) => x.includes(o.quote)), 'quote is source-verified learner text')
    for (const cap of report.summary.capabilities) assert.equal(cap.level, null, 'small slice: no fabricated capability band')
    assert.equal((await request('GET', `/api/v1/assessment-sessions/${sid}/report`, other.payload.token)).status, 404)
    const versions = await request('GET', `/api/v1/assessment-sessions/${sid}/report/versions`, token)
    assert.equal(versions.status, 200, JSON.stringify(versions.payload))
    const review = await request('POST', `/api/v1/assessment-sessions/${sid}/report/review-request`, token, { category: 'INTERPRETATION', reason: 'Synthetic review request for the Layer B check.' })
    assert.ok([200, 201].includes(review.status), JSON.stringify(review.payload))
    const afterReview = (await query('SELECT version, evidence_set_hash FROM student_report_versions WHERE session_id=$1', [sid])).rows
    assert.deepEqual(afterReview, stored.map((s) => ({ version: s.version, evidence_set_hash: s.evidence_set_hash })))
    issued = { version: stored[0].version, hash: stored[0].evidence_set_hash, report }
    evidence.checks.push({ id: 'T32/T36/CH-23', status: 'PASS', historyPurged: true, sameVersionTwice: true, evidenceSetHash: Boolean(stored[0].evidence_set_hash), shownObservations: shown.length, versionsRead: true, reviewRequest: review.status })
  })

  await t.test('practice: separate PRACTICE attempts from the moment, criterion feedback, retry; formal report unchanged; history typed and linked', async () => {
    const answered = (await units(sid)).find((u) => u.candidate_action_json?.dialogue_excerpt)?.provenance_json.opportunityId
    const replay = await request('POST', '/api/v1/development/replay', token, { sessionId: sid, opportunityId: answered }, { 'Idempotency-Key': 'p2-replay-1' })
    assert.equal(replay.status, 201, JSON.stringify(replay.payload))
    assert.equal(replay.payload.data.attempt.origin.kind, 'ASSESSMENT_MOMENT')
    const origin = { kind: 'ASSESSMENT_MOMENT', sessionId: sid, opportunityId: answered }
    const MID = 'MIS-CORE-HANDOVER-01'
    const a = await request('POST', `/api/v1/missions/${MID}/attempts`, token, { origin, retry: true }, { 'Idempotency-Key': 'p2-mission-1' })
    assert.equal(a.status, 201, JSON.stringify(a.payload))
    assert.equal(a.payload.data.evidenceType, 'PRACTICE')
    const id1 = a.payload.data.id
    const saved = await request('PATCH', `/api/v1/mission-attempts/${id1}`, token, { work: PARTIAL_WORK }, { 'If-Match': `"${a.payload.data.version}"` })
    assert.equal(saved.status, 200, JSON.stringify(saved.payload))
    const sub = await request('POST', `/api/v1/mission-attempts/${id1}/submit`, token)
    assert.equal(sub.status, 201, JSON.stringify(sub.payload))
    const byCriterion = Object.fromEntries(sub.payload.data.result.criteria.map((c) => [c.criterionId, c]))
    assert.equal(byCriterion['C-OWNERSHIP'].result, 'NOT_OBSERVED')
    const retry = await request('POST', `/api/v1/missions/${MID}/attempts`, token, { retry: true, origin }, { 'Idempotency-Key': 'p2-mission-2' })
    assert.equal(retry.status, 201)
    const id2 = retry.payload.data.id
    assert.notEqual(id2, id1)
    await request('PATCH', `/api/v1/mission-attempts/${id2}`, token, { work: GOOD_WORK }, { 'If-Match': `"${retry.payload.data.version}"` })
    const sub2 = await request('POST', `/api/v1/mission-attempts/${id2}/submit`, token)
    assert.equal(sub2.status, 201, JSON.stringify(sub2.payload))
    assert.equal(Object.fromEntries(sub2.payload.data.result.criteria.map((c) => [c.criterionId, c]))['C-OWNERSHIP'].result, 'OBSERVED')
    const after = (await query('SELECT version, evidence_set_hash FROM student_report_versions WHERE session_id=$1', [sid])).rows
    assert.deepEqual(after, [{ version: issued.version, evidence_set_hash: issued.hash }], 'formal report version/hash unchanged by practice')
    const again = await request('GET', `/api/v1/assessment-sessions/${sid}/report`, token)
    assert.deepEqual(again.payload.data.report, issued.report)
    const history = await request('GET', '/api/v1/me/history', token)
    assert.equal(history.status, 200, JSON.stringify(history.payload))
    const items = history.payload.data.items
    const formal = items.find((i) => i.sourceType === 'FORMAL_SESSION' && i.sourceId === sid)
    assert.ok(formal)
    assert.equal(formal.mode, 'FORMAL')
    const practice = items.filter((i) => i.sourceType === 'PRACTICE_ATTEMPT' && i.linkedSessionId === sid)
    assert.ok(practice.length >= 2)
    assert.ok(practice.every((p) => p.mode === 'PRACTICE'))
    evidence.checks.push({ id: 'P2.8/T41', status: 'PASS', replayCreated: true, practiceAttempts: practice.length, retryNewAttempt: true, formalReportUnchanged: true, historyTyped: true })
  })

  // ── Faults (fresh runs) ──────────────────────────────────────────────────────
  await t.test('fault: provider failure after save → technical, actions durable, retry succeeds, no learner-deficit unit (T25/T31)', async () => {
    const { sid: s } = await newRun()
    await act(s)
    fault('throw')
    const fin = await finish(s)
    fault(null)
    assert.equal(fin.status, 503, JSON.stringify(fin.payload))
    assert.equal(fin.payload.error.details.processing.resultState, 'TECHNICAL_FAILURE')
    assert.equal(fin.payload.error.details.processing.retryable, true)
    const j = await job(s)
    assert.equal(j.state, 'FAILED')
    assert.equal(j.resultState, 'TECHNICAL_FAILURE')
    assert.ok((await io.listActions(s)).filter((a) => a.kind !== 'FINISH').every((a) => a.state === 'APPLIED'))
    assert.equal((await units(s)).length, 0, 'no deficit written')
    const c = await request('GET', `/api/v1/assessment-sessions/${s}`, token)
    assert.equal(c.payload.data.status, 'SCORING_FAILED')
    assert.equal(c.payload.data.processing.state, 'FAILED')
    assert.equal((await request('GET', `/api/v1/assessment-sessions/${s}/report`, token)).status, 409)
    const retry = await finish(s)
    assert.equal(retry.status, 200, JSON.stringify(retry.payload))
    const rows = await units(s)
    assert.ok(rows.length >= 2)
    assert.ok(rows.every((u) => u.provenance_json.evaluatorAttempt === 2))
    assert.equal(rows.filter((u) => u.evidence_status === 'INSUFFICIENT_EVIDENCE' && u.provenance_json.reason !== 'NOT_ADDRESSED').length, 0)
    evidence.checks.push({ id: 'T25/T31/CH-22', status: 'PASS', fault: 'provider-throw', jobFailedTechnical: true, retryAttempt: 2 })
  })

  await t.test('fault: malformed evaluator output → technical, no units', async () => {
    const { sid: s } = await newRun()
    await act(s)
    fault('malformed')
    const fin = await finish(s)
    fault(null)
    assert.equal(fin.status, 503)
    assert.equal((await job(s)).resultState, 'TECHNICAL_FAILURE')
    assert.equal((await units(s)).length, 0)
    evidence.checks.push({ id: 'T31', status: 'PASS', fault: 'malformed' })
  })

  await t.test('fault: quote mismatch → HUMAN_REVIEW_REQUIRED, no replacement quotation (T32)', async () => {
    const { sid: s } = await newRun()
    await act(s)
    fault('mismatch')
    const fin = await finish(s)
    fault(null)
    assert.equal(fin.status, 200, JSON.stringify(fin.payload))
    const rows = await units(s)
    assert.ok(rows.length >= 2)
    for (const u of rows) {
      assert.equal(u.evidence_status, 'HUMAN_REVIEW_REQUIRED')
      assert.equal(u.human_review_status, 'REQUIRED')
      assert.equal(u.rubric_level, null)
      assert.equal(u.candidate_action_json?.dialogue_excerpt, undefined)
      assert.equal(u.provenance_json.reason, 'QUOTE_MISMATCH')
    }
    const report = await request('GET', `/api/v1/assessment-sessions/${s}/report`, token)
    assert.equal(report.status, 200)
    assert.equal(JSON.stringify(report.payload).includes('words the candidate never wrote'), false)
    evidence.checks.push({ id: 'T32', status: 'PASS', fault: 'quote-mismatch', reviewUnits: rows.length })
  })

  await t.test('fault: evidence-write failure (store rejects a value) → technical, no units', async () => {
    const { sid: s } = await newRun()
    await act(s)
    fault('evidence-write')
    const fin = await finish(s)
    fault(null)
    assert.equal(fin.status, 503, JSON.stringify(fin.payload))
    const j = await job(s)
    assert.equal(j.state, 'FAILED')
    assert.equal(j.resultState, 'TECHNICAL_FAILURE')
    assert.equal((await units(s)).length, 0)
    evidence.checks.push({ id: 'T31', status: 'PASS', fault: 'evidence-write' })
  })

  await t.test('fault: worker crash — lease expires, job is reclaimed, stale fencing token rejected, one applied result (T49)', async () => {
    const { sid: s } = await newRun()
    await act(s)
    fault('throw')
    assert.equal((await finish(s)).status, 503)
    fault(null)
    await io.retryJob(evaluateJobKey(s))
    const crashed = await io.claimJob(DRAFT_EVALUATE_JOB_KIND, 50)
    assert.equal(crashed.sessionId, s)
    await new Promise((r) => setTimeout(r, 120))
    const fin = await finish(s)
    assert.equal(fin.status, 200, JSON.stringify(fin.payload))
    const j = await job(s)
    assert.equal(j.state, 'DONE')
    assert.ok(j.fencingToken > crashed.fencingToken)
    await assert.rejects(io.completeJob(crashed.jobId, crashed.fencingToken, 'DONE'))
    const rows = await units(s)
    assert.ok(rows.length >= 2)
    assert.equal(new Set(rows.map((u) => u.provenance_json.evaluatorAttempt)).size, 1, 'exactly one applied result')
    assert.equal(rows[0].provenance_json.evaluatorAttempt, j.attempts)
    evidence.checks.push({ id: 'T49', status: 'PASS', staleTokenRejected: true, reclaimAttempt: j.attempts })
  })

  await t.test('race: concurrent report GETs publish exactly one version (T51)', async () => {
    const { sid: s } = await newRun()
    await act(s)
    assert.equal((await finish(s)).status, 200)
    const results = await Promise.all(Array.from({ length: 6 }, () => request('GET', `/api/v1/assessment-sessions/${s}/report`, token)))
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)))
    assert.equal(new Set(results.map((r) => r.payload.data.version.number)).size, 1)
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM student_report_versions WHERE session_id=$1', [s])).rows[0].n, 1)
    evidence.checks.push({ id: 'T51', status: 'PASS', concurrentGets: 6, versions: 1 })
  })

  await t.test('erasure while the job is LEASED → worker completion rejected, no resurrection (T52)', async () => {
    const { sid: s } = await newRun()
    await act(s)
    fault('throw')
    assert.equal((await finish(s)).status, 503)
    fault(null)
    await io.retryJob(evaluateJobKey(s))
    const held = await io.claimJob(DRAFT_EVALUATE_JOB_KIND, 60_000)
    assert.equal(held.sessionId, s)
    const { eraseCampusSessionData, isErased } = await import('../lib/campusErasure.js')
    await eraseCampusSessionData(s)
    assert.equal(await isErased(s), true)
    await assert.rejects(io.completeJob(held.jobId, held.fencingToken, 'DONE'))
    assert.equal(await campus.sessions.runEvaluationWorkerOnce(), null, 'nothing left to claim')
    for (const table of ['behavioral_evidence_units', 'assessment_candidate_actions', 'assessment_jobs', 'student_report_versions']) {
      assert.equal((await query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE session_id=$1`, [s])).rows[0].n, 0, table)
    }
    const late = await request('POST', `/api/v1/assessment-sessions/${s}/messages`, token, { clientEventId: 'p2-late-after-erasure', text: 'Synthetic late write after erasure' })
    assert.equal(late.status, 404)
    evidence.checks.push({ id: 'T52', status: 'PASS', leasedCompletionRejected: true, noResurrection: true })
  })

  await t.test('sparse input → honest insufficient (not technical, not fake complete) (T29)', async () => {
    const { sid: s } = await newRun()
    assert.equal((await begin(s, `p2-begin-${s}`)).status, 200)
    const row = await presented(s)
    await answer(s, row, 'ok sure')
    const fin = await finish(s)
    assert.equal(fin.status, 200, JSON.stringify(fin.payload))
    const j = await job(s)
    assert.equal(j.state, 'DONE')
    assert.equal(j.resultState, 'DONE')
    const rows = await units(s)
    assert.ok(rows.length >= 1)
    for (const u of rows) {
      assert.equal(u.evidence_status, 'INSUFFICIENT_EVIDENCE')
      assert.equal(u.rubric_level, null)
      assert.ok(['TOO_SPARSE', 'NOT_ADDRESSED'].includes(u.provenance_json.reason))
    }
    const report = await request('GET', `/api/v1/assessment-sessions/${s}/report`, token)
    assert.equal(report.status, 200)
    assert.equal(JSON.stringify(report.payload.data.report).includes('ok sure'), false)
    for (const cap of report.payload.data.report.summary.capabilities) assert.equal(cap.level, null)
    evidence.checks.push({ id: 'T29', status: 'PASS', insufficientUnits: rows.length, technical: false })
  })

  await mkdir(join('audit-results', 'p2'), { recursive: true })
  await writeFile(join('audit-results', 'p2', 'layer-b.json'), JSON.stringify({ ...evidence, runs }, null, 2))
})
