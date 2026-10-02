// Assessment session service (spec §12; C5.02–C5.06): the V3 player's server
// side, as adapters over the unchanged engine. Every call checks that the
// session belongs to the caller AND to the active workspace (personal and
// sponsored sessions never cross), is idempotent where the spec requires it,
// and fails closed — no dialogue, artifact state or result is ever invented.
import { randomUUID } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { buildSessionContract, scenarioView } from './sessionContract.js'
import { reportPath } from './assignmentService.js'
import { createMemorySessionLocks } from './sessionLocks.js'
import { draftSegmentFor, buildRunPin, evaluateJobKey, DRAFT_EVALUATE_JOB_KIND, DRAFT_SEGMENT_ID, SLICE_METHOD_VERSION, isUniversalSnapshot } from './draftSegments.js'
import { timingPolicyFor, legacyPolicy, isLegacyPolicy, deadlinesFor } from './timingPolicy.js'
import { selectNext, stageStrip, parentOpportunityId } from './director.js'
import { validateBoardPatch, worldStateFor } from './universalForm.js'
import { answerFactQuestion } from './factBoundary.js'

const START_EVENT = 'start'
const BEGIN_EVENT = 'begin'
const CANDIDATE = 'CANDIDATE'
const EVALUATE_LEASE_MS = 120_000

// The formal consent items the engine requires before /start (mirror of
// REQUIRED_CONSENT_SCOPES in routes/assessment.js; a test fails on drift). The
// engine re-checks the exact set (incl. the phone-camera item when enabled).
export const REQUIRED_CONSENT_SCOPES = Object.freeze([
  'data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work',
])
const requiredConsentScopes = REQUIRED_CONSENT_SCOPES

