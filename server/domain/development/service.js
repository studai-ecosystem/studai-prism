// Development Engine V2 service (spec §16, §26; C8.02, C8.05–C8.07).
// Practice missions, attempts and the PRACTICE evidence ledger for students;
// cohort interventions for institutions. Nothing here reads or writes formal
// evidence, sufficiency decisions or reports: practice never changes a
// formal result (§16.3), and interventions only group missions for a cohort.
import { createHash } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { can } from '../permissions/can.js'
import { capabilityInfo } from '../assessments/catalog.js'
import { CORE_TEAMREADY_A, opportunityById } from '../assessments/universalForm.js'
import { parseMission, applyVariant, MISSION_SCHEMA_VERSION } from './missionSchema.js'
import { MISSION_LIBRARY, draftContentEnabled } from './missionLibrary.js'
import { normaliseWork, initialWork, runDeterministicChecks, candidateTextFor } from './validators.js'
import { evaluateMissionWork, practiceUnitsFrom } from './evaluate.js'
import { compareAttempts, FEEDBACK_VERSION } from './feedback.js'
import { resolveRecommendations } from './recommendations.js'

const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const orgOf = (workspace) => (workspace.type === 'CAMPUS_STUDENT' ? workspace.organizationId : null)
const sameIntervention = (attempt, intervention) => (attempt.interventionId || null) === (intervention?.id || null)

// P6 assistance state of an attempt. GUIDED attempts may reveal hints;
// UNCOACHED (fresh challenge) attempts never do, so the feedback shows what
// the learner does without coaching.
export const ASSISTANCE_MODES = Object.freeze(['GUIDED', 'UNCOACHED'])
export const assistanceOf = (attempt) => {
  const mode = ASSISTANCE_MODES.includes(attempt.assistance?.mode) ? attempt.assistance.mode : 'GUIDED'
  return { mode, hintsUsed: attempt.hintsUsed || 0, scaffoldRequested: (attempt.hintsUsed || 0) > 0 }
}
// Which version of the mission an attempt runs: the base scene or its
// unfamiliar-transfer version (P6.7).
export const variantOf = (attempt) => (attempt.assistance?.variant === 'TRANSFER' ? 'TRANSFER' : 'BASE')
// P6.4 provenance: what assistance the learner was shown, whether this is a
// coached revision, why the attempt was started and which feedback /
// evaluator versions produced its result. Stored in assistance_json.
export const provenanceOf = (attempt) => {
  const a = attempt.assistance || {}
  return {
    hintsExposed: Array.isArray(a.hintsExposed) ? a.hintsExposed : Array.from({ length: attempt.hintsUsed || 0 }, (_, i) => i),
    examplesExposed: Array.isArray(a.examplesExposed) ? a.examplesExposed : [],
    coachedRevision: Boolean(a.coachedRevision),
    retryOrigin: a.retryOrigin || { kind: 'FIRST', previousAttemptId: null },
    feedbackVersion: a.feedbackVersion || null,
    evaluatorVersion: a.evaluatorVersion || null,
    promptVersion: a.promptVersion || null,
  }
}
// Text, English is the only supported practice mode today; stated on every
// card so availability is never implied for a mode the player cannot run.
const PRACTICE_MODE = Object.freeze({ input: 'TEXT', language: 'en', label: 'Text, English' })
// The finished attempt a retry follows: the newest finished attempt that no
// other attempt already retries (the tip of the retry chain), so a chain of
// retries is linear even when timestamps tie.
const tipOf = (attempts) => {
  const retried = new Set(attempts.map((a) => a.assistance?.retryOrigin?.previousAttemptId).filter(Boolean))
  return attempts.find((a) => a.status !== 'IN_PROGRESS' && !retried.has(a.id)) || attempts.find((a) => a.status !== 'IN_PROGRESS') || null
}
const MAX_STIMULUS_CHARS = 2000

// Why a practice attempt was started (P2.8). Only identifiers are kept: a
// practice attempt links to an approved assessment moment without ever
// receiving transcript text, scores or evidence from it.
const ORIGIN_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/
export function normaliseOrigin(origin) {
  if (origin == null) return { kind: 'GOAL' }
  if (typeof origin !== 'object' || Array.isArray(origin)) throw new ApiError('VALIDATION_FAILED', 'The practice origin could not be read.')
  if (origin.kind === 'GOAL') return { kind: 'GOAL' }
  if (origin.kind === 'ASSESSMENT_MOMENT') {
    const { sessionId, opportunityId } = origin
    if (!ORIGIN_ID.test(String(sessionId || '')) || !ORIGIN_ID.test(String(opportunityId || ''))) throw new ApiError('VALIDATION_FAILED', 'The practice origin needs a session and a moment.')
    return { kind: 'ASSESSMENT_MOMENT', sessionId: String(sessionId), opportunityId: String(opportunityId) }
  }
  throw new ApiError('VALIDATION_FAILED', 'The practice origin could not be read.')
}

