// P4.8 — content review tooling through the real admin forms router with an
// injected in-memory review store and audit capture: full version package,
// structured diff, synthetic preview (NO session, NO evidence writes),
// coverage matrix, exemplar/counterexample attachments, comments, role-checked
// reviewer decisions, the pilot approval gate (409 until a CONTENT and a
// MEASUREMENT reviewer have both approved), draft edits as NEW immutable
// versions, and an audit event for every mutation. CORE-TEAMREADY-A stays
// DRAFT in the process-wide registry: nothing here self-approves content.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createFormsRouter } from '../routes/admin/content.js'
import { createContentRegistry, contentRegistry, pilotApprovalGate } from '../domain/content/versions.js'
import { createContentTooling, createMemoryReviewStore, diffPackages, coverageMatrix, syntheticPreview, validateFormPackage } from '../domain/content/tooling.js'
import { CORE_TEAMREADY_A } from '../domain/assessments/universalForm.js'
import { ROLES } from '../lib/adminRbac.js'
import evidenceGraph from '../lib/evidenceGraph.js'

const ID = CORE_TEAMREADY_A.id
const V1 = CORE_TEAMREADY_A.version
const V2 = '0.2.0-draft'
const REASON = 'Reviewed the full package against the blueprint and the confound list.'

function world() {
  const registry = createContentRegistry({ clock: () => new Date('2026-10-03T00:00:00Z') })
  const store = createMemoryReviewStore()
  const tooling = createContentTooling({ registry, store, clock: () => new Date('2026-10-03T00:00:00Z') })
  const audits = []
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role']
    if (role === 'super') req.admin = { id: 'admin-super', permissions: new Set(['*']) }
    else if (role) req.admin = { id: `admin-${role}`, permissions: new Set(ROLES[role].permissions) }
    next()
  })
  app.use('/api/admin/content', createFormsRouter({ registry, tooling, audit: async (req, e) => { audits.push({ admin: req.admin?.id, ...e }) } }))
  const server = app.listen(0)
  const base = () => `http://127.0.0.1:${server.address().port}/api/admin/content`
  const call = async (role, method, path, body) => {
    const r = await fetch(`${base()}${path}`, { method, headers: { ...(role ? { 'x-test-role': role } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  return { registry, store, tooling, audits, call, close: () => new Promise((r) => server.close(r)) }
}
const draftPackage = (mutate) => { const pkg = JSON.parse(JSON.stringify(CORE_TEAMREADY_A)); pkg.version = V2; mutate?.(pkg); return pkg }

test('versions: full package (reviewer plane), permission gates, unknown id/version 404', async () => {
  const w = world()
  try {
    assert.equal((await w.call(null, 'GET', `/forms/${ID}/versions/${V1}`)).status, 401)
    assert.equal((await w.call('finance_admin', 'GET', `/forms/${ID}/versions/${V1}`)).status, 403)
    const r = await w.call('content_admin', 'GET', `/forms/${ID}/versions/${V1}`)
    assert.equal(r.status, 200)
    assert.equal(r.body.state, 'DRAFT')
    assert.equal(r.body.package.opportunities.length, 16)
    assert.equal(r.body.package.stages.length, 6)
    assert.ok(r.body.package.rubric.anchorsByBehaviour.QUESTION_ASSUMPTION, 'reviewers see the private anchors')
    assert.deepEqual(r.body.pilotGate, { ok: false, contentApprovals: 0, measurementApprovals: 0, missing: ['CONTENT_APPROVAL', 'MEASUREMENT_APPROVAL'] })
    assert.equal((await w.call('content_admin', 'GET', `/forms/${ID}/versions/9.9.9`)).status, 404)
    assert.equal((await w.call('content_admin', 'GET', `/forms/nope/versions/${V1}`)).status, 404)
  } finally { await w.close() }
})

test('coverage matrix: every family has ≥ 2 required groups, every behaviour is targeted, counts only', async () => {
  const w = world()
  try {
    const r = await w.call('content_admin', 'GET', `/forms/${ID}/coverage`)
    assert.equal(r.status, 200)
    assert.equal(r.body.families.length, 5)
    for (const f of r.body.families) { assert.ok(f.requiredGroups >= 2, f.capabilityId); assert.equal(f.meetsAuthoringFloor, true) }
    assert.deepEqual(r.body.untargetedBehaviours, [])
    assert.equal(r.body.stages.length, 6)
    assert.match(r.body.note, /not the governed evidence sufficiency floor/)
    assert.ok(!/"score|percent|rubricLevel/i.test(JSON.stringify(r.body)), 'coverage carries counts, never scores')
    // Measurement reviewers (scenarios:read) can read the matrix; finance cannot.
    assert.equal((await w.call('psychometric_admin', 'GET', `/forms/${ID}/coverage`)).status, 200)
    assert.equal((await w.call('finance_admin', 'GET', `/forms/${ID}/coverage`)).status, 403)
    assert.deepEqual(coverageMatrix(CORE_TEAMREADY_A).families.map((f) => f.capabilityId), r.body.families.map((f) => f.capabilityId))
  } finally { await w.close() }
})

test('synthetic preview: six stages rendered from permitted facts, render hashes recorded, nothing written', async () => {
  const w = world()
  const unitsBefore = evidenceGraph.getEvidenceUnits ? await evidenceGraph.getEvidenceUnits('preview-never') : []
  try {
    const r = await w.call('content_admin', 'POST', `/forms/${ID}/preview`, { seed: 'review-seed-1' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.is_synthetic, true)
    assert.equal(r.body.stages.length, 6)
    assert.ok(r.body.stages.every((s) => s.stimuli.length >= 1), 'every stage shows at least one stimulus')
    assert.equal(r.body.requiredPlanned, 11)
    assert.equal(r.body.requiredAnswered, 11)
    assert.equal(r.body.stop.reason, 'COVERAGE_COMPLETE')
    assert.ok(r.body.renderHashes.every((h) => /^[0-9a-f]{64}$/.test(h.renderHash)))
    assert.deepEqual(r.body.reviewRequired, [])
    const stage3 = r.body.stages.find((s) => s.id === 'RESPOND_TO_CHANGE')
    assert.equal(stage3.stimuli[0].worldChangeId, 'WC-FACILITATOR-UNAVAILABLE')
    assert.match(stage3.stimuli[0].content, /Sam cannot work on preparation during the afternoon of Day 1/)
    const stage4 = r.body.stages.find((s) => s.id === 'CHECK_RECOMMENDATION')
    assert.equal(stage4.stimuli[0].aiGenerated, true)
    assert.match(stage4.stimuli[0].content, /^AI-generated recommendation/)
    for (const f of Object.values(r.body.coverage)) assert.equal(f.meetsAuthoringFloor, true)
    // Deterministic for the same seed; a read audit records the preview run.
    const again = await w.call('content_admin', 'POST', `/forms/${ID}/preview`, { seed: 'review-seed-1' })
    assert.deepEqual(again.body.renderHashes, r.body.renderHashes)
    assert.equal(w.audits.filter((a) => a.action === 'assessment_form_preview_run').length, 2)
    // No evidence or session side effects: the evidence store is untouched.
    assert.deepEqual(evidenceGraph.getEvidenceUnits ? await evidenceGraph.getEvidenceUnits('preview-never') : [], unitsBefore)
    assert.equal(JSON.stringify(r.body).includes('"sessionId"'), false)
    assert.equal(syntheticPreview(CORE_TEAMREADY_A).syntheticActions, 11)
  } finally { await w.close() }
})

test('attachments: exemplar/counterexample need a behaviour, notes do not; validated and audited', async () => {
  const w = world()
  try {
    const bad = await w.call('content_admin', 'POST', `/forms/${ID}/attachments`, { version: V1, kind: 'EXEMPLAR', text: 'No behaviour named.' })
    assert.equal(bad.status, 400)
    const unknown = await w.call('content_admin', 'POST', `/forms/${ID}/attachments`, { version: V1, kind: 'COUNTEREXAMPLE', behaviourId: 'NOPE', text: 'Unknown behaviour.' })
    assert.equal(unknown.status, 400)
    const kind = await w.call('content_admin', 'POST', `/forms/${ID}/attachments`, { version: V1, kind: 'OTHER', text: 'Bad kind.' })
    assert.equal(kind.status, 400)
    const ok = await w.call('content_admin', 'POST', `/forms/${ID}/attachments`, { version: V1, kind: 'COUNTEREXAMPLE', behaviourId: 'STATE_MAIN_POINT', text: 'Synthetic counterexample: long, fluent, says nothing actionable.' })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    const note = await w.call('content_admin', 'POST', `/forms/${ID}/attachments`, { version: V1, kind: 'NOTE', text: 'Check the stage-3 wording for plain language.' })
    assert.equal(note.status, 201)
    assert.equal((await w.call('support_admin', 'POST', `/forms/${ID}/attachments`, { version: V1, kind: 'NOTE', text: 'no write permission' })).status, 403)
    const v = await w.call('content_admin', 'GET', `/forms/${ID}/versions/${V1}`)
    assert.deepEqual(v.body.attachments.map((a) => a.kind), ['COUNTEREXAMPLE', 'NOTE'])
    assert.equal(v.body.attachments[0].createdBy, 'admin-content_admin')
    assert.equal(w.audits.filter((a) => a.action === 'assessment_form_attachment_added').length, 2)
    const c = await w.call('content_admin', 'POST', `/forms/${ID}/comments`, { version: V1, text: 'Stage 5 reads well.' })
    assert.equal(c.status, 201)
    assert.equal((await w.call('content_admin', 'GET', `/forms/${ID}/versions/${V1}`)).body.comments.length, 1)
    assert.equal(w.audits.filter((a) => a.action === 'assessment_form_comment_added').length, 1)
  } finally { await w.close() }
})

test('decisions gate: role-checked; APPROVED_FOR_PILOT is 409 until CONTENT and MEASUREMENT reviewers both approve (distinct reviewers)', async () => {
  const w = world()
  const formId = `${ID}:${V1}`
  try {
    // A content admin cannot record a MEASUREMENT decision, and vice versa.
    assert.equal((await w.call('content_admin', 'POST', `/forms/${ID}/review-decisions`, { version: V1, reviewerRole: 'MEASUREMENT', decision: 'APPROVE', reason: REASON })).status, 403)
    assert.equal((await w.call('psychometric_admin', 'POST', `/forms/${ID}/review-decisions`, { version: V1, reviewerRole: 'CONTENT', decision: 'APPROVE', reason: REASON })).status, 403)
    assert.equal((await w.call('content_admin', 'POST', `/forms/${ID}/review-decisions`, { version: V1, reviewerRole: 'CONTENT', decision: 'APPROVE', reason: 'short' })).status, 400)
    // Into review, then try the pilot gate with no decisions → 409.
    const toReview = await w.call('content_admin', 'POST', `/forms/${formId}/transition`, { to: 'REVIEW', reason: REASON })
    assert.equal(toReview.status, 200, JSON.stringify(toReview.body))
    const noDecisions = await w.call('content_admin', 'POST', `/forms/${formId}/transition`, { to: 'APPROVED_FOR_PILOT', reason: REASON })
    assert.equal(noDecisions.status, 409)
    assert.deepEqual(noDecisions.body.details.missing, ['CONTENT_APPROVAL', 'MEASUREMENT_APPROVAL'])
    // One content approval is not enough.
    assert.equal((await w.call('content_admin', 'POST', `/forms/${ID}/review-decisions`, { version: V1, reviewerRole: 'CONTENT', decision: 'APPROVE', reason: REASON })).status, 201)
    const half = await w.call('content_admin', 'POST', `/forms/${formId}/transition`, { to: 'APPROVED_FOR_PILOT', reason: REASON })
    assert.equal(half.status, 409)
    assert.deepEqual(half.body.details.missing, ['MEASUREMENT_APPROVAL'])
    // A measurement REQUEST_CHANGES blocks; a later APPROVE by the same reviewer supersedes it.
    assert.equal((await w.call('psychometric_admin', 'POST', `/forms/${ID}/review-decisions`, { version: V1, reviewerRole: 'MEASUREMENT', decision: 'REQUEST_CHANGES', reason: REASON })).status, 201)
    const blocked = await w.call('content_admin', 'POST', `/forms/${formId}/transition`, { to: 'APPROVED_FOR_PILOT', reason: REASON })
    assert.equal(blocked.status, 409)
    assert.ok(blocked.body.details.missing.includes('MEASUREMENT_APPROVAL'))
    assert.equal((await w.call('psychometric_admin', 'POST', `/forms/${ID}/review-decisions`, { version: V1, reviewerRole: 'MEASUREMENT', decision: 'APPROVE', reason: REASON })).status, 201)
    const gate = (await w.call('content_admin', 'GET', `/forms/${ID}/versions/${V1}`)).body.pilotGate
    assert.deepEqual(gate, { ok: true, contentApprovals: 1, measurementApprovals: 1, missing: [] })
    const pilot = await w.call('content_admin', 'POST', `/forms/${formId}/transition`, { to: 'APPROVED_FOR_PILOT', reason: REASON })
    assert.equal(pilot.status, 200, JSON.stringify(pilot.body))
    assert.equal(pilot.body.state, 'APPROVED_FOR_PILOT')
    assert.equal(w.audits.filter((a) => a.action === 'assessment_form_review_decision').length, 3)
    assert.equal(w.audits.filter((a) => a.action === 'assessment_form_state_changed').length, 2)
    // The same person approving under both roles does not satisfy the gate.
    const self = pilotApprovalGate([
      { reviewerRole: 'CONTENT', reviewerId: 'one', decision: 'APPROVE', createdAt: '1' },
      { reviewerRole: 'MEASUREMENT', reviewerId: 'one', decision: 'APPROVE', createdAt: '2' },
    ])
    assert.deepEqual(self, { ok: false, contentApprovals: 1, measurementApprovals: 1, missing: ['DISTINCT_REVIEWERS'] })
    // The process-wide registry (and the authored module) are untouched.
    assert.equal(contentRegistry.stateOf(formId), 'DRAFT')
    assert.equal(CORE_TEAMREADY_A.status, 'DRAFT')
  } finally { await w.close() }
})

test('draft edit: validated body becomes a NEW version; the source version and module content are immutable; diff is structured', async () => {
  const w = world()
  try {
    const invalid = await w.call('content_admin', 'POST', `/forms/${ID}/draft`, { package: { id: ID, version: V2, title: 'x' } })
    assert.equal(invalid.status, 400)
    assert.ok(Array.isArray(invalid.body.details.issues))
    const dangling = await w.call('content_admin', 'POST', `/forms/${ID}/draft`, { package: draftPackage((p) => { p.opportunities[0].stimulus.factIds.push('F-NOPE') }) })
    assert.equal(dangling.status, 400)
    assert.match(dangling.body.error, /unknown fact F-NOPE/)
    const sameVersion = await w.call('content_admin', 'POST', `/forms/${ID}/draft`, { package: draftPackage((p) => { p.version = V1 }) })
    assert.equal(sameVersion.status, 409, 'an existing version is never overwritten')
    const wrongId = await w.call('content_admin', 'POST', `/forms/${ID}/draft`, { package: draftPackage((p) => { p.id = 'other' }) })
    assert.equal(wrongId.status, 400)
    assert.equal((await w.call('support_admin', 'POST', `/forms/${ID}/draft`, { package: draftPackage() })).status, 403)

    const created = await w.call('content_admin', 'POST', `/forms/${ID}/draft`, {
      derivedFrom: V1,
      package: draftPackage((p) => {
        p.publicFacts[0].text = '25 participants are expected.'
        p.stages[2].label = 'Respond to a changed constraint'
        p.behaviours[0].anchors['3'] = 'Names an assumption and asks one question that could settle it.'
        p.rubric.anchorsByBehaviour.QUESTION_ASSUMPTION['3'] = p.behaviours[0].anchors['3']
        p.opportunities.push({ ...p.opportunities[1], id: 'OPP-COMM-CLARIFY-BRIEF-B', groupId: 'G-UNDERSTAND-CLARIFY-B', paraphraseOf: 'OPP-COMM-CLARIFY-BRIEF' })
      }),
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.formId, `${ID}:${V2}`)
    assert.equal(created.body.state, 'DRAFT')
    assert.equal(created.body.derivedFrom, V1)
    const versions = await w.call('content_admin', 'GET', `/forms/${ID}/versions`)
    assert.deepEqual(versions.body.versions.map((v) => [v.version, v.state]), [[V1, 'DRAFT'], [V2, 'DRAFT']])
    assert.equal((await w.call('content_admin', 'GET', `/forms`)).body.forms.filter((f) => f.contentId === ID).length, 2)
    // Source version untouched; module content untouched.
    const v1 = await w.call('content_admin', 'GET', `/forms/${ID}/versions/${V1}`)
    assert.equal(v1.body.package.publicFacts[0].text, '24 participants are expected.')
    assert.equal(CORE_TEAMREADY_A.publicFacts[0].text, '24 participants are expected.')
    assert.equal(CORE_TEAMREADY_A.opportunities.length, 16)
    assert.ok(Object.isFrozen(CORE_TEAMREADY_A.publicFacts[0]))
    // Structured diff.
    const diff = await w.call('content_admin', 'GET', `/forms/${ID}/diff?from=${V1}&to=${V2}`)
    assert.equal(diff.status, 200)
    assert.deepEqual(diff.body.facts.changed.map((c) => c.id), ['F-PARTICIPANTS'])
    assert.deepEqual(diff.body.facts.changed[0].after, { text: '25 participants are expected.' })
    assert.deepEqual(diff.body.stages.changed.map((c) => [c.id, c.fields]), [['RESPOND_TO_CHANGE', ['label']]])
    assert.deepEqual(diff.body.opportunities.added, ['OPP-COMM-CLARIFY-BRIEF-B'])
    assert.deepEqual(diff.body.opportunities.removed, [])
    assert.deepEqual(diff.body.anchors.changed.map((c) => c.id), ['QUESTION_ASSUMPTION'])
    assert.equal(diff.body.behaviours.changed.length, 0, 'anchors are diffed separately from behaviour labels')
    assert.equal(diff.body.board.changed, false)
    assert.equal((await w.call('content_admin', 'GET', `/forms/${ID}/diff?from=${V1}`)).status, 400)
    assert.equal((await w.call('content_admin', 'GET', `/forms/${ID}/diff?from=${V1}&to=9.9.9`)).status, 404)
    // The new draft previews and reports coverage like any version.
    const preview = await w.call('content_admin', 'POST', `/forms/${ID}/preview`, { version: V2 })
    assert.equal(preview.status, 200)
    assert.match(preview.body.stages[0].stimuli[0].content, /25 participants/)
    assert.equal((await w.call('content_admin', 'GET', `/forms/${ID}/coverage?version=${V2}`)).body.families.length, 5)
    // Persisted draft is hydrated by a fresh tooling instance over the same store.
    const fresh = createContentTooling({ registry: createContentRegistry(), store: w.store })
    assert.equal((await fresh.getVersion(ID, V2)).package.publicFacts[0].text, '25 participants are expected.')
    assert.equal(w.audits.filter((a) => a.action === 'assessment_form_draft_created').length, 1)
    assert.equal(w.audits.filter((a) => a.action === 'assessment_form_draft_created')[0].admin, 'admin-content_admin')
    // Pure helpers agree with the route.
    assert.equal(diffPackages(CORE_TEAMREADY_A, CORE_TEAMREADY_A).facts.changed.length, 0)
    assert.throws(() => validateFormPackage({}), (e) => e.code === 'VALIDATION_FAILED')
  } finally { await w.close() }
})

test('every mutation route is audited; read routes other than preview are not', async () => {
  const w = world()
  try {
    await w.call('content_admin', 'GET', `/forms`)
    await w.call('content_admin', 'GET', `/forms/${ID}/versions`)
    await w.call('content_admin', 'GET', `/forms/${ID}/versions/${V1}`)
    await w.call('content_admin', 'GET', `/forms/${ID}/coverage`)
    await w.call('content_admin', 'GET', `/forms/${ID}/diff?from=${V1}&to=${V1}`)
    assert.equal(w.audits.length, 0)
    await w.call('content_admin', 'POST', `/forms/${ID}/attachments`, { version: V1, kind: 'NOTE', text: 'audited note' })
    await w.call('content_admin', 'POST', `/forms/${ID}/comments`, { version: V1, text: 'audited comment' })
    await w.call('content_admin', 'POST', `/forms/${ID}/review-decisions`, { version: V1, reviewerRole: 'CONTENT', decision: 'REQUEST_CHANGES', reason: REASON })
    await w.call('content_admin', 'POST', `/forms/${ID}:${V1}/transition`, { to: 'REVIEW', reason: REASON })
    await w.call('content_admin', 'POST', `/forms/${ID}/draft`, { package: draftPackage() })
    assert.deepEqual(w.audits.map((a) => a.action), ['assessment_form_attachment_added', 'assessment_form_comment_added', 'assessment_form_review_decision', 'assessment_form_state_changed', 'assessment_form_draft_created'])
    assert.ok(w.audits.every((a) => a.entityType === 'assessment_form' && a.admin === 'admin-content_admin'))
  } finally { await w.close() }
})
