// Development Engine V2 service (spec §16, §26; C8.02, C8.05–C8.07).
// Practice missions, attempts and the PRACTICE evidence ledger for students;
// cohort interventions for institutions. Nothing here reads or writes formal
// evidence, sufficiency decisions or reports: practice never changes a
// formal result (§16.3), and interventions only group missions for a cohort.
import { createHash } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { can } from '../permissions/can.js'
import { capabilityInfo } from '../assessments/catalog.js'
import { parseMission, MISSION_SCHEMA_VERSION } from './missionSchema.js'
import { MISSION_LIBRARY, draftContentEnabled } from './missionLibrary.js'
import { normaliseWork, initialWork, runDeterministicChecks, candidateTextFor } from './validators.js'
import { evaluateMissionWork, practiceUnitsFrom } from './evaluate.js'

const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const orgOf = (workspace) => (workspace.type === 'CAMPUS_STUDENT' ? workspace.organizationId : null)
const sameIntervention = (attempt, intervention) => (attempt.interventionId || null) === (intervention?.id || null)

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

export function createDevelopmentService({ repos, evaluator = null, clock = () => new Date(), audit = () => {}, library = MISSION_LIBRARY }) {
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
    return {
      id: m.mission_id,
      version: m.version,
      status: m.status,
      title: m.title,
      targetCapabilityId: m.target_capability_id,
      targetCapabilityName: capabilityInfo(m.target_capability_id)?.name || null,
      estimatedMinutes: m.estimated_duration.minutes,
      behaviorCount: m.target_behavior_ids.length,
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
      title: m.title,
      targetCapability: { id: m.target_capability_id, name: capabilityInfo(m.target_capability_id)?.name || null },
      scenario: m.scenario_context,
      instructions: m.instructions,
      artifacts: m.artifacts.map((a) => ({ id: a.artifact_id, type: a.type, title: a.title, prompt: a.prompt, fields: a.fields || null, columns: a.columns || null, maxLength: a.max_length || null })),
      constraints: m.constraints.notes,
      whatIsChecked: m.rubric.criteria.map((c) => ({ criterionId: c.criterion_id, description: c.description })),
      hintCount: m.scaffolding_policy.hints.length,
      estimatedMinutes: m.estimated_duration.minutes,
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
  // intervention is open; afterwards the work stays readable.
  async function attemptFor(user, workspace, attemptId, { write = false } = {}) {
    const a = await store().getAttempt(attemptId)
    if (!a || a.userId !== user.id || (a.organizationId || null) !== orgOf(workspace)) throw new ApiError('NOT_FOUND', 'Not found')
    if (write && a.status === 'IN_PROGRESS' && a.interventionId) {
      const i = await store().getIntervention(a.interventionId)
      if (!i || !isOpen(i)) throw new ApiError('CONFLICT', 'This intervention has ended. Your work is kept, but it can no longer be changed or submitted.')
    }
    const v = await store().getMissionVersion(a.missionId, a.missionVersion)
    return { attempt: a, mission: parseMission(v.content) }
  }

  function attemptView(a, mission) {
    return {
      id: a.id,
      missionId: a.missionId,
      missionVersion: a.missionVersion,
      status: a.status,
      version: a.version,
      work: a.work,
      hints: mission.scaffolding_policy.hints.slice(0, a.hintsUsed),
      hintsRemaining: Math.max(0, mission.scaffolding_policy.hints.length - a.hintsUsed),
      origin: a.origin || { kind: 'GOAL' },
      result: a.evaluation ? feedbackView(a.evaluation, mission) : null,
      submittedAt: a.submittedAt,
      evidenceType: 'PRACTICE',
    }
  }

  // Criterion feedback that references only what was checked (spec §16.4).
  function feedbackView(ev, mission) {
    return {
      status: ev.status,
      verified: ev.verified,
      summary: ev.summary,
      counts: ev.counts,
      criteria: ev.criteria.map((c) => ({
        criterionId: c.criterionId,
        description: c.description,
        result: c.result,
        quote: c.result === 'OBSERVED' ? c.quote : null,
        checks: c.rules.map((r) => ({ description: r.description, passed: r.passed })),
        note: c.result === 'OBSERVED' ? 'Shown in this attempt.'
          : c.result === 'NOT_OBSERVED' ? (mission.feedback_policy.show_unobserved ? 'Not shown yet in this attempt.' : null)
            : 'Could not be checked reliably this time. It is not counted either way.',
      })),
    }
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
      return { items: missions.map((m) => card(m, attempts, interventionFor.get(m.mission_id) || null)), evidenceType: 'PRACTICE' }
    },

    async getMission(user, workspace, missionId) {
      const { mission, intervention } = await missionFor(user, workspace, missionId)
      const attempts = (await store().listAttempts({ userId: user.id, organizationId: orgOf(workspace) })).filter((a) => a.missionId === missionId)
      const open = attempts.find((a) => a.status === 'IN_PROGRESS' && sameIntervention(a, intervention)) || null
      return {
        mission: playerView(mission),
        intervention: intervention ? { id: intervention.id, name: intervention.name, endsOn: intervention.endsOn } : null,
        openAttemptId: open?.id || null,
        pastAttempts: attempts.filter((a) => a.status !== 'IN_PROGRESS').map((a) => ({ id: a.id, status: a.status, summary: a.evaluation?.summary || null, submittedAt: a.submittedAt })),
      }
    },

    // Resumes the open attempt (same mission, workspace and intervention)
    // unless `retry`; an attempt left open in an ended intervention is not
    // resumed into a new one. A retry is always a NEW attempt: the previous
    // one is never changed. `origin` says why this practice was started.
    async startAttempt(user, workspace, missionId, { idempotencyKey, retry = false, origin = null }) {
      if (!idempotencyKey) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
      const { mission, intervention } = await missionFor(user, workspace, missionId)
      const organizationId = orgOf(workspace)
      const normalisedOrigin = normaliseOrigin(origin)
      if (!retry) {
        const open = (await store().listAttempts({ userId: user.id, organizationId })).find((a) => a.missionId === missionId && a.status === 'IN_PROGRESS' && sameIntervention(a, intervention))
        if (open) return { attempt: attemptView(open, mission), resumed: true }
      }
      const { attempt, replayed } = await store().createAttempt({
        userId: user.id, missionId, missionVersion: mission.version, organizationId, interventionId: intervention?.id || null,
        work: initialWork(mission), idempotencyKey: `start:${idempotencyKey}`, origin: normalisedOrigin,
      })
      if (attempt.missionId !== missionId || (attempt.organizationId || null) !== organizationId || !sameIntervention(attempt, intervention)) throw new ApiError('CONFLICT', 'This request was already used for another mission.')
      return { attempt: attemptView(attempt, mission), resumed: replayed }
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
      if (attempt.hintsUsed >= mission.scaffolding_policy.hints.length) return attemptView(attempt, mission)
      const out = await store().saveAttemptWork(attempt.id, { expectedVersion, hintsUsed: attempt.hintsUsed + 1 })
      if (out?.conflict) throw new ApiError('CONFLICT', 'This attempt changed. Reload to continue.')
      return attemptView(out.attempt, mission)
    },

    // Runs the §16.3 pipeline once; a repeated submit returns the stored result.
    async submit(user, workspace, attemptId) {
      const { attempt, mission } = await attemptFor(user, workspace, attemptId, { write: true })
      // A replay also completes a practice write that failed after evaluation
      // (units are unique per attempt + criterion, so this never duplicates).
      const settle = (a) => (a.evaluation ? store().appendPracticeUnits(practiceUnitsFrom({ evaluation: a.evaluation, mission, attempt: a })) : null)
      if (attempt.status !== 'IN_PROGRESS') { await settle(attempt); return { attempt: attemptView(attempt, mission), replayed: true } }
      const work = normaliseWork(mission, attempt.work)
      const evaluation = await evaluateMissionWork({ mission, work, evaluator, candidateName: user.name || null })
      const done = await store().completeAttempt(attempt.id, { status: evaluation.status, evaluation, submittedAt: clock().toISOString() })
      if (done.replayed) { await settle(done.attempt); return { attempt: attemptView(done.attempt, mission), replayed: true } }
      await settle(done.attempt)
      audit('development.mission.evaluated', null, {
        attemptId: attempt.id, missionId: mission.mission_id, missionVersion: mission.version, status: evaluation.status,
        demonstrated: evaluation.counts.demonstrated, uncertain: evaluation.counts.uncertain, total: evaluation.counts.total,
        evaluator: evaluation.evaluator.available ? evaluation.evaluator.promptVersion : evaluation.evaluator.reason, evidenceType: 'PRACTICE',
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
          status: a.status,
          origin: a.origin || { kind: 'GOAL' },
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
        recommended: recommended.map((m) => card(m, attempts, interventionFor.get(m.mission_id) || null)),
        catalogue: missions.map((m) => card(m, attempts, interventionFor.get(m.mission_id) || null)),
        completed: attempts.filter((a) => a.status !== 'IN_PROGRESS').slice(0, 20).map((a) => {
          const m = missions.find((x) => x.mission_id === a.missionId)
          return { attemptId: a.id, missionId: a.missionId, title: m?.title || null, status: a.status, summary: a.evaluation?.summary || null, submittedAt: a.submittedAt }
        }),
      }
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
