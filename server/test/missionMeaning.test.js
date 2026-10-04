// P6.8 — practice feedback assesses meaning, not formatting.
//   * Every DETERMINISTIC criterion in the ten missions is on a reviewed list
//     with the kind of claim its rule can honestly establish (text entered,
//     valid reference, constraint / required value). Nothing interpretive
//     ("defensible", "clearly", "substantively", "asks", "names the part") is
//     decided by a field length, a question mark or a required phrase.
//   * A concise valid paraphrase passes; punctuation is not evidence; long
//     nonsense fails; a bare punctuation pattern is refused by the schema.
//   * Negotiation / disagreement practice gets an in-character counterpart
//     reply bound to what the learner's message actually did; copied text
//     earns no line.
//   * M04 v3: a reworded task name counts; an owner must be a real person.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCompletionService } from '../services/ai/completionService.js'
import { auditConverse } from '../services/ai/auditConverse.js'
import { createMissionEvaluator } from '../domain/development/evaluator.js'
import { evaluateMissionWork, counterpartReply, COUNTERPART_NOTE } from '../domain/development/evaluate.js'
import { runDeterministicChecks, VALIDATORS_VERSION } from '../domain/development/validators.js'
import { MISSION_LIBRARY, P6_LIBRARY } from '../domain/development/missionLibrary.js'
import { parseMission, applyVariant, missionPackageGaps } from '../domain/development/missionSchema.js'
import { MISSION_FIXTURES, FILLER } from './fixtures/p6Missions.js'

process.env.NODE_ENV = 'test'
process.env.PRISM_AUDIT_AI = 'true'
delete process.env.PRISM_AUDIT_AI_FAULT

const latest = (id) => parseMission(MISSION_LIBRARY.filter((m) => m.mission_id === id).sort((x, y) => y.version - x.version)[0])
const MISSIONS = P6_LIBRARY.map((m) => latest(m.mission_id))
const harness = () => createMissionEvaluator({ complete: createCompletionService({ converseFn: auditConverse }) })
const by = (ev, id) => ev.criteria.find((c) => c.criterionId === id)

// The reviewed list: what each remaining deterministic criterion may claim.
//   ENTERED    a field contains text (confirms an answer was entered)
//   REFERENCE  the value names a participant / decision word that exists
//   CONSTRAINT arithmetic, a range, or a specific required value is present
const REVIEWED_DETERMINISTIC = {
  'MIS-CORE-HANDOVER-01': { 'C-OWNERSHIP': 'REFERENCE', 'C-CHECKPOINT': 'CONSTRAINT' },
  'MIS-CORE-BOUNDARY-01': { 'C-DECIDER': 'REFERENCE' },
  'MIS-CORE-REPLAN-01': { 'C-OWNERS': 'REFERENCE' },
  'MIS-CORE-REPAIR-01': { 'C-CORRECT': 'CONSTRAINT' },
  'MIS-CORE-USABLE-HANDOVER-01': { 'C-OWNERS': 'REFERENCE', 'C-DONE': 'ENTERED' },
  'MIS-CORE-NOT-TO-DO-01': { 'C-ORDER': 'CONSTRAINT', 'C-DECISIONS': 'REFERENCE' },
}
const KIND_FOR_RULE = { REQUIRED_FIELD: 'ENTERED', ONE_OF: 'REFERENCE', NUMBER_RANGE: 'CONSTRAINT', SUM_EQUALS: 'CONSTRAINT', TEXT_PATTERN: 'CONSTRAINT' }
const INTERPRETIVE = /defensible|clearly|substantiv|with a reason|addresses|explains|asks |engages|accurately|specific conflict|realistic|workable|meaningful/i

