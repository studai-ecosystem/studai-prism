// Assessment session service (spec §12; C5.02–C5.06): the V3 player's server
// side, as adapters over the unchanged engine. Every call checks that the
// session belongs to the caller AND to the active workspace (personal and
// sponsored sessions never cross), is idempotent where the spec requires it,
// and fails closed — no dialogue, artifact state or result is ever invented.
import { randomUUID } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { buildSessionContract, scenarioView } from './sessionContract.js'
import { reportPath } from './assignmentService.js'

const START_EVENT = 'start'
const CANDIDATE = 'CANDIDATE'

// The formal consent items the engine requires before /start (mirror of
// REQUIRED_CONSENT_SCOPES in routes/assessment.js; a test fails on drift). The
// engine re-checks the exact set (incl. the phone-camera item when enabled).
export const REQUIRED_CONSENT_SCOPES = Object.freeze([
  'data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work',
])
const requiredConsentScopes = REQUIRED_CONSENT_SCOPES

// Serialises engine calls per session inside this process, so a double-click
// can never produce two engine turns or interleave an artifact save.
function createSessionLocks() {
  const tails = new Map()
  return async function withLock(sessionId, fn) {
    const prev = tails.get(sessionId) || Promise.resolve()
    let release
    const next = new Promise((r) => { release = r })
    const tail = prev.then(() => next)
    tails.set(sessionId, tail)
    await prev
    try {
      return await fn()
    } finally {
      release()
      if (tails.get(sessionId) === tail) tails.delete(sessionId)
    }
  }
}

