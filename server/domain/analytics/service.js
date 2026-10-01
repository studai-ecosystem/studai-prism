// Campus analytics read models (spec §20, §27, §28; C10.01–C10.04).
// Aggregates only, over SPONSORED formal evidence of the organization (never
// personal Prism data, §53), scoped to the caller's cohorts/department:
//   - each student counts once, by their latest completed sponsored session
//     (held/invalidated sessions are excluded and counted as under review);
//   - buckets are the level labels plus "Insufficient evidence";
//   - every group below the organization's minimum aggregate group size
//     (default 10, floor 5) is suppressed whole — never a partial number —
//     and a lone suppressed group in a comparison gets a complementary one;
//   - no student list, ranking, composite or average score exists here.
import { ApiError } from '../http/errors.js'
import { can } from '../permissions/can.js'
import { PRIMARY_CAPABILITY_IDS, capabilityInfo } from '../assessments/catalog.js'
import { CAPABILITY_LEVELS } from '../evidence/levels.js'
import { csvCell } from '../campusAdmin/csv.js'

export const DEFAULT_MIN_GROUP_SIZE = 10
export const MIN_GROUP_FLOOR = 5
export const BUCKETS = Object.freeze(['INSUFFICIENT', 'EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG'])
const BUCKET_LABEL = Object.fromEntries(CAPABILITY_LEVELS.map((l) => [l.band, l.label]))
const ADMISSIBLE = new Set(['PROVISIONAL', 'SUFFICIENT'])
const NEEDS = new Set(['INSUFFICIENT', 'EARLY', 'DEVELOPING'])
const STATUSES = ['SUFFICIENT', 'PROVISIONAL', 'INSUFFICIENT_EVIDENCE', 'HUMAN_REVIEW_REQUIRED']
const SUPPRESSED = (extra = {}) => ({ suppressed: true, reason: 'SMALL_GROUP', ...extra })

export const NEEDS_METHOD = 'A student counts as needing further evidence or development in a capability when their latest sponsored assessment shows it below "Demonstrated" or without enough evidence. Each student counts once. Level labels are provisional until measurement governance finalises them.'

const bucketOf = (d) => (d && ADMISSIBLE.has(d.status) && d.level?.band && BUCKETS.includes(d.level.band) ? d.level.band : 'INSUFFICIENT')
const emptyBuckets = () => Object.fromEntries(BUCKETS.map((b) => [b, 0]))

