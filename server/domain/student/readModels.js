// Student read models (spec §9, §13, §15, §16.1, §17, §18; C4.03). Every
// capability status comes from the sufficiency engine over the stored
// evidence units of COMPLETED formal sessions in the active workspace; every
// sentence is a validated claim or a statement of absence. Nothing here
// invents a level, a change, a quote or a recommendation (fail closed):
//   - no admissible evidence → INSUFFICIENT_EVIDENCE, level null
//   - change across assessments → null until comparable forms exist (Phase 9)
//   - practice evidence is a separate kind and never alters formal status
import { evaluateProfile } from '../evidence/sufficiency.js'
import { LEVEL_LABELS_STATUS } from '../evidence/levels.js'
import { buildClaim, validateClaims, candidateTurnsUnion } from '../reports/claims.js'
import { PRIMARY_CAPABILITY_IDS, CORE_DEFINITION_ID, capabilityInfo, definitionForScenario, formForSession } from '../assessments/catalog.js'
import { playerPath } from '../assessments/assignmentService.js'
import { isEnabled } from '../flags/index.js'
import { RIASEC_KEYS, sanitizeInterests } from '../../lib/roleAffinityEngine.js'
import { PROCESSING_GRACE_MS } from './history.js'

const ADMISSIBLE = new Set(['PROVISIONAL', 'SUFFICIENT'])
const GROWTH_BANDS = new Set(['EARLY', 'DEVELOPING'])
const BAND_ORDER = { EARLY: 0, DEVELOPING: 1, DEMONSTRATED: 2, STRONG: 3 }
const REPORT_READY_DAYS = 30
const normalise = (s) => String(s).replace(/\s+/g, ' ').trim()

function verifiedQuote(unit, turns) {
  const excerpt = unit.candidate_action_json?.dialogue_excerpt
  if (typeof excerpt !== 'string' || !excerpt.trim()) return null
  const q = normalise(excerpt)
  return turns.some((t) => normalise(t).includes(q)) ? excerpt.trim() : null
}

