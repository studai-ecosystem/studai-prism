// Pilot technical report generator (PROD-READY Phase 8). Fills the sections
// of docs/commercial/PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md for ONE
// organization from live data, through the existing aggregate read models.
//
// Rules (template header, charter laws 2 and 6):
//   * every number comes from the live system; what is not measured here is
//     PENDING (a human action or a study) or UNKNOWN — never an estimate;
//   * aggregates only — no student, account, session or name appears;
//   * every count about learners obeys the organization's small-group
//     suppression (minimum aggregate group size, 0037; default 10, floor 5):
//     a non-zero count below it is shown as suppressed, never as a number;
//   * evidence statuses are reported as computed: PROVISIONAL and
//     INSUFFICIENT_EVIDENCE are shown, SUFFICIENT only if the rules say so
//     (they cannot while the rubric is UNCALIBRATED);
//   * no composite, ranking, pass/fail or prediction exists in the output;
//   * a demo organization (0061) is labelled synthetic on every section.
import { ApiError } from '../http/errors.js'
import { PILOT_NOTICE, NOT_SOLE_BASIS_POLICY, JOB_FAMILY_SCOPE, REVIEW_TARGET_BUSINESS_DAYS } from '../../lib/sharedConstants.js'
import { BUCKETS } from '../analytics/service.js'

export const PILOT_REPORT_TEMPLATE = 'docs/commercial/PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md'
export const PILOT_REPORT_VERSION = 'pilot-technical-report.v1'
export const DEMO_REPORT_NOTICE = 'DEMO DATA — this organization is a synthetic demo organization. Every number below describes generated data, not a pilot, a college or real students.'
export const SCOPE_STATEMENT = `Prism reports development evidence within ${JOB_FAMILY_SCOPE.document} (${Object.values(JOB_FAMILY_SCOPE.families).join(', ')}). It is not a hiring screen, a ranking, a pass/fail cut-off or a predictor of job performance, and no part of this report may be used as one.`
const STATUSES = ['SUFFICIENT', 'PROVISIONAL', 'INSUFFICIENT_EVIDENCE', 'HUMAN_REVIEW_REQUIRED']

// The organization's actor for the aggregate read models: the admin plane
// reads exactly what an organization owner's aggregate views show.
const reportActor = (organizationId) => ({ userId: 'admin-plane:pilot-report', memberships: [{ organizationId, role: 'ORG_OWNER', status: 'ACTIVE' }] })

// A learner count under the suppression rule (0 is not a small group).
export function countCell(n, min) {
  if (!Number.isFinite(n)) return { unknown: true }
  if (n === 0) return { n: 0 }
  return n < min ? { suppressed: true } : { n }
}

// Complementary suppression: in a row whose total is shown, a single
// suppressed cell could be recovered by subtraction, so the smallest
// non-zero visible cell of that row is suppressed too (same rule as the
// campus comparison view). Mutates and returns the row of cells.
export function protectRow(cells) {
  const entries = Object.entries(cells)
  const hidden = entries.filter(([, c]) => c?.suppressed)
  if (hidden.length !== 1) return cells
  const next = entries.filter(([, c]) => Number.isFinite(c?.n) && c.n > 0).sort((a, b) => a[1].n - b[1].n)[0]
  if (next) cells[next[0]] = { suppressed: true, complementary: true }
  return cells
}

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * buildPilotReport({ campus, organizationId, term, adminState, now })
 *   campus      the campus context (store, analytics, billing, catalog)
 *   adminState  async (sessionId) → { invalid, reviewState } | null
 * → JSON model (no personal data). renderPilotReportMarkdown(model) → Markdown.
 */