test('P6.8: every deterministic criterion across the ten missions is on the reviewed list and claims only what its rule kind can establish', () => {
  assert.equal(MISSIONS.length, 10)
  for (const m of MISSIONS) {
    const reviewed = REVIEWED_DETERMINISTIC[m.mission_id] || {}
    for (const c of m.rubric.criteria) {
      if (c.check === 'DETERMINISTIC' || c.check === 'BOTH') {
        assert.ok(reviewed[c.criterion_id], `${m.display_code} ${c.criterion_id} is a deterministic claim that has not been reviewed`)
        const rules = m.deterministic_validation_rules.filter((r) => r.criterion_id === c.criterion_id)
        assert.ok(rules.length >= 1)
        const kinds = new Set(rules.map((r) => KIND_FOR_RULE[r.type]))
        assert.ok(kinds.has(reviewed[c.criterion_id]), `${m.display_code} ${c.criterion_id}: rule kinds ${[...kinds]} do not establish ${reviewed[c.criterion_id]}`)
        assert.doesNotMatch(c.description, INTERPRETIVE, `${m.display_code} ${c.criterion_id}: "${c.description}" is interpretive but checked deterministically`)
        for (const r of rules) {
          assert.doesNotMatch(String(r.params.pattern || ''), /^\\\?$|^\\?[?!.]$/, `${m.display_code} ${r.rule_id} uses punctuation as evidence`)
          if (r.type === 'REQUIRED_FIELD') assert.ok(Number(r.params.min_length || 1) <= 8, `${m.display_code} ${r.rule_id}: a length floor of ${r.params.min_length} is length-as-substance`)
        }
      } else {
        assert.ok(!reviewed[c.criterion_id], `${m.display_code} ${c.criterion_id} is on the deterministic list but is a ${c.check} check`)
      }
      if (c.check === 'MEANING') assert.ok(c.meaning.intent.length > 20 && c.evaluator_guidance.includes('Not met'), `${m.display_code} ${c.criterion_id} says what is NOT met`)
    }
    assert.deepEqual(missionPackageGaps(m), [], `${m.display_code} package is complete`)
    assert.ok(m.rubric.criteria.some((c) => c.check === 'MEANING'), `${m.display_code} checks meaning`)
  }
  assert.equal(VALIDATORS_VERSION, 'mission-validators.v2')
})

test('P6.8: the schema refuses a punctuation-only pattern and a ONE_OF rule without options', () => {
  const m01 = MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-CORE-MISSING-FACT-01')
  const asksQuestionMark = { ...m01, deterministic_validation_rules: [{ rule_id: 'R-QM', criterion_id: 'C-HOLDS', type: 'TEXT_PATTERN', artifact_id: 'REPLY', path: 'text', params: { pattern: '\\?', flags: 'i' }, description: 'Has a question mark.' }] }
  assert.throws(() => parseMission(asksQuestionMark), /punctuation only/)
  const noOptions = { ...m01, deterministic_validation_rules: [{ rule_id: 'R-X', criterion_id: 'C-HOLDS', type: 'ONE_OF', artifact_id: 'REPLY', path: 'text', params: {}, description: 'x' }] }
  assert.throws(() => parseMission(noOptions), /needs options/)
})

test('P6.8 M01: "Please confirm the expected attendance" is a valid request without a question mark; filler and keyword lists are not', async () => {
  const M01 = latest('MIS-CORE-MISSING-FACT-01')
  const concise = 'Please confirm the expected attendance before I book anything, since Room 2 only seats twelve and two more teams were invited. Until I know that number the booking stays provisional.'
  const r = await evaluateMissionWork({ mission: M01, work: { REPLY: { text: concise } }, evaluator: harness() })
  assert.equal(r.status, 'EVALUATED')
  assert.equal(by(r, 'C-ASKS').result, 'OBSERVED', 'a request for information counts without a "?"')
  assert.equal(by(r, 'C-ASKS').check, 'MEANING')
  assert.equal(by(r, 'C-LIMIT').result, 'OBSERVED', 'the limit tied to the risk counts in any wording')
  assert.equal(by(r, 'C-HOLDS').result, 'OBSERVED')
  assert.ok(!concise.includes('?'))
  assert.equal(M01.deterministic_validation_rules.length, 0, 'nothing in M01 is decided by a pattern or a length')
  // Long polite nothing: nothing demonstrated, no praise.
  const f = await evaluateMissionWork({ mission: M01, work: { REPLY: { text: `${FILLER} ${FILLER}` } }, evaluator: harness() })
  assert.equal(f.counts.demonstrated, 0)
  assert.ok(f.criteria.every((c) => c.result === 'NOT_OBSERVED'), 'long text that says nothing meets nothing')
  assert.equal(f.focus.completed, null)
  // A question mark alone proves nothing.
  const qm = await evaluateMissionWork({ mission: M01, work: { REPLY: { text: 'Confirmed, Room 2 is booked for Tuesday, OK? Thanks for sorting it out so quickly, really appreciated!' } }, evaluator: harness() })
  assert.equal(by(qm, 'C-ASKS').result, 'NOT_OBSERVED')
})

