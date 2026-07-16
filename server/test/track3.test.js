// Track 3 gate tests — behavioral signal capture + pressure dynamics.
//
// T3.1: telemetry clamping (untrusted client), session rollup math with
//       latency-vs-complexity residuals, audio-never-persisted enforcement,
//       consent copy covers interaction-pattern research use.
// T3.2: pressure probes are flag-gated (default OFF), fairness-scheduled,
//       skill-mapped, and documented.
// T3.5: detection is advisory-only in the credential schema — controlled
//       vocabulary, no machine verdicts.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sanitizeBehaviorTelemetry } from '../lib/behavioralFeatures.js'
import { summarizeSessionBehavior } from '../lib/telemetry.js'
import { selectPressure, selectProbe, PRESSURE_PROBES, isPressureEnabled } from '../engine/probeSelector.js'
import { EvidenceLedger } from '../engine/evidenceLedger.js'
import { DIMENSION_KEYS } from '../lib/sharedConstants.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── T3.1: clamping the untrusted client summary ──────────────────────────────
test('T3.1: behavior telemetry is whitelisted and clamped', () => {
  const out = sanitizeBehaviorTelemetry({
    responseMs: 25000.7,
    modality: 'typed',
    typing: {
      keyCount: 420, backspaceCount: 37, grossChars: 400, netChars: 350,
      revisionRatio: 0.125, firstKeyMs: 1800, meanInterKeyMs: 160,
      medianInterKeyMs: 140, sdInterKeyMs: 90, longPauseCount: 2,
      maxPauseMs: 5200, pasteAttempts: 1,
      evil: 'ignored', __proto__: { hacked: true },
    },
    voice: { speechOnsetMs: 900, recordingMs: 30000, silenceGapCount: 1, extra: 'dropped' },
    injected: { deep: 'payload' },
  })
  assert.equal(out.responseMs, 25001)
  assert.equal(out.modality, 'typed')
  assert.equal(out.typing.keyCount, 420)
  assert.equal(out.typing.revisionRatio, 0.125)
  assert.equal(out.voice.speechOnsetMs, 900)
  assert.ok(!('evil' in out.typing) && !('extra' in out.voice) && !('injected' in out))

  // Hostile values: negative, Infinity, NaN, absurd magnitudes, wrong types.
  const hostile = sanitizeBehaviorTelemetry({
    responseMs: -5, modality: 'telepathy',
    typing: { keyCount: Infinity, meanInterKeyMs: NaN, revisionRatio: 99, maxPauseMs: 1e12 },
    voice: { speechOnsetMs: 'soon', recordingMs: -1 },
  })
  assert.equal(hostile.responseMs, 0)
  assert.ok(!('modality' in hostile))
  assert.ok(!('keyCount' in (hostile.typing || {})))
  assert.equal(hostile.typing.revisionRatio, 1) // clamped to [0,1]
  assert.equal(hostile.typing.maxPauseMs, 30 * 60 * 1000) // capped at test length
  assert.equal(hostile.voice.recordingMs, 0)

  assert.equal(sanitizeBehaviorTelemetry(null), null)
  assert.equal(sanitizeBehaviorTelemetry('string'), null)
  assert.equal(sanitizeBehaviorTelemetry({ junk: true }), null)
})

// ── T3.1: session rollup + residuals ─────────────────────────────────────────
test('T3.1: session rollup computes latency stats and within-session residuals', () => {
  // Latency perfectly linear in prompt complexity -> residuals ~ 0.
  const turns = [20, 40, 60, 80].map((w, i) => ({
    responseMs: 1000 * w, promptWordCount: w, modality: 'typed',
    typing: { meanInterKeyMs: 150 + i, revisionRatio: 0.1, backspaceCount: 5, longPauseCount: 1, pasteAttempts: 0 },
  }))
  const roll = summarizeSessionBehavior(turns)
  assert.equal(roll.turns, 4)
  assert.equal(roll.latency.n, 4)
  assert.equal(roll.latency.min, 20000)
  assert.equal(roll.latency.max, 80000)
  assert.equal(roll.latencyResiduals.perTurn.length, 4)
  for (const r of roll.latencyResiduals.perTurn) assert.ok(Math.abs(r) < 2, `residual ${r} ~ 0 for a perfect line`)
  assert.equal(roll.typing.backspaceTotal, 20)
  assert.deepEqual(roll.modalities, ['typed'])

  // An outlier turn (relay-like stall) shows up as a big residual.
  const stalled = [...turns, { responseMs: 300000, promptWordCount: 30, modality: 'typed' }]
  const roll2 = summarizeSessionBehavior(stalled)
  assert.ok(Math.max(...roll2.latencyResiduals.perTurn.map(Math.abs)) > 50000)

  // Fewer than 3 latency/complexity pairs -> no residual fit, no crash.
  assert.equal(summarizeSessionBehavior(turns.slice(0, 2)).latencyResiduals, null)
  assert.deepEqual(summarizeSessionBehavior([]).modalities, [])
})

// ── T3.1: audio never persisted (audit-established rule) ─────────────────────
test('T3.1: voice path keeps audio in memory only — no disk writes anywhere', async () => {
  const route = await readFile(join(__dirname, '..', 'routes', 'assessment.js'), 'utf-8')
  assert.ok(route.includes('multer.memoryStorage()'), 'transcribe upload must use memoryStorage')
  assert.ok(!route.includes('diskStorage'), 'no multer diskStorage')
  const speechToText = await readFile(join(__dirname, '..', 'services', 'ai', 'speechToTextService.js'), 'utf-8')
  for (const banned of ['writeFile', 'createWriteStream', 'appendFile']) {
    assert.ok(!speechToText.includes(banned), `speechToTextService.js must not persist audio (${banned})`)
  }
  // Client meter derives timing from loudness only — never records/uploads.
  const meter = await readFile(join(__dirname, '..', '..', 'src', 'lib', 'turnSignals.js'), 'utf-8')
  assert.ok(!meter.includes('MediaRecorder'), 'turnSignals must not record audio')
  for (const banned of ['prosody', 'emotion', 'sentiment']) {
    assert.ok(!meter.toLowerCase().includes(`measure ${banned}`), 'no prosody/emotion measurement')
  }
})

