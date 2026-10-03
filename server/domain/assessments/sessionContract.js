// Session metadata contract (spec §12.2; C5.02): everything the player needs,
// built from the stored session + frozen scenario bank + versioned artifact
// writes. Fails closed: an unknown scenario is an error, never a substitute.
// Never includes rubrics, anchors, probing trees, personas, prompts, evidence,
// ledgers or scores — nothing that reveals what an answer earns.
import { ApiError } from '../http/errors.js'
import { renderParsedTurn } from '../../lib/identityIsolation.js'
import { participantMessages } from './engine.js'
import { capabilityName, definitionForScenario } from './catalog.js'
import { LEGACY_35 } from './timingPolicy.js'
import { boardSchemaFor } from './universalForm.js'

// The legacy player asks for at least three exchanges before finishing; a
// governed-bank scenario defines one evidence opportunity per probing turn.
export const DEFAULT_REQUIRED_EXCHANGES = 3
const CANDIDATE_PREFIX = /^\[Candidate\]:\s*/

export function scenarioView(scenarioId, { generalScenarios = [], bankScenarios = {} }) {
  if (scenarioId && Object.prototype.hasOwnProperty.call(bankScenarios, scenarioId)) {
    const s = bankScenarios[scenarioId]
    return {
      title: s.title,
      context: [s.briefing?.background, s.briefing?.objective].filter(Boolean).join(' ') || null,
      yourRole: s.briefing?.role || null,
      participants: (s.briefing?.characters || []).map((c) => ({ name: c.name, role: c.role || null })),
      jobFamilyId: s.blueprintId || null,
      requiredExchanges: Math.max(DEFAULT_REQUIRED_EXCHANGES, (s.probingTree?.turns || []).length),
    }
  }
  const s = generalScenarios.find((x) => x && x.id === scenarioId)
  if (!s) throw new ApiError('SCENARIO_NOT_FOUND', 'This assessment is not available.')
  return {
    title: s.title,
    context: s.context || null,
    yourRole: s.yourRole || null,
    participants: (s.participants || []).map((p) => ({ name: p.name, role: p.role || null })),
    jobFamilyId: null,
    requiredExchanges: DEFAULT_REQUIRED_EXCHANGES,
  }
}

export function transcriptFrom(history = [], candidateName = null) {
  const out = []
  for (const m of history) {
    if (!m || typeof m.content !== 'string') continue
    if (m.role === 'user') {
      if (CANDIDATE_PREFIX.test(m.content)) out.push({ speaker: 'You', role: null, content: m.content.replace(CANDIDATE_PREFIX, ''), isUser: true })
      continue // any other user-role entry is system text (e.g. the opening instruction)
    }
    if (m.role !== 'assistant') continue
    let parsed
    try {
      parsed = JSON.parse(m.content)
    } catch {
      continue // never show raw model output
    }
    for (const msg of participantMessages(renderParsedTurn(parsed, candidateName))) out.push({ ...msg, isUser: false })
  }
  return out
}