test('P6.8: ONE_OF confirms a valid reference only — a real participant or decision word passes, prose or an outsider does not', () => {
  const M09 = latest('MIS-CORE-USABLE-HANDOVER-01')
  const fx = MISSION_FIXTURES['MIS-CORE-USABLE-HANDOVER-01']
  const owners = (names) => ({ ...fx.valid, BOARD: { rows: fx.valid.BOARD.rows.map((r, i) => ({ ...r, owner: names[i] ?? r.owner })) } })
  assert.equal(runDeterministicChecks(M09, fx.valid).get('C-OWNERS').observed, true)
  assert.equal(runDeterministicChecks(M09, fx.escalation).get('C-OWNERS').observed, true, 'an escalation to a named decider is a valid reference')
  assert.equal(runDeterministicChecks(M09, owners(['Lea', 'Someone sensible', 'Tom', 'Tom'])).get('C-OWNERS').observed, false, 'prose is not a participant')
  assert.equal(runDeterministicChecks(M09, owners(['Lea', 'Tomas', 'Tom', 'Tom'])).get('C-OWNERS').observed, false, 'a whole-word match is required')
  assert.equal(runDeterministicChecks(M09, fx.missingOwner).get('C-OWNERS').observed, false)
  const M10 = latest('MIS-CORE-NOT-TO-DO-01')
  const fx10 = MISSION_FIXTURES['MIS-CORE-NOT-TO-DO-01']
  assert.equal(runDeterministicChecks(M10, fx10.valid).get('C-DECISIONS').observed, true)
  const noDecision = { ...fx10.valid, BOARD: { rows: fx10.valid.BOARD.rows.map((r) => ({ ...r, decision: 'This one is really quite important for everyone.' })) } }
  assert.equal(runDeterministicChecks(M10, noDecision).get('C-DECISIONS').observed, false, 'words without a decision are not a decision')
})

test('P6.8 M05/M06: the counterpart replies in character from what the message actually did; copied text earns no line; the transfer scene has its own counterpart', async () => {
  const M05 = latest('MIS-CORE-DISAGREE-01')
  const fx = MISSION_FIXTURES['MIS-CORE-DISAGREE-01']
  assert.equal(M05.deterministic_validation_rules.length, 0, 'no length check stands in for substance')
  assert.ok(!M05.rubric.criteria.some((c) => c.criterion_id === 'C-SUBSTANTIVE'))
  const good = await evaluateMissionWork({ mission: M05, work: fx.valid, evaluator: harness() })
  assert.ok(good.counterpart, 'Mina replies')
  assert.equal(good.counterpart.name, 'Mina')
  assert.equal(good.counterpart.note, COUNTERPART_NOTE)
  const observed = good.criteria.filter((c) => c.result === 'OBSERVED').map((c) => c.criterionId)
  assert.ok(observed.length >= 1)
  for (const line of good.counterpart.lines) {
    assert.equal(line.when, by(good, line.criterionId).result, 'every line is bound to that criterion\'s actual result')
    assert.ok(M05.counterpart.reactions.some((r) => r.criterion_id === line.criterionId && r.when === line.when && r.text === line.text))
  }
  if (observed.length === M05.rubric.criteria.length) assert.equal(good.counterpart.closing, M05.counterpart.all_met)
  // Filler: Mina says what is missing; nothing is praised.
  const bad = await evaluateMissionWork({ mission: M05, work: fx.filler, evaluator: harness() })
  assert.ok(bad.counterpart.lines.length >= 1)
  assert.ok(bad.counterpart.lines.every((l) => l.when === 'NOT_OBSERVED'))
  assert.equal(bad.counterpart.closing, M05.counterpart.none_met)
  assert.match(bad.counterpart.lines.find((l) => l.criterionId === 'C-RESTATE').text, /not sure you heard/i)
  // Copied example: the copied criteria get no line at all.
  const ex = M05.examples.find((e) => e.kind === 'EXAMPLE')
  const copied = await evaluateMissionWork({ mission: M05, work: { REPLY: { text: ex.text } }, evaluator: harness(), exposed: [{ source: 'EXAMPLE', id: ex.example_id, text: ex.text }] })
  const flagged = copied.criteria.filter((c) => c.result === 'COPIED_ASSISTANCE').map((c) => c.criterionId)
  assert.ok(flagged.length >= 1)
  assert.ok(copied.counterpart.lines.every((l) => !flagged.includes(l.criterionId)), 'no in-character praise for borrowed words')
  assert.equal(copied.counterpart.closing, null)
  // An incomplete review gets no reply (nothing is guessed).
  const broken = await evaluateMissionWork({ mission: M05, work: fx.valid, evaluator: createMissionEvaluator({ complete: async () => ({ choices: [{ message: { content: 'nope' } }] }) }) })
  assert.equal(broken.status, 'EVALUATION_UNAVAILABLE')
  assert.equal(broken.counterpart, null)
  // Transfer: Omar, not Mina.
  const t = applyVariant(M05, 'TRANSFER')
  assert.equal(t.counterpart.name, 'Omar')
  const omar = counterpartReply({ mission: t, criteria: [{ criterionId: 'C-RESTATE', result: 'NOT_OBSERVED' }, { criterionId: 'C-DISAGREE', result: 'UNCERTAIN' }, { criterionId: 'C-NEXT', result: 'OBSERVED' }], status: 'EVALUATED' })
  assert.equal(omar.name, 'Omar')
  assert.deepEqual(omar.lines.map((l) => [l.criterionId, l.when]), [['C-RESTATE', 'NOT_OBSERVED'], ['C-NEXT', 'OBSERVED']])
  assert.equal(omar.closing, null, 'an uncertain criterion means no all/none closing')
  // M06: Priya replies too; a missing decider is named plainly.
  const M06 = latest('MIS-CORE-BOUNDARY-01')
  const fx6 = MISSION_FIXTURES['MIS-CORE-BOUNDARY-01']
  const noDecider = { REPLY: { fields: { ...fx6.valid.REPLY.fields, who_decides: '' } } }
  const r6 = await evaluateMissionWork({ mission: M06, work: noDecider, evaluator: harness() })
  assert.equal(by(r6, 'C-DECIDER').result, 'NOT_OBSERVED')
  assert.match(r6.counterpart.lines.find((l) => l.criterionId === 'C-DECIDER').text, /who decides/i)
  assert.equal(r6.counterpart.name, 'Priya')
})

