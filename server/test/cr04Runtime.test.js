import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createMissionEvaluator } from '../domain/development/evaluator.js'
import { evaluateMissionWork, practiceUnitsFrom, CONFIDENCE_THRESHOLD, MIN_QUOTE_WORDS, MIN_QUOTE_CHARS } from '../domain/development/evaluate.js'
import { MISSION_LIBRARY, P6_LIBRARY } from '../domain/development/missionLibrary.js'
import { applyVariant, parseMission } from '../domain/development/missionSchema.js'
import { initialWork, normaliseWork, runDeterministicChecks, candidateTextFor } from '../domain/development/validators.js'
import { copiedFrom, buildFocus, compareAttempts } from '../domain/development/feedback.js'
import { meaningWorkEmpty } from '../domain/development/evaluator.js'
import { createDevelopmentService } from '../domain/development/service.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { MISSION_FIXTURES } from './fixtures/p6Missions.js'

const latest = (id) => parseMission(MISSION_LIBRARY.filter((m) => m.mission_id === id).sort((a, b) => b.version - a.version)[0])
const section = (prompt, heading) => JSON.parse(prompt.replace(/\r\n/g, '\n').split(`${heading}\n`)[1].split('\n')[0])
const workIn = (prompt) => JSON.parse(prompt.split('<candidate_transcript>').pop().split('</candidate_transcript>')[0].trim())
const capturedEvaluator = (requests) => createMissionEvaluator({
  complete: async (request, options) => {
    requests.push({ request, options })
    return { content: { criteria: [] }, model: 'request-capture-fixture' }
  },
})

test('CR04 request capture: all ten missions and both effective scenes reach the model with attributed structured work', async () => {
  assert.equal(P6_LIBRARY.length, 10)
  for (const base of P6_LIBRARY.map((m) => latest(m.mission_id))) {
    for (const variant of ['BASE', 'TRANSFER']) {
      const mission = applyVariant(base, variant)
      const work = initialWork(mission)
      for (const artifact of mission.artifacts) {
        const marker = `${artifact.artifact_id} learner contribution for this practice attempt.`
        if (artifact.type === 'TEXT_RESPONSE') work[artifact.artifact_id].text = marker
        if (artifact.type === 'FIELD_SHEET') for (const field of artifact.fields) work[artifact.artifact_id].fields[field.key] = field.kind === 'number' ? 17 : `${field.key} ${marker}`
        if (artifact.type === 'TABLE') for (const row of work[artifact.artifact_id].rows) {
          for (const column of artifact.columns.filter((c) => c.editable)) row[column.key] = column.kind === 'number' ? 17 : `${row.id} ${column.key} ${marker}`
        }
      }
      const requests = []
      await evaluateMissionWork({ mission, work: normaliseWork(mission, work), evaluator: capturedEvaluator(requests) })
      assert.ok(requests.length, `${base.display_code} ${variant} made a model request`)
      for (const { request, options } of requests) {
        assert.equal(options.task, 'mission_evaluator')
        const prompt = request.messages[0].content
        assert.ok(prompt.includes('EXERCISE CONTEXT (JSON)'), `${base.display_code} ${variant}: effective scene is missing`)
        const context = section(prompt, 'EXERCISE CONTEXT (JSON)')
        assert.deepEqual(context, {
          setting: mission.scenario_context.setting,
          objective: mission.scenario_context.objective,
          situation_facts: mission.situation_facts || [],
          constraints: mission.constraints,
        })
        const criteria = section(prompt, prompt.includes('MEANING CRITERIA (JSON)') ? 'MEANING CRITERIA (JSON)' : 'CRITERIA (JSON)')
        const structured = workIn(prompt)
        for (const criterion of criteria) {
          const definition = mission.rubric.criteria.find((c) => c.criterion_id === criterion.criterion_id)
          assert.deepEqual(criterion.artifact_ids, definition.artifact_ids)
          assert.deepEqual(criterion.work_paths, definition.work_paths || [])
        }
        for (const artifact of structured) {
          assert.ok(mission.artifacts.some((a) => a.artifact_id === artifact.artifact_id))
          for (const entry of artifact.entries) {
            assert.ok(entry.path)
            assert.ok(['LEARNER', 'SCENARIO'].includes(entry.source))
            if (entry.source === 'LEARNER') assert.ok(String(entry.value).includes('learner contribution') || entry.value === 17)
          }
        }
        const table = structured.find((a) => a.type === 'TABLE')
        if (table) {
          assert.ok(table.entries.some((e) => e.row_id && e.source === 'SCENARIO'), 'read-only row context is distinct from learner cells')
          assert.ok(table.entries.some((e) => e.row_id && e.source === 'LEARNER'), 'editable rows retain row attribution')
        }
      }
    }
  }
})