export function createAssessmentSessionService({
  repos, assignments, catalog, scenarioSource, engine, legacy, resolver, ledger, sessionScopes,
  clock = () => new Date(), limitMs, audit = () => {},
}) {
  const withLock = createSessionLocks()

  function requireStore() {
    if (!repos?.sessionIo) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The assessment workspace is temporarily unavailable.')
  }

  // The session, if and only if the caller owns it in this workspace.
  async function authorize(user, workspace, sessionId) {
    const session = await legacy.getSession(sessionId)
    if (!session || session.userId !== user.id) throw new ApiError('NOT_FOUND', 'Not found')
    const scope = repos?.scopes ? await repos.scopes.getSessionScope(sessionId) : null
    const sponsored = scope?.sponsorType === 'INSTITUTION'
    if (workspace.type === 'PERSONAL' && sponsored) throw new ApiError('NOT_FOUND', 'Not found')
    if (workspace.type === 'CAMPUS_STUDENT' && !(sponsored && scope.sponsorOrganizationId === workspace.organizationId)) throw new ApiError('NOT_FOUND', 'Not found')
    if (workspace.type !== 'PERSONAL' && workspace.type !== 'CAMPUS_STUDENT') throw new ApiError('NOT_FOUND', 'Not found')
    return { session, scope, sponsored }
  }

  // The scenario a fixed-form assignment pins: resolved through its form (id
  // and version), never through the definition id. Missing → fail closed.
  async function fixedScenarioId(item) {
    if (item.definition.formPolicy !== 'FIXED_FORM') return null
    const cat = await catalog.getCatalog()
    const forms = cat.forms.filter((f) => f.definitionId === item.definition.id && f.status === 'FROZEN')
    const formId = item.assignment?.formId || null
    const form = formId ? forms.find((f) => f.id === formId) : (forms.length === 1 ? forms[0] : null)
    if (!form?.scenarioId) throw new ApiError('SCENARIO_NOT_FOUND', 'This assessment is not available.')
    return form.scenarioId
  }

  // Close the sponsored seat once a report exists (idempotent replay).
  async function settle(sessionId, user) {
    const startEvent = await repos.sessionIo.getClientEvent(sessionId, START_EVENT)
    const entitlementId = startEvent?.response?.entitlementId
    if (entitlementId) {
      await ledger.consume({ entitlementId, user, sessionId }).catch((err) => {
        if (err?.code !== 'CONFLICT') throw err
      })
    }
    const assignmentId = startEvent?.response?.assignmentId
    if (assignmentId && startEvent.response.sponsored) {
      const row = await repos.assessments.getAssignmentForUser(assignmentId, user.id)
      if (row && row.student.status !== 'COMPLETED') {
        await repos.assessments.updateStudent({ assignmentId, userId: user.id, patch: { status: 'COMPLETED', sessionId, completedAt: clock().toISOString() } })
      }
    }
  }

  return {
    async start({ user, workspace, assignmentId, idempotencyKey, consent, authorization, client, requestId }) {
      requireStore()
      if (!idempotencyKey) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
      const resolved = await assignments.resolveItem(user, workspace, assignmentId)
      if (!resolved) throw new ApiError('NOT_FOUND', 'Not found')
      const { item, card } = resolved
      if (card.status === 'COMPLETED') throw new ApiError('ASSESSMENT_COMPLETED', 'This assessment has already been completed.')
      if (card.status === 'EXPIRED') throw new ApiError('ASSESSMENT_NOT_OPEN', 'This assessment has closed.')
      if (card.status === 'UPCOMING') throw new ApiError('ASSESSMENT_NOT_OPEN', 'This assessment has not opened yet.')
      // Already started (a replay, a second tab, a refresh): return it — the
      // engine is never started twice for one assignment. Replay is detected
      // by the assignment, so a retried Idempotency-Key and a new one from a
      // second tab both land on the same session (K68).
      if (card.sessionId) return { sessionId: card.sessionId, resumed: true }

      // Refuse obviously incomplete consent before any seat is reserved; the
      // engine re-checks the exact required set when it records the consent.
      const scopes = Array.isArray(consent?.scopes) ? consent.scopes.filter((s) => typeof s === 'string').slice(0, 20) : []
      const missing = requiredConsentScopes.filter((s) => !scopes.includes(s))
      if (missing.length) throw new ApiError('CONSENT_REQUIRED', 'Please accept every consent item to continue.', { details: { missing } })
      const scenarioId = await fixedScenarioId(item)

      const sponsored = card.scope === 'SPONSORED'
      let sessionId
      let entitlementId = null
      if (!sponsored) {
        if (!item.legacySessionId) throw new ApiError('ENTITLEMENT_REQUIRED', 'Buy or redeem an assessment to start.')
        sessionId = item.legacySessionId
      } else {
        if (!card.acknowledged) throw new ApiError('ACKNOWLEDGEMENT_REQUIRED', 'Confirm you have read who can see this assessment first.')
        const resolution = await resolver.resolveEntitlement({ user, workspace, action: 'assessment.start', assignment: { assessmentDefinitionId: item.definition.id } })
        // One seat per assignment and student: the reservation key is the
        // assignment, so concurrent or replayed starts share one session id.
        // A failed start keeps the reservation open (it is consumed only when
        // the assessment finishes), so a retry reuses the same seat and
        // session instead of running on a released one (K69).
        const reserved = await ledger.reserve({ resolution, user, sessionId: randomUUID(), idempotencyKey: `start:${assignmentId}` })
        sessionId = reserved.consumption?.sessionId
        entitlementId = reserved.consumption?.entitlementId || null
        if (!sessionId) throw new ApiError('ENTITLEMENT_REQUIRED', 'No entitlement covers this assessment.')
        // The engine's per-session gate needs its own entitlement record. Mode
        // 'campus' is a real candidate for calibration (K67) and is never read
        // as a personal purchase (legacy adapter).
        if (!(await legacy.getEntitlement(sessionId))) {
          await legacy.createEntitlement({ sessionId, mode: 'campus', amount: 0, userId: user.id, userEmail: user.email || null })
        }
        await sessionScopes.recordSponsoredStart({ sessionId, user, workspace }).catch((err) => {
          if (err?.code !== 'CONFLICT') throw err
        })
      }

      return withLock(sessionId, async () => {
        const existing = await repos.sessionIo.getClientEvent(sessionId, START_EVENT)
        if (existing && (await legacy.getSession(sessionId))) return { sessionId, resumed: true }
        await engine.recordConsent({ sessionId, scopes, consentVersion: consent?.consentVersion, authorization, client, requestId })
        if (!(await legacy.getSession(sessionId))) {
          await engine.start({ sessionId, scenarioId, authorization, client, requestId })
        }
        await repos.sessionIo.putClientEvent({
          sessionId, clientEventId: START_EVENT, kind: 'START',
          response: { assignmentId, sponsored, entitlementId, idempotencyKey: String(idempotencyKey).slice(0, 80) },
        })
        if (sponsored) {
          await repos.assessments.updateStudent({ assignmentId, userId: user.id, patch: { status: 'IN_PROGRESS', sessionId, startedAt: clock().toISOString() } })
        }
        audit('assessment.started', sessionId, { sessionId, assignmentId, scope: sponsored ? 'SPONSORED' : 'PERSONAL', formScenarioId: scenarioId, requestId })
        return { sessionId, resumed: false }
      })
    },

    async get({ user, workspace, sessionId, requestId }) {
      requireStore()
      const { session, sponsored } = await authorize(user, workspace, sessionId)
      const [cat, scenarios, versions, report] = await Promise.all([
        catalog.getCatalog(), scenarioSource(), repos.sessionIo.listLatestArtifactVersions(sessionId), legacy.getReport(sessionId),
      ])
      const engineStatus = report ? 'COMPLETE' : await engine.evaluateStatus({ sessionId, requestId })
      if (report) await settle(sessionId, user)
      return buildSessionContract({
        session: { ...session, sessionId },
        hasReport: Boolean(report),
        engineStatus,
        scope: sponsored ? 'SPONSORED' : 'PERSONAL',
        sponsorName: sponsored ? workspace.organizationName || workspace.name || null : null,
        catalog: cat,
        scenarios,
        versions,
        limitMs,
        now: clock(),
        reportPath: reportPath(legacy.paths, sessionId, Object.prototype.hasOwnProperty.call(scenarios.bankScenarios || {}, session.scenarioId), sponsored ? workspace.organizationId : null),
      })
    },

    async sendMessage({ user, workspace, sessionId, clientEventId, text, authorization, client, requestId }) {
      requireStore()
      await authorize(user, workspace, sessionId)
      const replay = await repos.sessionIo.getClientEvent(sessionId, clientEventId)
      if (replay) return { ...replay.response, replayed: true }
      return withLock(sessionId, async () => {
        const again = await repos.sessionIo.getClientEvent(sessionId, clientEventId)
        if (again) return { ...again.response, replayed: true }
        if (await legacy.getReport(sessionId)) throw new ApiError('ASSESSMENT_COMPLETED', 'This assessment has already been completed.')
        const { messages } = await engine.message({ sessionId, text, authorization, client, requestId })
        const after = await legacy.getSession(sessionId)
        const response = { messages, exchanges: Number(after?.exchangeCount) || 0 }
        const stored = await repos.sessionIo.putClientEvent({ sessionId, clientEventId, kind: 'MESSAGE', response })
        return { ...stored.response, replayed: false }
      })
    },

    async saveArtifact({ user, workspace, sessionId, artifactId, ifMatch, clientEventId = null, updates, notes, authorization, client, requestId }) {
      requireStore()
      const { session } = await authorize(user, workspace, sessionId)
      if (!Number.isInteger(ifMatch) || ifMatch < 0) throw new ApiError('IF_MATCH_REQUIRED', 'Send the version you are changing (If-Match).')
      if (clientEventId) {
        const replay = await repos.sessionIo.getClientEvent(sessionId, clientEventId)
        if (replay) return { ...replay.response, replayed: true }
      }
      if (!(session.artifacts || []).some((a) => a.artifactId === artifactId)) throw new ApiError('NOT_FOUND', 'This work material is not part of the session.')
      return withLock(sessionId, async () => {
        if (await legacy.getReport(sessionId)) throw new ApiError('ASSESSMENT_COMPLETED', 'This assessment has already been completed.')
        const current = await repos.sessionIo.latestArtifactVersion(sessionId, artifactId)
        const currentVersion = current?.version || 0
        const currentNotes = typeof current?.content?.notes === 'string' ? current.content.notes : ''
        if (ifMatch !== currentVersion) {
          const fresh = await legacy.getSession(sessionId)
          const snapshot = (fresh?.artifacts || []).find((a) => a.artifactId === artifactId) || null
          throw new ApiError('CONFLICT', 'This work material changed since you opened it.', {
            details: { version: currentVersion, artifact: snapshot ? { artifactId, type: snapshot.type, title: snapshot.title || null, data: snapshot.data ?? null, notes: currentNotes } : null },
          })
        }
        const { artifact } = await engine.saveArtifact({ sessionId, artifactId, updates, notes, authorization, client, requestId })
        if (!artifact) throw new ApiError('UPSTREAM_UNAVAILABLE', 'Your work was not saved.')
        // The candidate's reasoning is kept with the version so a refresh
        // shows it again (the engine keeps it only inside evidence).
        const savedNotes = typeof notes === 'string' ? notes : currentNotes
        const written = await repos.sessionIo.appendArtifactVersion({ sessionId, artifactId, version: currentVersion + 1, content: { data: artifact.data ?? null, notes: savedNotes }, savedBy: CANDIDATE })
        const response = { artifactId, version: written.version, data: artifact.data ?? null, notes: savedNotes }
        if (clientEventId) await repos.sessionIo.putClientEvent({ sessionId, clientEventId, kind: 'ARTIFACT', response })
        return { ...response, replayed: false }
      })
    },

    async finish({ user, workspace, sessionId, early = false, authorization, client, requestId }) {
      requireStore()
      const { session } = await authorize(user, workspace, sessionId)
      const bankOrPool = await scenarioSource()
      if (await legacy.getReport(sessionId)) {
        await settle(sessionId, user)
        return { state: 'COMPLETE' }
      }
      const exchanges = Number(session.exchangeCount) || 0
      const required = scenarioView(session.scenarioId, bankOrPool).requiredExchanges
      if (exchanges < required && !early) {
        throw new ApiError('FINISH_CONFIRMATION_REQUIRED', 'You have not reached every part of this assessment yet.', { details: { exchanges, requiredExchanges: required } })
      }
      const { state } = await engine.evaluate({ sessionId, authorization, client, requestId })
      audit('assessment.finish_requested', sessionId, { sessionId, early: exchanges < required, exchanges, requiredExchanges: required, requestId })
      if (state === 'COMPLETE') await settle(sessionId, user)
      return { state }
    },
  }
}
