// P5.6 current recommendations, projected at READ time next to an immutable
// report version (never stored inside it). Pure: the same gaps, missions and
// allowance always give the same recommendations, and nothing here can change
// a version, a hash or a capability status.
//
// A recommendation answers one question: "which reviewed, reachable practice
// mission practises the behaviours this report found room to build?" It is
// resolved from the stored version's evidence (behaviour ids on the units of
// a priority capability), the missions the workspace may actually open and
// the learner's practice allowance. When nothing qualifies, the answer is an
// honest `mission: null` with a reason — never the unrelated legacy mission.
const DEMONSTRATED_FLOOR = 3

export const RECOMMENDATION_AVAILABILITY = Object.freeze(['AVAILABLE', 'NO_REVIEWED_PRACTICE', 'ALLOWANCE_EXHAUSTED', 'PRACTICE_OFF'])

// Behaviour gaps from a stored report version and the session's units:
// one per development priority (what to build), plus one optional STRETCH
// per STRONG capability (nothing to fix, an optional challenge). Behaviour
// ids come from the evaluator's provenance; units without one leave the
// gap capability-only.
export function behaviourGaps(report, units = []) {
  const own = (units || []).filter((u) => u && u.session_id === report.sessionId)
  const idsFor = (capabilityId, predicate = () => true) => [...new Set(own
    .filter((u) => u.capability_id === capabilityId && predicate(u))
    .map((u) => u.provenance_json?.behaviourId).filter((b) => typeof b === 'string' && b))].sort()
  const gaps = []
  for (const p of report.development?.priorities || []) {
    const below = idsFor(p.capabilityId, (u) => Number.isFinite(u.rubric_level) && u.rubric_level < DEMONSTRATED_FLOOR)
    gaps.push({ kind: 'PRACTICE', capabilityId: p.capabilityId, behaviourIds: below.length ? below : idsFor(p.capabilityId), nextBehavior: p.behaviorToImprove || null })
  }
  // A bounded observation (one verified moment below the sufficiency floor)
  // names a next behaviour too; its practice gap is that moment's behaviour.
  for (const o of report.boundedObservations || []) {
    if (gaps.some((g) => g.capabilityId === o.capability?.id)) continue
    const unit = own.find((u) => u.evidence_id === o.id)
    const behaviourId = unit?.provenance_json?.behaviourId
    gaps.push({ kind: 'PRACTICE', capabilityId: o.capability.id, behaviourIds: typeof behaviourId === 'string' && behaviourId ? [behaviourId] : [], nextBehavior: o.nextBehavior || null })
  }
  for (const c of report.summary?.capabilities || []) {
    if (c.level?.band === 'STRONG') gaps.push({ kind: 'STRETCH', capabilityId: c.id, behaviourIds: idsFor(c.id), nextBehavior: null })
  }
  return gaps
}

export function missionEligible(m, { draftEnabled = false } = {}) {
  if (!m || m.status === 'RETIRED') return false
  return m.status === 'PUBLISHED' || (m.status === 'DRAFT' && draftEnabled)
}

function matchMission(gap, missions, opts) {
  const eligible = missions.filter((m) => missionEligible(m, opts) && Array.isArray(m.form_behaviour_ids) && m.form_behaviour_ids.length)
  const byBehaviour = eligible
    .map((m) => ({ m, matched: m.form_behaviour_ids.filter((b) => gap.behaviourIds.includes(b)).sort() }))
    .filter((x) => x.matched.length)
    .sort((a, b) => b.matched.length - a.matched.length || a.m.mission_id.localeCompare(b.m.mission_id))
  if (byBehaviour[0]) return { ...byBehaviour[0], matchedBy: 'BEHAVIOUR' }
  // No behaviour ids on this capability's units (older runs): fall back to a
  // behaviour-mapped mission authored for the same capability.
  if (!gap.behaviourIds.length) {
    const byCap = eligible.filter((m) => m.target_capability_id === gap.capabilityId).sort((a, b) => a.mission_id.localeCompare(b.mission_id))
    if (byCap[0]) return { m: byCap[0], matched: [], matchedBy: 'CAPABILITY' }
  }
  return null
}

/**
 * @param gaps        behaviourGaps() output
 * @param missions    parsed missions the workspace can open (service decides reach)
 * @param allowance   { kind: 'UNLIMITED' } | { kind: 'BOUNDED', remaining, ... }
 * @param draftEnabled PRISM_DRAFT_CONTENT (test/local only)
 * @param pathFor     (missionId) => route
 */
export function resolveRecommendations({ gaps = [], missions = [], allowance = { kind: 'UNLIMITED' }, draftEnabled = false, pathFor = (id) => `/app/development/missions/${encodeURIComponent(id)}`, practiceEnabled = true } = {}) {
  const exhausted = allowance?.kind === 'BOUNDED' && (allowance.remaining ?? 0) <= 0
  return gaps.map((gap) => {
    const base = { kind: gap.kind, capabilityId: gap.capabilityId, behaviourIds: gap.behaviourIds, nextBehavior: gap.nextBehavior, allowance: allowance || { kind: 'UNLIMITED' }, consumesActivity: allowance?.kind === 'BOUNDED' }
    if (!practiceEnabled) return { ...base, availability: 'PRACTICE_OFF', mission: null }
    const hit = matchMission(gap, missions, { draftEnabled })
    if (!hit) return { ...base, availability: 'NO_REVIEWED_PRACTICE', mission: null }
    const m = hit.m
    const mission = {
      id: m.mission_id,
      title: m.title,
      displayCode: m.display_code || null,
      status: m.status,
      label: m.status === 'DRAFT' ? 'Draft practice mission (test content)' : 'Practice mission',
      estimatedMinutes: Number.isFinite(m.estimated_duration?.minutes) ? m.estimated_duration.minutes : null,
      matchedBehaviourIds: hit.matched,
      matchedBy: hit.matchedBy,
      to: pathFor(m.mission_id),
    }
    return { ...base, availability: exhausted ? 'ALLOWANCE_EXHAUSTED' : 'AVAILABLE', mission }
  })
}