export function createStudentReadModels({ directory, catalog, assignments, evidence, practice = { list: async () => [] }, development = { enabled: () => false }, growth = { enabled: () => false }, preparation = { enabled: () => false }, roles, legacy, clock = () => new Date(), repos = null }) {
  // Accepted candidate actions: the quote source that survives a history purge (T32).
  const actionsFor = async (sessionId) => (repos?.sessionIo && typeof repos.sessionIo.listActions === 'function'
    ? repos.sessionIo.listActions(sessionId).catch(() => [])
    : [])
  // One entry per completed formal session in the workspace (newest first).
  // Held or invalidated sessions are never formal evidence (K59).
  async function formalSessions(user, workspace) {
    const cat = await catalog.getCatalog()
    const completed = (await directory.listSessions(user, workspace)).filter((s) => s.hasReport)
    const sessions = completed.filter((s) => s.integrity === 'OK')
    const out = []
    out.excludedCount = completed.length - sessions.length
    for (const s of sessions) {
      const definitionId = definitionForScenario(cat, s.scenarioId)
      const definition = cat.definitions.find((d) => d.id === definitionId) || null
      const units = await evidence.units(s.sessionId)
      const capabilityIds = definition?.measures || PRIMARY_CAPABILITY_IDS
      out.push({
        session: s,
        definition,
        form: formForSession(cat, s.scenarioId),
        units,
        turns: candidateTurnsUnion(s.history, await actionsFor(s.sessionId)),
        decisions: evaluateProfile(units, { capabilityIds }),
      })
    }
    return out
  }

  function summaryClaim(cap, entry, decision) {
    if (!entry) return { text: 'No completed assessment has measured this yet.', status: 'INSUFFICIENT', evidenceIds: [] }
    if (decision?.status === 'HUMAN_REVIEW_REQUIRED') {
      return { text: 'A person is reviewing the evidence for this before it is described.', status: 'INSUFFICIENT', evidenceIds: [] }
    }
    if (!decision || !ADMISSIBLE.has(decision.status) || !decision.level) {
      return { text: `There was not enough evidence in ${entry.definition?.title || 'your assessment'} to describe this.`, status: 'INSUFFICIENT', evidenceIds: [] }
    }
    const n = decision.unitIds.length
    const draft = buildClaim({
      claimType: 'OBSERVED_BEHAVIOR',
      capabilityId: cap.id,
      text: `Based on ${n} observed ${n === 1 ? 'response' : 'responses'} in ${entry.definition?.title || 'your assessment'}.`,
      evidenceIds: decision.unitIds,
      status: decision.status === 'SUFFICIENT' ? 'SUPPORTED' : 'PROVISIONAL',
    })
    const index = new Map(entry.units.filter((u) => ADMISSIBLE.has(u.evidence_status)).map((u) => [u.evidence_id, u]))
    const { accepted } = validateClaims([draft], index, { turns: entry.turns })
    return accepted[0]
      ? { text: accepted[0].text, status: accepted[0].status, evidenceIds: accepted[0].evidence_ids, claimId: accepted[0].claim_id }
      : { text: 'The evidence for this could not be verified, so no level is shown.', status: 'INSUFFICIENT', evidenceIds: [] }
  }

  function capabilityView(capId, entries) {
    const cap = capabilityInfo(capId)
    if (!cap) return null
    const measured = entries.filter((e) => e.decisions[capId])
    const current = measured[0] || null
    const decision = current ? current.decisions[capId] : null
    const admissible = Boolean(decision && ADMISSIBLE.has(decision.status) && decision.level)
    const eligible = admissible ? new Set(decision.unitIds) : new Set()
    const observed = admissible
      ? current.units.filter((u) => eligible.has(u.evidence_id) && u.observable_behavior).slice(0, 3).map((u) => ({
        evidenceId: u.evidence_id,
        behavior: u.observable_behavior,
        quote: verifiedQuote(u, current.turns),
      }))
      : []
    const summary = summaryClaim(cap, current, decision)
    return {
      id: cap.id,
      name: cap.name,
      definition: cap.description,
      layer: cap.layer,
      status: decision?.status || 'INSUFFICIENT_EVIDENCE',
      statusReasons: decision?.reasons || ['NO_EVIDENCE'],
      level: admissible ? { band: decision.level.band, label: decision.level.label } : null,
      levelLabelsStatus: LEVEL_LABELS_STATUS,
      change: null,
      changeStatus: 'NOT_COMPARABLE',
      evidenceSummary: summary,
      observedBehaviors: observed,
      evidenceSources: current ? [{ sessionId: current.session.sessionId, assessmentTitle: current.definition?.title || null, completedAt: current.session.completedAt }] : [],
      developmentPriority: admissible && GROWTH_BANDS.has(decision.level.band),
      relatedMissions: [],
      history: measured.map((e) => {
        const d = e.decisions[capId]
        const ok = ADMISSIBLE.has(d.status) && d.level
        return { sessionId: e.session.sessionId, assessmentTitle: e.definition?.title || null, completedAt: e.session.completedAt, status: d.status, level: ok ? { band: d.level.band, label: d.level.label } : null }
      }),
    }
  }

  async function capabilities(user, workspace) {
    const entries = await formalSessions(user, workspace)
    const contextual = new Set()
    for (const e of entries) {
      for (const [id, d] of Object.entries(e.decisions)) {
        if (!PRIMARY_CAPABILITY_IDS.includes(id) && d.consideredUnitIds.length > 0) contextual.add(id)
      }
    }
    const items = [...PRIMARY_CAPABILITY_IDS, ...[...contextual].sort()].map((id) => capabilityView(id, entries)).filter(Boolean)
    return { items, assessedCount: entries.length, excludedCount: entries.excludedCount || 0, levelLabelsStatus: LEVEL_LABELS_STATUS }
  }

  function focusFrom(items) {
    return items
      .filter((c) => c.developmentPriority)
      .sort((a, b) => BAND_ORDER[a.level.band] - BAND_ORDER[b.level.band] || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((c) => ({ capabilityId: c.id, name: c.name, level: c.level, status: c.status, basedOn: c.evidenceSources[0] || null }))
  }

  return {
    capabilities,

    async evidence(user, workspace, filters = {}) {
      const entries = await formalSessions(user, workspace)
      const formal = []
      for (const e of entries) {
        for (const u of e.units) {
          const cap = capabilityInfo(u.capability_id)
          const admissible = ADMISSIBLE.has(u.evidence_status) && Number.isFinite(u.rubric_level)
          const anchor = admissible && cap?.anchors?.[Math.round(u.rubric_level)]
          formal.push({
            id: u.evidence_id,
            kind: 'FORMAL',
            sessionId: e.session.sessionId,
            assessmentTitle: e.definition?.title || null,
            scope: e.session.scope,
            date: e.session.completedAt,
            candidateAction: { quote: verifiedQuote(u, e.turns), turn: u.source_turn ?? null, artifactId: u.source_artifact_id || null },
            observedBehavior: u.observable_behavior || null,
            capability: { id: u.capability_id, name: cap?.name || null },
            rubricAnchor: anchor ? { criteria: anchor.criteria } : null,
            evidenceStatus: u.evidence_status,
          })
        }
      }
      const practiceItems = (await practice.list(user, workspace)).map((p) => ({ ...p, kind: 'PRACTICE' }))
      const all = [...formal, ...practiceItems]
      const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : null
      const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null
      const items = all.filter((i) => (!filters.capability || i.capability?.id === filters.capability)
        && (!filters.assessment || i.sessionId === filters.assessment)
        && (!filters.scope || i.scope === filters.scope)
        && (!filters.kind || i.kind === filters.kind)
        && (!from || (i.date && new Date(i.date) >= from))
        && (!to || (i.date && new Date(i.date) <= to)))
      const capabilitiesSeen = new Map(all.filter((i) => i.capability?.id).map((i) => [i.capability.id, i.capability.name]))
      return {
        items,
        total: all.length,
        facets: {
          capabilities: [...capabilitiesSeen].map(([id, name]) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
          assessments: entries.map((e) => ({ sessionId: e.session.sessionId, title: e.definition?.title || null, completedAt: e.session.completedAt })),
        },
        practiceAvailable: practiceItems.length > 0,
      }
    },

    async home(user, workspace) {
      const at = clock()
      const [lists, caps, sessions, cat] = await Promise.all([
        assignments.listForWorkspace(user, workspace), capabilities(user, workspace), directory.listSessions(user, workspace), catalog.getCatalog(),
      ])
      // A finished session without a report is either still being reviewed
      // (within the grace window) or a technical failure to recover from.
      // Both outrank "resume": the learner's work is saved, not resumable.
      // Same facts and thresholds as the history projection (P1.2).
      const awaiting = sessions
        .filter((s) => s.integrity === 'OK' && s.hasSession && !s.hasReport && s.sessionCompletedAt)
        .sort((a, b) => String(b.sessionCompletedAt).localeCompare(String(a.sessionCompletedAt)))
      const failed = awaiting.find((s) => at.getTime() - new Date(s.sessionCompletedAt).getTime() > PROCESSING_GRACE_MS)
      const processing = awaiting.find((s) => at.getTime() - new Date(s.sessionCompletedAt).getTime() <= PROCESSING_GRACE_MS)
      const recoveryTo = (s) => {
        const sponsored = s.scope === 'SPONSORED'
        if (isEnabled('PRISM_ASSESSMENT_WORKSPACE_V3')) return playerPath(s.sessionId, sponsored ? workspace.id : null)
        if (sponsored) return null
        const definitionId = definitionForScenario(cat, s.scenarioId)
        return legacy.paths.resume(s.sessionId, Boolean(definitionId) && definitionId !== CORE_DEFINITION_ID)
      }
      const fromSession = (kind, s, to) => ({
        kind, sessionId: s.sessionId, title: cat.definitions.find((d) => d.id === definitionForScenario(cat, s.scenarioId))?.title || null,
        scope: s.scope, completedAt: s.sessionCompletedAt, to,
      })
      const due = lists.active.find((a) => a.status === 'NOT_STARTED' && a.dueAt)
      const inProgress = lists.active.find((a) => a.status === 'IN_PROGRESS')
      const ready = lists.active.find((a) => a.status === 'NOT_STARTED')
      const recentReport = lists.completed.find((a) => a.cta.kind === 'VIEW_REPORT' && a.completedAt
        && at.getTime() - new Date(a.completedAt).getTime() <= REPORT_READY_DAYS * 86400000)
      const anyLevel = caps.items.some((c) => c.level)
      // P3.3: a private preparation the learner can return to (PERSONAL only,
      // flag-gated). A failed read omits the state; it never invents one.
      const preparing = !due && !failed && !processing && !inProgress && workspace.type === 'PERSONAL' && preparation.enabled()
        ? ((await preparation.list(user, workspace).catch(() => ({ items: [] })))?.items || []).find((a) => a.state === 'DRAFT' || a.state === 'REHEARSING') || null
        : null
      // P3.3: one relevant reviewed practice mission from the development plan
      // (never DRAFT content); only offered when nothing more urgent applies.
      const practiceMission = !due && !failed && !processing && !inProgress && !preparing && !ready && !recentReport && development.enabled()
        ? await development.planFor(user, workspace, focusFrom(caps.items)).then((p) => ({ mission: (p?.recommended || []).find((m) => m.status !== 'DRAFT') || null, allowance: p?.allowance || null })).catch(() => null)
        : null
      let primaryAction
      const fromCard = (kind, a) => ({ kind, assignmentId: a.id, title: a.title, scope: a.scope, dueAt: a.dueAt, to: a.cta.to || `${workspace.type === 'CAMPUS_STUDENT' ? `/app/campus/${workspace.organizationId}/assignments` : '/app/assessments'}/${a.id}/briefing` })
      if (due) primaryAction = fromCard('ASSESSMENT_DUE', due)
      else if (failed) primaryAction = fromSession('ASSESSMENT_TECHNICAL_FAILED', failed, recoveryTo(failed))
      else if (processing) primaryAction = fromSession('ASSESSMENT_PROCESSING', processing, null)
      else if (inProgress) primaryAction = fromCard('ASSESSMENT_IN_PROGRESS', inProgress)
      else if (preparing) primaryAction = { kind: 'PREPARATION_IN_PROGRESS', attemptId: preparing.id, title: preparing.situationLabel || null, scope: 'PERSONAL', completedAt: null, startedAt: preparing.createdAt || null, to: `/app/prepare/${encodeURIComponent(preparing.id)}` }
      else if (ready) primaryAction = fromCard('ASSESSMENT_READY', ready)
      else if (recentReport) primaryAction = fromCard('REPORT_READY', recentReport)
      else if (practiceMission?.mission) {
        const m = practiceMission.mission
        const base = workspace.type === 'CAMPUS_STUDENT' ? `/app/campus/${workspace.organizationId}/development` : '/app/development'
        primaryAction = {
          kind: 'PRACTICE_AVAILABLE', missionId: m.id, title: m.title, targetCapabilityName: m.targetCapabilityName || null,
          estimatedMinutes: Number.isFinite(m.estimatedMinutes) ? m.estimatedMinutes : null, mode: (m.modes || [])[0] || 'GUIDED',
          allowance: practiceMission.allowance, to: `${base}/missions/${encodeURIComponent(m.id)}`,
        }
      }
      else if (anyLevel) primaryAction = { kind: 'CAPABILITY_SUMMARY', to: workspace.type === 'PERSONAL' ? '/app/capabilities' : null }
      else if (workspace.type === 'PERSONAL') primaryAction = { kind: 'GET_STARTED', to: legacy.paths.purchase }
      else primaryAction = { kind: 'NOTHING_ASSIGNED', to: null }
      const snapshot = caps.items.filter((c) => c.layer === 'PRIMARY' || c.level).map((c) => ({
        id: c.id, name: c.name, status: c.status, level: c.level, change: c.change, changeStatus: c.changeStatus, evidenceSummary: c.evidenceSummary.text,
      }))
      return {
        user: { name: user.name || null },
        workspace: { id: workspace.id, type: workspace.type, name: workspace.name || null, organizationName: workspace.organizationName || null },
        primaryAction,
        capabilitySnapshot: snapshot,
        assessedCount: caps.assessedCount,
        focus: focusFrom(caps.items),
        sponsor: workspace.type === 'CAMPUS_STUDENT' ? { organizationId: workspace.organizationId, organizationName: workspace.organizationName || workspace.name || null, programName: null } : null,
        levelLabelsStatus: LEVEL_LABELS_STATUS,
      }
    },

    async developmentPlan(user, workspace) {
      const caps = await capabilities(user, workspace)
      const priorities = focusFrom(caps.items)
      // Development V2 (Phase 8): recommended and catalogue missions plus past
      // attempts. Practice never feeds back into `priorities` (formal only).
      const v2 = development.enabled() ? await development.planFor(user, workspace, priorities) : null
      return {
        status: priorities.length ? 'FOCUS_FROM_EVIDENCE' : 'NO_PLAN',
        priorities,
        missions: v2 ? v2.recommended : [],
        catalogue: v2 ? v2.catalogue : [],
        allowance: v2?.allowance || { kind: 'UNLIMITED' },
        completedMissions: v2 ? v2.completed : [],
        missionsAvailable: Boolean(v2 && v2.catalogue.length),
        missionsEnabled: Boolean(v2),
        upcomingReassessment: null,
        practiceEvidence: await practice.list(user, workspace),
      }
    },

    async growth(user, workspace) {
      const entries = await formalSessions(user, workspace)
      // Growth V2 (Phase 9): a change only across APPROVED equivalent forms with
      // SUFFICIENT evidence in both sessions; otherwise an honest reason.
      if (growth.enabled()) {
        const g = await growth.growthFor(user, workspace, entries)
        return {
          ...g,
          reassessments: await growth.reassessmentsFor(user, workspace),
          interventions: await growth.interventionsFor(user, workspace),
          growthEnabled: true,
        }
      }
      return {
        comparable: false,
        reason: entries.length >= 2 ? 'FORMS_NOT_VALIDATED_FOR_COMPARISON' : 'NEEDS_COMPARABLE_REASSESSMENT',
        assessments: entries.map((e) => ({ sessionId: e.session.sessionId, title: e.definition?.title || null, completedAt: e.session.completedAt, form: e.form ? { id: e.form.id, version: e.form.version } : null })),
        comparison: null,
        changes: [],
        reassessments: [],
        interventions: [],
        growthEnabled: false,
      }
    },

    // Explore Roles V2 (§18): self-reported interests and demonstrated formal
    // evidence stay separate; without interests there are no recommendations.
    async exploration(user, workspace, rawInterests = null) {
      const caps = await capabilities(user, workspace)
      const demonstrated = caps.items.filter((c) => c.level).map((c) => ({ capabilityId: c.id, name: c.name, level: c.level, status: c.status }))
      const interests = rawInterests == null ? null : sanitizeInterests(rawInterests)
      if (!interests) return { selfReported: { interests: [] }, demonstrated, recommendations: [], evaluated: false }
      const profile = {}
      for (const c of caps.items) {
        if (c.level) profile[c.id] = { status: c.status, level: c.level, unit_ids: c.evidenceSummary.evidenceIds }
      }
      const results = await roles.evaluate({ capabilityProfile: profile, candidateInterests: interests })
      return {
        selfReported: { interests: RIASEC_KEYS.filter((k) => interests[k] > 0) },
        demonstrated,
        recommendations: results.filter((r) => r.basis !== 'NONE').map((r) => ({
          roleId: r.roleId,
          title: r.title,
          basis: r.basis,
          selfReportedReasons: r.whyShown.filter((w) => w.type === 'SELF_REPORTED_INTEREST').map((w) => w.statement),
          demonstratedReasons: r.whyShown.filter((w) => w.type === 'DEMONSTRATED_CAPABILITY').map((w) => w.statement),
          unknowns: r.unknowns.slice(0, 3).map((u) => u.note),
          nextStep: r.nextStep,
        })),
        evaluated: true,
      }
    },
  }
}