export function createDevelopmentService({ repos, evaluator = null, clock = () => new Date(), audit = () => {}, library = MISSION_LIBRARY, sourceSession = async () => null }) {
  const store = () => repos.development
  let seeded = null
  // An intervention is open while ACTIVE and inside its date window. Dates are
  // the institution's calendar days (no time zone is stored), so a day counts
  // as soon as it has begun anywhere (UTC+14) and until it has ended everywhere
  // (UTC−12).
  const isOpen = (i) => {
    const t = clock().getTime()
    const day = (offsetHours) => new Date(t + offsetHours * 3600_000).toISOString().slice(0, 10)
    return i.status === 'ACTIVE' && i.startsOn <= day(14) && day(-12) <= i.endsOn
  }

  async function ensureSeeded() {
    if (!store()) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Practice missions are temporarily unavailable.')
    if (!seeded) {
      seeded = (async () => {
        for (const raw of library) {
          const m = parseMission(raw)
          // Starting content must demonstrate nothing: a pre-filled value that
          // already passes a rule, or starting text an evaluator could quote as
          // the learner's words, would be feedback for work nobody did. This is
          // a content fault, so it surfaces as an internal error, not a 4xx.
          const start = initialWork(m)
          const passes = [...runDeterministicChecks(m, start).values()].some((r) => r.observed)
          const quotable = candidateTextFor(m, start, m.artifacts.map((a) => a.artifact_id)).some((t) => String(t).trim())
          if (passes || quotable) throw new Error(`Mission ${m.mission_id} v${m.version}: its starting state is not empty (governance review required).`)
          await store().seedMissionVersion({
            missionId: m.mission_id, targetCapabilityId: m.target_capability_id, version: m.version, status: m.status,
            schemaVersion: MISSION_SCHEMA_VERSION, content: m, contentHash: hash(m), publishedAt: m.status === 'DRAFT' ? null : '2026-09-26T00:00:00.000Z',
          })
        }
      })()
    }
    try { await seeded } catch (err) { seeded = null; throw err }
  }

  async function published() {
    await ensureSeeded()
    return (await store().listPublishedMissions()).map((v) => parseMission(v.content))
  }

  // DRAFT missions are reachable only while PRISM_DRAFT_CONTENT is on
  // (test/local). They are never part of the published catalogue, so they
  // cannot be recommended or assigned to real users.
  async function openable() {
    const all = await published()
    if (!draftContentEnabled() || typeof store().listDraftMissions !== 'function') return all
    const ids = new Set(all.map((m) => m.mission_id))
    const drafts = (await store().listDraftMissions()).map((v) => parseMission(v.content)).filter((m) => !ids.has(m.mission_id))
    return [...all, ...drafts]
  }

  // Missions this workspace may open: all published missions in PERSONAL; in
  // a campus workspace only missions of the student's open interventions.
  async function reachable(user, workspace) {
    const all = await openable()
    if (workspace.type === 'PERSONAL') return { missions: all, interventionFor: new Map() }
    if (workspace.type !== 'CAMPUS_STUDENT') return { missions: [], interventionFor: new Map() }
    // Oldest first, so a mission in two open interventions always resolves to
    // the same one.
    const interventions = (await store().listInterventionsForUser(user.id, workspace.organizationId)).filter(isOpen)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)))
    const interventionFor = new Map()
    for (const i of interventions) for (const id of i.missionIds) if (!interventionFor.has(id)) interventionFor.set(id, i)
    return { missions: all.filter((m) => interventionFor.has(m.mission_id)), interventionFor }
  }

  function card(m, attempts, intervention = null) {
    const mine = attempts.filter((a) => a.missionId === m.mission_id)
    const latest = mine[0] || null
    const situation = m.situation_facts?.[0] || m.scenario_context.setting.split(/(?<=[.!?])\s+/)[0]
    return {
      id: m.mission_id,
      version: m.version,
      status: m.status,
      // Catalogue availability (P6.1/P6.8): REVIEWED only for published
      // content; DRAFT is test content behind the flag and says so.
      availability: m.status === 'PUBLISHED' ? 'REVIEWED' : 'DRAFT',
      displayCode: m.display_code || null,
      title: m.title,
      targetCapabilityId: m.target_capability_id,
      targetCapabilityName: capabilityInfo(m.target_capability_id)?.name || null,
      behaviourIds: m.target_behavior_ids,
      situation,
      estimatedMinutes: m.estimated_duration.minutes,
      untimed: Boolean(m.accessibility_mode.untimed),
      mode: PRACTICE_MODE,
      behaviorCount: m.target_behavior_ids.length,
      // GUIDED: hints on request. A fresh (UNCOACHED) challenge is started
      // per capability, not per card, so it is not listed as a card mode.
      modes: ['GUIDED'],
      hasTransfer: Boolean(m.transfer),
      intervention: intervention ? { id: intervention.id, name: intervention.name, endsOn: intervention.endsOn } : null,
      latestAttempt: latest ? { id: latest.id, status: latest.status, summary: latest.evaluation?.summary || null, submittedAt: latest.submittedAt } : null,
    }
  }

  // The player view: everything needed to do the mission; no rule parameters.
  function playerView(m) {
    return {
      id: m.mission_id,
      version: m.version,
      status: m.status,
      availability: m.status === 'PUBLISHED' ? 'REVIEWED' : 'DRAFT',
      displayCode: m.display_code || null,
      title: m.title,
      targetCapability: { id: m.target_capability_id, name: capabilityInfo(m.target_capability_id)?.name || null },
      scenario: m.scenario_context,
      situationFacts: m.situation_facts || [],
      whyItMatters: m.why_it_matters || null,
      reflectionPrompt: m.reflection_prompt || null,
      instructions: m.instructions,
      artifacts: m.artifacts.map((a) => ({ id: a.artifact_id, type: a.type, title: a.title, prompt: a.prompt, fields: a.fields || null, columns: a.columns || null, maxLength: a.max_length || null })),
      constraints: m.constraints.notes,
      whatIsChecked: m.rubric.criteria.map((c) => ({ criterionId: c.criterion_id, description: c.description })),
      hintCount: m.scaffolding_policy.hints.length,
      examplesAvailable: (m.examples || []).length,
      estimatedMinutes: m.estimated_duration.minutes,
      untimed: Boolean(m.accessibility_mode.untimed),
      mode: PRACTICE_MODE,
      accessibility: m.accessibility_mode,
      evidenceType: 'PRACTICE',
    }
  }

  async function missionFor(user, workspace, missionId) {
    const { missions, interventionFor } = await reachable(user, workspace)
    const m = missions.find((x) => x.mission_id === missionId)
    if (!m) throw new ApiError('NOT_FOUND', 'Not found')
    return { mission: m, intervention: interventionFor.get(missionId) || null }
  }

  // `write`: a campus attempt can be changed or submitted only while its
  // intervention is open; afterwards the work stays readable. The mission is
  // returned as the attempt runs it (base or transfer version).
  async function attemptFor(user, workspace, attemptId, { write = false } = {}) {
    const a = await store().getAttempt(attemptId)
    if (!a || a.userId !== user.id || (a.organizationId || null) !== orgOf(workspace)) throw new ApiError('NOT_FOUND', 'Not found')
    if (write && a.status === 'IN_PROGRESS' && a.interventionId) {
      const i = await store().getIntervention(a.interventionId)
      if (!i || !isOpen(i)) throw new ApiError('CONFLICT', 'This intervention has ended. Your work is kept, but it can no longer be changed or submitted.')
    }
    const v = await store().getMissionVersion(a.missionId, a.missionVersion)
    return { attempt: a, mission: applyVariant(parseMission(v.content), variantOf(a)) }
  }
  const missionOfAttempt = async (a) => applyVariant(parseMission((await store().getMissionVersion(a.missionId, a.missionVersion)).content), variantOf(a))

  const exampleView = (e) => ({ id: e.example_id, kind: e.kind, criterionIds: e.criterion_ids, text: e.text, note: e.note })
  function attemptView(a, mission) {
    const assistance = assistanceOf(a)
    const coached = assistance.mode === 'GUIDED'
    const examplesExposed = Array.isArray(a.assistance?.examplesExposed) && a.assistance.examplesExposed.length > 0
    return {
      id: a.id,
      missionId: a.missionId,
      missionVersion: a.missionVersion,
      status: a.status,
      version: a.version,
      work: a.work,
      variant: variantOf(a),
      // The scene this attempt runs (differs from the mission's base scene
      // for a transfer version).
      scene: { setting: mission.scenario_context.setting, objective: mission.scenario_context.objective, constraints: mission.constraints.notes, situationFacts: mission.situation_facts || [] },
      hints: coached ? mission.scaffolding_policy.hints.slice(0, a.hintsUsed) : [],
      hintsRemaining: coached ? Math.max(0, mission.scaffolding_policy.hints.length - a.hintsUsed) : 0,
      // Examples / counterexamples are teaching support: shown only after an
      // explicit request (never in an uncoached challenge).
      examples: coached && examplesExposed ? (mission.examples || []).filter((e) => a.assistance.examplesExposed.includes(e.example_id)).map(exampleView) : [],
      examplesAvailable: coached ? (mission.examples || []).length : 0,
      origin: a.origin || { kind: 'GOAL' },
      assistance,
      provenance: provenanceOf(a),
      stimulus: a.stimulus || null,
      result: a.evaluation ? feedbackView(a.evaluation, mission) : null,
      submittedAt: a.submittedAt,
      evidenceType: 'PRACTICE',
    }
  }

  // Criterion feedback that references only what was checked (spec §16.4),
  // plus the P6.5 focus (one completed criterion, one next change) and, for
  // a retry, the criterion-level comparison with the earlier attempt.
  function feedbackView(ev, mission) {
    return {
      status: ev.status,
      verified: ev.verified,
      summary: ev.summary,
      counts: ev.counts,
      focus: ev.focus || null,
      // P6.8: the counterpart's in-character reply, bound to the results above.
      counterpart: ev.counterpart || null,
      comparison: ev.comparison || null,
      criteria: ev.criteria.map((c) => ({
        criterionId: c.criterionId,
        description: c.description,
        result: c.result,
        reason: c.reason || null,
        quote: c.result === 'OBSERVED' ? c.quote : null,
        checks: c.rules.map((r) => ({ description: r.description, passed: r.passed })),
        note: c.result === 'OBSERVED' ? 'Shown in this attempt.'
          : c.result === 'COPIED_ASSISTANCE' ? 'This matches the example you were shown, so it is not counted as your own.'
            : c.result === 'NOT_OBSERVED' ? (mission.feedback_policy.show_unobserved ? 'Not shown yet in this attempt.' : null)
              : 'Could not be checked reliably this time. It is not counted either way.',
      })),
    }
  }

  // ── P6 allowance (0046) ───────────────────────────────────────────────
  // No row = unlimited (today's behaviour). A BOUNDED row caps how many
  // practice attempts can be STARTED; finished attempts stay readable. No
  // pricing or purchase flow lives here (P8).
  async function allowanceFor(user, workspace) {
    const row = typeof store().getPracticeAllowance === 'function' ? await store().getPracticeAllowance({ userId: user.id, organizationId: orgOf(workspace) }) : null
    if (!row || row.kind !== 'BOUNDED') return { kind: 'UNLIMITED', row: null }
    const expired = Boolean(row.validUntil) && new Date(row.validUntil).getTime() < clock().getTime()
    const remaining = Math.max(0, row.total - row.used)
    return { kind: 'BOUNDED', total: row.total, used: row.used, remaining, validUntil: row.validUntil || null, exhausted: expired || remaining === 0, row }
  }
  const allowanceView = (a) => (a.kind === 'UNLIMITED' ? { kind: 'UNLIMITED' } : { kind: 'BOUNDED', total: a.total, used: a.used, remaining: a.remaining, validUntil: a.validUntil })

  // Every NEW practice attempt goes through here: allowance first, then the
  // idempotent create. One unit is consumed only when a row was actually
  // created, so a repeated request never charges twice. `charge: false` is
  // the reissue after a technical review failure (P6.5): a failed model
  // request never costs another attempt, even when the allowance is used up.
  async function newAttempt(user, workspace, { mission, intervention, idempotencyKey, origin, assistance, stimulus = null, charge = true }) {
    const allowance = await allowanceFor(user, workspace)
    if (charge && allowance.kind === 'BOUNDED' && allowance.exhausted) throw new ApiError('ALLOWANCE_EXHAUSTED', 'Your practice allowance is used up. Finished attempts stay readable.')
    const organizationId = orgOf(workspace)
    const { attempt, replayed } = await store().createAttempt({
      userId: user.id, missionId: mission.mission_id, missionVersion: mission.version, organizationId, interventionId: intervention?.id || null,
      work: initialWork(mission), idempotencyKey, origin, assistance, stimulus,
    })
    if (attempt.missionId !== mission.mission_id || (attempt.organizationId || null) !== organizationId || !sameIntervention(attempt, intervention)) throw new ApiError('CONFLICT', 'This request was already used for another mission.')
    if (!replayed && charge && allowance.row && typeof store().consumePracticeAllowance === 'function') await store().consumePracticeAllowance(allowance.row.id)
    return { attempt, replayed }
  }

  // ── P6.6 replay source checks ─────────────────────────────────────────
  // The source session must belong to this user and to this workspace's
  // sponsorship (personal ↔ no sponsor; campus ↔ that organization).
  async function authorizeSource(user, workspace, sessionId) {
    const scope = typeof repos.scopes?.getSessionScope === 'function' ? await repos.scopes.getSessionScope(sessionId) : null
    const session = await sourceSession(sessionId)
    const owner = scope?.ownerUserId || session?.userId || null
    if (!owner || owner !== user.id) throw new ApiError('NOT_FOUND', 'Not found')
    const sponsor = scope?.sponsorType === 'INSTITUTION' ? scope.sponsorOrganizationId : null
    if ((sponsor || null) !== orgOf(workspace)) throw new ApiError('NOT_FOUND', 'Not found')
  }
  async function ledgerOpportunity(sessionId, opportunityId) {
    if (typeof repos.sessionIo?.listOpportunities !== 'function') return null
    return (await repos.sessionIo.listOpportunities(sessionId)).find((o) => o.opportunityId === opportunityId) || null
  }
  // ONLY the stimulus the learner was actually shown (speaker + content) for
  // THIS opportunity — never their own actions, scores, evidence, rubric
  // anchors or any later-stage stimulus. An opportunity that was never
  // presented (a future prompt) has nothing to replay: the mission's own
  // briefing is the teaching situation.
  function stimulusFor(row, mission, opportunityId) {
    const presented = Boolean(row?.presentedAt) && row?.state !== 'PLANNED'
    const messages = presented && Array.isArray(row?.stimulus?.messages) ? row.stimulus.messages : []
    const text = messages.map((m) => `${m?.speaker ? `${m.speaker}: ` : ''}${typeof m?.content === 'string' ? m.content : ''}`.trim()).filter(Boolean).join('\n').slice(0, MAX_STIMULUS_CHARS)
    if (row && text) return { source: 'ASSESSMENT_MOMENT', opportunityId, text, presentedAt: row.presentedAt || null }
    return { source: 'MISSION_BRIEFING', opportunityId, text: mission.scenario_context.setting, presentedAt: null }
  }

  // P6.4 — everything the learner was SHOWN for this mission before (and in)
  // this attempt: scaffold hints and examples, across all of their attempts
  // of the mission in this workspace. Used for copy detection and provenance.
  async function exposedAssistanceFor(user, workspace, attempt, mission) {
    const mine = (await store().listAttempts({ userId: user.id, organizationId: orgOf(workspace) }))
      .filter((a) => a.missionId === attempt.missionId && (a.id === attempt.id || String(a.createdAt) <= String(attempt.createdAt)))
    const hints = new Set()
    const examples = new Set()
    for (const a of mine) {
      const used = a.id === attempt.id ? (attempt.hintsUsed || 0) : (a.hintsUsed || 0)
      for (let i = 0; i < used; i += 1) hints.add(i)
      for (const id of a.assistance?.examplesExposed || []) examples.add(id)
    }
    const list = [
      ...[...hints].sort((x, y) => x - y).map((i) => ({ source: 'HINT', id: `H${i + 1}`, text: mission.scaffolding_policy.hints[i] })).filter((h) => h.text),
      ...(mission.examples || []).filter((e) => examples.has(e.example_id)).map((e) => ({ source: 'EXAMPLE', id: e.example_id, text: e.text })),
    ]
    return { list, hints: [...hints].sort((x, y) => x - y), examples: [...examples], priorAttempts: mine.filter((a) => a.id !== attempt.id).length }
  }

  return {
    ensureSeeded,

    // Published missions (for the institution's intervention builder).
    async catalogue() {
      return (await published()).map((m) => card(m, []))
    },

    async listMissions(user, workspace) {
      const { missions, interventionFor } = await reachable(user, workspace)
      const attempts = await store().listAttempts({ userId: user.id, organizationId: orgOf(workspace) })
      return { items: missions.map((m) => card(m, attempts, interventionFor.get(m.mission_id) || null)), allowance: allowanceView(await allowanceFor(user, workspace)), evidenceType: 'PRACTICE' }
    },

    async getMission(user, workspace, missionId) {
      const { mission, intervention } = await missionFor(user, workspace, missionId)
      const attempts = (await store().listAttempts({ userId: user.id, organizationId: orgOf(workspace) })).filter((a) => a.missionId === missionId)
      const open = attempts.find((a) => a.status === 'IN_PROGRESS' && sameIntervention(a, intervention)) || null
      return {
        mission: playerView(mission),
        intervention: intervention ? { id: intervention.id, name: intervention.name, endsOn: intervention.endsOn } : null,
        openAttemptId: open?.id || null,
        allowance: allowanceView(await allowanceFor(user, workspace)),
        pastAttempts: attempts.filter((a) => a.status !== 'IN_PROGRESS').map((a) => ({ id: a.id, status: a.status, summary: a.evaluation?.summary || null, submittedAt: a.submittedAt })),
      }
    },

    // Resumes the open attempt (same mission, workspace and intervention)
    // unless `retry`; an attempt left open in an ended intervention is not
    // resumed into a new one. A retry is always a NEW attempt: the previous
    // one is never changed. `origin` says why this practice was started.
    //
    // Retry semantics (P6.5/P6.6): the new attempt records which finished
    // attempt it follows (`retryOrigin`), keeps that attempt's scene version,
    // and is deduplicated on that link — two simultaneous "Try again"
    // requests, or a repeat with the same key, yield one new attempt. A
    // retry after a technical review failure is a reissue: it never costs
    // an allowance unit.
    async startAttempt(user, workspace, missionId, { idempotencyKey, retry = false, origin = null }) {
      if (!idempotencyKey) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
      const { mission, intervention } = await missionFor(user, workspace, missionId)
      const organizationId = orgOf(workspace)
      const normalisedOrigin = normaliseOrigin(origin)
      const attempts = (await store().listAttempts({ userId: user.id, organizationId })).filter((a) => a.missionId === missionId && sameIntervention(a, intervention))
      if (!retry) {
        const open = attempts.find((a) => a.status === 'IN_PROGRESS')
        if (open) return { attempt: attemptView(open, mission), resumed: true }
      }
      const previous = retry ? tipOf(attempts) : null
      if (previous) {
        const openRetry = attempts.find((a) => a.status === 'IN_PROGRESS' && a.assistance?.retryOrigin?.previousAttemptId === previous.id)
        if (openRetry) return { attempt: attemptView(openRetry, await missionOfAttempt(openRetry)), resumed: true }
      }
      const variant = previous ? variantOf(previous) : 'BASE'
      const runMission = applyVariant(mission, variant)
      const reissued = previous?.status === 'EVALUATION_UNAVAILABLE'
      const assistance = {
        mode: 'GUIDED', variant,
        retryOrigin: previous ? { kind: 'RETRY', previousAttemptId: previous.id, reissued } : { kind: 'FIRST', previousAttemptId: null },
      }
      const key = previous ? `retry:${missionId}:${previous.id}` : `start:${idempotencyKey}`
      const { attempt, replayed } = await newAttempt(user, workspace, { mission: runMission, intervention, idempotencyKey: key, origin: previous?.origin && normalisedOrigin.kind === 'GOAL' ? previous.origin : normalisedOrigin, assistance, charge: !reissued })
      if (!replayed && previous) audit('development.retry.started', null, { attemptId: attempt.id, missionId, previousAttemptId: previous.id, reissued, variant, evidenceType: 'PRACTICE' })
      return { attempt: attemptView(attempt, runMission), resumed: replayed }
    },

    // P6.6 "Try that moment again": a separate PRACTICE attempt from one
    // authorized assessment moment. Copies only the presented stimulus text;
    // the formal session, its evidence and its report are never read for
    // content or written to.
    async replayMoment(user, workspace, { sessionId, opportunityId, idempotencyKey }) {
      if (!idempotencyKey) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
      const origin = normaliseOrigin({ kind: 'ASSESSMENT_MOMENT', sessionId, opportunityId })
      await authorizeSource(user, workspace, origin.sessionId)
      const row = await ledgerOpportunity(origin.sessionId, origin.opportunityId)
      const capabilityId = row?.capabilityId || opportunityById(CORE_TEAMREADY_A, origin.opportunityId)?.capabilityId || null
      const { missions, interventionFor } = await reachable(user, workspace)
      const candidates = missions.filter((m) => !capabilityId || m.target_capability_id === capabilityId)
      const mission = candidates.find((m) => (m.exposure_tags || []).includes(origin.opportunityId)) || candidates.find((m) => m.status === 'PUBLISHED') || candidates[0] || null
      if (!mission) throw new ApiError('NOT_FOUND', 'No practice mission matches this moment yet.')
      const stimulus = stimulusFor(row, mission, origin.opportunityId)
      const intervention = interventionFor.get(mission.mission_id) || null
      const assistance = { mode: 'GUIDED', variant: 'BASE', retryOrigin: { kind: 'REPLAY', previousAttemptId: null } }
      const { attempt, replayed } = await newAttempt(user, workspace, { mission, intervention, idempotencyKey: `replay:${idempotencyKey}`, origin, assistance, stimulus })
      if (!replayed) audit('development.replay.started', null, { attemptId: attempt.id, missionId: mission.mission_id, sessionId: origin.sessionId, opportunityId: origin.opportunityId, stimulusSource: stimulus.source, evidenceType: 'PRACTICE' })
      return { attempt: attemptView(attempt, mission), resumed: replayed, missionId: mission.mission_id }
    },

    // P6.7 fresh challenge: a different practice SETTING for the same
    // behaviours, with hints and examples off for the whole attempt
    // (UNCOACHED). Candidates are the unfamiliar-transfer version of a
    // mission the learner has practised (same behaviour ids, different
    // setting) or another mission of the capability they have not met, in
    // that order; anything whose exposure tags the learner has already met
    // (practised, replayed or formally seen) is excluded. The outcome is an
    // observed practice behaviour in a fresh situation, not growth or a
    // retest.
    async startChallenge(user, workspace, { capabilityId, idempotencyKey }) {
      if (!idempotencyKey) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
      if (!capabilityInfo(capabilityId)) throw new ApiError('VALIDATION_FAILED', 'Choose a capability from the framework.')
      const { missions, interventionFor } = await reachable(user, workspace)
      const attempts = await store().listAttempts({ userId: user.id, organizationId: orgOf(workspace) })
      // A repeated request returns the attempt it already created, even
      // though that attempt has since made its own setting "exposed".
      const prior = attempts.find((a) => a.idempotencyKey === `challenge:${idempotencyKey}`)
      if (prior) return { attempt: attemptView(prior, await missionOfAttempt(prior)), resumed: true, missionId: prior.missionId }
      const attemptedVariants = new Set()
      const exposed = new Set()
      let recent = null
      for (const a of attempts) {
        if (a.origin?.kind === 'ASSESSMENT_MOMENT') exposed.add(a.origin.opportunityId)
        const v = await store().getMissionVersion(a.missionId, a.missionVersion)
        if (!v) continue
        const base = parseMission(v.content)
        const run = applyVariant(base, variantOf(a))
        attemptedVariants.add(`${a.missionId}:${variantOf(a)}`)
        for (const t of run.exposure_tags || []) exposed.add(t)
        if (!recent && base.target_capability_id === capabilityId) recent = { missionId: base.mission_id, behaviours: new Set(base.target_behavior_ids) }
      }
      const candidates = []
      for (const m of missions.filter((x) => x.target_capability_id === capabilityId)) {
        if (!attemptedVariants.has(`${m.mission_id}:BASE`) && !(m.exposure_tags || []).some((t) => exposed.has(t))) candidates.push({ mission: m, variant: 'BASE' })
        if (m.transfer && !attemptedVariants.has(`${m.mission_id}:TRANSFER`) && !(m.transfer.exposure_tags || []).some((t) => exposed.has(t))) candidates.push({ mission: m, variant: 'TRANSFER' })
      }
      const shared = (m) => (recent ? m.target_behavior_ids.filter((b) => recent.behaviours.has(b)).length : 0)
      const sameSet = (m) => recent && m.target_behavior_ids.length === recent.behaviours.size && shared(m) === recent.behaviours.size
      const practised = (m) => attemptedVariants.has(`${m.mission_id}:BASE`)
      const score = (c) => (sameSet(c.mission) ? 2 : shared(c.mission) > 0 ? 1 : 0) * 10 + (c.variant === 'TRANSFER' && practised(c.mission) ? 1 : c.variant === 'BASE' ? 1 : 0)
      candidates.sort((x, y) => score(y) - score(x))
      const chosen = candidates[0]
      if (!chosen) throw new ApiError('NO_FRESH_CHALLENGE', 'No unfamiliar practice setting is available for this capability yet.')
      const runMission = applyVariant(chosen.mission, chosen.variant)
      const intervention = interventionFor.get(chosen.mission.mission_id) || null
      const assistance = { mode: 'UNCOACHED', variant: chosen.variant, exposureTags: runMission.exposure_tags || [], excludedExposure: [...exposed], retryOrigin: { kind: 'CHALLENGE', previousAttemptId: null } }
      const { attempt, replayed } = await newAttempt(user, workspace, { mission: runMission, intervention, idempotencyKey: `challenge:${idempotencyKey}`, origin: { kind: 'GOAL' }, assistance })
      if (!replayed) audit('development.challenge.started', null, { attemptId: attempt.id, missionId: chosen.mission.mission_id, variant: chosen.variant, capabilityId, exposureTags: assistance.exposureTags, evidenceType: 'PRACTICE' })
      return { attempt: attemptView(attempt, runMission), resumed: replayed, missionId: chosen.mission.mission_id }
    },

    async getAttempt(user, workspace, attemptId) {
      const { attempt, mission } = await attemptFor(user, workspace, attemptId)
      return attemptView(attempt, mission)
    },

    async saveWork(user, workspace, attemptId, { work, expectedVersion }) {
      const { attempt, mission } = await attemptFor(user, workspace, attemptId, { write: true })
      const normalised = normaliseWork(mission, { ...attempt.work, ...work })
      const out = await store().saveAttemptWork(attempt.id, { expectedVersion, work: normalised })
      if (out?.conflict === 'SUBMITTED') throw new ApiError('CONFLICT', 'This attempt has already been submitted. Start a new attempt to try again.')
      if (out?.conflict === 'VERSION') throw new ApiError('CONFLICT', 'This work was changed somewhere else. Reload to continue.', { details: { current: attemptView(out.attempt, mission) } })
      return attemptView(out.attempt, mission)
    },

    async revealHint(user, workspace, attemptId, { expectedVersion }) {
      const { attempt, mission } = await attemptFor(user, workspace, attemptId, { write: true })
      if (assistanceOf(attempt).mode === 'UNCOACHED') throw new ApiError('CONFLICT', 'Hints are off for a fresh challenge, so the feedback shows what you do without coaching.')
      if (attempt.hintsUsed >= mission.scaffolding_policy.hints.length) return attemptView(attempt, mission)
      const out = await store().saveAttemptWork(attempt.id, { expectedVersion, hintsUsed: attempt.hintsUsed + 1 })
      if (out?.conflict) throw new ApiError('CONFLICT', 'This attempt changed. Reload to continue.')
      return attemptView(out.attempt, mission)
    },

    // P6.5 examples and counterexamples on explicit request (or after
    // feedback). Never in an uncoached challenge. Exposure is recorded so a
    // copied example is detected and never counted as the learner's own.
    async revealExamples(user, workspace, attemptId) {
      const { attempt, mission } = await attemptFor(user, workspace, attemptId)
      if (assistanceOf(attempt).mode === 'UNCOACHED') throw new ApiError('CONFLICT', 'Examples are off for a fresh challenge, so the feedback shows what you do without coaching.')
      const ids = (mission.examples || []).map((e) => e.example_id)
      const already = new Set(attempt.assistance?.examplesExposed || [])
      if (!ids.length || ids.every((id) => already.has(id))) return attemptView(attempt, mission)
      if (typeof store().recordAssistance !== 'function') throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Examples are temporarily unavailable.')
      const updated = await store().recordAssistance(attempt.id, { ...(attempt.assistance || { mode: 'GUIDED' }), examplesExposed: [...new Set([...already, ...ids])] })
      audit('development.examples.revealed', null, { attemptId: attempt.id, missionId: mission.mission_id, exampleIds: ids, afterSubmit: attempt.status !== 'IN_PROGRESS', evidenceType: 'PRACTICE' })
      return attemptView(updated, mission)
    },

    // Runs the §16.3 pipeline once; a repeated submit returns the stored result.
    async submit(user, workspace, attemptId) {
      const { attempt, mission } = await attemptFor(user, workspace, attemptId, { write: true })
      // A replay also completes a practice write that failed after evaluation
      // (units are unique per attempt + criterion, so this never duplicates).
      const settle = (a) => (a.evaluation ? store().appendPracticeUnits(practiceUnitsFrom({ evaluation: a.evaluation, mission, attempt: a })) : null)
      if (attempt.status !== 'IN_PROGRESS') { await settle(attempt); return { attempt: attemptView(attempt, mission), replayed: true } }
      const work = normaliseWork(mission, attempt.work)
      const exposure = await exposedAssistanceFor(user, workspace, attempt, mission)
      const evaluation = await evaluateMissionWork({ mission, work, evaluator, candidateName: user.name || null, exposed: exposure.list })
      // P6.6 criterion-level comparison with the attempt this one retries.
      const previousId = attempt.assistance?.retryOrigin?.previousAttemptId || null
      const previous = previousId ? await store().getAttempt(previousId) : null
      if (previous?.evaluation && previous.userId === user.id) evaluation.comparison = compareAttempts({ ...previous.evaluation, attemptId: previous.id }, evaluation)
      const assistance = {
        ...(attempt.assistance || { mode: 'GUIDED' }),
        hintsExposed: Array.from({ length: attempt.hintsUsed || 0 }, (_, i) => i),
        examplesExposed: attempt.assistance?.examplesExposed || [],
        coachedRevision: Boolean(previousId) && exposure.list.length > 0,
        copyCheck: { sources: exposure.list.map((e) => `${e.source}:${e.id}`), flagged: evaluation.criteria.filter((c) => c.result === 'COPIED_ASSISTANCE').map((c) => c.criterionId) },
        feedbackVersion: FEEDBACK_VERSION,
        evaluatorVersion: evaluation.evaluator.available ? (evaluation.evaluator.promptVersion || 'deterministic-only') : null,
        promptVersion: { evaluator: evaluation.evaluator.promptVersion, meaning: evaluation.evaluator.meaningPromptVersion, pipeline: evaluation.versions.pipeline },
      }
      const done = await store().completeAttempt(attempt.id, { status: evaluation.status, evaluation, submittedAt: clock().toISOString(), assistance })
      if (done.replayed) { await settle(done.attempt); return { attempt: attemptView(done.attempt, mission), replayed: true } }
      await settle(done.attempt)
      audit('development.mission.evaluated', null, {
        attemptId: attempt.id, missionId: mission.mission_id, missionVersion: mission.version, variant: variantOf(done.attempt), status: evaluation.status,
        demonstrated: evaluation.counts.demonstrated, uncertain: evaluation.counts.uncertain, copied: evaluation.counts.copied, total: evaluation.counts.total,
        evaluator: evaluation.evaluator.available ? evaluation.evaluator.promptVersion : evaluation.evaluator.reason, evidenceType: 'PRACTICE',
        assistance: assistanceOf(done.attempt), origin: done.attempt.origin?.kind || 'GOAL', retryOrigin: assistance.retryOrigin?.kind || 'FIRST',
      })
      return { attempt: attemptView(done.attempt, mission), replayed: false }
    },

    // Practice evidence for the evidence explorer (kind PRACTICE only).
    async listPractice(user, workspace) {
      if (!store()) return []
      const units = await store().listPracticeUnits({ userId: user.id, organizationId: orgOf(workspace) })
      const out = []
      for (const u of units) {
        const v = await store().getMissionVersion(u.missionId, u.missionVersion)
        const m = v ? parseMission(v.content) : null
        const criterion = m?.rubric.criteria.find((c) => c.criterion_id === u.criterionId)
        out.push({
          id: u.id,
          kind: 'PRACTICE',
          assessmentTitle: m?.title || null,
          scope: workspace.type === 'CAMPUS_STUDENT' ? 'SPONSORED' : 'PERSONAL',
          date: u.createdAt,
          candidateAction: { quote: u.excerpt || null, turn: null, artifactId: null },
          observedBehavior: criterion?.description || null,
          capability: { id: u.capabilityId, name: capabilityInfo(u.capabilityId)?.name || null },
          rubricAnchor: null,
          evidenceStatus: 'PRACTICE',
          missionId: u.missionId,
        })
      }
      return out
    },

    // Every attempt of this user in this workspace for the history projection
    // (P1.2): stored dates only; the title comes from the attempted version.
    async listAttemptHistory(user, workspace) {
      if (!store()) return []
      const attempts = await store().listAttempts({ userId: user.id, organizationId: orgOf(workspace) })
      const out = []
      for (const a of attempts) {
        const v = await store().getMissionVersion(a.missionId, a.missionVersion)
        out.push({
          id: a.id,
          missionId: a.missionId,
          title: v?.content?.title || null,
          capabilityId: v?.content?.target_capability_id || null,
          status: a.status,
          origin: a.origin || { kind: 'GOAL' },
          assistance: assistanceOf(a),
          variant: variantOf(a),
          startedAt: a.createdAt || null,
          submittedAt: a.submittedAt || null,
        })
      }
      return out
    },

    // Plan from the formal priorities (same rule as Report V3: ≤ 3 capabilities
    // in the Early/Developing bands), persisted once per source report.
    async planFor(user, workspace, priorities) {
      const { missions, interventionFor } = await reachable(user, workspace)
      const attempts = await store().listAttempts({ userId: user.id, organizationId: orgOf(workspace) })
      const sourceSessionId = priorities[0]?.basedOn?.sessionId || null
      let plan = null
      if (sourceSessionId) plan = await store().upsertPlan({ userId: user.id, organizationId: orgOf(workspace), sourceSessionId, items: priorities.map((p) => ({ capabilityId: p.capabilityId })) })
      const focus = new Set(priorities.map((p) => p.capabilityId))
      // DRAFT content is never recommended, even when it is openable locally.
      const recommended = missions.filter((m) => m.status !== 'DRAFT' && (focus.has(m.target_capability_id) || interventionFor.has(m.mission_id)))
      return {
        planId: plan?.id || null,
        allowance: allowanceView(await allowanceFor(user, workspace)),
        recommended: recommended.map((m) => card(m, attempts, interventionFor.get(m.mission_id) || null)),
        catalogue: missions.map((m) => card(m, attempts, interventionFor.get(m.mission_id) || null)),
        completed: attempts.filter((a) => a.status !== 'IN_PROGRESS').slice(0, 20).map((a) => {
          const m = missions.find((x) => x.mission_id === a.missionId)
          return { attemptId: a.id, missionId: a.missionId, title: m?.title || null, status: a.status, summary: a.evaluation?.summary || null, submittedAt: a.submittedAt }
        }),
      }
    },

    // P5.6: current recommendations for behaviour gaps, resolved at read time
    // from the missions THIS workspace can open (DRAFT only behind the flag)
    // and the live allowance. Never persisted with a report version.
    async recommendFor(user, workspace, gaps) {
      if (!store()) return resolveRecommendations({ gaps, practiceEnabled: false })
      const { missions } = await reachable(user, workspace)
      const base = workspace.type === 'CAMPUS_STUDENT' ? `/app/campus/${encodeURIComponent(workspace.organizationId)}/development` : '/app/development'
      return resolveRecommendations({
        gaps, missions, allowance: allowanceView(await allowanceFor(user, workspace)), draftEnabled: draftContentEnabled(),
        pathFor: (id) => `${base}/missions/${encodeURIComponent(id)}`,
      })
    },

    // ── Campus interventions (§26; C8.07) ─────────────────────────────────
    async createIntervention(req, actor, organizationId, input, { cohortOf, orgAudit }) {
      const d = can(actor, 'interventions.write', { organizationId })
      if (!d.allowed) throw new ApiError('NOT_FOUND', 'Not found')
      const cohort = await cohortOf(organizationId, input.cohortId)
      const reach = can(actor, 'cohorts.read', { organizationId, cohortId: cohort.id, departmentId: cohort.departmentId || null })
      if (!reach.allowed || cohort.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'Choose an active cohort you work with.')
      if (d.scope === 'ASSIGNED' && !(d.cohortIds || []).includes(cohort.id)) throw new ApiError('FORBIDDEN', 'Choose a cohort you work with.')
      if (!capabilityInfo(input.targetCapabilityId)) throw new ApiError('VALIDATION_FAILED', 'Choose a capability from the framework.')
      if (!(input.endsOn >= input.startsOn)) throw new ApiError('VALIDATION_FAILED', 'The end date must be on or after the start date.')
      const catalogue = new Map((await published()).map((m) => [m.mission_id, m]))
      const missionIds = [...new Set(input.missionIds)]
      if (!missionIds.length || missionIds.some((id) => !catalogue.has(id))) throw new ApiError('VALIDATION_FAILED', 'Choose published practice missions.')
      if (missionIds.some((id) => catalogue.get(id).target_capability_id !== input.targetCapabilityId)) throw new ApiError('VALIDATION_FAILED', 'Choose missions that practise the target capability.')
      const row = await store().createIntervention({
        organizationId, name: input.name, targetCapabilityId: input.targetCapabilityId, cohortId: cohort.id, startsOn: input.startsOn, endsOn: input.endsOn,
        status: 'ACTIVE', missionIds, reassessmentPlanned: Boolean(input.reassessmentPlanned), createdBy: actor.userId,
      })
      let members = 0
      for (const m of await repos.campusAdmin.listCohortMembers(cohort.id)) {
        await store().addInterventionMember(row.id, m.userId)
        members += 1
      }
      await orgAudit(req, organizationId, 'intervention.assigned', 'INTERVENTION', row.id, { name: row.name, cohortId: cohort.id, missions: missionIds.length, members })
      return this.interventionSummary(row)
    },

    async syncCohortMember(organizationId, cohortId, userId) {
      if (!store()) return
      for (const i of await store().listInterventions(organizationId)) {
        if (i.status === 'ACTIVE' && i.cohortId === String(cohortId)) await store().addInterventionMember(i.id, userId)
      }
    },

    // Completion counts only: institutions never see practice work or quotes.
    async interventionSummary(i) {
      const members = await store().listInterventionMembers(i.id)
      const attempts = await store().listAttemptsForIntervention(i.id)
      const memberIds = new Set(members.map((m) => m.userId))
      const finished = (userId, missionId) => attempts.some((a) => a.userId === userId && a.missionId === missionId && a.status !== 'IN_PROGRESS')
      const started = new Set(attempts.filter((a) => memberIds.has(a.userId)).map((a) => a.userId))
      const completedAll = members.filter((m) => i.missionIds.every((id) => finished(m.userId, id))).length
      const titles = new Map((await published()).map((m) => [m.mission_id, m.title]))
      return {
        id: i.id, name: i.name, status: i.status, cohortId: i.cohortId, startsOn: i.startsOn, endsOn: i.endsOn, reassessmentPlanned: i.reassessmentPlanned,
        targetCapability: { id: i.targetCapabilityId, name: capabilityInfo(i.targetCapabilityId)?.name || null },
        missions: i.missionIds.map((id) => ({ id, title: titles.get(id) || null, completed: members.filter((m) => finished(m.userId, id)).length })),
        counts: { members: members.length, started: started.size, completedAll },
      }
    },

    async listInterventions(actor, organizationId, decision, { cohortsById }) {
      const out = []
      for (const i of await store().listInterventions(organizationId)) {
        const c = cohortsById.get(i.cohortId)
        if (!c) continue
        const reach = can(actor, 'interventions.read', { organizationId, cohortId: c.id, departmentId: c.departmentId || null })
        if (!reach.allowed || (decision.scope === 'ASSIGNED' && !(decision.cohortIds || []).includes(c.id))) continue
        out.push({ ...(await this.interventionSummary(i)), cohortName: c.name })
      }
      return out
    },

    async getIntervention(actor, organizationId, interventionId, { cohortOf }) {
      const i = await store().getIntervention(interventionId)
      if (!i || i.organizationId !== organizationId) throw new ApiError('NOT_FOUND', 'Not found')
      const c = await cohortOf(organizationId, i.cohortId)
      const reach = can(actor, 'interventions.read', { organizationId, cohortId: c.id, departmentId: c.departmentId || null })
      if (!reach.allowed) throw new ApiError('NOT_FOUND', 'Not found')
      return { ...(await this.interventionSummary(i)), cohortName: c.name }
    },

    async setInterventionStatus(req, actor, organizationId, interventionId, status, { cohortOf, orgAudit }) {
      const i = await store().getIntervention(interventionId)
      if (!i || i.organizationId !== organizationId) throw new ApiError('NOT_FOUND', 'Not found')
      const c = await cohortOf(organizationId, i.cohortId)
      const d = can(actor, 'interventions.write', { organizationId, cohortId: c.id, departmentId: c.departmentId || null })
      const reach = can(actor, 'cohorts.read', { organizationId, cohortId: c.id, departmentId: c.departmentId || null })
      if (!d.allowed || !reach.allowed) throw new ApiError('NOT_FOUND', 'Not found')
      if (i.status !== 'ACTIVE') throw new ApiError('CONFLICT', 'This intervention has already ended.')
      const row = await store().setInterventionStatus(i.id, status)
      await orgAudit(req, organizationId, `intervention.${status.toLowerCase()}`, 'INTERVENTION', i.id, {})
      return this.interventionSummary(row)
    },
  }
}
