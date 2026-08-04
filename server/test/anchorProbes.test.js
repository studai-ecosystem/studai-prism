// Charter §8 — standardized assessment core + §7.2 AI & Digital Fluency gate.
//
// Pins:
//   * the versioned anchor-probe bank (wording frozen, 5 dimensions, fixed
//     schedule, sufficiency thresholds);
//   * the avatar invariant: anchor wording/schedule CANNOT vary with candidate
//     name, avatar or persona — structurally (no such parameters exist) and at
//     runtime (byte-identical appended wording across different turns);
//   * §7.2 unconditionally: AIDF is scored ONLY with the direct probe + a
//     response over the threshold — otherwise `Insufficient evidence`;
//   * audit + turn-marking wiring in the /message and /evaluate handlers;
//   * the flag is registered and defaults OFF (ONE LAW: humans flip it).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isStandardizedCoreEnabled,
  anchorProbeBank,
  anchorDueForExchange,
  appendAnchorProbe,
  evaluateEvidenceSufficiency,
} from '../engine/anchorProbes.js'
import { DIMENSION_KEYS } from '../lib/sharedConstants.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── the versioned bank ───────────────────────────────────────────────────────

test('§8: the anchor bank is versioned and covers every reported dimension', () => {
  const bank = anchorProbeBank()
  assert.equal(bank.version, 'anchor-probes-v1')
  assert.deepEqual(Object.keys(bank.probes).sort(), [...DIMENSION_KEYS].sort())
  for (const dim of DIMENSION_KEYS) {
    assert.ok(bank.probes[dim].id.includes('v1'), `${dim} probe id is versioned`)
    assert.ok(bank.probes[dim].text.trim().length > 40, `${dim} probe has substantive fixed wording`)
    // Anchor wording is delivered verbatim — it must carry no template holes.
    assert.ok(!/\{\{|\}\}/.test(bank.probes[dim].text), `${dim} probe text has no placeholders`)
  }
})

test('§8: the schedule delivers one anchor per dimension at fixed exchanges', () => {
  const bank = anchorProbeBank()
  const dims = bank.policy.schedule.map((s) => s.dimension)
  assert.deepEqual([...dims].sort(), [...DIMENSION_KEYS].sort(), 'every dimension gets exactly one scheduled opportunity')
  const exchanges = bank.policy.schedule.map((s) => s.exchange)
  assert.deepEqual(exchanges, [...new Set(exchanges)], 'one anchor per exchange')
  assert.ok(Math.max(...exchanges) <= 6, 'the full floor is delivered within the guaranteed session length')
  assert.ok(bank.policy.minResponseWords >= 1)
  assert.ok(bank.policy.minOpportunitiesPerDimension >= 1)
})

test('§7.2: the AIDF probe targets workplace judgement with AI tools, with verification behaviour', () => {
  const bank = anchorProbeBank()
  const text = bank.probes.aiDigitalFluency.text
  assert.match(text, /AI/, 'names AI explicitly')
  assert.match(text, /check|verify/i, 'asks for verification judgement, not trivia')
})

// ── delivery determinism + avatar invariance ─────────────────────────────────

test('§8: anchorDueForExchange is deterministic and deduplicates per dimension', () => {
  const bank = anchorProbeBank()
  const slot = bank.policy.schedule[0]
  const a = anchorDueForExchange(slot.exchange, [])
  const b = anchorDueForExchange(slot.exchange, [])
  assert.deepEqual(a, b, 'same inputs, same anchor')
  assert.equal(a.dimension, slot.dimension)
  assert.equal(a.text, bank.probes[slot.dimension].text, 'wording comes byte-identical from the bank')
  const suppressed = anchorDueForExchange(slot.exchange, [{ dimension: slot.dimension }])
  assert.equal(suppressed, null, 'an already-presented dimension is never re-anchored')
  assert.equal(anchorDueForExchange(99, []), null, 'no anchor outside the schedule')
})

test('§8 AVATAR INVARIANT (structural): the anchor machinery accepts no candidate/avatar input', async () => {
  const source = await readFile(join(__dirname, '..', 'engine', 'anchorProbes.js'), 'utf-8')
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const banned of ['candidateName', 'avatarStyle', 'characterId', 'persona']) {
    assert.ok(!stripped.includes(banned), `anchorProbes.js must not reference ${banned} — wording cannot vary with it`)
  }
})

test('§8 AVATAR INVARIANT (runtime): appended anchor wording is byte-identical regardless of generated content', () => {
  const bank = anchorProbeBank()
  const anchor = anchorDueForExchange(bank.policy.schedule[0].exchange, [])
  const turnA = { messages: [{ speaker: 'Aditya', role: 'Teammate', content: 'I think we should report them to the professor right now.' }] }
  const turnB = { messages: [{ speaker: 'Divya', role: 'Organiser', content: 'The stalls will pull out, {{candidate}} — что вы думаете?' }, { speaker: 'Prof. Nair', role: 'Advisor', content: 'The budget is fixed.' }] }
  assert.ok(appendAnchorProbe(turnA, anchor))
  assert.ok(appendAnchorProbe(turnB, anchor))
  const lastA = turnA.messages.at(-1).content
  const lastB = turnB.messages.at(-1).content
  assert.ok(lastA.endsWith(anchor.text), 'anchor appended verbatim (A)')
  assert.ok(lastB.endsWith(anchor.text), 'anchor appended verbatim (B)')
  assert.equal(lastA.slice(-anchor.text.length), lastB.slice(-anchor.text.length), 'identical wording across different turns/casts')
})