test('CR04 request capture: evaluator/BOTH path carries scene, numeric cells and field attribution, without learner identity', async () => {
  const mission = parseMission(MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-MKT-EXP-01'))
  const work = normaliseWork(mission, {
    HYPOTHESIS: { text: 'If we change the message then conversion increases because the benefit is clearer.' },
    TEST_PLAN: { fields: {
      variable_changed: 'Only the headline wording changes.',
      kept_the_same: 'Asha Verma keeps the audience, timing and landing page unchanged.',
      primary_metric: 'Purchase conversion rate before launch.',
      decision_rule: 'Compare after the planned test period.',
    } },
    BUDGET: { rows: [{ id: 'ctrl', spend: 50000 }, { id: 'test', spend: 50000 }] },
  })
  const requests = []
  await evaluateMissionWork({ mission, work, evaluator: capturedEvaluator(requests), candidateName: 'Asha Verma' })
  assert.equal(requests.length, 1)
  const prompt = requests[0].request.messages[0].content
  assert.ok(prompt.includes('EXERCISE CONTEXT (JSON)'), 'evaluator context is missing')
  assert.ok(!prompt.includes('Asha Verma'))
  const artifacts = workIn(prompt)
  assert.equal(artifacts.find((a) => a.artifact_id === 'BUDGET').entries.find((e) => e.row_id === 'ctrl' && e.path === 'rows.spend').value, 50000)
  assert.ok(artifacts.find((a) => a.artifact_id === 'TEST_PLAN').entries.some((e) => e.path === 'fields.kept_the_same' && e.source === 'LEARNER'))
})

test('CR04 service wiring: a stored transfer attempt uses its effective scene and replay preserves stored feedback without a new model call', async () => {
  const repos = createMemoryCampusRepos()
  const requests = []
  const service = createDevelopmentService({ repos, evaluator: capturedEvaluator(requests) })
  await service.ensureSeeded()
  const mission = latest('MIS-CORE-MISSING-FACT-01')
  const { attempt } = await repos.development.createAttempt({
    userId: 'cr04-learner', missionId: mission.mission_id, missionVersion: mission.version,
    work: { REPLY: { text: 'Jo, please weigh every kit box before I confirm the van slot.' } },
    assistance: { mode: 'UNCOACHED', variant: 'TRANSFER' }, idempotencyKey: 'cr04-transfer',
  })
  const user = { id: 'cr04-learner' }
  const workspace = { type: 'PERSONAL' }
  const first = await service.submit(user, workspace, attempt.id)
  assert.equal(requests.length, 1)
  assert.equal(section(requests[0].request.messages[0].content, 'EXERCISE CONTEXT (JSON)').setting, mission.transfer.setting)
  const saved = await repos.development.getAttempt(attempt.id)
  const replay = await service.submit(user, workspace, attempt.id)
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.attempt.result, first.attempt.result)
  assert.deepEqual((await repos.development.getAttempt(attempt.id)).evaluation, saved.evaluation)
  assert.equal(requests.length, 1)
})