export function createAnalyticsService({ repos, entryFor, growth = null }) {
  const ca = () => repos.campusAdmin

  async function minGroupSize(organizationId) {
    const s = repos.analytics ? await repos.analytics.getSettings(organizationId) : null
    return Math.max(MIN_GROUP_FLOOR, s?.minAggregateGroupSize ?? DEFAULT_MIN_GROUP_SIZE)
  }

  // Students the caller may count, with their cohorts, narrowed by filters.
  async function population(actor, organizationId, filters = {}, permission = 'analytics.read') {
    const d = can(actor, permission, { organizationId })
    if (!d.allowed) throw new ApiError('NOT_FOUND', 'Not found')
    const full = d.scope === 'ALL' || d.scope === 'LIMITED'
    const inScope = (c) => full
      || (d.scope === 'ASSIGNED' && (d.cohortIds || []).includes(String(c.id)))
      || (d.scope === 'DEPARTMENT' && Boolean(c.departmentId) && String(c.departmentId) === String(d.departmentId))
    let programCohorts = null
    if (filters.programId) {
      const p = await ca().getProgram(filters.programId)
      if (!p || p.organizationId !== organizationId) throw new ApiError('VALIDATION_FAILED', 'Unknown program.')
      programCohorts = new Set(await ca().listProgramCohorts(p.id))
    }
    const cohorts = (await ca().listCohorts(organizationId)).filter((c) => inScope(c)
      && (!filters.cohortId || c.id === filters.cohortId)
      && (!filters.departmentId || c.departmentId === filters.departmentId)
      && (!filters.campusId || c.campusId === filters.campusId)
      && (!filters.batchId || c.batchId === filters.batchId)
      && (!programCohorts || programCohorts.has(c.id)))
    const students = new Set((await ca().listOrgMemberships(organizationId)).filter((m) => m.role === 'STUDENT' && m.status === 'ACTIVE').map((m) => m.userId))
    const chosen = new Set(cohorts.map((c) => c.id))
    const cohortsOf = new Map()
    for (const m of await ca().listCohortMembershipsForOrg(organizationId)) {
      if (!chosen.has(m.cohortId) || !students.has(m.userId)) continue
      if (!cohortsOf.has(m.userId)) cohortsOf.set(m.userId, [])
      cohortsOf.get(m.userId).push(m.cohortId)
    }
    const unfiltered = !filters.cohortId && !filters.departmentId && !filters.campusId && !filters.batchId && !filters.programId
    if (full && unfiltered) for (const u of students) if (!cohortsOf.has(u)) cohortsOf.set(u, [])
    return { decision: d, cohorts, cohortsOf }
  }

  // Latest completed sponsored session per student (within the date filter).
  async function latestEntries(organizationId, userIds, filters = {}) {
    const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : null
    const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null
    const latest = new Map()
    for (const a of await ca().listOrgAssignments(organizationId)) {
      for (const s of await ca().listAssignmentStudents(a.id)) {
        if (s.status !== 'COMPLETED' || !s.sessionId || !userIds.has(s.userId)) continue
        const at = s.completedAt ? new Date(s.completedAt) : null
        if ((from && (!at || at < from)) || (to && (!at || at > to))) continue
        const prev = latest.get(s.userId)
        if (!prev || String(s.completedAt || '') > String(prev.completedAt || '')) latest.set(s.userId, s)
      }
    }
    const entries = new Map()
    let underReview = 0
    for (const [userId, s] of latest) {
      const e = await entryFor(s.sessionId)
      if (e) entries.set(userId, e)
      else underReview += 1
    }
    return { entries, underReview }
  }

  function capabilityIdsOf(entries) {
    const seen = new Set()
    for (const e of entries.values()) for (const id of e.definition?.measures || []) seen.add(id)
    const primary = PRIMARY_CAPABILITY_IDS.filter((id) => seen.has(id))
    return [...primary, ...[...seen].filter((id) => !PRIMARY_CAPABILITY_IDS.includes(id)).sort()]
  }

  function distribution(entries, capabilityId, min) {
    const buckets = emptyBuckets()
    let n = 0
    let provisional = 0
    for (const e of entries.values()) {
      if (!(e.definition?.measures || []).includes(capabilityId)) continue
      const d = e.decisions?.[capabilityId]
      n += 1
      const b = bucketOf(d)
      buckets[b] += 1
      if (b !== 'INSUFFICIENT' && d.status === 'PROVISIONAL') provisional += 1
    }
    const name = capabilityInfo(capabilityId)?.name || null
    if (n < min) return { capabilityId, name, ...SUPPRESSED() }
    return { capabilityId, name, suppressed: false, n, buckets, provisional }
  }

  async function base(actor, organizationId, filters, permission) {
    const [min, pop] = await Promise.all([minGroupSize(organizationId), population(actor, organizationId, filters, permission)])
    const { entries, underReview } = await latestEntries(organizationId, new Set(pop.cohortsOf.keys()), filters)
    return { min, pop, entries, underReview }
  }

  const service = {
    minGroupSize,
    async settings(organizationId, actor = null) {
      const s = repos.analytics ? await repos.analytics.getSettings(organizationId) : null
      const canChange = actor ? can(actor, 'org.manage', { organizationId }).scope === 'ALL' : false
      return { minAggregateGroupSize: await minGroupSize(organizationId), default: DEFAULT_MIN_GROUP_SIZE, floor: MIN_GROUP_FLOOR, updatedAt: s?.updatedAt || null, canChange }
    },
    async updateSettings(req, actor, organizationId, { minAggregateGroupSize }, { orgAudit }) {
      const d = can(actor, 'org.manage', { organizationId })
      if (!d.allowed) throw new ApiError('NOT_FOUND', 'Not found')
      if (d.scope !== 'ALL') throw new ApiError('FORBIDDEN', 'Only organization owners can change privacy thresholds.')
      if (!Number.isInteger(minAggregateGroupSize) || minAggregateGroupSize < MIN_GROUP_FLOOR || minAggregateGroupSize > 1000) {
        throw new ApiError('VALIDATION_FAILED', `The minimum group size must be a whole number from ${MIN_GROUP_FLOOR} to 1000.`)
      }
      const before = await minGroupSize(organizationId)
      await repos.analytics.saveSettings({ organizationId, minAggregateGroupSize, updatedBy: actor.userId })
      await orgAudit(req, organizationId, 'analytics.settings.updated', 'ORGANIZATION', organizationId, { minAggregateGroupSize: { from: before, to: minAggregateGroupSize } })
      return this.settings(organizationId, actor)
    },

    // §27.1 capability distribution + §20.3 top development needs. A view
    // below the minimum returns no counts at all (not even how many students
    // were assessed or are under review).
    async capabilities(actor, organizationId, filters = {}, { permission = 'analytics.read' } = {}) {
      const { min, entries, underReview } = await base(actor, organizationId, filters, permission)
      const assessed = entries.size
      const meta = { minGroupSize: min, bucketLabels: BUCKET_LABEL, method: NEEDS_METHOD }
      if (assessed < min) return { ...meta, ...SUPPRESSED(), capabilities: [], topNeeds: [] }
      const capabilities = capabilityIdsOf(entries).map((id) => distribution(entries, id, min))
      const topNeeds = capabilities.filter((c) => !c.suppressed)
        .map((c) => ({ capabilityId: c.capabilityId, name: c.name, needs: BUCKETS.filter((b) => NEEDS.has(b)).reduce((s, b) => s + c.buckets[b], 0), of: c.n }))
        .filter((c) => c.needs > 0)
        .sort((a, b) => b.needs / b.of - a.needs / a.of || String(a.name).localeCompare(String(b.name)))
        .slice(0, 3)
      return { ...meta, assessed, underReview, suppressed: false, capabilities, topNeeds }
    },

    // §27.1 evidence sufficiency distribution + insufficient-evidence rates.
    async sufficiency(actor, organizationId, filters = {}) {
      const { min, entries, underReview } = await base(actor, organizationId, filters)
      const meta = { minGroupSize: min }
      if (entries.size < min) return { ...meta, ...SUPPRESSED(), capabilities: [] }
      const capabilities = capabilityIdsOf(entries).map((capabilityId) => {
        const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]))
        let n = 0
        for (const e of entries.values()) {
          if (!(e.definition?.measures || []).includes(capabilityId)) continue
          n += 1
          counts[e.decisions?.[capabilityId]?.status || 'INSUFFICIENT_EVIDENCE'] += 1
        }
        const name = capabilityInfo(capabilityId)?.name || null
        return n < min ? { capabilityId, name, ...SUPPRESSED() } : { capabilityId, name, suppressed: false, n, statuses: counts, insufficient: counts.INSUFFICIENT_EVIDENCE + counts.HUMAN_REVIEW_REQUIRED }
      })
      return { ...meta, assessed: entries.size, underReview, suppressed: false, capabilities }
    },

    // §27.1 department / cohort comparison (heatmap source).
    async comparison(actor, organizationId, { groupBy = 'cohort', ...filters } = {}) {
      const { min, pop, entries } = await base(actor, organizationId, filters)
      const structure = await ca().listStructure(organizationId)
      const groups = new Map()
      const add = (id, name) => { if (!groups.has(id)) groups.set(id, { groupId: id, name, members: new Set() }) }
      for (const c of pop.cohorts) {
        if (groupBy === 'department') { if (c.departmentId) add(c.departmentId, structure.departments.find((x) => x.id === c.departmentId)?.name || null) } else add(c.id, c.name)
      }
      for (const [userId, cohortIds] of pop.cohortsOf) {
        let placed = false
        for (const cid of cohortIds) {
          const c = pop.cohorts.find((x) => x.id === cid)
          const gid = groupBy === 'department' ? c?.departmentId : cid
          if (gid && groups.has(gid)) { groups.get(gid).members.add(userId); placed = true }
        }
        // Students outside every group form an explicit row, so the
        // suppression rules below cover them too (never an implicit residue).
        if (!placed) { add('NONE', groupBy === 'department' ? 'No department' : 'No cohort'); groups.get('NONE').members.add(userId) }
      }
      if (groups.has('NONE') && ![...groups.get('NONE').members].some((u) => entries.has(u))) groups.delete('NONE')
      const capabilityIds = capabilityIdsOf(entries)
      const rows = [...groups.values()].map((g) => {
        const sub = new Map([...entries].filter(([u]) => g.members.has(u)))
        return { groupId: g.groupId, name: g.name, n: sub.size, sub }
      }).sort((a, b) => String(a.name).localeCompare(String(b.name)))
      // Complementary suppression: a single hidden (non-empty) group next to
      // visible ones could be derived from the total, so the smallest visible
      // group is hidden too; the same rule applies to each capability column.
      const hiddenRows = rows.filter((r) => r.n > 0 && r.n < min)
      if (hiddenRows.length === 1 && rows.length > 1) {
        const next = rows.filter((r) => r.n >= min).sort((a, b) => a.n - b.n)[0]
        if (next) next.complementary = true
      }
      const visibleRows = rows.filter((r) => r.n >= min && !r.complementary)
      const cells = new Map(visibleRows.map((r) => [r.groupId, new Map(capabilityIds.map((id) => [id, distribution(r.sub, id, min)]))]))
      for (const id of capabilityIds) {
        const measured = (r) => [...r.sub.values()].filter((e) => (e.definition?.measures || []).includes(id)).length
        const column = visibleRows.map((r) => ({ r, n: measured(r) }))
        const hiddenCells = column.filter((c) => c.n > 0 && c.n < min)
        if (hiddenCells.length === 1 && column.length > 1) {
          const next = column.filter((c) => c.n >= min).sort((a, b) => a.n - b.n)[0]
          if (next) cells.get(next.r.groupId).set(id, { capabilityId: id, name: capabilityInfo(id)?.name || null, ...SUPPRESSED({ complementary: true }) })
        }
      }
      return {
        groupBy, minGroupSize: min,
        capabilities: capabilityIds.map((id) => ({ capabilityId: id, name: capabilityInfo(id)?.name || null })),
        groups: rows.map((r) => ((r.n < min || r.complementary)
          ? { groupId: r.groupId, name: r.name, ...SUPPRESSED({ complementary: Boolean(r.complementary) }) }
          : { groupId: r.groupId, name: r.name, suppressed: false, n: r.n, capabilities: capabilityIds.map((id) => cells.get(r.groupId).get(id)) })),
      }
    },

    // §27.1 assessment completion funnel (participation counts).
    async completion(actor, organizationId, filters = {}, { permission = 'analytics.read' } = {}) {
      const { pop } = await base(actor, organizationId, filters, permission)
      const users = new Set(pop.cohortsOf.keys())
      const cohortIds = new Set(pop.cohorts.map((c) => c.id))
      const counts = { ASSIGNED: 0, ACKNOWLEDGED: 0, IN_PROGRESS: 0, COMPLETED: 0, EXPIRED: 0, WITHDRAWN: 0 }
      let assignments = 0
      for (const a of await ca().listOrgAssignments(organizationId)) {
        if (a.status === 'CANCELLED') continue
        const targets = (await repos.assessments.listTargets(a.id)).filter((t) => t.targetType === 'COHORT').map((t) => t.targetId)
        if (!targets.some((t) => cohortIds.has(t))) continue
        assignments += 1
        for (const s of await ca().listAssignmentStudents(a.id)) if (users.has(s.userId) && counts[s.status] !== undefined) counts[s.status] += 1
      }
      const total = Object.values(counts).reduce((x, y) => x + y, 0)
      return {
        assignments,
        funnel: { assigned: total, acknowledged: counts.ACKNOWLEDGED + counts.IN_PROGRESS + counts.COMPLETED, started: counts.IN_PROGRESS + counts.COMPLETED, completed: counts.COMPLETED },
        notCompleted: { expired: counts.EXPIRED, withdrawn: counts.WITHDRAWN },
      }
    },

    // §27.1 mission completion (practice participation per intervention).
    async missions(actor, organizationId, { development, filters = {}, permission = 'analytics.read' }) {
      const min = await minGroupSize(organizationId)
      const pop = await population(actor, organizationId, filters, permission)
      if (!development || !repos.development) return { minGroupSize: min, available: false, interventions: [] }
      const cohortIds = new Set(pop.cohorts.map((c) => c.id))
      const out = []
      for (const i of await repos.development.listInterventions(organizationId)) {
        if (!cohortIds.has(i.cohortId) || i.status === 'CANCELLED') continue
        const s = await development.interventionSummary(i)
        const base = { interventionId: i.id, name: i.name, status: i.status, startsOn: i.startsOn, endsOn: i.endsOn, targetCapability: s.targetCapability }
        out.push(s.counts.members < min ? { ...base, ...SUPPRESSED() } : { ...base, suppressed: false, members: s.counts.members, started: s.counts.started, completedAll: s.counts.completedAll })
      }
      return { minGroupSize: min, available: true, interventions: out }
    },

    // §27.1 intervention outcome + baseline vs reassessment (comparable only).
    async interventions(actor, organizationId, { development, admin, growthEnabled = true }) {
      const missions = await this.missions(actor, organizationId, { development })
      const min = missions.minGroupSize
      const useGrowth = growth && growthEnabled && repos.growth
      const outcomes = useGrowth ? (await growth.outcomes(actor, organizationId, { admin, minGroupSize: min })).items : []
      const cycles = useGrowth ? await growth.listCycles(actor, organizationId, { admin, permission: 'analytics.read' }) : []
      const byIntervention = new Map()
      for (const c of cycles) if (c.interventionId) byIntervention.set(c.interventionId, outcomes.find((o) => o.cycle.id === c.id) || null)
      return {
        minGroupSize: min,
        interventions: missions.interventions.map((i) => ({ ...i, outcome: byIntervention.get(i.interventionId) || null })),
        reassessments: outcomes,
      }
    },

    // Audited CSV of an aggregate view (authorised fields only).
    async exportCsv(req, actor, organizationId, { view, filters = {}, groupBy }, { orgAudit, development, admin }) {
      const e = can(actor, 'exports.cohort', { organizationId })
      if (!e.allowed) throw new ApiError('NOT_FOUND', 'Not found')
      const hidden = 'Hidden'
      const rows = []
      if (view === 'capabilities') {
        const v = await this.capabilities(actor, organizationId, filters)
        rows.push(['Capability', 'Students assessed', ...BUCKETS.map((b) => BUCKET_LABEL[b])])
        for (const c of v.capabilities) rows.push(c.suppressed ? [c.name, hidden, ...BUCKETS.map(() => hidden)] : [c.name, c.n, ...BUCKETS.map((b) => c.buckets[b])])
      } else if (view === 'sufficiency') {
        const v = await this.sufficiency(actor, organizationId, filters)
        rows.push(['Capability', 'Students assessed', 'Enough evidence', 'Provisional', 'Not enough evidence', 'Under human review'])
        for (const c of v.capabilities) rows.push(c.suppressed ? [c.name, hidden, hidden, hidden, hidden, hidden] : [c.name, c.n, c.statuses.SUFFICIENT, c.statuses.PROVISIONAL, c.statuses.INSUFFICIENT_EVIDENCE, c.statuses.HUMAN_REVIEW_REQUIRED])
      } else if (view === 'comparison') {
        const v = await this.comparison(actor, organizationId, { ...filters, groupBy })
        rows.push([groupBy === 'department' ? 'Department' : 'Cohort', 'Capability', 'Students assessed', ...BUCKETS.map((b) => BUCKET_LABEL[b])])
        for (const g of v.groups) {
          if (g.suppressed) { rows.push([g.name, 'All', hidden, ...BUCKETS.map(() => hidden)]); continue }
          for (const c of g.capabilities) rows.push(c.suppressed ? [g.name, c.name, hidden, ...BUCKETS.map(() => hidden)] : [g.name, c.name, c.n, ...BUCKETS.map((b) => c.buckets[b])])
        }
      } else if (view === 'completion') {
        const v = await this.completion(actor, organizationId, filters)
        rows.push(['Stage', 'Students'], ['Assigned', v.funnel.assigned], ['Acknowledged', v.funnel.acknowledged], ['Started', v.funnel.started], ['Completed', v.funnel.completed])
      } else if (view === 'missions') {
        const v = await this.missions(actor, organizationId, { development, filters })
        rows.push(['Intervention', 'Members', 'Started', 'Finished all missions'])
        for (const i of v.interventions) rows.push(i.suppressed ? [i.name, hidden, hidden, hidden] : [i.name, i.members, i.started, i.completedAll])
      } else {
        throw new ApiError('VALIDATION_FAILED', 'Choose a view to export.')
      }
      const footnote = ['Hidden: Data hidden because this segment is too small for aggregate reporting.']
      const csv = [...rows, [], footnote].map((r) => r.map(csvCell).join(',')).join('\r\n')
      await orgAudit(req, organizationId, 'report.exported', 'ANALYTICS', null, { view, groupBy: groupBy || null, rows: rows.length - 1 })
      return { fileName: `prism-analytics-${view}.csv`, contentType: 'text/csv', csv }
    },

    // §28 executive (whole organization in scope) / department / cohort report.
    async cohortReport(req, actor, organizationId, { cohortId = null, departmentId = null } = {}, { orgAudit, development, admin, growthEnabled = true }) {
      if (!can(actor, 'reports.read', { organizationId }).allowed) throw new ApiError('NOT_FOUND', 'Not found')
      const filters = { cohortId, departmentId }
      const permission = 'reports.read'
      // A cohort or department outside the caller's reach is not found.
      const scope = await population(actor, organizationId, filters, permission)
      if ((cohortId || departmentId) && scope.cohorts.length === 0) throw new ApiError('NOT_FOUND', 'Not found')
      const targetCohorts = new Set(scope.cohorts.map((c) => c.id))
      const [participation, caps, missions, cycles] = await Promise.all([
        this.completion(actor, organizationId, filters, { permission }),
        this.capabilities(actor, organizationId, filters, { permission }),
        this.missions(actor, organizationId, { development, filters, permission }),
        growth && growthEnabled && repos.growth ? growth.listCycles(actor, organizationId, { admin, permission }) : [],
      ])
      // Only reassessments of the report's own cohorts.
      const outcomes = cycles.filter((c) => c.cohortIds.some((id) => targetCohorts.has(id)))
      const kind = cohortId ? 'COHORT' : departmentId ? 'DEPARTMENT' : 'EXECUTIVE'
      const actions = []
      const open = participation.funnel.assigned - participation.funnel.completed
      if (open > 0) actions.push({ kind: 'COMPLETION', text: `${open} assigned ${open === 1 ? 'assessment is' : 'assessments are'} not completed yet. Remind students before the window closes.` })
      for (const n of caps.topNeeds) actions.push({ kind: 'DEVELOPMENT', capabilityId: n.capabilityId, text: `${n.name}: ${n.needs} of ${n.of} assessed students need further evidence or development. Consider a practice intervention.` })
      if (!outcomes.some((c) => ['SCHEDULED', 'ACTIVE'].includes(c.status)) && missions.interventions.some((i) => i.status !== 'CANCELLED')) actions.push({ kind: 'REASSESSMENT', text: 'No reassessment is scheduled after the practice interventions. Schedule one to see change on comparable forms.' })
      const report = {
        kind,
        generatedAt: new Date().toISOString(),
        minGroupSize: caps.minGroupSize,
        participation,
        capabilities: caps.suppressed
          ? { suppressed: true, items: [], bucketLabels: caps.bucketLabels }
          : { suppressed: false, assessed: caps.assessed, underReview: caps.underReview, items: caps.capabilities, bucketLabels: caps.bucketLabels },
        majorGaps: caps.topNeeds,
        interventions: missions.interventions,
        reassessments: outcomes.map((c) => ({ id: c.id, name: c.name, status: c.status, windowStart: c.windowStart, windowEnd: c.windowEnd, comparability: c.comparability })),
        recommendedActions: actions,
        method: NEEDS_METHOD,
        privacy: 'Aggregate only. No personal Prism data, no student names and no ranking. Groups below the minimum size are hidden.',
      }
      await orgAudit(req, organizationId, 'report.exported', 'COHORT_REPORT', cohortId || departmentId || null, { kind })
      return report
    },
  }
  return service
}
