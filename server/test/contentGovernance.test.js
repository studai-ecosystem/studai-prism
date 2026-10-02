// P4.8 — content version governance: the transition guard needs a reviewer
// permission and a reason, follows the allowed graph, and nothing is
// published by default (CORE-TEAMREADY-A stays DRAFT).
import test from 'node:test'
import assert from 'node:assert/strict'
import { CONTENT_STATES, canTransition, guardTransition, createContentRegistry, contentRegistry } from '../domain/content/versions.js'
import { CORE_TEAMREADY_A } from '../domain/assessments/universalForm.js'

const reviewer = { id: 'adm-1', email: 'reviewer@test.local', permissions: new Set(['content:read', 'content:publish']) }
const reader = { id: 'adm-2', email: 'reader@test.local', permissions: new Set(['content:read']) }
const REASON = 'Content review requested after internal read-through.'

test('states and graph', () => {
  assert.deepEqual([...CONTENT_STATES], ['DRAFT', 'REVIEW', 'APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE', 'RETIRED'])
  assert.ok(canTransition('DRAFT', 'REVIEW'))
  assert.ok(canTransition('REVIEW', 'APPROVED_FOR_PILOT'))
  assert.ok(canTransition('APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE'))
  assert.equal(canTransition('DRAFT', 'APPROVED_FOR_PILOT'), false, 'no skipping review')
  assert.equal(canTransition('DRAFT', 'APPROVED_FOR_INTENDED_USE'), false)
  assert.equal(canTransition('RETIRED', 'DRAFT'), false)
  assert.equal(canTransition('APPROVED_FOR_INTENDED_USE', 'DRAFT'), false, 'published content is immutable; revise as a new version')
})

test('guardTransition requires a reviewer permission and a reason', () => {
  assert.throws(() => guardTransition({ from: 'DRAFT', to: 'REVIEW', actor: reader, reason: REASON }), (e) => e.code === 'FORBIDDEN')
  assert.throws(() => guardTransition({ from: 'DRAFT', to: 'REVIEW', actor: reviewer, reason: '' }), (e) => e.code === 'VALIDATION_FAILED')
  assert.throws(() => guardTransition({ from: 'DRAFT', to: 'REVIEW', actor: reviewer, reason: 'short' }), (e) => e.code === 'VALIDATION_FAILED')
  assert.throws(() => guardTransition({ from: 'DRAFT', to: 'APPROVED_FOR_PILOT', actor: reviewer, reason: REASON }), (e) => e.code === 'VALIDATION_FAILED')
  assert.throws(() => guardTransition({ from: 'DRAFT', to: 'PUBLISHED', actor: reviewer, reason: REASON }), (e) => e.code === 'VALIDATION_FAILED')
  const entry = guardTransition({ from: 'DRAFT', to: 'REVIEW', actor: reviewer, reason: REASON, at: new Date('2026-10-02T10:00:00Z') })
  assert.deepEqual(entry, { state: 'REVIEW', from: 'DRAFT', at: '2026-10-02T10:00:00.000Z', by: 'adm-1', reason: REASON })
  assert.ok(guardTransition({ from: 'DRAFT', to: 'REVIEW', actor: { permissions: new Set(['*']) }, reason: REASON }))
})

test('registry: forms start DRAFT, transitions are recorded in approval history, module content never changes', () => {
  const reg = createContentRegistry({ clock: () => new Date('2026-10-02T10:00:00Z') })
  const forms = reg.listForms()
  assert.ok(forms.every((f) => f.state === 'DRAFT'), 'nothing is published by default')
  const universal = forms.find((f) => f.formId === CORE_TEAMREADY_A.formId)
  assert.equal(universal.kind, 'UNIVERSAL_FORM')
  assert.equal(universal.opportunities, CORE_TEAMREADY_A.opportunities.length)
  const out = reg.transition({ formId: CORE_TEAMREADY_A.formId, to: 'REVIEW', actor: reviewer, reason: REASON })
  assert.equal(out.before, 'DRAFT')
  assert.equal(out.state, 'REVIEW')
  assert.equal(reg.stateOf(CORE_TEAMREADY_A.formId), 'REVIEW')
  assert.deepEqual(reg.listVersions(CORE_TEAMREADY_A.id)[0].approvalHistory.map((h) => h.state), ['DRAFT', 'REVIEW'])
  assert.throws(() => reg.transition({ formId: CORE_TEAMREADY_A.formId, to: 'REVIEW', actor: reviewer, reason: REASON }), (e) => e.code === 'VALIDATION_FAILED')
  assert.throws(() => reg.transition({ formId: 'nope:1', to: 'REVIEW', actor: reviewer, reason: REASON }), (e) => e.code === 'NOT_FOUND')
  assert.throws(() => reg.listVersions('nope'), (e) => e.code === 'NOT_FOUND')
  // The authored module content is untouched by the registry.
  assert.deepEqual(CORE_TEAMREADY_A.approvalHistory.map((h) => h.state), ['DRAFT'])
  assert.equal(CORE_TEAMREADY_A.status, 'DRAFT')
  // The process-wide registry is independent of this test registry.
  assert.equal(contentRegistry.stateOf(CORE_TEAMREADY_A.formId), 'DRAFT')
})
