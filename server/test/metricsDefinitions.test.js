// P9.2: event allow-list and metric definitions v1 are frozen, versioned and
// apply synthetic exclusions; no helper can redefine a denominator.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CANONICAL_EVENTS, LEGACY_EVENT_ALIASES, ALLOWED_PAYLOAD_KEYS, FORBIDDEN_PAYLOAD_KEYS, EVENT_SCHEMA_VERSION,
  canonicalEventName, validateEvent,
} from '../domain/metrics/events.js'
import { PRODUCT_EVENTS, PROP_RULES } from '../domain/telemetry/events.js'
import * as defs from '../domain/metrics/definitions.js'

const SPEC_EVENTS = [
  'intent_selected', 'preview_started', 'preview_feedback_seen', 'package_viewed', 'purchase_verified', 'formal_begin_acknowledged',
  'candidate_action_saved', 'opportunity_presented', 'evaluation_completed', 'evaluation_failed', 'report_published', 'report_opened',
  'moment_opened', 'practice_recommended', 'practice_started', 'practice_feedback_seen', 'practice_retried', 'fresh_challenge_completed',
  'application_self_reported', 'review_requested', 'share_created',
]

test('P9.2 events: the canonical list matches the source plan and is frozen', () => {
  assert.deepEqual([...CANONICAL_EVENTS], SPEC_EVENTS)
  assert.ok(Object.isFrozen(CANONICAL_EVENTS))
  assert.equal(EVENT_SCHEMA_VERSION, 'v1')
})

test('P9.2 events: existing telemetry names are reconciled by alias, never silently dropped', () => {
  for (const [legacy, canonical] of Object.entries(LEGACY_EVENT_ALIASES)) {
    assert.ok(PRODUCT_EVENTS.includes(legacy), `${legacy} is a real existing telemetry event`)
    assert.ok(CANONICAL_EVENTS.includes(canonical))
    assert.equal(canonicalEventName(legacy), canonical)
  }
  assert.equal(canonicalEventName('preview_started'), 'preview_started')
  assert.equal(canonicalEventName('made_up'), null)
})

test('P9.2 payload: any key outside the allow-list is a hard rejection; forbidden content keys cannot be expressed', () => {
  const good = validateEvent({ event: 'practice_started', props: { missionId: 'm-1', channel: 'VOLUNTARY', count: 1 } })
  assert.equal(good.ok, true)
  assert.equal(good.event, 'practice_started')
  const aliased = validateEvent({ event: 'mission_started', props: { missionId: 'm-1' } })
  assert.equal(aliased.ok, true)
  assert.equal(aliased.event, 'practice_started')
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    assert.equal(ALLOWED_PAYLOAD_KEYS.includes(key), false, `${key} must not be allow-listed`)
    const r = validateEvent({ event: 'report_opened', props: { [key]: 'x' } })
    assert.equal(r.ok, false, `${key} must be rejected`)
  }
  assert.equal(validateEvent({ event: 'report_opened', props: { surface: 'lowercase text here' } }).ok, false)
  assert.equal(validateEvent({ event: 'unknown_thing' }).ok, false)
  assert.equal(validateEvent({ event: 'report_opened', extra: 1 }).ok, false)
  // The existing prop allow-list stays a subset of the canonical one (no regression for current clients).
  for (const key of Object.keys(PROP_RULES)) {
    if (['cohortId', 'programId'].includes(key)) continue // campus-admin funnel props, out of scope for learner metrics
    assert.ok(ALLOWED_PAYLOAD_KEYS.includes(key), `existing prop ${key} remains allow-listed`)
  }
})

