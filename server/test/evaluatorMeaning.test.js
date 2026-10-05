// P6.4 / T40 — the meaning (paraphrase) check. A valid paraphrase satisfies a
// MEANING criterion through the structured {met, quote, reason} output; a
// bare keyword list does not; empty work is "not met —
// EMPTY_WORK" without any model call and never produces invented feedback;
// malformed output leaves the criterion UNCERTAIN; the payload is
// identity-free. Runs over the deterministic audit harness provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCompletionService } from '../services/ai/completionService.js'
import { auditConverse } from './fixtures/missionAuditConverse.js'
import { createMissionEvaluator, buildMeaningMessages, MEANING_PROMPT, meaningWorkEmpty } from '../domain/development/evaluator.js'
import { evaluateMissionWork, practiceUnitsFrom } from '../domain/development/evaluate.js'
import { MISSION_LIBRARY } from '../domain/development/missionLibrary.js'
import { parseMission } from '../domain/development/missionSchema.js'

const M01 = parseMission(MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-CORE-MISSING-FACT-01'))
const harness = () => createMissionEvaluator({ complete: createCompletionService({ converseFn: auditConverse }) })
const work = (text) => ({ REPLY: { text } })
const by = (ev, id) => ev.criteria.find((c) => c.criterionId === id)

test('T40: a valid paraphrase is accepted with a verbatim quote; keyword stuffing alone is not', async () => {
  const paraphrase = 'Dev, before I confirm Room 2 I need to know roughly how many people are coming, because it only seats 12 and two more teams were invited. Could you check with them? Once I know the number I will either confirm Room 2 or ask for the bigger room.'
  const good = await evaluateMissionWork({ mission: M01, work: work(paraphrase), evaluator: harness(), candidateName: 'Asha Verma' })
  assert.equal(good.status, 'EVALUATED')
  assert.equal(by(good, 'C-ASKS').result, 'OBSERVED')
  assert.equal(by(good, 'C-LIMIT').result, 'OBSERVED')
  const unknown = by(good, 'C-NAMES-UNKNOWN')
  assert.equal(unknown.result, 'OBSERVED')
  assert.equal(unknown.reason, 'MEANING_EXPRESSED')
  assert.ok(unknown.quote && paraphrase.toLowerCase().includes(unknown.quote.toLowerCase()), 'the quote is the learner\'s own words')
  const holds = by(good, 'C-HOLDS')
  assert.equal(holds.result, 'OBSERVED')
  assert.ok(holds.quote.length >= 12)
  const units = practiceUnitsFrom({ evaluation: good, mission: M01, attempt: { id: 'a', userId: 'u' } })
  const meaningUnit = units.find((u) => u.criterionId === 'C-NAMES-UNKNOWN')
  assert.equal(meaningUnit.checkType, 'MEANING')
  assert.equal(meaningUnit.provenance.evaluatorPrompt, MEANING_PROMPT)
  assert.equal(meaningUnit.sourceType, 'MISSION_PRACTICE')

  // Keyword stuffing: the phrasings appear but carry no intent.
  const stuffed = 'headcount how many people number of people once I know until I know depends on ? 12'
  const bad = await evaluateMissionWork({ mission: M01, work: work(stuffed), evaluator: harness() })
  assert.equal(bad.status, 'EVALUATED')
  assert.equal(by(bad, 'C-NAMES-UNKNOWN').result, 'NOT_OBSERVED')
  assert.equal(by(bad, 'C-NAMES-UNKNOWN').reason, 'MEANING_KEYWORDS_ONLY')
  assert.equal(by(bad, 'C-HOLDS').result, 'NOT_OBSERVED')
  assert.equal(by(bad, 'C-NAMES-UNKNOWN').quote, null, 'no quote is invented for an unmet criterion')
})

test('T40: only empty work (including long whitespace) is "not met — EMPTY_WORK" with no model call', async () => {
  let calls = 0
  const spy = createMissionEvaluator({ complete: async (params, opts) => { calls += 1; return createCompletionService({ converseFn: auditConverse })(params, opts) } })
  for (const text of ['', '   \n\n   '.repeat(100)]) {
    const ev = await evaluateMissionWork({ mission: M01, work: work(text), evaluator: spy })
    assert.equal(ev.status, 'EVALUATED', 'empty work is decided, not "unavailable"')
    for (const id of ['C-NAMES-UNKNOWN', 'C-HOLDS']) {
      assert.equal(by(ev, id).result, 'NOT_OBSERVED')
      assert.equal(by(ev, id).reason, 'EMPTY_WORK')
      assert.equal(by(ev, id).quote, null)
    }
    assert.equal(ev.counts.demonstrated, 0)
  }
  assert.equal(calls, 0, 'the model is never asked about empty work')
  assert.equal(meaningWorkEmpty(['Headcount please']), false)
  assert.equal(meaningWorkEmpty(['Print locally']), false)
  // Even with no evaluator configured, empty work is a decision, not an outage.
  const none = await evaluateMissionWork({ mission: M01, work: work(''), evaluator: null })
  assert.equal(by(none, 'C-HOLDS').reason, 'EMPTY_WORK')
  assert.equal(none.status, 'EVALUATED')
})

test('T40: malformed or failing evaluator output keeps the attempt reviewable (UNCERTAIN), and a quote not in the work is never trusted', async () => {
  const text = 'Dev, I am not sure how many people are coming so I would rather hold the booking until we know.'
  const garbage = createMissionEvaluator({ complete: async () => ({ choices: [{ message: { content: 'not json at all' } }] }) })
  const g = await evaluateMissionWork({ mission: M01, work: work(text), evaluator: garbage })
  assert.equal(g.status, 'EVALUATION_UNAVAILABLE')
  assert.equal(by(g, 'C-NAMES-UNKNOWN').result, 'UNCERTAIN')
  assert.equal(by(g, 'C-NAMES-UNKNOWN').reason, 'EVALUATION_UNAVAILABLE')
  assert.equal(by(g, 'C-ASKS').result, 'UNCERTAIN', 'a meaning check is withheld, never guessed')
  // Deterministic (structural) checks still run without the evaluator.
  const M08 = parseMission(MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-CORE-REPAIR-01'))
  const g8 = await evaluateMissionWork({ mission: M08, work: { CORRECTION: { text: 'Apologies all, we start at 9:30 not 10:00; please fix your calendars.' } }, evaluator: garbage })
  assert.equal(by(g8, 'C-CORRECT').result, 'OBSERVED', 'deterministic checks still run')
  assert.equal(by(g8, 'C-OWN').result, 'UNCERTAIN')
  const failing = createMissionEvaluator({ complete: async () => { throw new Error('boom') } })
  const f = await evaluateMissionWork({ mission: M01, work: work(text), evaluator: failing })
  assert.equal(f.evaluator.reason, 'PROVIDER_ERROR')
  const fabricating = createMissionEvaluator({ complete: async () => ({ choices: [{ message: { content: JSON.stringify({ criteria: [
    { criterion_id: 'C-NAMES-UNKNOWN', met: true, quote: 'words the learner never wrote here', reason: 'EXPRESSED' },
    { criterion_id: 'C-HOLDS', met: true, quote: 'hold the booking until we know', reason: 'EXPRESSED' },
  ] }) } }] }) })
  const fb = await evaluateMissionWork({ mission: M01, work: work(text), evaluator: fabricating })
  assert.equal(by(fb, 'C-NAMES-UNKNOWN').result, 'UNCERTAIN')
  assert.equal(by(fb, 'C-NAMES-UNKNOWN').reason, 'QUOTE_NOT_VERIFIED')
  assert.equal(by(fb, 'C-HOLDS').result, 'OBSERVED')
})

test('T40: the meaning payload is identity-free and carries intent + phrasings, not rule internals', () => {
  const criteria = M01.rubric.criteria.filter((c) => c.check === 'MEANING')
  const msgs = buildMeaningMessages({ mission: M01, criteria, work: work('Asha Verma here: I need to know how many people are coming.'), candidateName: 'Asha Verma' })
  const system = msgs[0].content
  assert.ok(system.includes('MEANING CRITERIA (JSON)'))
  assert.ok(system.includes('"phrasings"'))
  assert.ok(!system.includes('Asha'), 'the learner\'s name is tokenised out')
  assert.ok(!/rule_id|"pattern"/.test(system))
  assert.ok(/not enough on its own/i.test(system), 'the prompt forbids keyword-only credit')
})