export async function buildPilotReport({ campus, organizationId, term = null, adminState = async () => null, now = new Date() }) {
  const store = campus.store
  const org = await store.organizations.getOrganization(organizationId)
  if (!org) throw new ApiError('NOT_FOUND', 'Not found')
  const actor = reportActor(organizationId)
  const min = await campus.analytics.minGroupSize(organizationId)
  const [completion, capabilities, sufficiency, detail, catalog] = await Promise.all([
    campus.analytics.completion(actor, organizationId),
    campus.analytics.capabilities(actor, organizationId),
    campus.analytics.sufficiency(actor, organizationId),
    campus.billing.organizationDetail(organizationId),
    campus.catalog.getCatalog(),
  ])

  // Administration window and forms (from the organization's assignments).
  const assignments = (await store.campusAdmin.listOrgAssignments(organizationId)).filter((a) => a.status !== 'CANCELLED')
  const starts = assignments.map((a) => a.windowStart).filter(Boolean).sort()
  const ends = assignments.map((a) => a.windowEnd).filter(Boolean).sort()
  const definitionIds = [...new Set(assignments.map((a) => a.definitionId))]
  const forms = catalog.forms.filter((f) => definitionIds.includes(f.definitionId)).map((f) => ({ formId: f.id, version: f.version ?? null, status: f.status ?? null }))
  const roster = typeof store.campusAdmin.listOrgRosterRows === 'function' ? await store.campusAdmin.listOrgRosterRows(organizationId) : []
  const completed = roster.filter((r) => r.status === 'COMPLETED' && r.sessionId)

  // Integrity tri-status of completed sessions (admin holds / invalidations).
  const integrity = { conditionsMet: 0, reviewRecommended: 0, invalidated: 0 }
  for (const r of completed) {
    const s = await adminState(r.sessionId)
    if (s?.invalid) integrity.invalidated += 1
    else if (s?.reviewState === 'held') integrity.reviewRecommended += 1
    else integrity.conditionsMet += 1
  }

  // Accommodations: approved alternate administrations, counts only.
  let accommodations = null
  if (store.accommodationRequests && typeof store.accommodationRequests.getForAssignment === 'function') {
    accommodations = 0
    const seen = new Set()
    for (const r of roster) {
      const key = `${r.assignmentId}:${r.userId}`
      if (seen.has(key)) continue
      seen.add(key)
      const req = await store.accommodationRequests.getForAssignment(r.assignmentId, r.userId)
      if (req?.status === 'APPROVED') accommodations += 1
    }
  }

  // Human review requests and outcomes (counts only).
  let reviews = null
  if (store.reportReviews && typeof store.reportReviews.listForSession === 'function') {
    reviews = { humanReview: 0, moment: 0, decided: 0, outcomes: { UPHOLD: 0, CORRECT: 0, REJECT: 0 } }
    for (const r of completed) {
      for (const q of await store.reportReviews.listForSession(r.sessionId)) {
        if (q.kind === 'HUMAN_REVIEW' || q.requestKind === 'HUMAN_REVIEW') reviews.humanReview += 1
        else reviews.moment += 1
        const decisions = typeof store.reportReviews.listDecisions === 'function' ? await store.reportReviews.listDecisions(q.id) : []
        const last = decisions[decisions.length - 1]
        if (last && reviews.outcomes[last.decision] !== undefined) { reviews.decided += 1; reviews.outcomes[last.decision] += 1 }
      }
    }
  }

  const durations = completed
    .map((r) => (r.startedAt && r.completedAt ? (Date.parse(r.completedAt) - Date.parse(r.startedAt)) / 60000 : null))
    .filter((m) => Number.isFinite(m) && m >= 0)
  const funnel = completion.funnel
  const students = new Set(roster.map((r) => r.userId)).size
  const seats = detail.entitlements.reduce((acc, e) => ({ included: acc.included + (e.seats.included || 0), inUse: acc.inUse + (e.seats.inUse || 0) }), { included: 0, inUse: 0 })

  const capabilityRows = capabilities.suppressed ? null : capabilities.capabilities.map((c) => {
    const s = sufficiency.suppressed ? null : sufficiency.capabilities.find((x) => x.capabilityId === c.capabilityId)
    if (c.suppressed) return { capabilityId: c.capabilityId, name: c.name, suppressed: true }
    const statuses = s && !s.suppressed ? protectRow(Object.fromEntries(STATUSES.map((k) => [k, countCell(s.statuses[k], min)]))) : null
    // A rate is shown only when every count it is made of is shown.
    const rateVisible = statuses && !statuses.INSUFFICIENT_EVIDENCE.suppressed && !statuses.HUMAN_REVIEW_REQUIRED.suppressed && s.n >= min
    return {
      capabilityId: c.capabilityId, name: c.name, suppressed: false, n: c.n,
      levelBands: protectRow(Object.fromEntries(BUCKETS.map((b) => [b, countCell(c.buckets[b], min)]))),
      // The same number as the PROVISIONAL status count: shown exactly when that cell is.
      provisional: statuses ? statuses.PROVISIONAL : countCell(c.provisional, min),
      statuses,
      insufficientRate: rateVisible ? Math.round((s.insufficient / s.n) * 1000) / 10 : null,
    }
  })

  return {
    version: PILOT_REPORT_VERSION,
    template: PILOT_REPORT_TEMPLATE,
    status: 'DRAFT pending science review (HA-008)',
    generatedAt: now.toISOString(),
    organization: { name: org.name, type: org.organizationType, isDemo: org.isDemo === true },
    demoNotice: org.isDemo === true ? DEMO_REPORT_NOTICE : null,
    term: term || null,
    minGroupSize: min,
    administration: {
      seats: detail.entitlements.length ? { contracted: seats.included, used: seats.inUse } : null,
      students: countCell(students, min),
      funnel: funnel.assigned < min
        ? { suppressed: funnel.assigned > 0 }
        : { assigned: countCell(funnel.assigned, min), started: countCell(funnel.started, min), completed: countCell(funnel.completed, min) },
      window: { from: starts[0] ? String(starts[0]).slice(0, 10) : null, to: ends.length ? String(ends[ends.length - 1]).slice(0, 10) : null },
      assignments: assignments.length,
      forms,
      identityAssurance: 'UNKNOWN',
      accommodations: accommodations == null ? { unknown: true } : countCell(accommodations, min),
      integrity: completed.length < min
        ? { suppressed: completed.length > 0 }
        : protectRow({ conditionsMet: countCell(integrity.conditionsMet, min), reviewRecommended: countCell(integrity.reviewRecommended, min), invalidated: countCell(integrity.invalidated, min) }),
    },
    measurement: {
      assessed: capabilities.suppressed ? { suppressed: true } : countCell(capabilities.assessed, min),
      underReview: capabilities.suppressed ? { suppressed: true } : countCell(capabilities.underReview, min),
      capabilities: capabilityRows,
      levelLabels: 'PROVISIONAL (HA-C002)',
      compositeReported: false,
      panelConsistency: 'PENDING',
    },
    evidenceStatus: {
      humanAiAgreement: 'PENDING (HA-009, HA-010, HA-013)',
      retestStability: 'PENDING',
      fairness: 'PENDING / UNDERPOWERED (charter §15 suppression rules)',
    },
    operations: {
      completionRate: funnel.assigned >= min && funnel.completed >= min ? Math.round((funnel.completed / funnel.assigned) * 1000) / 10 : null,
      medianMinutes: durations.length >= min ? Math.round(median(durations)) : null,
      reviewTargetBusinessDays: REVIEW_TARGET_BUSINESS_DAYS,
      reviews: reviews == null ? { unknown: true } : {
        humanReviewRequests: countCell(reviews.humanReview, min),
        momentRequests: countCell(reviews.moment, min),
        decided: countCell(reviews.decided, min),
        outcomes: protectRow(Object.fromEntries(Object.entries(reviews.outcomes).map(([k, v]) => [k, countCell(v, min)]))),
      },
    },
    limitations: { pilotNotice: PILOT_NOTICE, notSoleBasis: NOT_SOLE_BASIS_POLICY, scope: SCOPE_STATEMENT },
  }
}