export function buildSessionContract({
  session, hasReport, engineStatus, scope, sponsorName = null, catalog, scenarios, versions = [], integrityPolicy = 'STANDARD',
  limitMs, now = new Date(), reportPath = null, processing = null,
  // P3.8: the persisted run timing row, when the run has one.
  runTiming = null,
  // P4: a Director-driven run supplies its recorded transcript, task-only
  // stage strip and its own exchange count (never the engine's history).
  universal = null,
}) {
  const view = scenarioView(session.scenarioId, scenarios)
  const definitionId = definitionForScenario(catalog, session.scenarioId)
  const definition = catalog.definitions.find((d) => d.id === definitionId) || null
  const versionOf = new Map(versions.map((v) => [v.artifactId, v]))
  const ms = (v) => (v == null ? null : typeof v === 'number' ? v : new Date(v).getTime())
  // Timing is authoritative from the persisted row when present (timed start,
  // answer deadline, grace deadline, policy version); otherwise it is the
  // legacy engine-derived timing, which is already begun and has no grace.
  const startedAt = runTiming ? ms(runTiming.timedStartedAt) : ms(session.startedAt)
  const deadline = runTiming ? ms(runTiming.answerDeadlineAt) : (startedAt && limitMs ? startedAt + limitMs : null)
  const graceDeadline = runTiming ? ms(runTiming.graceDeadlineAt) : null
  const begun = runTiming ? Boolean(runTiming.timedStartedAt) : true
  const policyVersion = runTiming?.policyVersion || LEGACY_35.version
  // System-processing state is separate from measurement outcomes (P2.6).
  // `status` keeps the existing vocabulary (a queued/leased review → SCORING,
  // a technical failure → SCORING_FAILED); `processing` carries the detail.
  // An allocated-but-not-begun run (briefing phase) reports ALLOCATED.
  const status = hasReport ? 'COMPLETED'
    : engineStatus === 'SCORING' ? 'SCORING'
      : engineStatus === 'FAILED' ? 'SCORING_FAILED'
        : begun ? 'IN_PROGRESS' : 'ALLOCATED'
  const processingView = {
    state: ['NONE', 'QUEUED', 'LEASED', 'DONE', 'FAILED'].includes(processing?.state) ? processing.state : 'NONE',
    resultState: processing?.resultState ?? null,
    retryable: Boolean(processing?.retryable),
    acceptedActions: Number.isInteger(processing?.acceptedActions) ? processing.acceptedActions : 0,
  }
  const artifacts = (Array.isArray(session.artifacts) ? session.artifacts : []).map((a) => ({
    artifactId: a.artifactId,
    type: a.type,
    title: a.title || null,
    data: a.data ?? null,
    version: versionOf.get(a.artifactId)?.version || 0,
    // The candidate's own saved reasoning for this material (resume).
    notes: typeof versionOf.get(a.artifactId)?.content?.notes === 'string' ? versionOf.get(a.artifactId).content.notes : '',
    // P3.6: allowed board choices (the same lists the server validates).
    ...(a.type === 'PLAN_BOARD' && boardSchemaFor(a.artifactId) ? { schema: boardSchemaFor(a.artifactId) } : {}),
  }))
  return {
    sessionId: session.sessionId,
    status,
    // T21: every session contract is a FORMAL assessment context. Difficulty
    // calibration (legacy pre-assessment step) is a separate purpose and is
    // never part of this contract or of a universal run.
    purpose: 'FORMAL',
    processing: processingView,
    scope,
    sponsorName,
    assessment: { definitionId, title: definition?.title || view.title },
    scenario: { title: view.title, context: view.context, yourRole: view.yourRole, participants: view.participants },
    jobFamilyId: view.jobFamilyId,
    capabilities: (definition?.measures || []).map((id) => ({ id, name: capabilityName(id) })).filter((c) => c.name),
    artifacts,
    messages: universal ? universal.messages : transcriptFrom(session.history, session.candidateName || null),
    progress: { exchanges: universal ? universal.exchanges : Number(session.exchangeCount) || 0, requiredExchanges: view.requiredExchanges },
    // Task names and position only: never scores or hidden coverage gaps.
    ...(universal ? { stages: universal.stages } : {}),
    // P4.5/P4.7: counts-only coverage diagnostics once input is closed.
    ...(universal?.coverage ? { coverage: universal.coverage } : {}),
    integrityPolicy,
    device: { requiresLargeScreen: artifacts.length > 0, allowSmallScreen: true },
    timing: {
      serverTime: now.toISOString(),
      begun,
      startedAt: startedAt ? new Date(startedAt).toISOString() : null,
      deadlineAt: deadline ? new Date(deadline).toISOString() : null,
      graceDeadlineAt: graceDeadline ? new Date(graceDeadline).toISOString() : null,
      remainingMs: deadline ? Math.max(0, deadline - now.getTime()) : null,
      policyVersion,
      // P3.7/P3.8: the run's persisted policy duration, shown in the intro
      // before Begin and used to decide which time warnings apply.
      policyDurationMs: runTiming ? (Number.isFinite(runTiming.policy?.durationMs) ? runTiming.policy.durationMs : null) : (Number.isFinite(limitMs) ? limitMs : null),
      policyStatus: runTiming?.policy?.status || null,
    },
    reportPath: hasReport ? reportPath : null,
  }
}
