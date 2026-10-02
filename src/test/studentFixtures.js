// Synthetic student read-model responses for unit tests (no real people).
import { jsonResponse } from './utils.jsx'

const CAPS = [
  ['CAP-L1-REASONING', 'Reasoning & Decision Quality'],
  ['CAP-L1-COMMUNICATION', 'Communication & Structure'],
  ['CAP-L1-COLLABORATION', 'Collaboration & Navigation'],
  ['CAP-L1-ADAPTABILITY', 'Adaptability & Learning'],
  ['CAP-L1-EXECUTION', 'Execution & Ownership'],
]

export function capability(id, name, overrides = {}) {
  return {
    id, name, definition: `Synthetic definition of ${name}.`, layer: 'PRIMARY', status: 'INSUFFICIENT_EVIDENCE', statusReasons: ['NO_EVIDENCE'],
    level: null, levelLabelsStatus: 'PROVISIONAL', change: null, changeStatus: 'NOT_COMPARABLE',
    evidenceSummary: { text: 'No completed assessment has measured this yet.', status: 'INSUFFICIENT', evidenceIds: [] },
    observedBehaviors: [], evidenceSources: [], developmentPriority: false, relatedMissions: [], history: [],
    ...overrides,
  }
}

export const emptyCapabilities = () => ({ data: { items: CAPS.map(([id, n]) => capability(id, n)), assessedCount: 0, excludedCount: 0, levelLabelsStatus: 'PROVISIONAL' } })

export const describedCapabilities = () => ({
  data: {
    items: CAPS.map(([id, n], i) => (i === 0
      ? capability(id, n, {
        status: 'PROVISIONAL', statusReasons: ['RULES_NOT_APPROVED'], level: { band: 'DEVELOPING', label: 'Developing' }, developmentPriority: true,
        evidenceSummary: { text: 'Based on 3 observed responses in Prism Workplace Simulation.', status: 'PROVISIONAL', evidenceIds: ['u1', 'u2', 'u3'] },
        observedBehaviors: [{ evidenceId: 'u1', behavior: 'Separated symptoms from causes', quote: 'I would first separate the complaint data' }],
        evidenceSources: [{ sessionId: 'sess-1', assessmentTitle: 'Prism Workplace Simulation', completedAt: '2026-09-20T10:00:00.000Z' }],
        history: [{ sessionId: 'sess-1', assessmentTitle: 'Prism Workplace Simulation', completedAt: '2026-09-20T10:00:00.000Z', status: 'PROVISIONAL', level: { band: 'DEVELOPING', label: 'Developing' } }],
      })
      : capability(id, n, { evidenceSummary: { text: 'There was not enough evidence in Prism Workplace Simulation to describe this.', status: 'INSUFFICIENT', evidenceIds: [] }, evidenceSources: [{ sessionId: 'sess-1', assessmentTitle: 'Prism Workplace Simulation', completedAt: '2026-09-20T10:00:00.000Z' }] }))),
    assessedCount: 1,
    excludedCount: 0,
    levelLabelsStatus: 'PROVISIONAL',
  },
})

export function home(overrides = {}) {
  return {
    data: {
      user: { name: 'Synthetic Student' },
      workspace: { id: 'personal', type: 'PERSONAL', name: 'Personal', organizationName: null },
      primaryAction: { kind: 'GET_STARTED', to: '/payment' },
      capabilitySnapshot: emptyCapabilities().data.items.map((c) => ({ id: c.id, name: c.name, status: c.status, level: c.level, change: null, changeStatus: 'NOT_COMPARABLE', evidenceSummary: c.evidenceSummary.text })),
      assessedCount: 0,
      focus: [],
      sponsor: null,
      levelLabelsStatus: 'PROVISIONAL',
      ...overrides,
    },
  }
}

export function card(overrides = {}) {
  return {
    id: 'pa_00000000000000000000000000000001', definitionId: 'prism-workplace-core', title: 'Prism Workplace Simulation', description: null,
    scope: 'PERSONAL', sponsor: null, durationMinutes: 35, integrityMode: 'STANDARD', opensAt: null, dueAt: null, status: 'NOT_STARTED', tab: 'ACTIVE',
    sessionId: null, startedAt: null, completedAt: null, underReview: false, acknowledgementRequired: false, acknowledged: false,
    cta: { kind: 'START', to: '/app/assessments/pa_00000000000000000000000000000001/briefing' },
    ...overrides,
  }
}

export const emptyAssessments = () => ({ data: { active: [], completed: [], upcoming: [] } })
export const emptyEvidence = () => ({ data: { items: [], total: 0, facets: { capabilities: [], assessments: [] }, practiceAvailable: false } })
export const emptyPlan = () => ({ data: { status: 'NO_PLAN', priorities: [], missions: [], completedMissions: [], missionsAvailable: false, upcomingReassessment: null, practiceEvidence: [] } })
export const growth = (reason = 'NEEDS_COMPARABLE_REASSESSMENT', assessments = []) => ({ data: { comparable: false, reason, assessments, changes: [] } })
export const preferences = (p = {}) => ({ data: { reducedMotion: false, largerText: false, updatedAt: null, ...p } })
export const noGrants = () => ({ data: { items: [] } })
export const notFound = () => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req-nf' } })

export function briefing(overrides = {}) {
  const assignment = card(overrides.assignment)
  return {
    data: {
      assignment,
      definition: {
        id: 'prism-workplace-core', title: 'Prism Workplace Simulation', description: null, durationMinutes: 35,
        measures: CAPS.map(([id, name]) => ({ id, name })), notMeasured: ['PERSONALITY', 'EMOTION_OR_TONE'], hasArtifacts: false, integrityModes: ['STANDARD'],
      },
      sponsorship: { scope: 'PERSONAL', sponsorName: null, disclosureCopyVersion: null, acknowledged: false, acknowledgedAt: null },
      start: { allowed: true, reason: 'ALLOWED', to: '/briefing?session=sess-x' },
      ...overrides.rest,
    },
  }
}

// Every /api/v1 student route with empty-but-valid responses. Overrides come
// FIRST so a more specific override (e.g. …/acknowledge) wins prefix matching;
// '/api/v1/me' itself must be added after these by the caller.
export function studentRoutes(extra = {}) {
  const defaults = {
    '/api/v1/me/home': home(),
    '/api/v1/me/assessments': emptyAssessments(),
    '/api/v1/me/history': { data: { items: [], nextCursor: null } },
    '/api/v1/me/capabilities': emptyCapabilities(),
    '/api/v1/me/evidence': emptyEvidence(),
    '/api/v1/me/development-plan': emptyPlan(),
    '/api/v1/me/growth': growth(),
    '/api/v1/me/preferences': preferences(),
    '/api/v1/me/share-grants': noGrants(),
    '/api/v1/assessment-assignments/': () => notFound(),
    '/api/v1/health': { data: { status: 'ok' } },
  }
  return { ...extra, ...Object.fromEntries(Object.entries(defaults).filter(([k]) => !(k in extra))) }
}