// ── T3.1: consent copy covers behavioral-signal research use ─────────────────
test('T3.1: research consent names interaction-pattern signals; version bumped', async () => {
  const briefing = await readFile(join(__dirname, '..', '..', 'src', 'pages', 'Briefing.jsx'), 'utf-8')
  const researchItem = briefing.split('\n').find((l) => l.includes("scope: 'research_calibration'"))
  assert.ok(researchItem, 'research_calibration consent item exists')
  for (const word of ['interaction patterns', 'timing', 'typing']) {
    assert.ok(researchItem.toLowerCase().includes(word), `consent copy names "${word}"`)
  }
  const { CONSENT_VERSION } = await import('../lib/sharedConstants.js')
  assert.ok(CONSENT_VERSION >= '2026-07-05.1', 'CONSENT_VERSION bumped with the copy change')
})

// ── T3.2: pressure probes — flag, fairness, skill mapping ────────────────────
test('T3.2: pressure is OFF by default and never fires when disabled', () => {
  delete process.env.PRISM_PRESSURE
  assert.equal(isPressureEnabled(), false)
  const probe = selectProbe(new EvidenceLedger(), { nextExchange: 5, pressureEnabled: false, pressureTurns: [] })
  assert.equal(probe.pressure, null)
  assert.ok(!probe.directive.includes('PRESSURE MOVE'))
})

test('T3.2: every pressure kind maps to a scored dimension (documented contract)', async () => {
  for (const [kind, spec] of Object.entries(PRESSURE_PROBES)) {
    assert.ok(DIMENSION_KEYS.includes(spec.dimension), `${kind} evidences a real dimension`)
  }
  // The registry doc exists and names every kind + its dimension.
  const doc = await readFile(join(__dirname, '..', '..', 'docs', 'pressure-probes-v1.md'), 'utf-8')
  for (const [kind, spec] of Object.entries(PRESSURE_PROBES)) {
    assert.ok(doc.includes(kind), `doc covers ${kind}`)
    assert.ok(doc.includes(spec.dimension), `doc names ${spec.dimension}`)
  }
})

test('T3.2: fairness scheduling — never early, spaced, capped, one pressure source per turn', () => {
  const base = { pressureEnabled: true, pressureTurns: [], candidateQuote: 'earlier I argued we should pilot the change for one month first' }
  // Never in the opening exchanges.
  assert.equal(selectPressure('communication', { ...base, nextExchange: 3 }), null)
  // Fires from exchange 4, matched to the target dimension.
  const p = selectPressure('communication', { ...base, nextExchange: 4 })
  assert.equal(p.kind, 'micro_response')
  assert.equal(p.dimension, 'communication')
  // Spacing: another probe 2 turns later is suppressed.
  const spaced = selectPressure('communication', {
    ...base, nextExchange: 6, pressureTurns: [{ exchange: 4, kind: 'micro_response' }],
  })
  assert.equal(spaced, null)
  // Session cap: two probes used -> no third, ever.
  const capped = selectPressure('problemSolving', {
    ...base, nextExchange: 12,
    pressureTurns: [{ exchange: 4, kind: 'micro_response' }, { exchange: 8, kind: 'contingency_shift' }],
  })
  assert.equal(capped, null)
  // Callback requires the candidate's own (sanitized) words.
  const noQuote = selectPressure('criticalThinking', { ...base, candidateQuote: null, nextExchange: 5 })
  assert.equal(noQuote.kind, 'contingency_shift', 'falls back when no quote is available')
  const withQuote = selectPressure('criticalThinking', { ...base, nextExchange: 5 })
  assert.equal(withQuote.kind, 'callback')
  assert.ok(withQuote.line.includes(base.candidateQuote))
  // Challenger turns never stack with pressure (one source at a time).
  const ledger = new EvidenceLedger()
  const probe = selectProbe(ledger, { nextExchange: 5, pressureEnabled: true, pressureTurns: [], candidateQuote: base.candidateQuote })
  if (probe.deployChallenger) assert.equal(probe.pressure, null)
})

// ── T3.5: detection is advisory-only in the credential schema ────────────────
test('T3.5: credential schema encodes human review, never a machine verdict', async () => {
  const raw = await readFile(join(__dirname, '..', '..', 'docs', 'evidence-bundle-schema-v1.json'), 'utf-8')
  const schema = JSON.parse(raw)
  const review = schema.properties.review
  assert.ok(review, 'schema declares the review field')
  assert.deepEqual(review.properties.status.enum, ['none', 'human_review_pending', 'human_reviewed'])
  assert.deepEqual(review.properties.outcome.enum, ['confirmed_valid', 'annulled', null])
  // Controlled vocabulary contains no accusatory or automated verdict.
  assert.ok(!raw.toLowerCase().includes('cheater'))
  const vocab = [...review.properties.status.enum, ...review.properties.outcome.enum].filter(Boolean)
  for (const term of vocab) {
    assert.ok(!/auto|cheat|fraud|fail/i.test(term), `verdict vocabulary stays human + neutral: ${term}`)
  }
  // And the bundle assembly carries it (advisory default: none).
  const cred = await readFile(join(__dirname, '..', 'lib', 'credentials.js'), 'utf-8')
  assert.ok(cred.includes("review: { status: 'none', outcome: null }"))
})
