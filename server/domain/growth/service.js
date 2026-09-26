// Reassessment + growth service (spec §17, §30.10; C9.02–C9.05).
//   - Form equivalence registry: every pair of frozen forms of a definition is
//     seeded PENDING; only a human psychometric decision (admin plane, with a
//     second administrator's approval for APPROVED) changes it. Nothing here
//     approves anything.
//   - Growth: a change is shown only across an APPROVED pair and only where
//     both sessions have SUFFICIENT evidence (snapshot.js); snapshots record
//     what was shown and are never edited.
//   - Campus reassessment cycles: a baseline assignment plus a new sponsored
//     assignment of the same definition for the same cohorts; students take
//     it through the normal sponsored flow.
//   - Campus growth outcomes: aggregate, comparable-only, small groups
//     suppressed.
import { ApiError } from '../http/errors.js'
import { can } from '../permissions/can.js'
import { capabilityInfo } from '../assessments/catalog.js'
import { MIN_GROUP_SIZE } from '../../lib/fairnessResearch.js'
import { canonicalPair, pairKey, compareCapability, choosePair } from './snapshot.js'

const EFFECTIVE = (c, at) => {
  if (c.status === 'SCHEDULED' && new Date(c.windowStart) <= at) return new Date(c.windowEnd) <= at ? 'CLOSED' : 'ACTIVE'
  if (c.status === 'ACTIVE' && new Date(c.windowEnd) <= at) return 'CLOSED'
  return c.status
}
const sessionRef = (e) => ({
  sessionId: e.session.sessionId, title: e.definition?.title || null, completedAt: e.session.completedAt,
  form: e.form ? { id: e.form.id, version: e.form.version } : null,
})