export function createAssessmentSessionService({
  repos, assignments, catalog, scenarioSource, engine, legacy, resolver, ledger, sessionScopes,
  clock = () => new Date(), limitMs, audit = () => {},
  // P2.4 bounded evidence evaluator for draft-segment runs (null → such runs
  // cannot be finished: fail closed, never a legacy score in their place).
  sliceEvaluator = null,
  // Called once a sponsored roster row turns COMPLETED (completion notifications).
  onSponsoredCompleted = async () => {},
  // P10.2 release gate (domain/release/config.js): NEW universal/draft runs are
  // allocated only when readiness is READY; null → no gate (legacy path and
  // fixture tests are unchanged).
  releaseGate = null,
}) {
  const localLocks = createMemorySessionLocks()
  const withLock = (resource, work) => {
    if (repos?.sessionLocks) return repos.sessionLocks.withLock(resource, work)
    if (repos?.kind === 'pg' || process.env.NODE_ENV === 'production') {
      throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Distributed assessment locking is unavailable.')
    }
    return localLocks.withLock(resource, work)
  }

  function requireStore() {
    if (!repos?.sessionIo) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The assessment workspace is temporarily unavailable.')
  }

  // P1.5 durable acceptance: the candidate action is persisted BEFORE the
  // engine runs. Same key + same payload → the stored row (replay / re-drive);
  // same key + different payload → CONFLICT; erased session → NOT_FOUND. The
  // engine may therefore run more than once after a failure, but there is
  // exactly one accepted action and one applied result per client event id.
  const durable = () => (typeof repos.sessionIo.acceptAction === 'function' ? repos.sessionIo : null)
  async function rejectErased(sessionId) {
    const io = durable()
    if (io && await io.hasErasureMarker(sessionId)) throw new ApiError('NOT_FOUND', 'Not found')
  }
  async function accept(args) {
    const io = durable()
    return io ? io.acceptAction(args) : null
  }
  async function applied(action, result) {
    if (action) await repos.sessionIo.applyAction(action.actionId, result)
  }
  async function failed(action, err) {
    if (action) await repos.sessionIo.failAction(action.actionId, err?.code || 'ENGINE_FAILED').catch(() => {})
  }

  // --- P2.1/P2.6 draft-segment runs ------------------------------------------
  // A run is a "draft run" when its scenario is a DRAFT segment AND its start
  // was pinned (runPin on the START receipt). Such runs are evaluated by the
  // bounded slice evaluator through a leased job; the legacy engine is never
  // asked for a score on their behalf.
  const jobs = () => (repos.sessionIo && typeof repos.sessionIo.enqueueJob === 'function' ? repos.sessionIo : null)
  async function draftRun(sessionId, session) {
    const snapshot = draftSegmentFor(session?.scenarioId)
    if (!snapshot || !jobs()) return null
    const startEvent = await repos.sessionIo.getClientEvent(sessionId, START_EVENT)
    const pin = startEvent?.response?.runPin
    if (!pin || pin.methodVersion !== SLICE_METHOD_VERSION || pin.snapshotHash !== buildRunPin({ formId: pin.formId, engineVersion: pin.engineVersion, scenarioId: pin.scenarioId || DRAFT_SEGMENT_ID }).snapshotHash) {
      // Pinned to a snapshot/method this code no longer carries: never re-interpret.
      return pin ? { snapshot: null, pin } : null
    }
    return { snapshot, pin }
  }
  // P10.5: a pinned run this build cannot serve fails closed. It is never
  // handed to the legacy engine and its timer is never reset by a new Start.
  function assertRunSupported(run) {
    if (run && !run.snapshot) {
      throw new ApiError('RUN_VERSION_UNSUPPORTED', 'This assessment was started on a version this service cannot continue. Your saved work is preserved; please contact support.', {
        details: { methodVersion: run.pin?.methodVersion || null, snapshotVersion: run.pin?.snapshotVersion || null, supportedMethodVersion: SLICE_METHOD_VERSION },
      })
    }
    return run
  }
  const evaluationJob = async (sessionId) => (jobs() ? repos.sessionIo.getJob(evaluateJobKey(sessionId)) : null)

  // --- P4 Director-driven universal runs -----------------------------------------
  // A universal run never asks the engine for dialogue: every stimulus is
  // authored, rendered only from permitted facts, hashed and recorded on the
  // opportunity ledger before it is shown. The Director selects; it never
  // writes evidence or levels.
  const ledgerStore = () => (repos.sessionIo && typeof repos.sessionIo.listOpportunities === 'function' ? repos.sessionIo : null)
  const isUniversalRun = (run) => Boolean(run?.snapshot && isUniversalSnapshot(run.snapshot) && ledgerStore())
  const messageActions = (actions) => actions.filter((a) => a.kind === 'MESSAGE' && a.state === 'APPLIED')
  const revealedFactIds = (actions) => actions.map((a) => a.result?.revealedFactId).filter(Boolean)
  async function planOpportunities(sessionId, run) {
    const io = ledgerStore()
    for (const o of run.snapshot.opportunities) {
      await io.upsertOpportunity({ sessionId, opportunityId: o.id, groupId: o.groupId, capabilityId: o.capabilityId, behaviourIds: o.behaviourIds, state: 'PLANNED' })
    }
  }
  // Present the Director's next allowed event; returns the messages shown.
  async function presentNext(sessionId, run, { requestId } = {}) {
    const io = ledgerStore()
    const form = run.snapshot.form
    const timing = await runTimingOf(sessionId)
    const remainingMs = timing?.answerDeadlineAt ? new Date(timing.answerDeadlineAt).getTime() - clock().getTime() : null
    const shown = []
    for (let guard = 0; guard < form.opportunities.length + 2; guard += 1) {
      const [ledger, actions] = await Promise.all([io.listOpportunities(sessionId), io.listActions(sessionId)])
      const next = selectNext({ form, presented: ledger, actions, budget: { remainingMs }, seed: sessionId })
      audit('assessment.director_decision', sessionId, { sessionId, kind: next.kind, ...next.decision, ...(next.kind === 'STOP' ? { reason: next.reason, partial: next.partial, review: next.review } : {}), requestId })
      if (next.kind === 'WAIT' || next.kind === 'STOP') break
      const id = next.kind === 'CLARIFY' ? next.opportunityId : next.opportunity.id
      if (next.kind === 'CLARIFY') {
        const o = next.opportunity
        await io.upsertOpportunity({ sessionId, opportunityId: id, groupId: o.groupId, capabilityId: o.capabilityId, behaviourIds: o.behaviourIds, state: 'PLANNED' })
      }
      if (!next.stimulus.ok) {
        // The render differs from the authored intent: flag it, never show it.
        await io.setOpportunityState(sessionId, id, 'REVIEW_REQUIRED', { renderHash: next.stimulus.renderHash, stimulus: { issues: next.stimulus.issues, decision: next.decision } })
        continue
      }
      const at = clock()
      const messages = []
      if (next.worldChangeId) {
        const wc = form.worldChanges.find((w) => w.id === next.worldChangeId)
        messages.push({ speaker: 'Update', role: null, actorKind: 'SYSTEM', content: `What changed: ${wc.description} Your board is unchanged; you can revise it.` })
      }
      messages.push(next.stimulus.message)
      await io.setOpportunityState(sessionId, id, 'PRESENTED', { presentedAt: at, renderHash: next.stimulus.renderHash, stimulus: { messages, worldChangeId: next.worldChangeId || null, decision: next.decision } })
      shown.push(...messages)
      break
    }
    return shown
  }
  // Attach an accepted candidate action to the opportunity currently shown.
  // An action of an accepted kind serves the opportunity; any other kind is
  // kept as linked work while the opportunity stays presented.
  async function attachAction(sessionId, run, action) {
    const io = ledgerStore()
    const current = (await io.listOpportunities(sessionId)).find((r) => r.state === 'PRESENTED')
    if (!current) return null
    const def = run.snapshot.opportunities.find((o) => o.id === parentOpportunityId(current.opportunityId))
    const serves = (def?.accepts || ['MESSAGE']).includes(action.kind) || current.opportunityId.endsWith(':CLARIFY')
    return io.setOpportunityState(sessionId, current.opportunityId, serves ? 'ACTION_RECEIVED' : 'PRESENTED', { actionId: action.actionId })
  }
  // Learner-visible transcript of a universal run: recorded stimuli and the
  // learner's own accepted messages, in presentation order. Nothing from the
  // engine's history is shown or evaluated.
  function universalTranscript(ledger, actions) {
    const byId = new Map(actions.map((a) => [a.actionId, a]))
    const rows = ledger.filter((r) => r.presentedAt).sort((a, b) => a.presentedAt.localeCompare(b.presentedAt))
    const out = []
    for (const row of rows) {
      for (const m of row.stimulus?.messages || []) out.push({ speaker: m.speaker, role: m.role || null, content: m.content, isUser: false, actorKind: m.actorKind, aiGenerated: Boolean(m.aiGenerated) })
      for (const id of row.actionIds || []) {
        const a = byId.get(id)
        if (a?.kind === 'MESSAGE' && a.state === 'APPLIED') {
          out.push({ speaker: 'You', role: null, content: a.payload.text, isUser: true })
          for (const m of a.result?.messages || []) if (m.factAnswer) out.push({ speaker: m.speaker, role: m.role || null, content: m.content, isUser: false, actorKind: m.actorKind })
        }
      }
    }
    return out
  }
  // Learner-facing processing state, separate from evidence sufficiency (P2.6).
  function processingOf(job) {
    if (!job) return null
    if (job.state === 'DONE') return { state: 'DONE', resultState: job.resultState || 'DONE', retryable: false }
    if (job.state === 'FAILED') return { state: 'FAILED', resultState: job.resultState || 'TECHNICAL_FAILURE', retryable: true }
    return { state: job.state, resultState: null, retryable: false }
  }
  // A session accepts no more candidate input once it has a legacy report or
  // an evaluation job (queued, running, done or failed).
  async function isClosed(sessionId) {
    if (await legacy.getReport(sessionId)) return true
    return Boolean(await evaluationJob(sessionId))
  }

  // One worker pass: claim one EVALUATE_RUN job and run it to DONE or FAILED.
  // The lease is held only around the claim/complete; the evaluator runs
  // outside any transaction and a stale fencing token can never complete.
  async function runEvaluationWorkerOnce({ requestId } = {}) {
    const io = jobs()
    const job = await io.claimJob(DRAFT_EVALUATE_JOB_KIND, EVALUATE_LEASE_MS)
    if (!job) return null
    try {
      if (await io.hasErasureMarker(job.sessionId)) throw new ApiError('NOT_FOUND', 'Not found')
      const session = await legacy.getSession(job.sessionId)
      const run = session ? await draftRun(job.sessionId, session) : null
      if (!run?.snapshot) throw new ApiError('UPSTREAM_UNAVAILABLE', 'The review could not be completed.')
      if (!sliceEvaluator) throw new ApiError('UPSTREAM_UNAVAILABLE', 'The review could not be completed.')
      const actions = await io.listActions(job.sessionId)
      const universal = isUniversalRun(run)
      const opportunities = universal ? await io.listOpportunities(job.sessionId) : null
      const { units } = await sliceEvaluator.evaluateRun({
        sessionId: job.sessionId, actions, snapshot: run.snapshot, pin: run.pin, formId: run.pin.formId || null, attempt: job.attempts,
        ...(universal ? { opportunities } : {}),
      })
      if (universal) {
        for (const row of opportunities) if (['ACTION_RECEIVED', 'EVALUATION_PENDING'].includes(row.state)) await io.setOpportunityState(job.sessionId, row.opportunityId, 'EVALUATED')
      }
      // P10.5: a model result that arrives after an erasure marker is never
      // written back (tombstone check on both sides of the external call).
      if (await io.hasErasureMarker(job.sessionId)) throw new ApiError('NOT_FOUND', 'Not found')
      const done = await io.completeJob(job.jobId, job.fencingToken, 'DONE')
      audit('assessment.evaluation_completed', job.sessionId, { sessionId: job.sessionId, jobId: job.jobId, attempt: job.attempts, units: units.length, requestId })
      return done
    } catch (err) {
      // Any failure (provider, malformed output, evidence write) is a
      // technical state the learner can retry — never an evidence deficit.
      const failedJob = await io.failJob(job.jobId, job.fencingToken, { resultState: 'TECHNICAL_FAILURE' }).catch(() => null)
      audit('assessment.evaluation_failed', job.sessionId, { sessionId: job.sessionId, jobId: job.jobId, attempt: job.attempts, code: err?.code || 'EVALUATION_FAILED', requestId })
      return failedJob
    }
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
        // A notification failure never blocks the student's report.
        await Promise.resolve(onSponsoredCompleted({ organizationId: row.organizationId, assignmentId })).catch(() => {})
      }
    }
  }

  // --- P3.8 run timing ---------------------------------------------------------
  // The persisted timing row is authoritative when present. Runs started
  // before 0043 have no row and keep the engine-derived legacy timing; the
  // engine's own limit is never bypassed or shortened.
  const timingStore = () => (repos.sessionIo && typeof repos.sessionIo.getRunTiming === 'function' ? repos.sessionIo : null)
  const engineStartMs = (session) => (typeof session?.startedAt === 'number' ? session.startedAt : (session?.startedAt ? new Date(session.startedAt).getTime() : null))
  async function runTimingOf(sessionId) {
    const io = timingStore()
    return io ? io.getRunTiming(sessionId) : null
  }
  // Timestamps a legacy run (no row) reports: the engine start under the
  // configured legacy policy, already begun.
  function legacyTiming(session) {
    const policy = legacyPolicy(limitMs)
    const start = engineStartMs(session)
    const { answerDeadlineAt } = deadlinesFor(policy, start)
    return { startedAt: start ? new Date(start).toISOString() : null, deadlineAt: answerDeadlineAt, graceDeadlineAt: null, policyVersion: policy.version, replayed: true }
  }
  // True when this client event id already has an accepted action or a
  // stored receipt, so replay/conflict handling (not the timing guard) decides.
  async function alreadyAccepted(sessionId, clientEventId) {
    const io = durable()
    if (io && await io.getAction(sessionId, clientEventId)) return true
    return Boolean(await repos.sessionIo.getClientEvent(sessionId, clientEventId))
  }
  // Formal answers are accepted only between Begin and the answer deadline
  // (server clock; a client timestamp is never proof of a pre-cutoff answer).
  // Legacy-policy runs are left to the engine's own enforcement.
  async function guardTimed(sessionId) {
    const row = await runTimingOf(sessionId)
    if (!row || isLegacyPolicy(row.policyVersion)) return
    if (!row.timedStartedAt) throw new ApiError('ASSESSMENT_NOT_BEGUN', 'Begin the timed assessment before answering.')
    if (row.answerDeadlineAt && clock().getTime() > new Date(row.answerDeadlineAt).getTime()) {
      throw new ApiError('SESSION_TIME_LIMIT', 'The answer time for this assessment has ended. Your saved work is kept.', { details: { deadlineAt: row.answerDeadlineAt, graceDeadlineAt: row.graceDeadlineAt } })
    }
  }

  const service = {
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
      // P10.2: a NEW universal/draft run is allocated only when the release
      // configuration says the whole chain is READY — checked BEFORE any seat
      // is reserved or credit consumed. The legacy start path is unchanged.
      if (releaseGate && draftSegmentFor(scenarioId)) await releaseGate.assertAllocatable({ scenarioId })

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
        // A contract billed on start closes the seat once the engine has
        // started — before the start is recorded, so a failure here is retried
        // by the next start instead of leaving the seat open (K99).
        if (sponsored && entitlementId) {
          await ledger.finalizeOn('ASSESSMENT_STARTED', { entitlementId, user, sessionId }).catch((err) => {
            if (err?.code !== 'CONFLICT') throw err
          })
        }
        // P2.1: a run on a DRAFT segment is pinned to the exact snapshot,
        // form, method and rubric reference it was started with.
        const draft = draftSegmentFor(scenarioId)
        const runPin = draft ? buildRunPin({ formId: (await catalog.getCatalog()).forms.find((f) => f.scenarioId === scenarioId)?.id || null, scenarioId }) : undefined
        await repos.sessionIo.putClientEvent({
          sessionId, clientEventId: START_EVENT, kind: 'START',
          response: { assignmentId, sponsored, entitlementId, idempotencyKey: String(idempotencyKey).slice(0, 80), ...(runPin ? { runPin } : {}) },
        })
        // P4.5: every opportunity of a universal run is PLANNED at start.
        if (draft && isUniversalSnapshot(draft) && ledgerStore()) await planOpportunities(sessionId, { snapshot: draft, pin: runPin })
        // P3.8: allocation is distinct from the timed start. A draft run is
        // allocated untimed (the briefing comes first; Begin starts the clock);
        // a legacy run's timed start is the engine's startedAt, unchanged.
        if (timingStore()) {
          const policy = timingPolicyFor({ draft: Boolean(draft), limitMs })
          const startedMs = draft ? null : engineStartMs(await legacy.getSession(sessionId))
          await repos.sessionIo.allocateRunTiming(sessionId, { policy, timedStartedAt: startedMs ? new Date(startedMs).toISOString() : null })
        }
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
      const [cat, scenarios, versions, report, job, actions, runTiming] = await Promise.all([
        catalog.getCatalog(), scenarioSource(), repos.sessionIo.listLatestArtifactVersions(sessionId), legacy.getReport(sessionId), evaluationJob(sessionId),
        jobs() ? repos.sessionIo.listActions(sessionId) : [],
        runTimingOf(sessionId),
      ])
      const processing = processingOf(job)
      // A draft run never asks the legacy engine for a scoring status.
      const engineStatus = report ? 'COMPLETE'
        : processing ? (processing.state === 'DONE' ? 'COMPLETE' : processing.state === 'FAILED' ? 'FAILED' : 'SCORING')
          : await engine.evaluateStatus({ sessionId, requestId })
      if (report || processing?.state === 'DONE') await settle(sessionId, user)
      // P4: a universal run shows its recorded authored transcript and the
      // task-only stage strip; the engine's history is never shown.
      const run = jobs() ? await draftRun(sessionId, session) : null
      let universal = null
      if (isUniversalRun(run)) {
        const ledger = await repos.sessionIo.listOpportunities(sessionId)
        universal = { messages: universalTranscript(ledger, actions), stages: stageStrip(run.snapshot.form, ledger), exchanges: messageActions(actions).length }
      }
      return buildSessionContract({
        session: { ...session, sessionId },
        hasReport: Boolean(report) || processing?.state === 'DONE',
        engineStatus,
        processing: { ...(processing || { state: 'NONE', resultState: null, retryable: false }), acceptedActions: actions.filter((a) => a.state === 'APPLIED').length },
        scope: sponsored ? 'SPONSORED' : 'PERSONAL',
        sponsorName: sponsored ? workspace.organizationName || workspace.name || null : null,
        catalog: cat,
        scenarios,
        versions,
        limitMs,
        runTiming,
        universal,
        now: clock(),
        reportPath: reportPath(legacy.paths, sessionId, Object.prototype.hasOwnProperty.call(scenarios.bankScenarios || {}, session.scenarioId), sponsored ? workspace.organizationId : null),
      })
    },

    // P3.8 Begin: the explicit transition from "allocated / reading the
    // briefing" to "timed". Idempotent and concurrency-safe at the store: the
    // first begin writes the timed start, every later one (same or different
    // key) returns the same timestamps. Legacy runs are begun at engine start,
    // so begin is a no-op that reports their existing timestamps.
    async begin({ user, workspace, sessionId, idempotencyKey, expectedVersion = null, requestId }) {
      requireStore()
      if (!idempotencyKey) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
      const { session } = await authorize(user, workspace, sessionId)
      await rejectErased(sessionId)
      const io = timingStore()
      const row = io ? await io.getRunTiming(sessionId) : null
      if (!row || isLegacyPolicy(row.policyVersion)) {
        if (row?.timedStartedAt) return { startedAt: row.timedStartedAt, deadlineAt: row.answerDeadlineAt, graceDeadlineAt: null, policyVersion: row.policyVersion, replayed: true }
        return legacyTiming(session)
      }
      return withLock(sessionId, async () => {
        if (!row.timedStartedAt && await isClosed(sessionId)) throw new ApiError('ASSESSMENT_COMPLETED', 'This assessment has already been completed.')
        const begun = await io.beginRun(sessionId, { idempotencyKey: String(idempotencyKey).slice(0, 128), expectedVersion, now: clock() })
        if (!begun.replayed) {
          await repos.sessionIo.putClientEvent({
            sessionId, clientEventId: BEGIN_EVENT, kind: 'BEGIN',
            response: { startedAt: begun.timedStartedAt, deadlineAt: begun.answerDeadlineAt, graceDeadlineAt: begun.graceDeadlineAt, policyVersion: begun.policyVersion, idempotencyKey: String(idempotencyKey).slice(0, 80) },
          })
          audit('assessment.begun', sessionId, { sessionId, policyVersion: begun.policyVersion, startedAt: begun.timedStartedAt, deadlineAt: begun.answerDeadlineAt, requestId })
          // P4: the Director presents the first opportunity once the clock runs.
          const run = assertRunSupported(await draftRun(sessionId, session))
          if (isUniversalRun(run)) await presentNext(sessionId, run, { requestId })
        }
        return { startedAt: begun.timedStartedAt, deadlineAt: begun.answerDeadlineAt, graceDeadlineAt: begun.graceDeadlineAt, policyVersion: begun.policyVersion, replayed: begun.replayed }
      })
    },

    async sendMessage({ user, workspace, sessionId, clientEventId, text, authorization, client, requestId }) {
      requireStore()
      const { session } = await authorize(user, workspace, sessionId)
      await rejectErased(sessionId)
      // An already-accepted answer replays (or conflicts) even after cutoff;
      // a NEW one is accepted only inside the timed window (P3.8).
      if (!(await alreadyAccepted(sessionId, clientEventId))) await guardTimed(sessionId)
      const action = await accept({ sessionId, clientEventId, kind: 'MESSAGE', payload: { text } })
      const replay = await repos.sessionIo.getClientEvent(sessionId, clientEventId)
      if (replay) return { ...replay.response, replayed: true }
      return withLock(sessionId, async () => {
        const again = await repos.sessionIo.getClientEvent(sessionId, clientEventId)
        if (again) return { ...again.response, replayed: true }
        if (await isClosed(sessionId)) {
          const err = new ApiError('ASSESSMENT_COMPLETED', 'This assessment has already been completed.')
          await failed(action, err)
          throw err
        }
        // P4: a universal run is Director-driven — no engine dialogue. The
        // learner's text is attached to the opportunity shown, a fact
        // question gets the authored boundary answer, then the next
        // authored opportunity is presented.
        let run
        try {
          run = assertRunSupported(await draftRun(sessionId, session))
        } catch (err) {
          await failed(action, err)
          throw err
        }
        if (isUniversalRun(run)) {
          await attachAction(sessionId, run, action)
          const actions = await repos.sessionIo.listActions(sessionId)
          const world = worldStateFor(run.snapshot.form, { revealedFactIds: revealedFactIds(actions) })
          const messages = []
          let revealedFactId = null
          if (/\?/.test(String(text))) {
            const answer = answerFactQuestion({ form: run.snapshot.form, worldState: world, text })
            if (answer.text) messages.push({ speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', content: answer.text, factAnswer: answer.kind })
            if (answer.kind === 'AUTHORED') revealedFactId = answer.factId
          }
          const response = { messages, exchanges: messageActions(actions).length + 1 }
          const stored = await repos.sessionIo.putClientEvent({ sessionId, clientEventId, kind: 'MESSAGE', response })
          await applied(action, { ...stored.response, revealedFactId })
          const shown = await presentNext(sessionId, run, { requestId })
          return { ...stored.response, messages: [...stored.response.messages, ...shown], replayed: false }
        }
        let messages
        try {
          ;({ messages } = await engine.message({ sessionId, text, authorization, client, requestId }))
        } catch (err) {
          await failed(action, err)
          throw err
        }
        const after = await legacy.getSession(sessionId)
        const response = { messages, exchanges: Number(after?.exchangeCount) || 0 }
        const stored = await repos.sessionIo.putClientEvent({ sessionId, clientEventId, kind: 'MESSAGE', response })
        await applied(action, stored.response)
        return { ...stored.response, replayed: false }
      })
    },

    async saveArtifact({ user, workspace, sessionId, artifactId, ifMatch, clientEventId = null, updates, notes, authorization, client, requestId }) {
      requireStore()
      const { session } = await authorize(user, workspace, sessionId)
      await rejectErased(sessionId)
      if (!Number.isInteger(ifMatch) || ifMatch < 0) throw new ApiError('IF_MATCH_REQUIRED', 'Send the version you are changing (If-Match).')
      if (!clientEventId || !(await alreadyAccepted(sessionId, clientEventId))) await guardTimed(sessionId)
      const action = clientEventId
        ? await accept({ sessionId, clientEventId, kind: 'ARTIFACT', payload: { artifactId, ifMatch, updates: updates ?? null, notes: notes ?? null } })
        : null
      if (clientEventId) {
        const replay = await repos.sessionIo.getClientEvent(sessionId, clientEventId)
        if (replay) return { ...replay.response, replayed: true }
      }
      if (!(session.artifacts || []).some((a) => a.artifactId === artifactId)) throw new ApiError('NOT_FOUND', 'This work material is not part of the session.')
      return withLock(sessionId, async () => {
        if (clientEventId) {
          const replay = await repos.sessionIo.getClientEvent(sessionId, clientEventId)
          if (replay) return { ...replay.response, replayed: true }
        }
        if (await isClosed(sessionId)) {
          const err = new ApiError('ASSESSMENT_COMPLETED', 'This assessment has already been completed.')
          await failed(action, err)
          throw err
        }
        const current = await repos.sessionIo.latestArtifactVersion(sessionId, artifactId)
        const currentVersion = current?.version || 0
        const currentNotes = typeof current?.content?.notes === 'string' ? current.content.notes : ''
        if (ifMatch !== currentVersion) {
          const fresh = await legacy.getSession(sessionId)
          const snapshot = (fresh?.artifacts || []).find((a) => a.artifactId === artifactId) || null
          const err = new ApiError('CONFLICT', 'This work material changed since you opened it.', {
            details: { version: currentVersion, artifact: snapshot ? { artifactId, type: snapshot.type, title: snapshot.title || null, data: snapshot.data ?? null, notes: currentNotes } : null },
          })
          await failed(action, err)
          throw err
        }
        let artifact
        // P4.3: a universal run validates the board patch against the schema
        // (participants, rows, statuses, dependencies) without completing any
        // field on the learner's behalf.
        let run
        try {
          run = assertRunSupported(await draftRun(sessionId, session))
        } catch (err) {
          await failed(action, err)
          throw err
        }
        const universal = isUniversalRun(run)
        if (universal && updates != null) {
          const check = validateBoardPatch(run.snapshot.form, updates)
          if (!check.ok) {
            const err = new ApiError('VALIDATION_FAILED', 'The board change could not be applied.', { details: { errors: check.errors } })
            await failed(action, err)
            throw err
          }
        }
        try {
          ;({ artifact } = await engine.saveArtifact({ sessionId, artifactId, updates, notes, authorization, client, requestId }))
        } catch (err) {
          await failed(action, err)
          throw err
        }
        if (!artifact) {
          const err = new ApiError('UPSTREAM_UNAVAILABLE', 'Your work was not saved.')
          await failed(action, err)
          throw err
        }
        // The candidate's reasoning is kept with the version so a refresh
        // shows it again (the engine keeps it only inside evidence).
        const savedNotes = typeof notes === 'string' ? notes : currentNotes
        const written = await repos.sessionIo.appendArtifactVersion({ sessionId, artifactId, version: currentVersion + 1, content: { data: artifact.data ?? null, notes: savedNotes }, savedBy: CANDIDATE })
        const response = { artifactId, version: written.version, data: artifact.data ?? null, notes: savedNotes }
        if (clientEventId) await repos.sessionIo.putClientEvent({ sessionId, clientEventId, kind: 'ARTIFACT', response })
        await applied(action, response)
        if (universal && action) {
          const attached = await attachAction(sessionId, run, action)
          const shown = attached?.state === 'ACTION_RECEIVED' ? await presentNext(sessionId, run, { requestId }) : []
          return { ...response, messages: shown, replayed: false }
        }
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
      const legacyExchanges = Number(session.exchangeCount) || 0
      const exchanges = legacyExchanges
      const required = scenarioView(session.scenarioId, bankOrPool).requiredExchanges
      // P2.6: a draft-segment run is reviewed by the bounded evaluator through
      // a leased job; the legacy engine is never asked to score it.
      const run = await draftRun(sessionId, session)
      if (run) {
        const existing = await evaluationJob(sessionId)
        if (existing?.state === 'DONE') {
          await settle(sessionId, user)
          return { state: 'COMPLETE' }
        }
        // A universal run counts the learner's own accepted messages; the
        // engine's exchange counter is never consulted for it.
        const universal = isUniversalRun(run)
        const exchanges = universal ? messageActions(await repos.sessionIo.listActions(sessionId)).length : legacyExchanges
        if (!existing && exchanges < required && !early) {
          throw new ApiError('FINISH_CONFIRMATION_REQUIRED', 'You have not reached every part of this assessment yet.', { details: { exchanges, requiredExchanges: required } })
        }
        assertRunSupported(run)
        const io = jobs()
        if (!existing) {
          await io.acceptAction({ sessionId, clientEventId: 'finish', kind: 'FINISH', payload: { early: exchanges < required } }).catch((err) => { if (err?.code !== 'CONFLICT') throw err })
          if (universal) {
            // Answered opportunities move to EVALUATION_PENDING; presented-but-
            // unanswered and never-presented ones stay as they are (no unit).
            for (const row of await io.listOpportunities(sessionId)) if (row.state === 'ACTION_RECEIVED') await io.setOpportunityState(sessionId, row.opportunityId, 'EVALUATION_PENDING')
          }
          await io.enqueueJob({ taskKey: evaluateJobKey(sessionId), sessionId, kind: DRAFT_EVALUATE_JOB_KIND })
          audit('assessment.finish_requested', sessionId, { sessionId, early: exchanges < required, exchanges, requiredExchanges: required, requestId })
        } else if (existing.state === 'FAILED') {
          await io.retryJob(evaluateJobKey(sessionId))
        }
        // Drive the worker until this session's job has settled (other
        // claimable jobs of the same kind are processed on the way).
        let job = await evaluationJob(sessionId)
        for (let i = 0; i < 25 && job && (job.state === 'QUEUED' || (job.state === 'LEASED' && new Date(job.leaseExpiresAt) <= clock())); i += 1) {
          if (!(await runEvaluationWorkerOnce({ requestId }))) break
          job = await evaluationJob(sessionId)
        }
        const processing = processingOf(job)
        if (processing?.state === 'DONE') { await settle(sessionId, user); return { state: 'COMPLETE' } }
        if (processing?.state === 'FAILED') {
          // Technical, retryable: the learner's work stays saved; finish again re-runs the review.
          throw new ApiError('UPSTREAM_UNAVAILABLE', 'The review did not finish. Your work is saved; please try again.', { details: { processing } })
        }
        return { state: 'SCORING' }
      }
      if (exchanges < required && !early) {
        throw new ApiError('FINISH_CONFIRMATION_REQUIRED', 'You have not reached every part of this assessment yet.', { details: { exchanges, requiredExchanges: required } })
      }
      const { state } = await engine.evaluate({ sessionId, authorization, client, requestId })
      audit('assessment.finish_requested', sessionId, { sessionId, early: exchanges < required, exchanges, requiredExchanges: required, requestId })
      if (state === 'COMPLETE') await settle(sessionId, user)
      return { state }
    },
  }
  return {
    ...service,
    // One evaluation worker pass (operators/tests drive it; finish() drives it inline).
    runEvaluationWorkerOnce,
    start(args) {
      requireStore()
      return withLock(`assignment:${args.assignmentId}:${args.user.id}`, () => service.start(args))
    },
    finish(args) {
      requireStore()
      return withLock(args.sessionId, () => service.finish(args))
    },
  }
}
