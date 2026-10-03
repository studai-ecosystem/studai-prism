// P7.6 (CH-36, T46) — comparison eligibility rules on the growth snapshot
// chooser. A fixture APPROVED equivalence record (none is approved in
// reality) exercises the approved path: version/equivalence, spacing, form
// retirement and a pending report correction each withdraw comparability
// with an explicit reason; an unapproved pair is never comparable; a new
// result is an additional snapshot and never rewrites the earlier ones.
import test from 'node:test'
import assert from 'node:assert/strict'
import { choosePair, pairKey, compareCapability } from '../domain/growth/snapshot.js'

const entry = (sessionId, formId, completedAt, extra = {}) => ({ session: { sessionId, completedAt }, form: { id: formId, version: formId.split('-').pop() }, decisions: {}, ...extra })

// Fixture approval record: a human decision that does not exist in any real
// registry. Used only to exercise the approved path.
const APPROVED_FIXTURE = new Set([pairKey('CORE-FORM-A', 'CORE-FORM-B')])

test('T46: an unapproved form pair is never comparable, whatever else holds', () => {
  const entries = [entry('s2', 'CORE-FORM-C', '2026-09-01T00:00:00.000Z'), entry('s1', 'CORE-FORM-A', '2026-03-01T00:00:00.000Z')]
  assert.deepEqual(choosePair(entries, APPROVED_FIXTURE), { reason: 'FORMS_NOT_VALIDATED_FOR_COMPARISON' })
  assert.deepEqual(choosePair(entries, new Set()), { reason: 'FORMS_NOT_VALIDATED_FOR_COMPARISON' })
  assert.deepEqual(choosePair([entries[0]], APPROVED_FIXTURE), { reason: 'NEEDS_COMPARABLE_REASSESSMENT' })
})

test('T46: on a fixture-approved pair, equivalence, spacing, retirement and correction rules each apply with an explicit reason', () => {
  const later = entry('s2', 'CORE-FORM-B', '2026-09-01T00:00:00.000Z')
  const earlier = entry('s1', 'CORE-FORM-A', '2026-03-01T00:00:00.000Z')
  const ok = choosePair([later, earlier], APPROVED_FIXTURE)
  assert.equal(ok.reassessment.session.sessionId, 's2')
  assert.equal(ok.baseline.session.sessionId, 's1')
  // Spacing rule from the approval: 184 days apart satisfies 90, not 365.
  assert.ok(!choosePair([later, earlier], APPROVED_FIXTURE, { minSpacingDays: 90 }).reason)
  assert.deepEqual(choosePair([later, earlier], APPROVED_FIXTURE, { minSpacingDays: 365 }), { reason: 'TOO_CLOSE_IN_TIME' })
  // Form retirement propagates: either form retired → not comparable.
  assert.deepEqual(choosePair([later, earlier], APPROVED_FIXTURE, { retiredFormIds: new Set(['CORE-FORM-A']) }), { reason: 'FORM_RETIRED' })
  assert.deepEqual(choosePair([later, earlier], APPROVED_FIXTURE, { retiredFormIds: new Set(['CORE-FORM-B']) }), { reason: 'FORM_RETIRED' })
  // A pending report correction on either session holds the comparison.
  assert.deepEqual(choosePair([later, earlier], APPROVED_FIXTURE, { correctedSessionIds: new Set(['s1']) }), { reason: 'REPORT_CORRECTION_PENDING' })
  assert.deepEqual(choosePair([later, earlier], APPROVED_FIXTURE, { correctedSessionIds: new Set(['s2']) }), { reason: 'REPORT_CORRECTION_PENDING' })
})

test('T46: a new formal result is an additional snapshot; the earlier pair is not rewritten and an unapproved newer form withdraws the comparison', () => {
  const s1 = entry('s1', 'CORE-FORM-A', '2026-03-01T00:00:00.000Z')
  const s2 = entry('s2', 'CORE-FORM-B', '2026-09-01T00:00:00.000Z')
  const s3 = entry('s3', 'CORE-FORM-C', '2026-12-01T00:00:00.000Z')
  const before = choosePair([s2, s1], APPROVED_FIXTURE)
  assert.equal(before.baseline.session.sessionId, 's1')
  // The newest session is on a form with no approved pair: separate snapshots, explicit reason.
  assert.deepEqual(choosePair([s3, s2, s1], APPROVED_FIXTURE), { reason: 'FORMS_NOT_VALIDATED_FOR_COMPARISON' })
  // Inputs were not mutated.
  assert.equal(s1.session.completedAt, '2026-03-01T00:00:00.000Z')
  assert.equal(s2.form.id, 'CORE-FORM-B')
})

test('T46: a capability change is a level-label change with no number, and different evidence rules are not comparable', () => {
  const dec = (band, rulesVersion = 'r1') => ({ status: 'SUFFICIENT', level: { band }, rulesVersion })
  const c = compareCapability(dec('DEVELOPING'), dec('DEMONSTRATED'))
  assert.equal(c.comparable, true)
  assert.equal(c.direction, 'HIGHER')
  assert.equal(c.uncertainty, null)
  assert.equal(c.uncertaintyStatus, 'NOT_VALIDATED')
  assert.ok(!('delta' in c) && !('score' in c))
  assert.deepEqual(compareCapability(dec('DEVELOPING', 'r1'), dec('DEMONSTRATED', 'r2')), { comparable: false, reason: 'DIFFERENT_EVIDENCE_RULES' })
  assert.deepEqual(compareCapability(dec('DEVELOPING'), { status: 'INSUFFICIENT', level: null }), { comparable: false, reason: 'EVIDENCE_NOT_SUFFICIENT_IN_BOTH' })
})