test('P9.2 definitions: v1, frozen, each with numerator/denominator/exclusions text; transfer is manual-only', () => {
  assert.equal(defs.METRIC_DEFINITIONS_VERSION, 'v1')
  assert.ok(Object.isFrozen(defs.METRIC_DEFINITIONS))
  const expected = ['saved_action_reliability', 'required_opportunity_delivery', 'technical_empty_report_rate', 'evidence_yield', 'comprehension', 'voluntary_practice_activation', 'seven_day_return', 'paid_conversion', 'transfer']
  assert.deepEqual([...defs.METRIC_IDS], expected)
  for (const id of expected) {
    const d = defs.METRIC_DEFINITIONS[id]
    assert.ok(Object.isFrozen(d))
    assert.equal(d.version, 'v1')
    assert.ok(d.numerator.length > 20 && d.denominator.length > 10 && d.exclusions.length >= 1, id)
    assert.throws(() => { d.denominator = 'something else' }, TypeError)
    assert.equal(typeof defs.METRIC_COMPUTE[id], 'function')
  }
  assert.equal(defs.METRIC_DEFINITIONS.transfer.manualOnly, true)
  assert.equal(defs.transfer().status, 'MANUAL_ONLY')
  assert.equal(defs.transfer().value, null)
  // No denominator-override helper exists on the module surface.
  for (const name of Object.keys(defs)) assert.equal(/override|redefine|setDenominator|withDenominator/i.test(name), false, name)
  const sig = Object.values(defs.METRIC_COMPUTE).map((fn) => fn.length)
  assert.ok(sig.every((n) => n <= 2), 'compute functions take rows (and an optional options bag), never a denominator')
})

test('P9.2 synthetic exclusion: is_synthetic, preview synthetic and DEV grants leave numerator and denominator', () => {
  assert.equal(defs.isSyntheticRow({ is_synthetic: true }), true)
  assert.equal(defs.isSyntheticRow({ props: { isSynthetic: true } }), true)
  assert.equal(defs.isSyntheticRow({ preview: { isSynthetic: true } }), true)
  assert.equal(defs.isSyntheticRow({ fundingSource: 'DEV' }), true)
  assert.equal(defs.isSyntheticRow({ fundingSource: 'PAID' }), false)
  const r = defs.savedActionReliability([
    { state: 'APPLIED', payloadHash: 'h1' }, { state: 'FAILED', payloadHash: 'h2' }, { state: 'ACCEPTED', payloadHash: 'h3', recoverable: false },
    { state: 'APPLIED', payloadHash: 'h4', isSynthetic: true }, { acknowledged: false },
  ])
  assert.deepEqual([r.numerator, r.denominator, r.value], [2, 3, 0.6667])
  assert.deepEqual(r.excluded, { synthetic: 1, unacknowledged: 1 })
  assert.equal(r.definitionVersion, 'v1')
})

test('P9.2 required opportunity delivery: interruptions reported separately, optional/ineligible excluded', () => {
  const r = defs.requiredOpportunityDelivery([
    { required: true, eligible: true, state: 'EVALUATED' }, { required: true, eligible: true, state: 'PRESENTED' },
    { required: true, eligible: true, state: 'PLANNED', interrupted: true }, { required: false, state: 'PLANNED' },
    { required: true, eligible: false, state: 'PLANNED' }, { required: true, eligible: true, state: 'EVALUATED', is_synthetic: true },
  ])
  assert.deepEqual([r.numerator, r.denominator], [2, 3])
  assert.deepEqual(r.separate, { interrupted: 1 })
  assert.deepEqual(r.excluded, { synthetic: 1, optional: 1, ineligible: 1 })
})

test('P9.2 technical empty-report rate separates genuinely limited evidence from technical faults', () => {
  const r = defs.technicalEmptyReportRate([
    { submitted: true, resultState: 'TECHNICAL_FAILURE' }, { submitted: true, limitedEvidence: true }, { submitted: true },
    { submitted: false }, { submitted: true, technicalFailure: true, fundingSource: 'DEV' },
  ])
  assert.deepEqual([r.numerator, r.denominator], [1, 3])
  assert.deepEqual(r.separate, { genuinelyLimitedEvidence: 1 })
  assert.equal(r.excluded.synthetic, 1)
})

test('P9.2 evidence yield is segmented by method and is not a score', () => {
  const r = defs.evidenceYield([
    { method: 'SLICE', meetsGovernedRule: true }, { method: 'SLICE', meetsGovernedRule: false }, { method: 'UNIVERSAL', meetsGovernedRule: true },
    { applicable: false, method: 'SLICE' },
  ])
  assert.deepEqual([r.numerator, r.denominator], [2, 3])
  assert.deepEqual(r.segments.SLICE, { numerator: 1, denominator: 2, value: 0.5 })
  assert.deepEqual(r.segments.UNIVERSAL, { numerator: 1, denominator: 1, value: 1 })
  assert.equal(r.excluded.notApplicable, 1)
})