// ── Markdown ────────────────────────────────────────────────────────────────
const fmt = (c, min) => {
  if (c == null) return 'UNKNOWN'
  if (c.unknown) return 'UNKNOWN'
  if (c.complementary) return 'suppressed (complementary)'
  if (c.suppressed) return `suppressed (fewer than ${min})`
  return String(c.n)
}
const pct = (v) => (v == null ? 'suppressed or not enough data' : `${v}%`)
const esc = (s) => String(s ?? '').replace(/[|\r\n]+/g, ' ')

export function renderPilotReportMarkdown(m) {
  const min = m.minGroupSize
  const a = m.administration
  const L = []
  L.push(`# Prism pilot technical report — ${esc(m.organization.name)}, ${esc(m.term || 'term not stated')}`)
  L.push('')
  if (m.demoNotice) { L.push(`> **${m.demoNotice}**`); L.push('') }
  L.push(`Generated ${m.generatedAt} from live data · template \`${m.template}\` · ${m.version} · **${m.status}**.`)
  L.push(`Small-group suppression: any learner count below ${min} is shown as suppressed. Aggregates only; no individual result appears in this report.`)
  L.push('')
  L.push('### 1. Administration summary')
  L.push('')
  L.push(`- Cohort contracted / used: ${a.seats ? `${a.seats.contracted} seats / ${a.seats.used} in use` : 'UNKNOWN (no sponsorship pool recorded)'}`)
  L.push(`- Students on assignment rosters: ${fmt(a.students, min)}`)
  L.push(`- Assigned / started / completed: ${'assigned' in a.funnel ? `${fmt(a.funnel.assigned, min)} / ${fmt(a.funnel.started, min)} / ${fmt(a.funnel.completed, min)}` : (a.funnel.suppressed ? `suppressed (fewer than ${min})` : '0 / 0 / 0')}`)
  L.push(`- Window: ${a.window.from || 'UNKNOWN'} to ${a.window.to || 'UNKNOWN'} (${a.assignments} assignment${a.assignments === 1 ? '' : 's'})`)
  L.push(`- Assessment forms (catalog): ${a.forms.length ? a.forms.map((f) => `\`${esc(f.formId)}\`${f.version ? ` v${esc(f.version)}` : ''}`).join(', ') : 'UNKNOWN'}`)
  L.push(`- Identity assurance distribution: ${a.identityAssurance} (not aggregated per organization yet)`)
  L.push(`- Accommodations (approved alternate administrations, no detail — ACCOMMODATIONS_POLICY_v1): ${fmt(a.accommodations, min)}`)
  L.push(`- Integrity (completed sessions): ${'conditionsMet' in a.integrity ? `conditions met ${fmt(a.integrity.conditionsMet, min)} · review recommended ${fmt(a.integrity.reviewRecommended, min)} · invalidated ${fmt(a.integrity.invalidated, min)}` : (a.integrity.suppressed ? `suppressed (fewer than ${min})` : '0')}`)
  L.push('')
  L.push('### 2. Measurement properties (this cohort)')
  L.push('')
  L.push(`- Students with a completed assessment counted: ${fmt(m.measurement.assessed, min)} · under review (excluded): ${fmt(m.measurement.underReview, min)}`)
  L.push(`- Level labels: ${m.measurement.levelLabels}. Composite score: NOT REPORTED. AI panel consistency: ${m.measurement.panelConsistency}.`)
  L.push('')
  if (!m.measurement.capabilities) {
    L.push(`Capability tables suppressed: fewer than ${min} students have a counted assessment.`)
  } else {
    L.push('Evidence status per capability (each student counted once, latest completed assessment):')
    L.push('')
    L.push('| Capability | Students | SUFFICIENT | PROVISIONAL | INSUFFICIENT_EVIDENCE | HUMAN_REVIEW_REQUIRED | Insufficient-evidence rate |')
    L.push('| --- | --- | --- | --- | --- | --- | --- |')
    for (const c of m.measurement.capabilities) {
      if (c.suppressed || !c.statuses) { L.push(`| ${esc(c.name || c.capabilityId)} | suppressed | — | — | — | — | — |`); continue }
      L.push(`| ${esc(c.name || c.capabilityId)} | ${c.n} | ${STATUSES.map((s) => fmt(c.statuses[s], min)).join(' | ')} | ${pct(c.insufficientRate)} |`)
    }
    L.push('')
    L.push('Level-band distribution (provisional labels; not a ranking, no cut-off):')
    L.push('')
    L.push(`| Capability | ${BUCKETS.join(' | ')} | of which PROVISIONAL |`)
    L.push(`| --- | ${BUCKETS.map(() => '---').join(' | ')} | --- |`)
    for (const c of m.measurement.capabilities) {
      if (c.suppressed) { L.push(`| ${esc(c.name || c.capabilityId)} | ${BUCKETS.map(() => 'suppressed').join(' | ')} | suppressed |`); continue }
      L.push(`| ${esc(c.name || c.capabilityId)} | ${BUCKETS.map((b) => fmt(c.levelBands[b], min)).join(' | ')} | ${fmt(c.provisional, min)} |`)
    }
  }
  L.push('')
  L.push('### 3. Evidence status (claims ceiling applies)')
  L.push('')
  L.push(`- Human–AI agreement study (S2): ${m.evidenceStatus.humanAiAgreement}`)
  L.push(`- Retest stability (S3): ${m.evidenceStatus.retestStability}`)
  L.push(`- DIF/fairness: ${m.evidenceStatus.fairness}`)
  L.push('- This section states no validity conclusion: there are no registered results.')
  L.push('')
  L.push('### 4. Operations')
  L.push('')
  const r = m.operations.reviews
  L.push(`- Completion rate: ${pct(m.operations.completionRate)} · median duration: ${m.operations.medianMinutes == null ? 'suppressed or not enough data' : `${m.operations.medianMinutes} minutes`}`)
  L.push(r.unknown
    ? '- Review requests: UNKNOWN'
    : `- Human review requests: ${fmt(r.humanReviewRequests, min)} (one free review per assessment) · interpretation requests: ${fmt(r.momentRequests, min)} · decided: ${fmt(r.decided, min)} (uphold ${fmt(r.outcomes.UPHOLD, min)}, correct ${fmt(r.outcomes.CORRECT, min)}, reject ${fmt(r.outcomes.REJECT, min)})`)
  L.push(`- Review target: ${m.operations.reviewTargetBusinessDays} business days (not monitored automatically for V3 reviews — see the programme Risks).`)
  L.push('')
  L.push('### 5. Limitations')
  L.push('')
  L.push(`- ${m.limitations.pilotNotice}`)
  L.push(`- ${m.limitations.notSoleBasis}`)
  L.push(`- ${m.limitations.scope}`)
  if (m.demoNotice) { L.push(''); L.push(`> **${m.demoNotice}**`) }
  L.push('')
  return L.join('\n')
}
