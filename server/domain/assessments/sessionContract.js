// Session metadata contract (spec §12.2; C5.02): everything the player needs,
// built from the stored session + frozen scenario bank + versioned artifact
// writes. Fails closed: an unknown scenario is an error, never a substitute.
// Never includes rubrics, anchors, probing trees, personas, prompts, evidence,
// ledgers or scores — nothing that reveals what an answer earns.
import { ApiError } from '../http/errors.js'
import { renderParsedTurn } from '../../lib/identityIsolation.js'
import { participantMessages } from './engine.js'
import { capabilityName, definitionForScenario } from './catalog.js'

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
  limitMs, now = new Date(), reportPath = null,
}) {
  const view = scenarioView(session.scenarioId, scenarios)
  const definitionId = definitionForScenario(catalog, session.scenarioId)
  const definition = catalog.definitions.find((d) => d.id === definitionId) || null
  const versionOf = new Map(versions.map((v) => [v.artifactId, v]))
  const startedAt = typeof session.startedAt === 'number' ? session.startedAt : (session.startedAt ? new Date(session.startedAt).getTime() : null)
  const deadline = startedAt && limitMs ? startedAt + limitMs : null
  const status = hasReport ? 'COMPLETED'
    : engineStatus === 'SCORING' ? 'SCORING'
      : engineStatus === 'FAILED' ? 'SCORING_FAILED'
        : 'IN_PROGRESS'
  const artifacts = (Array.isArray(session.artifacts) ? session.artifacts : []).map((a) => ({
    artifactId: a.artifactId,
    type: a.type,
    title: a.title || null,
    data: a.data ?? null,
    version: versionOf.get(a.artifactId)?.version || 0,
    // The candidate's own saved reasoning for this material (resume).
    notes: typeof versionOf.get(a.artifactId)?.content?.notes === 'string' ? versionOf.get(a.artifactId).content.notes : '',
  }))
  return {
    sessionId: session.sessionId,
    status,
    scope,
    sponsorName,
    assessment: { definitionId, title: definition?.title || view.title },
    scenario: { title: view.title, context: view.context, yourRole: view.yourRole, participants: view.participants },
    jobFamilyId: view.jobFamilyId,
    capabilities: (definition?.measures || []).map((id) => ({ id, name: capabilityName(id) })).filter((c) => c.name),
    artifacts,
    messages: transcriptFrom(session.history, session.candidateName || null),
    progress: { exchanges: Number(session.exchangeCount) || 0, requiredExchanges: view.requiredExchanges },
    integrityPolicy,
    device: { requiresLargeScreen: artifacts.length > 0, allowSmallScreen: true },
    timing: {
      serverTime: now.toISOString(),
      startedAt: startedAt ? new Date(startedAt).toISOString() : null,
      deadlineAt: deadline ? new Date(deadline).toISOString() : null,
      remainingMs: deadline ? Math.max(0, deadline - now.getTime()) : null,
    },
    reportPath: hasReport ? reportPath : null,
  }
}