test('CR04 attribution: a model quote in a different field or static row label cannot establish a criterion', async () => {
  const mission = latest('MIS-CORE-CHECK-RECOMMENDATION-01')
  const quote = 'Use the local shop that can deliver tomorrow instead.'
  const work = { CHECK: { fields: { what_found: quote, alternative: 'Thanks for your help with this.' } } }
  const evaluator = createMissionEvaluator({ complete: async () => ({ content: { criteria: [
    { criterion_id: 'C-ALT', met: true, reason: 'EXPRESSED', quote },
  ] } }) })
  const result = await evaluateMissionWork({ mission, work, evaluator })
  const alternative = result.criteria.find((c) => c.criterionId === 'C-ALT')
  assert.equal(alternative.result, 'UNCERTAIN')
  assert.equal(alternative.reason, 'QUOTE_NOT_VERIFIED')
  assert.equal(alternative.quote, null)
  assert.equal(result.focus.completed, null)
  assert.equal(result.focus.reviewIncomplete, true)
  assert.equal(practiceUnitsFrom({ evaluation: result, mission, attempt: { id: 'a', userId: 'u' } }).length, 0)
  const m09 = latest('MIS-CORE-USABLE-HANDOVER-01')
  const seeded = initialWork(m09)
  assert.deepEqual(candidateTextFor(m09, seeded, ['BOARD']), [])
  const requests = []
  await evaluateMissionWork({ mission: m09, work: seeded, evaluator: capturedEvaluator(requests) })
  assert.equal(requests.length, 0, 'scenario task/due labels are not learner work')
})