test('§8: appendAnchorProbe fails closed on malformed turns (no record, no fabricated delivery)', () => {
  const anchor = anchorDueForExchange(1, [])
  assert.equal(appendAnchorProbe({}, anchor), false)
  assert.equal(appendAnchorProbe({ messages: [] }, anchor), false)
  assert.equal(appendAnchorProbe({ messages: [{ content: 42 }] }, anchor), false)
})

// ── §7.2 / §8 evidence sufficiency ───────────────────────────────────────────

const historyWith = (userTurns) => {
  const h = [{ role: 'assistant', content: '{"messages":[]}' }]
  for (const t of userTurns) {
    h.push({ role: 'user', content: `[Candidate]: ${t}` })
    h.push({ role: 'assistant', content: '{"messages":[]}' })
  }
  return h
}

test('§7.2 UNCONDITIONAL: without the direct probe, AIDF is insufficient — core flag irrelevant', () => {
  const s = evaluateEvidenceSufficiency({
    anchorRecords: [],
    history: historyWith(['a perfectly reasonable answer with many words in it']),
    coreEnabled: false,
  })
  assert.ok(s.insufficient.includes('aiDigitalFluency'), 'AIDF never inferred from ordinary conversation')
  for (const dim of DIMENSION_KEYS.filter((d) => d !== 'aiDigitalFluency')) {
    assert.ok(!s.insufficient.includes(dim), `${dim} keeps its legacy conversational basis with the core off`)
    assert.equal(s.perDimension[dim].basis, 'conversational')
  }
  assert.equal(s.policyVersion, 'anchor-probes-v1')
})

test('§7.2: AIDF scores when its anchor was presented AND answered over the word floor', () => {
  // Anchor on the AI reply to exchange 2 → the response is exchange 3.
  const records = [{ exchange: 2, dimension: 'aiDigitalFluency', probeId: 'anchor-aiDigitalFluency-v1', version: 'anchor-probes-v1' }]
  const sufficient = evaluateEvidenceSufficiency({
    anchorRecords: records,
    history: historyWith(['turn one answer', 'turn two answer', 'I would ask it to draft the summary and verify the numbers myself']),
    coreEnabled: false,
  })
  assert.ok(!sufficient.insufficient.includes('aiDigitalFluency'))
  assert.equal(sufficient.perDimension.aiDigitalFluency.basis, 'anchor-probe')

  const tooShort = evaluateEvidenceSufficiency({
    anchorRecords: records,
    history: historyWith(['turn one answer', 'turn two answer', 'no idea']),
    coreEnabled: false,
  })
  assert.ok(tooShort.insufficient.includes('aiDigitalFluency'), 'a sub-threshold response is not evidence')

  const unanswered = evaluateEvidenceSufficiency({
    anchorRecords: records,
    history: historyWith(['turn one answer', 'turn two answer']),
    coreEnabled: false,
  })
  assert.ok(unanswered.insufficient.includes('aiDigitalFluency'), 'a probe with no response is not evidence')
})

test('§8: with the core ON every dimension requires its anchor floor', () => {
  const bank = anchorProbeBank()
  const records = bank.policy.schedule.map((s) => ({ exchange: s.exchange, dimension: s.dimension, probeId: bank.probes[s.dimension].id, version: bank.version }))
  const answers = Array.from({ length: 7 }, (_, i) => `a substantive answer number ${i + 1} with clearly enough words`)
  const allGood = evaluateEvidenceSufficiency({ anchorRecords: records, history: historyWith(answers), coreEnabled: true })
  assert.deepEqual(allGood.insufficient, [], 'full schedule + full responses → all five reportable')

  const missingOne = evaluateEvidenceSufficiency({
    anchorRecords: records.filter((r) => r.dimension !== 'collaboration'),
    history: historyWith(answers),
    coreEnabled: true,
  })
  assert.deepEqual(missingOne.insufficient, ['collaboration'], 'a dimension without its opportunity is insufficient — never fabricated')
})

// ── wiring + governance ──────────────────────────────────────────────────────

test('§8: the flag defaults OFF and is registered for human governance (ONE LAW)', () => {
  assert.equal(isStandardizedCoreEnabled(), false, 'PRISM_STANDARDIZED_CORE defaults off — the agent flips nothing')
  const entry = FLAG_CATALOGUE.find((f) => f.key === 'PRISM_STANDARDIZED_CORE')
  assert.ok(entry, 'flag is in the governed catalogue')
  assert.equal(entry.risk, 'high')
  assert.equal(entry.owner, 'psychometrics')
})

test('§8: delivery, audit rows and fixed-turn marking are wired into the assessment routes', async () => {
  const source = await readFile(join(__dirname, '..', 'routes', 'assessment.js'), 'utf-8')
  assert.ok(source.includes("auditLog('anchor_probe_presented'"), 'every presented probe writes an audit row')
  assert.ok(source.includes("auditLog('evidence_sufficiency'"), 'every scoring run records the sufficiency decision')
  assert.ok(source.includes('anchorDueForExchange('), 'delivery goes through the versioned bank')
  assert.ok(source.includes('appendAnchorProbe('), 'wording is appended server-side, never generated')
  assert.ok(source.includes("turnType: anchorPresented ? 'fixed' : 'adaptive'"), 'fixed vs adaptive turns are distinguished in the decision trail')
  assert.ok(source.includes('evaluateEvidenceSufficiency('), '/evaluate applies the sufficiency policy')
  // Anchor turns suppress adaptive steering (evidence floor before adaptivity).
  assert.match(source, /if \(anchorDue\) \{[\s\S]{0,600}?directive = null/, 'fixed turns carry no adaptive directive')
})
