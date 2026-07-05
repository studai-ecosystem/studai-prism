// Track 5 gate tests — counterfactual replay + team-fit simulation.
//
// Gate 1: replay cannot alter any certified score (ledger isolation, proven
//         at source level: the replay surface has no import path to any
//         report/credential/telemetry writer).
// Gate 2: team-fit requires + verifies consent from every profile member.
// Gate 3: no numeric fit score exists anywhere in team-fit output.
// Gate 4: both features are invisible without their flags.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { detectMoments, truncateHistoryForReplay, isReplayEnabled, MAX_REPLAY_TURNS } from '../lib/replay.js'
import {
  isTeamfitEnabled, TEAMFIT_CONSENT_SCOPE, verifyTeamConsent, personaFromReport,
  sanitizeObservations, assertNoNumericFit, composeTwins, FORBIDDEN_FIT_KEYS,
} from '../lib/teamfit.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Gate 4: invisible without flags ──────────────────────────────────────────
test('T5: both surfaces are dark by default (flags off => 404)', async () => {
  delete process.env.PRISM_REPLAY
  delete process.env.PRISM_TEAMFIT
  assert.equal(isReplayEnabled(), false)
  assert.equal(isTeamfitEnabled(), false)
  const { buildApp } = await import('../app.js')
  const app = buildApp()
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    for (const path of ['/api/replay/00000000-0000-4000-8000-000000000000/moments', '/api/teamfit/teams']) {
      const res = await fetch(base + path)
      assert.equal(res.status, 404, `${path} must be invisible`)
    }
  } finally {
    server.close()
  }
})

// ── Gate 1: certified-score isolation (source-level proof) ───────────────────
test('T5.1: replay surface has NO import path to score/credential/telemetry writers', async () => {
  const forbidden = [
    'saveReport', 'issueCredential', 'recordItemResponse', 'recordTimelineEntry',
    'recordAbilityEstimate', 'recordSessionTranscript', 'recordBehavioralFeatures',
    'buildScoringPrompt', 'aggregateSamples', 'buildPanelPlan', 'equateScore',
  ]
  for (const f of ['routes/replay.js', 'lib/replay.js']) {
    const raw = await readFile(join(__dirname, '..', f), 'utf-8')
    const code = raw.replace(/^\s*\/\/.*$/gm, '') // comments may NAME the rule; code may not break it
    for (const name of forbidden) {
      assert.ok(!code.includes(name), `${f} must never touch ${name}`)
    }
    // And it never writes any certified table.
    for (const table of ['INSERT INTO item_responses', 'INSERT INTO judge_votes', 'UPDATE credentials', 'INSERT INTO credentials', 'INSERT INTO assessment_timeline', 'reports']) {
      assert.ok(!code.includes(table), `${f} must not write ${table}`)
    }
  }
  // The practice ledger is structurally practice: is_practice CHECK constraint.
  const migration = await readFile(join(__dirname, '..', 'db', 'migrations', '0009_replay_teamfit.sql'), 'utf-8')
  assert.ok(migration.includes('CHECK (is_practice)'), 'practice rows are permanently labeled practice')
})

// ── T5.1: moment detection math ──────────────────────────────────────────────
test('T5.1: moment detection finds theta drops and weak-evidence turns, deterministically', () => {
  const estimates = [
    { exchange_no: 1, theta_mean: 0.5 },
    { exchange_no: 2, theta_mean: 0.55 },
    { exchange_no: 3, theta_mean: 0.30 }, // big drop -> strongest moment
    { exchange_no: 4, theta_mean: 0.28 },
  ]
  const items = [
    { turnIndex: 1, signals: { criticalThinking: 0.8, communication: 0.7, collaboration: 0.6, problemSolving: 0.7, aiDigitalFluency: 0.2 } },
    { turnIndex: 2, signals: { criticalThinking: 0.8, communication: 0.1, collaboration: 0.6, problemSolving: 0.7, aiDigitalFluency: 0.2 } }, // communication dip
    { turnIndex: 3, signals: { criticalThinking: 0.8, communication: 0.7, collaboration: 0.6, problemSolving: 0.7, aiDigitalFluency: 0.2 } },
  ]
  const moments = detectMoments({ items, estimates, top: 3 })
  assert.ok(moments.length >= 2 && moments.length <= 3)
  const theta = moments.find((m) => m.kind === 'theta_drop')
  assert.equal(theta.exchangeNo, 3)
  assert.ok(Math.abs(theta.magnitude - 0.25) < 1e-9)
  const weak = moments.find((m) => m.kind === 'weak_evidence')
  assert.equal(weak.exchangeNo, 2)
  assert.equal(weak.dimension, 'communication')
  // Deterministic + capped + de-duped by exchange.
  assert.deepEqual(moments, detectMoments({ items, estimates, top: 3 }))
  assert.ok(new Set(moments.map((m) => m.exchangeNo)).size === moments.length)
  // Degenerate inputs never throw.
  assert.deepEqual(detectMoments({}), [])
  assert.deepEqual(detectMoments({ items: [{}], estimates: [{}] }), [])
})

test('T5.1: history reconstruction stops right before the replayed answer', () => {
  const history = [
    { role: 'user', content: 'Begin the scenario now. …' },
    { role: 'assistant', content: '{"messages":[{"content":"opening q"}]}' },
    { role: 'user', content: '[Candidate]: first answer' },
    { role: 'assistant', content: '{"messages":[{"content":"second q"}]}' },
    { role: 'user', content: '[Candidate]: second answer' },
    { role: 'assistant', content: '{"messages":[{"content":"third q"}]}' },
  ]
  const at2 = truncateHistoryForReplay(history, 2)
  assert.equal(at2.length, 4, 'ends just before the second candidate answer')
  assert.ok(at2[at2.length - 1].content.includes('second q'))
  const at1 = truncateHistoryForReplay(history, 1)
  assert.equal(at1.length, 2)
  assert.equal(truncateHistoryForReplay(history, 9), null, 'unknown exchange refuses')
  assert.equal(truncateHistoryForReplay(null, 1), null)
  assert.ok(MAX_REPLAY_TURNS <= 5, 'replay stays a practice rep, not a second assessment')
})