test('CR04 structural rules: every effective table row is checked, including omitted, duplicate and unknown rows', () => {
  for (const raw of P6_LIBRARY) for (const variant of ['BASE', 'TRANSFER']) {
    const mission = applyVariant(parseMission(raw), variant)
    for (const artifact of mission.artifacts.filter((a) => a.type === 'TABLE')) {
      const work = initialWork(mission)
      const rows = work[artifact.artifact_id].rows
      for (const row of rows) for (const column of artifact.columns.filter((c) => c.editable)) {
        row[column.key] = column.kind === 'number' ? 1 : column.key === 'owner' ? 'Sam' : 'DO - a decision with a reason'
      }
      const rowCriteria = mission.deterministic_validation_rules.filter((r) => r.artifact_id === artifact.artifact_id && r.path.startsWith('rows.')).map((r) => r.criterion_id)
      for (const invalidRows of [rows.slice(0, 1), [rows[0], rows[0]], [...rows.slice(0, -1), { ...rows.at(-1), id: 'unknown-row' }]]) {
        const invalid = { ...work, [artifact.artifact_id]: { rows: invalidRows } }
        const checked = runDeterministicChecks(mission, invalid)
        for (const id of rowCriteria) assert.equal(checked.get(id).observed, false, `${mission.display_code} ${variant} ${id}`)
      }
    }
  }
  const legacy = parseMission(MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-MKT-EXP-01'))
  assert.equal(runDeterministicChecks(legacy, { BUDGET: { rows: [{ id: 'ctrl', spend: 100000 }] } }).get('C-BUDGET').observed, false, 'one funded ad is not a split across both rows')
})

test('CR04 references and ordering: generic escalation, negated names, duplicate ranks and fractional ranks are not complete work', () => {
  const m04 = latest('MIS-CORE-HANDOVER-01')
  for (const owner of ['decide', 'decides', 'I do not know', 'Sam is not the owner', 'Someone will decide', 'Ask nobody to decide']) {
    const work = { BOARD: { rows: [{ id: 'quotes', owner }, { id: 'checklist', owner: 'Sam' }] } }
    assert.equal(runDeterministicChecks(m04, work).get('C-OWNERSHIP').observed, false, owner)
  }
  const m09 = latest('MIS-CORE-USABLE-HANDOVER-01')
  assert.equal(runDeterministicChecks(m09, MISSION_FIXTURES[m09.mission_id].escalation).get('C-OWNERS').observed, true)
  const anonymousEscalation = structuredClone(MISSION_FIXTURES[m09.mission_id].escalation)
  anonymousEscalation.BOARD.rows[2].owner = 'Escalate: Someone to decide'
  assert.equal(runDeterministicChecks(m09, anonymousEscalation).get('C-OWNERS').observed, false)
  const m10 = latest('MIS-CORE-NOT-TO-DO-01')
  const valid = MISSION_FIXTURES[m10.mission_id].valid
  assert.equal(runDeterministicChecks(m10, valid).get('C-ORDER').observed, true)
  for (const ranks of [[1, 1, 3, 4, 5], [1, 2.5, 3, 4, 5]]) {
    const work = { ...valid, BOARD: { rows: valid.BOARD.rows.map((r, i) => ({ ...r, order: ranks[i] })) } }
    assert.equal(runDeterministicChecks(m10, work).get('C-ORDER').observed, false)
  }
  const noDecisions = { ...valid, BOARD: { rows: valid.BOARD.rows.map((r) => ({ ...r, decision: 'I do not know what to do' })) } }
  assert.equal(runDeterministicChecks(m10, noDecisions).get('C-DECISIONS').observed, false)
})

test('CR04 result contract: contradictory/keyword-only model decisions never produce praise or evidence (fixture, not a semantic-quality test)', async () => {
  const mission = latest('MIS-CORE-DISAGREE-01')
  for (const reason of ['CONTRADICTED', 'KEYWORDS_ONLY', 'NOT_EXPRESSED']) {
    const evaluator = createMissionEvaluator({ complete: async () => ({ content: { criteria: mission.rubric.criteria.map((c) => ({
      criterion_id: c.criterion_id, met: false, reason, quote: '',
    })) } }) })
    const result = await evaluateMissionWork({ mission, work: MISSION_FIXTURES[mission.mission_id].valid, evaluator })
    assert.ok(result.criteria.every((c) => c.result === 'NOT_OBSERVED'))
    assert.equal(result.focus.completed, null)
    assert.ok(result.counterpart.lines.every((l) => l.when === 'NOT_OBSERVED'))
    assert.equal(result.counts.demonstrated, 0)
  }
  for (const reason of ['CONTRADICTED', 'KEYWORDS_ONLY', 'invented-reason']) {
    const evaluator = createMissionEvaluator({ complete: async () => ({ content: { criteria: [{
      criterion_id: 'C-RESTATE', met: true, reason, quote: 'printing takes an afternoon we simply do not have',
    }] } }) })
    const result = await evaluateMissionWork({ mission, work: MISSION_FIXTURES[mission.mission_id].valid, evaluator })
    assert.equal(result.status, 'EVALUATION_UNAVAILABLE')
    assert.equal(result.evaluator.reason, 'UNPARSEABLE_OUTPUT')
    assert.equal(result.focus.completed, null)
    assert.equal(result.counterpart, null)
  }
})

test('CR04 feedback: copied assistance is not praised and automatic checks cannot borrow unrelated text for an acknowledgement', async () => {
  const mission = latest('MIS-CORE-BOUNDARY-01')
  const example = mission.examples.find((e) => e.kind === 'EXAMPLE')
  const work = { REPLY: { fields: { ...MISSION_FIXTURES[mission.mission_id].valid.REPLY.fields, cannot_do: example.text } } }
  const evaluator = createMissionEvaluator({ complete: async () => ({ content: { criteria: mission.rubric.criteria.filter((c) => c.check === 'MEANING').map((c) => ({
    criterion_id: c.criterion_id, met: true, reason: 'EXPRESSED',
    quote: c.criterion_id === 'C-INSTEAD' ? work.REPLY.fields.instead : example.text,
  })) } }) })
  const result = await evaluateMissionWork({ mission, work, evaluator, exposed: [{ source: 'EXAMPLE', id: example.example_id, text: example.text }] })
  for (const id of ['C-LIMIT', 'C-WHY']) {
    assert.equal(result.criteria.find((c) => c.criterionId === id).result, 'COPIED_ASSISTANCE')
    assert.ok(!result.counterpart.lines.some((l) => l.criterionId === id))
  }
  assert.equal(result.criteria.find((c) => c.criterionId === 'C-INSTEAD').result, 'OBSERVED', 'an independently written alternative is not contaminated by another field')
  assert.equal(result.counterpart.closing, null)
  const focus = buildFocus({ mission, status: 'EVALUATED', criteria: [{ criterionId: 'C-DECIDER', check: 'DETERMINISTIC', result: 'OBSERVED', description: 'Names the decider.', quote: null }], learnerTextFor: () => ['Unrelated eloquent text about the conflict.'] })
  assert.equal(focus.completed.quote, null)
  assert.equal(copiedFrom(['one two three four', 'four five six seven eight'], [{ source: 'HINT', id: 'h', text: 'one two three four five six seven eight' }]).id, 'h', 'splitting exposed assistance across eligible fields does not evade copy protection')
})

test('CR04 authoring: historical versions are retained, revisions are unapproved and bindings cannot target read-only cells', () => {
  const historical = MISSION_LIBRARY.filter((m) => m.mission_id === 'MIS-CORE-HANDOVER-01' ? m.version <= 3 : m.version === 1)
  assert.equal(historical.length, 13)
  assert.equal(createHash('sha256').update(JSON.stringify(historical)).digest('hex'), '0f69ee34807d45deabab5f721607ff78d9977256fef0a9e601e9e86c5ce84f77', 'historical bodies match starting HEAD 12bc65e')
  for (const revised of P6_LIBRARY) {
    const previous = MISSION_LIBRARY.find((m) => m.mission_id === revised.mission_id && m.version === revised.version - 1)
    assert.ok(previous)
    assert.equal(previous.rubric.criteria[0].work_paths, undefined)
    assert.equal(revised.status, 'DRAFT')
    assert.equal(revised.review_record.approval, 'NOT_APPROVED')
    assert.equal(revised.review_record.reviewed_by, null)
    assert.equal(revised.review_record.reviewed_on, null)
    assert.deepEqual(revised.required_evidence, previous.required_evidence)
    for (const variant of ['BASE', 'TRANSFER']) assert.ok(applyVariant(parseMission(revised), variant).rubric.criteria.every((c) => c.work_paths.length))
  }
  const m09 = structuredClone(P6_LIBRARY.find((m) => m.display_code === 'M09'))
  m09.rubric.criteria[0].work_paths = [{ artifact_id: 'BOARD', path: 'rows.task' }]
  assert.throws(() => parseMission(m09), /read-only work path/)
  assert.equal(CONFIDENCE_THRESHOLD, 0.7)
  assert.equal(MIN_QUOTE_WORDS, 3)
  assert.equal(MIN_QUOTE_CHARS, 12)
  assert.equal(meaningWorkEmpty(['Headcount please']), false)
})

test('CR04 paraphrase wiring: a concise indirect request needs no listed phrasing or question mark (fixture, not a semantic-quality test)', async () => {
  const mission = latest('MIS-CORE-MISSING-FACT-01')
  const text = 'An attendance total would let me settle the booking.'
  const asks = mission.rubric.criteria.find((c) => c.criterion_id === 'C-ASKS')
  assert.ok(asks.meaning.synonyms.every((s) => !text.toLowerCase().includes(s.toLowerCase())))
  assert.ok(!text.includes('?'))
  let prompt
  const evaluator = createMissionEvaluator({ complete: async ({ messages }) => {
    prompt = messages[0].content
    return { content: { criteria: [{ criterion_id: 'C-ASKS', met: true, reason: 'EXPRESSED', quote: text }] } }
  } })
  const result = await evaluateMissionWork({ mission, work: { REPLY: { text } }, evaluator })
  assert.equal(result.criteria.find((c) => c.criterionId === 'C-ASKS').result, 'OBSERVED')
  assert.match(prompt, /concise indirect request/i)
  assert.match(prompt, /non-exhaustive illustrations, never required phrases-as-behaviour/)
  assert.match(prompt, /Nonsense, unsupported facts, missing required work or context contradictions are not met/)
})

test('CR04 output contract: duplicate decisions and invalid confidence are unavailable, never silently repaired', async () => {
  const meaningMission = latest('MIS-CORE-MISSING-FACT-01')
  const record = { criterion_id: 'C-ASKS', met: true, reason: 'EXPRESSED', quote: 'Could you check with them before confirming the room?' }
  const duplicate = createMissionEvaluator({ complete: async () => ({ content: { criteria: [record, record] } }) })
  const result = await evaluateMissionWork({ mission: meaningMission, work: { REPLY: { text: record.quote } }, evaluator: duplicate })
  assert.equal(result.status, 'EVALUATION_UNAVAILABLE')
  assert.equal(result.evaluator.reason, 'UNPARSEABLE_OUTPUT')
  const mission = parseMission(MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-MKT-EXP-01'))
  for (const confidence of ['0.99', 2, -1, null]) {
    const evaluator = createMissionEvaluator({ complete: async () => ({ content: { criteria: [{
      criterion_id: 'C-METRIC', observed: true, confidence, quote: 'Purchase conversion rate before launch.',
    }] } }) })
    const result = await evaluateMissionWork({ mission, work: { TEST_PLAN: { fields: { primary_metric: 'Purchase conversion rate before launch.' } } }, evaluator })
    assert.equal(result.status, 'EVALUATION_UNAVAILABLE')
    assert.equal(result.evaluator.reason, 'UNPARSEABLE_OUTPUT')
  }
})

test('CR04 concise followup: Headcount please and Print locally reach the model and can ground a complete two-word cell', async () => {
  for (const [id, criterionId, text, work] of [
    ['MIS-CORE-MISSING-FACT-01', 'C-ASKS', 'Headcount please', { REPLY: { text: 'Headcount please' } }],
    ['MIS-CORE-CHECK-RECOMMENDATION-01', 'C-ALT', 'Print locally', { CHECK: { fields: { alternative: 'Print locally' } } }],
  ]) {
    const mission = latest(id)
    let calls = 0
    const evaluator = createMissionEvaluator({ complete: async ({ messages }) => {
      calls += 1
      const prompt = messages[0].content
      const definition = section(prompt, 'MEANING CRITERIA (JSON)').find((c) => c.criterion_id === criterionId)
      assert.ok(workIn(prompt).some((a) => a.entries.some((e) => e.source === 'LEARNER' && e.value === text && definition.work_paths.some((p) => p.artifact_id === a.artifact_id && p.path === e.path))))
      return { content: { criteria: mission.rubric.criteria.filter((c) => c.check === 'MEANING').map((c) => ({
        criterion_id: c.criterion_id, met: c.criterion_id === criterionId, reason: c.criterion_id === criterionId ? 'EXPRESSED' : 'NOT_EXPRESSED', quote: c.criterion_id === criterionId ? text : '',
      })) } }
    } })
    const result = await evaluateMissionWork({ mission, work, evaluator })
    assert.equal(calls, 1, `${text} must not be classified locally as empty work`)
    const criterion = result.criteria.find((c) => c.criterionId === criterionId)
    assert.equal(criterion.result, 'OBSERVED')
    assert.equal(criterion.quote, text)
    assert.equal(criterion.quoteSource.coverage, 'WHOLE_VALUE')
    assert.equal(criterion.quoteSource.artifactId, id === 'MIS-CORE-MISSING-FACT-01' ? 'REPLY' : 'CHECK')
    assert.equal(criterion.quoteSource.path, id === 'MIS-CORE-MISSING-FACT-01' ? 'text' : 'fields.alternative')
    assert.ok(practiceUnitsFrom({ evaluation: result, mission, attempt: { id: 'a', userId: 'u' } }).some((u) => u.criterionId === criterionId && u.excerpt === text))
  }
})

test('CR04 concise followup: NOT_JUDGEABLE is neither unmet behaviour nor provider outage and is excluded from comparisons', async () => {
  const mission = latest('MIS-CORE-DISAGREE-01')
  const evaluator = createMissionEvaluator({ complete: async () => ({ content: { criteria: mission.rubric.criteria.map((c) => ({
    criterion_id: c.criterion_id, met: false, reason: 'NOT_JUDGEABLE', quote: '',
  })) } }) })
  const result = await evaluateMissionWork({ mission, work: { REPLY: { text: 'The details conflict.' } }, evaluator })
  assert.equal(result.status, 'EVALUATED')
  assert.equal(result.evaluator.available, true)
  assert.equal(result.evaluator.reason, null)
  assert.ok(result.criteria.every((c) => c.result === 'NOT_JUDGEABLE'))
  assert.ok(result.behaviors.every((b) => b.result === 'NOT_JUDGEABLE'))
  assert.equal(result.counts.notJudgeable, mission.target_behavior_ids.length)
  assert.equal(result.counts.uncertain, 0)
  assert.equal(result.verified, false)
  assert.equal(result.focus.completed, null)
  assert.equal(result.focus.nextChange, null)
  assert.match(result.focus.note, /work and context/)
  assert.deepEqual(result.counterpart.lines, [])
  assert.equal(result.counterpart.closing, null)
  assert.deepEqual(practiceUnitsFrom({ evaluation: result, mission, attempt: { id: 'a', userId: 'u' } }), [])
  const previous = { criteria: result.criteria.map((c) => ({ ...c, result: 'OBSERVED' })) }
  const comparison = compareAttempts(previous, result)
  assert.deepEqual(comparison.newlyMet, [])
  assert.deepEqual(comparison.noLongerMet, [])
  assert.deepEqual(comparison.notCompared, result.criteria.map((c) => c.criterionId))
  const repos = createMemoryCampusRepos()
  const service = createDevelopmentService({ repos, evaluator })
  await service.ensureSeeded()
  const { attempt } = await repos.development.createAttempt({
    userId: 'cr04-judgeability', missionId: mission.mission_id, missionVersion: mission.version,
    work: { REPLY: { text: 'The details conflict.' } }, idempotencyKey: 'cr04-judgeability',
  })
  const response = await service.submit({ id: 'cr04-judgeability' }, { type: 'PERSONAL' }, attempt.id)
  assert.ok(response.attempt.result.criteria.every((c) => c.result === 'NOT_JUDGEABLE' && /not a missing behaviour or a provider outage/.test(c.note)))
  assert.equal(response.attempt.result.counts.notJudgeable, result.counts.notJudgeable)
})

test('CR04 concise followup: courtesy and nonsense are semantic negatives, not short-text or outage decisions; empty fields stay local', async () => {
  const mission = latest('MIS-CORE-MISSING-FACT-01')
  for (const text of ['ok thanks', 'blue pear Tuesday']) {
    let calls = 0
    const evaluator = createMissionEvaluator({ complete: async () => {
      calls += 1
      return { content: { criteria: mission.rubric.criteria.map((c) => ({
        criterion_id: c.criterion_id, met: false, reason: 'NOT_EXPRESSED', quote: '',
      })) } }
    } })
    const result = await evaluateMissionWork({ mission, work: { REPLY: { text } }, evaluator })
    assert.equal(calls, 1)
    assert.equal(result.status, 'EVALUATED')
    assert.equal(result.counts.notJudgeable, 0)
    assert.ok(result.criteria.every((c) => c.result === 'NOT_OBSERVED' && c.reason === 'MEANING_NOT_EXPRESSED'))
    assert.equal(result.focus.completed, null)
  }
  const m02 = latest('MIS-CORE-CHECK-RECOMMENDATION-01')
  const failed = await evaluateMissionWork({
    mission: m02, work: { CHECK: { fields: { alternative: 'Print locally' } } },
    evaluator: createMissionEvaluator({ complete: async () => { throw new Error('fixture provider outage') } }),
  })
  assert.equal(failed.status, 'EVALUATION_UNAVAILABLE')
  assert.equal(failed.criteria.find((c) => c.criterionId === 'C-ALT').result, 'UNCERTAIN')
  assert.equal(failed.criteria.find((c) => c.criterionId === 'C-CLAIM').reason, 'EMPTY_WORK')
})

test('CR04 concise followup: two-word evidence cannot migrate between fields or earn praise when copied from exposed assistance', async () => {
  const mission = latest('MIS-CORE-CHECK-RECOMMENDATION-01')
  const evaluator = createMissionEvaluator({ complete: async () => ({ content: { criteria: [{
    criterion_id: 'C-ALT', met: true, reason: 'EXPRESSED', quote: 'Print locally',
  }] } }) })
  const wrongField = await evaluateMissionWork({ mission, work: { CHECK: { fields: { what_found: 'Print locally', alternative: 'An unrelated response.' } } }, evaluator })
  assert.equal(wrongField.criteria.find((c) => c.criterionId === 'C-ALT').reason, 'QUOTE_NOT_VERIFIED')
  const copied = await evaluateMissionWork({
    mission, work: { CHECK: { fields: { alternative: 'Print locally' } } }, evaluator,
    exposed: [{ source: 'HINT', id: 'short-hint', text: 'Print locally' }],
  })
  assert.equal(copied.criteria.find((c) => c.criterionId === 'C-ALT').result, 'COPIED_ASSISTANCE')
  assert.equal(copied.criteria.find((c) => c.criterionId === 'C-ALT').quoteSource, null)
  assert.equal(copied.focus.completed, null)
  assert.deepEqual(practiceUnitsFrom({ evaluation: copied, mission, attempt: { id: 'a', userId: 'u' } }), [])
})

test('CR04 concise followup: evaluator/BOTH retains confidence floor and distinguishes NOT_JUDGEABLE from a negative decision', async () => {
  const mission = parseMission(MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-MKT-EXP-01'))
  const work = { TEST_PLAN: { fields: { primary_metric: 'Sales' } } }
  for (const [observed, confidence, reason, expected] of [
    [true, 0.69, 'OBSERVED', 'UNCERTAIN'],
    [true, 0.7, 'OBSERVED', 'OBSERVED'],
    [false, 0.9, 'NOT_JUDGEABLE', 'NOT_JUDGEABLE'],
    [false, 0.9, 'NOT_OBSERVED', 'UNCERTAIN'],
  ]) {
    const evaluator = createMissionEvaluator({ complete: async ({ json_schema }) => {
      assert.ok(json_schema.schema.properties.criteria.items.properties.reason.enum.includes('NOT_JUDGEABLE'))
      return { content: { criteria: [{ criterion_id: 'C-METRIC', observed, confidence, reason, quote: observed ? 'Sales' : '' }] } }
    } })
    const result = await evaluateMissionWork({ mission, work, evaluator })
    const criterion = result.criteria.find((c) => c.criterionId === 'C-METRIC')
    assert.equal(criterion.result, expected)
    assert.equal(result.evaluator.available, true)
    if (expected === 'OBSERVED') assert.deepEqual(criterion.quoteSource, { artifactId: 'TEST_PLAN', path: 'fields.primary_metric', rowId: null, coverage: 'WHOLE_VALUE' })
    if (reason === 'NOT_OBSERVED') assert.equal(criterion.reason, 'CHECKS_DISAGREE', 'BOTH disagreement remains withheld')
  }
})