test('P9.2 comprehension excludes coached sessions; both finding and next behaviour are required', () => {
  const r = defs.comprehension([
    { explainedFinding: true, explainedNextBehaviour: true }, { explainedFinding: true, explainedNextBehaviour: false },
    { explainedFinding: true, explainedNextBehaviour: true, coached: true },
  ])
  assert.deepEqual([r.numerator, r.denominator], [1, 2])
  assert.equal(r.excluded.coached, 1)
})

test('P9.2 voluntary practice activation: compulsory and unavailable never enter the rate', () => {
  const ev = (event, actorHash, props) => ({ event, actorHash, props })
  const r = defs.voluntaryPracticeActivation([
    ev('practice_recommended', 'a', { channel: 'VOLUNTARY', availability: 'AVAILABLE' }),
    ev('practice_recommended', 'b', { channel: 'VOLUNTARY', availability: 'AVAILABLE' }),
    ev('practice_recommended', 'c', { channel: 'COMPULSORY' }),
    ev('practice_recommended', 'd', { channel: 'VOLUNTARY', availability: 'UNAVAILABLE' }),
    ev('practice_recommended', 'e', {}),
    ev('mission_started', 'a', { channel: 'VOLUNTARY' }),
    ev('practice_started', 'c', { channel: 'COMPULSORY' }),
    ev('practice_started', 'z', { channel: 'VOLUNTARY' }),
    ev('practice_started', 'b', { channel: 'VOLUNTARY', isSynthetic: true }),
  ])
  assert.deepEqual([r.numerator, r.denominator, r.value], [1, 2, 0.5])
  assert.deepEqual(r.excluded, { synthetic: 1, compulsoryRecommendations: 1, unavailable: 1, unknownChannel: 1 })
  assert.deepEqual(r.separate, { compulsoryStarts: 1 })
})

test('P9.2 seven-day return uses a mature cohort and flags reminder/incentive-only returns', () => {
  const asOf = '2026-10-20T00:00:00Z'
  const r = defs.sevenDayReturn([
    { actorHash: 'a', firstAt: '2026-10-01T00:00:00Z', returns: [{ at: '2026-10-03T00:00:00Z' }] },
    { actorHash: 'b', firstAt: '2026-10-01T00:00:00Z', returns: [{ at: '2026-10-05T00:00:00Z', reminded: true }] },
    { actorHash: 'c', firstAt: '2026-10-01T00:00:00Z', returns: [{ at: '2026-10-01T05:00:00Z' }, { at: '2026-10-12T00:00:00Z' }] },
    { actorHash: 'd', firstAt: '2026-10-18T00:00:00Z', returns: [{ at: '2026-10-19T00:00:00Z' }] },
    { actorHash: 'e', firstAt: '2026-10-01T00:00:00Z', returns: [{ at: '2026-10-02T00:00:00Z' }], isSynthetic: true },
  ], { asOf })
  assert.deepEqual([r.numerator, r.denominator], [2, 3])
  assert.deepEqual(r.excluded, { synthetic: 1, immature: 1 })
  assert.deepEqual(r.separate, { onlyAfterReminder: 1, onlyAfterIncentive: 0 })
})

test('P9.2 paid conversion keeps channels apart, excludes DEV/INVITE funding and reports refunds separately', () => {
  const ev = (event, actorHash, props) => ({ event, actorHash, props })
  const r = defs.paidConversion([
    ev('offer_viewed', 'a', { channel: 'VOLUNTARY' }), ev('package_viewed', 'b', { channel: 'VOLUNTARY' }), ev('package_viewed', 'c', { channel: 'COMPULSORY' }),
    ev('purchase_verified', 'a', { channel: 'VOLUNTARY', fundingSource: 'PAID' }),
    ev('purchase_completed', 'b', { channel: 'VOLUNTARY', fundingSource: 'PAID', refunded: true }),
    ev('purchase_verified', 'c', { channel: 'COMPULSORY', fundingSource: 'PAID' }),
    ev('purchase_verified', 'x', { channel: 'VOLUNTARY', fundingSource: 'DEV' }),
    ev('purchase_verified', 'y', { channel: 'VOLUNTARY', fundingSource: 'INVITE' }),
  ])
  assert.deepEqual([r.numerator, r.denominator, r.value], [1, 2, 0.5])
  assert.equal(r.segments.COMPULSORY.value, 1)
  assert.deepEqual(r.separate, { refunded: 1 })
  assert.equal(r.excluded.synthetic, 1, 'DEV funding is synthetic')
  assert.equal(r.excluded.nonPaidFunding, 1, 'INVITE funding is excluded, not paid')
})