export function createGrowthService({ repos, catalog, clock = () => new Date(), audit = () => {}, entryFor, minGroupSize = MIN_GROUP_SIZE }) {
  const store = () => repos.growth
  let seeded = null

  async function ensureRegistrySeeded() {
    if (!store()) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'This feature is temporarily unavailable.')
    if (!seeded) {
      seeded = (async () => {
        const cat = await catalog.ensureSeeded()
        const pairs = []
        for (const d of cat.definitions) {
          const forms = cat.forms.filter((f) => f.definitionId === d.id && f.status === 'FROZEN').map((f) => f.id).sort()
          for (let i = 0; i < forms.length; i += 1) for (let j = i; j < forms.length; j += 1) pairs.push({ formAId: forms[i], formBId: forms[j] })
        }
        await store().seedPendingPairs(pairs)
      })()
    }
    try { await seeded } catch (err) { seeded = null; throw err }
  }

  async function approvedPairs() {
    await ensureRegistrySeeded()
    const out = new Map()
    for (const p of await store().listEquivalence()) if (p.status === 'APPROVED') out.set(pairKey(p.formAId, p.formBId), p)
    return out
  }

  // Comparability of a definition's forms for a campus cycle (what staff are told).
  async function definitionComparability(definitionId, formId) {
    await ensureRegistrySeeded()
    const cat = await catalog.getCatalog()
    const all = await store().listEquivalence()
    const status = (a, b) => { const { formAId, formBId } = canonicalPair(a, b); return all.find((p) => p.formAId === formAId && p.formBId === formBId)?.status || 'PENDING' }
    if (formId) return status(formId, formId)
    const forms = cat.forms.filter((f) => f.definitionId === definitionId && f.status === 'FROZEN').map((f) => f.id)
    const statuses = forms.flatMap((a) => forms.map((b) => status(a, b)))
    if (statuses.length && statuses.every((s) => s === 'APPROVED')) return 'APPROVED'
    return statuses.some((s) => s === 'APPROVED') ? 'PARTIAL' : 'PENDING'
  }

  async function comparePair(baseline, reassessment, approved, { userId, organizationId }) {
    const pairRow = approved.get(pairKey(baseline.form.id, reassessment.form.id))
    const measured = new Set([...(baseline.definition?.measures || []), ...(reassessment.definition?.measures || [])])
    const changes = []
    for (const capabilityId of measured) {
      const before = baseline.decisions[capabilityId]
      const after = reassessment.decisions[capabilityId]
      if (!before?.consideredUnitIds?.length && !after?.consideredUnitIds?.length) continue
      const c = compareCapability(before, after)
      changes.push({ capabilityId, name: capabilityInfo(capabilityId)?.name || null, ...c })
      if (c.comparable && userId) {
        const { formAId, formBId } = canonicalPair(baseline.form.id, reassessment.form.id)
        const { created } = await store().recordSnapshot({
          userId, organizationId, capabilityId, baselineSessionId: baseline.session.sessionId, reassessmentSessionId: reassessment.session.sessionId,
          formAId, formBId, fromBand: c.from.band, toBand: c.to.band, direction: c.direction, uncertainty: null, rulesVersion: after.rulesVersion || 'unknown',
        })
        if (created) audit('growth.snapshot.created', null, { capabilityId, direction: c.direction, formPair: `${formAId}|${formBId}`, organizationId: organizationId || null })
      }
    }
    return { pairRow, changes }
  }

  function cycleReachable(actor, organizationId, permission, cohorts, cycleCohortIds, cohortInScope) {
    const d = can(actor, permission, { organizationId })
    if (!d.allowed) return false
    if (d.scope === 'ALL' || d.scope === 'LIMITED') return true
    return cycleCohortIds.some((id) => cohortInScope(d, cohorts.find((c) => c.id === id)))
  }

  return {
    ensureRegistrySeeded,

    // ── Equivalence registry (admin plane) ──────────────────────────────
    async registry() {
      await ensureRegistrySeeded()
      const cat = await catalog.getCatalog()
      const formInfo = (id) => {
        const f = cat.forms.find((x) => x.id === id)
        return f ? { id, definitionId: f.definitionId, definitionTitle: cat.definitions.find((d) => d.id === f.definitionId)?.title || null, version: f.version, status: f.status } : { id, definitionId: null, definitionTitle: null, version: null, status: 'NOT_IN_CATALOG' }
      }
      return (await store().listEquivalence()).map((p) => ({ formA: formInfo(p.formAId), formB: formInfo(p.formBId), status: p.status, evidenceRef: p.evidenceRef, decidedBy: p.decidedBy, decidedAt: p.decidedAt }))
    },
    async decide({ formAId, formBId, status, evidenceRef, reason, decidedBy, approvalId = null }) {
      await ensureRegistrySeeded()
      if (!['APPROVED', 'REJECTED'].includes(status)) throw new ApiError('VALIDATION_FAILED', 'Choose approve or reject.')
      if (typeof evidenceRef !== 'string' || evidenceRef.trim().length < 3) throw new ApiError('VALIDATION_FAILED', 'Cite the evidence (study, calibration run or document) behind this decision.')
      if (typeof reason !== 'string' || reason.trim().length < 10) throw new ApiError('VALIDATION_FAILED', 'Give a specific reason (at least 10 characters).')
      if (status === 'APPROVED' && !approvalId) throw new ApiError('VALIDATION_FAILED', 'Approving a form pair needs a second administrator\'s approval.')
      const pair = canonicalPair(formAId, formBId)
      const before = await store().getEquivalence(pair.formAId, pair.formBId)
      if (!before) throw new ApiError('NOT_FOUND', 'Not found')
      const after = await store().recordDecision({ ...pair, status, evidenceRef: evidenceRef.trim(), reason: reason.trim(), decidedBy, approvalId })
      audit('growth.equivalence.decided', null, { formPair: `${pair.formAId}|${pair.formBId}`, from: before.status, to: status, approvalId })
      return { before, after }
    },

    // ── Student growth (§17) ────────────────────────────────────────────
    // `entries`: the workspace's formal sessions, newest first, with `form`.
    async growthFor(user, workspace, entries) {
      const approved = await approvedPairs()
      const organizationId = workspace.type === 'CAMPUS_STUDENT' ? workspace.organizationId : null
      const base = { assessments: entries.map(sessionRef), comparison: null, changes: [] }
      const choice = choosePair(entries, approved)
      if (choice.reason) return { ...base, comparable: false, reason: choice.reason }
      const { pairRow, changes } = await comparePair(choice.baseline, choice.reassessment, approved, { userId: user.id, organizationId })
      const comparable = changes.some((c) => c.comparable)
      return {
        ...base,
        comparable,
        reason: comparable ? null : 'EVIDENCE_NOT_SUFFICIENT_FOR_COMPARISON',
        comparison: {
          baseline: sessionRef(choice.baseline),
          reassessment: sessionRef(choice.reassessment),
          formPair: { status: 'APPROVED', evidenceRef: pairRow.evidenceRef, decidedAt: pairRow.decidedAt },
        },
        changes,
      }
    },

    // Reassessments the student is rostered on in this campus workspace.
    async reassessmentsFor(user, workspace) {
      if (workspace.type !== 'CAMPUS_STUDENT' || !store()) return []
      const at = clock()
      const out = []
      for (const c of await store().listCycles(workspace.organizationId)) {
        const mine = await repos.assessments.getAssignmentForUser(c.reassessmentAssignmentId, user.id)
        if (!mine) continue
        const status = EFFECTIVE(c, at)
        if (status === 'CANCELLED') continue
        const baseline = await repos.assessments.getAssignment(c.baselineAssignmentId)
        out.push({
          id: c.id, name: c.name, windowStart: c.windowStart, windowEnd: c.windowEnd, status, assignmentId: c.reassessmentAssignmentId, rosterStatus: mine.student?.status || null,
          endedAt: c.status === 'CLOSED' ? c.updatedAt : null,
          // Whether this reassessment can show a change at all (forms approved).
          comparability: baseline ? await definitionComparability(baseline.definitionId, baseline.formPolicy === 'FIXED_FORM' ? baseline.formId : null) : 'PENDING',
        })
      }
      return out
    },

    // ── Campus reassessment cycles (§25, §30.10) ────────────────────────
    async cycleSummary(c, admin) {
      const baseline = await repos.assessments.getAssignment(c.baselineAssignmentId)
      const reassessment = await repos.assessments.getAssignment(c.reassessmentAssignmentId)
      const b = await admin.assignmentSummary(baseline)
      const r = await admin.assignmentSummary(reassessment)
      return {
        id: c.id, name: c.name, status: EFFECTIVE(c, clock()), windowStart: c.windowStart, windowEnd: c.windowEnd,
        // When staff ended it early (the window end otherwise applies).
        endedAt: ['CLOSED', 'CANCELLED'].includes(c.status) ? c.updatedAt : null,
        programId: c.programId, interventionId: c.interventionId, cohortIds: b.cohortIds,
        baseline: { assignmentId: b.id, title: b.title, windowStart: b.windowStart, windowEnd: b.windowEnd, completed: b.counts.COMPLETED || 0, rostered: b.counts.total },
        reassessment: { assignmentId: r.id, title: r.title, completed: r.counts.COMPLETED || 0, rostered: r.counts.total },
        comparability: await definitionComparability(baseline.definitionId, baseline.formPolicy === 'FIXED_FORM' ? baseline.formId : null),
      }
    },

    async createCycle(req, actor, organizationId, input, { admin }) {
      const d = can(actor, 'reassessments.write', { organizationId })
      if (!d.allowed) throw new ApiError('NOT_FOUND', 'Not found')
      const baseline = await repos.assessments.getAssignment(input.baselineAssignmentId)
      if (!baseline || baseline.organizationId !== organizationId || baseline.sponsorType !== 'INSTITUTION') throw new ApiError('VALIDATION_FAILED', 'Choose an assessment your organization assigned.')
      if (baseline.status === 'CANCELLED') throw new ApiError('VALIDATION_FAILED', 'A cancelled assessment cannot be the baseline.')
      const summary = await admin.assignmentSummary(baseline)
      if (!summary.cohortIds.length) throw new ApiError('VALIDATION_FAILED', 'The baseline assessment has no cohorts to reassess.')
      const cohorts = []
      for (const id of summary.cohortIds) cohorts.push(await admin.cohortOf(organizationId, id))
      if (d.scope === 'LIMITED' && cohorts.some((c) => !admin.cohortInScope(can(actor, 'cohorts.read', { organizationId }), c))) {
        throw new ApiError('FORBIDDEN', 'You can reassess cohorts from your own department only.')
      }
      if (!(new Date(input.windowStart) > new Date(baseline.windowStart || 0))) throw new ApiError('VALIDATION_FAILED', 'The reassessment must open after the baseline assessment opened.')
      if (input.interventionId) {
        const i = repos.development ? await repos.development.getIntervention(input.interventionId) : null
        if (!i || i.organizationId !== organizationId) throw new ApiError('VALIDATION_FAILED', 'Unknown intervention.')
      }
      // The reassessment is a normal sponsored assignment of the same definition
      // for the same cohorts (createAssignment re-checks permission and scope).
      const assignment = await admin.createAssignment(req, actor, organizationId, {
        definitionId: baseline.definitionId, cohortIds: summary.cohortIds, windowStart: input.windowStart, windowEnd: input.windowEnd,
        integrityPolicy: baseline.integrityPolicy, programId: input.programId || baseline.programId || null,
        accommodationsRequestable: baseline.accommodationsPolicy?.requestable !== false, extraTimeAllowed: Boolean(baseline.accommodationsPolicy?.extraTimeAllowed),
      })
      const row = await store().createCycle({
        organizationId, name: input.name, programId: assignment.programId, interventionId: input.interventionId || null,
        baselineAssignmentId: baseline.id, reassessmentAssignmentId: assignment.id,
        windowStart: assignment.windowStart, windowEnd: assignment.windowEnd, status: assignment.status === 'SCHEDULED' ? 'SCHEDULED' : 'ACTIVE', createdBy: actor.userId,
      })
      await admin.orgAudit(req, organizationId, 'reassessment.created', 'REASSESSMENT', row.id, { baselineAssignmentId: baseline.id, reassessmentAssignmentId: assignment.id, rostered: assignment.rostered })
      return { ...(await this.cycleSummary(row, admin)), rostered: assignment.rostered }
    },

    async listCycles(actor, organizationId, { admin, permission = 'reassessments.read' }) {
      if (!store()) return []
      const cohorts = await repos.campusAdmin.listCohorts(organizationId)
      const out = []
      for (const c of await store().listCycles(organizationId)) {
        const s = await this.cycleSummary(c, admin)
        if (cycleReachable(actor, organizationId, permission, cohorts, s.cohortIds, admin.cohortInScope)) out.push(s)
      }
      return out
    },

    async getCycle(actor, organizationId, cycleId, { admin, permission = 'reassessments.read' }) {
      const c = await store().getCycle(cycleId)
      if (!c || c.organizationId !== organizationId) throw new ApiError('NOT_FOUND', 'Not found')
      const s = await this.cycleSummary(c, admin)
      const cohorts = await repos.campusAdmin.listCohorts(organizationId)
      if (!cycleReachable(actor, organizationId, permission, cohorts, s.cohortIds, admin.cohortInScope)) throw new ApiError('NOT_FOUND', 'Not found')
      return { cycle: c, summary: s }
    },

    async setCycleStatus(req, actor, organizationId, cycleId, status, { admin }) {
      if (!['CLOSED', 'CANCELLED'].includes(status)) throw new ApiError('VALIDATION_FAILED', 'Choose close or cancel.')
      const { cycle } = await this.getCycle(actor, organizationId, cycleId, { admin, permission: 'reassessments.write' })
      if (['CLOSED', 'CANCELLED'].includes(cycle.status)) throw new ApiError('CONFLICT', 'This reassessment has already ended.')
      await admin.closeAssignment(req, actor, organizationId, cycle.reassessmentAssignmentId, status)
      const row = await store().setCycleStatus(cycle.id, status)
      await admin.orgAudit(req, organizationId, `reassessment.${status.toLowerCase()}`, 'REASSESSMENT', cycle.id, {})
      return this.cycleSummary(row, admin)
    },

    // ── Campus growth outcomes (comparable only; §17, §27) ──────────────
    async outcomes(actor, organizationId, { admin, cycleId = null }) {
      const approved = await approvedPairs()
      const permission = 'analytics.read'
      const cycles = cycleId ? [(await this.getCycle(actor, organizationId, cycleId, { admin, permission })).cycle] : (await this.listCycles(actor, organizationId, { admin, permission })).map((s) => ({ id: s.id }))
      const out = []
      const decision = can(actor, permission, { organizationId })
      const orgCohorts = await repos.campusAdmin.listCohorts(organizationId)
      for (const ref of cycles) {
        const c = await store().getCycle(ref.id)
        const summary = await this.cycleSummary(c, admin)
        // Scoped roles count only students of the cohorts they work with.
        let visible = null
        if (!(decision.scope === 'ALL' || decision.scope === 'LIMITED')) {
          visible = new Set()
          for (const id of summary.cohortIds) {
            if (!admin.cohortInScope(decision, orgCohorts.find((x) => x.id === id))) continue
            for (const m of await repos.campusAdmin.listCohortMembers(id)) visible.add(m.userId)
          }
        }
        const counts = { completedBoth: 0, comparable: 0, formsNotApproved: 0, underReviewOrMissing: 0 }
        const byCapability = new Map()
        for (const r of await repos.campusAdmin.listAssignmentStudents(c.reassessmentAssignmentId)) {
          if (visible && !visible.has(r.userId)) continue
          if (r.status !== 'COMPLETED' || !r.sessionId) continue
          const b = await repos.assessments.getAssignmentForUser(c.baselineAssignmentId, r.userId)
          if (b?.student?.status !== 'COMPLETED' || !b.student.sessionId) continue
          counts.completedBoth += 1
          const [before, after] = [await entryFor(b.student.sessionId), await entryFor(r.sessionId)]
          if (!before?.form || !after?.form) { counts.underReviewOrMissing += 1; continue }
          if (!approved.has(pairKey(before.form.id, after.form.id))) { counts.formsNotApproved += 1; continue }
          // Aggregate only: staff views never write a student's snapshot (K89).
          const { changes } = await comparePair(before, after, approved, { userId: null, organizationId })
          if (changes.some((x) => x.comparable)) counts.comparable += 1
          for (const ch of changes) {
            if (!ch.comparable) continue
            const agg = byCapability.get(ch.capabilityId) || { capabilityId: ch.capabilityId, name: ch.name, n: 0, HIGHER: 0, SAME: 0, LOWER: 0 }
            agg.n += 1
            agg[ch.direction] += 1
            byCapability.set(ch.capabilityId, agg)
          }
        }
        // Small groups are suppressed whole: never a partial number (§27).
        const capabilities = [...byCapability.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((a) => (a.n >= minGroupSize
          ? { capabilityId: a.capabilityId, name: a.name, n: a.n, higher: a.HIGHER, same: a.SAME, lower: a.LOWER, suppressed: false }
          : { capabilityId: a.capabilityId, name: a.name, suppressed: true, reason: 'SMALL_GROUP' }))
        out.push({
          cycle: { id: summary.id, name: summary.name, status: summary.status, comparability: summary.comparability },
          counts,
          capabilities,
          minGroupSize,
          method: 'Level-label change between the baseline and reassessment, counted only for students whose two assessment forms are approved as comparable and who gathered enough evidence in both. Groups smaller than the minimum size are not shown.',
        })
      }
      return { items: out }
    },
  }
}