test('P6.8 M04 v3: a reworded task name counts, an owner must be a person in the situation; v1 and v2 are untouched', async () => {
  const versions = MISSION_LIBRARY.filter((m) => m.mission_id === 'MIS-CORE-HANDOVER-01').map((m) => m.version)
  assert.deepEqual(versions, [1, 2, 3])
  const v2 = MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-CORE-HANDOVER-01' && m.version === 2)
  assert.equal(v2.rubric.criteria.find((c) => c.criterion_id === 'C-NAMES-TASKS').check, 'DETERMINISTIC', 'v2 keeps its stored checks')
  const M04 = latest('MIS-CORE-HANDOVER-01')
  assert.equal(M04.version, 3)
  assert.equal(M04.rubric.criteria.find((c) => c.criterion_id === 'C-NAMES-TASKS').check, 'MEANING')
  assert.equal(M04.rubric.criteria.find((c) => c.criterion_id === 'C-FIRST-STEP').check, 'MEANING')
  assert.ok(!M04.deterministic_validation_rules.some((r) => r.type === 'TEXT_PATTERN' && /vendor|checklist/.test(r.params.pattern)), 'no required phrase stands in for naming the tasks')
  const fx = MISSION_FIXTURES['MIS-CORE-HANDOVER-01']
  const reworded = { ...fx.valid, MESSAGE: { text: 'Sam, two tasks are still unowned while I am away: the quotes from the vendor, due Thursday, and the checklist for the launch, due Friday. Start with the venue call to lock the quote in.' } }
  const r = await evaluateMissionWork({ mission: M04, work: reworded, evaluator: harness() })
  assert.equal(by(r, 'C-NAMES-TASKS').result, 'OBSERVED', 'a reworded task name is not a failure')
  assert.equal(by(r, 'C-FIRST-STEP').result, 'OBSERVED')
  assert.equal(by(r, 'C-OWNERSHIP').result, 'OBSERVED')
  const outsider = { ...fx.valid, BOARD: { rows: [{ id: 'quotes', owner: 'Whoever is around' }, { id: 'checklist', owner: 'Sam' }] } }
  assert.equal(runDeterministicChecks(M04, outsider).get('C-OWNERSHIP').observed, false, 'an owner must be a person in the situation or a decide word')
  const t = applyVariant(M04, 'TRANSFER')
  assert.equal(t.transfer.rule_overrides, undefined)
  assert.ok(t.rubric.criteria.find((c) => c.criterion_id === 'C-NAMES-TASKS').meaning.synonyms.includes('comms pack'))
})