// ── Gate 2: consent verification for every member ────────────────────────────
test('T5.2: team registration consent — every member verified, missing listed', async () => {
  const consents = {
    'member-a': { scopes: ['data_processing', TEAMFIT_CONSENT_SCOPE] },
    'member-b': { scopes: ['data_processing'] }, // has NOT granted teamfit use
    'member-c': null, // never consented at all
  }
  const getConsentFn = async (sid) => consents[sid] || null
  const bad = await verifyTeamConsent(['member-a', 'member-b', 'member-c'], getConsentFn)
  assert.equal(bad.ok, false)
  assert.deepEqual(bad.missing, ['member-b', 'member-c'])
  const good = await verifyTeamConsent(['member-a'], getConsentFn)
  assert.equal(good.ok, true)
  // The scope is OPTIONAL — never part of the required assessment consent.
  const briefing = await readFile(join(__dirname, '..', '..', 'src', 'pages', 'Briefing.jsx'), 'utf-8')
  assert.ok(!briefing.includes(TEAMFIT_CONSENT_SCOPE), 'taking the assessment never implies teamfit consent')
  const route = await readFile(join(__dirname, '..', 'routes', 'teamfit.js'), 'utf-8')
  assert.ok(route.includes('verifyTeamConsent'), 'registration verifies consent')
  assert.ok(route.includes('409'), 'refusal is explicit')
})

// ── Gate 3: no numeric fit anywhere ──────────────────────────────────────────
test('T5.2: personas are qualitative — descriptors carry no scores', () => {
  const report = { scores: { criticalThinking: 82, communication: 45, collaboration: 91, problemSolving: 60, aiDigitalFluency: 30 } }
  const persona = personaFromReport(report, 'Twin A')
  assert.equal(persona.name, 'Twin A')
  assert.ok(persona.personality.length > 20)
  assert.ok(!/\d/.test(persona.personality), 'no digits leak from scores into the persona')
  assert.ok(!/\d/.test(persona.role))
})

test('T5.2: observation output is schema-clean — forbidden keys and numbers rejected', () => {
  const raw = {
    observations: [
      { pattern: 'Acknowledged Twin B\u2019s objection before countering', transcriptEvidence: '"I see your point about the deadline, but…"', skillContext: 'collaboration under disagreement' },
      { pattern: 'drew out the quieter twin', transcriptEvidence: '"What do you think?"', skillContext: 'inclusion' },
      { pattern: 'missing evidence — dropped', transcriptEvidence: null },
    ],
    fitScore: 87, // hostile smuggle attempt — must vanish
    compatibility: 'high',
  }
  const clean = sanitizeObservations(raw)
  assert.equal(clean.observations.length, 2)
  assert.ok(!('fitScore' in clean) && !('compatibility' in clean))
  assert.ok(clean.disclaimer.includes('no team-fit score'))
  assert.doesNotThrow(() => assertNoNumericFit(clean))
  // The structural guard catches every smuggling shape.
  assert.throws(() => assertNoNumericFit({ observations: [], teamFitScore: 9 }), /forbidden key/)
  assert.throws(() => assertNoNumericFit({ nested: { deep: { matchPercent: 'high' } } }), /forbidden key/)
  assert.throws(() => assertNoNumericFit({ observations: [{ pattern: 'x', weight: 3 }] }), /numeric value/)
  assert.throws(() => assertNoNumericFit({ hireRecommendation: 'yes' }), /forbidden key/)
  for (const k of ['fitScore', 'rating', 'rank', 'matchScore', 'hireSignal', 'recommendation']) {
    assert.ok(FORBIDDEN_FIT_KEYS.test(k), `${k} is banned`)
  }
})

test('T5.2: observer prompt forbids verdicts; teamfit route has no scoring imports', async () => {
  const prompt = await readFile(join(__dirname, '..', 'prompts', 'teamfit_observer.v1.md'), 'utf-8')
  for (const banned of ['NO score', 'NO rating', 'no hire/no-hire']) {
    assert.ok(prompt.toLowerCase().includes(banned.toLowerCase()), `observer prompt says ${banned}`)
  }
  const route = await readFile(join(__dirname, '..', 'routes', 'teamfit.js'), 'utf-8')
  for (const name of ['saveReport', 'issueCredential', 'buildScoringPrompt', 'aggregateSamples', 'recordItemResponse']) {
    assert.ok(!route.includes(name), `teamfit route must never touch ${name}`)
  }
  assert.ok(route.includes('assertNoNumericFit(clean)'), 'route enforces the guard at response time')
})

// ── T5.2: twin composition tolerates missing reports ─────────────────────────
test('T5.2: composeTwins skips members without completed reports', async () => {
  const reports = {
    a: { scores: { criticalThinking: 80, communication: 70, collaboration: 60, problemSolving: 75, aiDigitalFluency: 50 } },
    c: { scores: { criticalThinking: 40, communication: 85, collaboration: 90, problemSolving: 55, aiDigitalFluency: 65 } },
  }
  const twins = await composeTwins(['a', 'b', 'c'], async (sid) => reports[sid] || null)
  assert.equal(twins.length, 2)
  assert.deepEqual(twins.map((t) => t.name), ['Twin A', 'Twin B'])
})
