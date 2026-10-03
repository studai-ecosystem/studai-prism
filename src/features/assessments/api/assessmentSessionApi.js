// Assessment Workspace V3 session API (spec §12, §32). A thin wrapper over the
// shared client (src/api/client.js is the only place that calls fetch); every
// call carries the active workspace header.
import { z } from 'zod'
import { request } from '../../../api/client.js'

const Message = z.object({ speaker: z.string(), role: z.string().nullable(), content: z.string(), isUser: z.boolean().optional(), aiGenerated: z.boolean().optional(), actorKind: z.string().optional() })
// P4.6: task-stage strip (names and state only; never scores or coverage).
const StageStrip = z.array(z.object({ id: z.string(), label: z.string(), state: z.enum(['DONE', 'CURRENT', 'UPCOMING']) }))

export const SessionContractSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['ALLOCATED', 'IN_PROGRESS', 'SCORING', 'SCORING_FAILED', 'COMPLETED']),
  // T21: the session contract is always a FORMAL context; difficulty
  // calibration is a separate payload and never part of a universal run.
  purpose: z.enum(['FORMAL', 'CALIBRATION']).optional(),
  scope: z.enum(['PERSONAL', 'SPONSORED']),
  sponsorName: z.string().nullable(),
  assessment: z.object({ definitionId: z.string(), title: z.string() }),
  scenario: z.object({
    title: z.string(),
    context: z.string().nullable(),
    yourRole: z.string().nullable(),
    participants: z.array(z.object({ name: z.string(), role: z.string().nullable() })),
  }),
  jobFamilyId: z.string().nullable(),
  capabilities: z.array(z.object({ id: z.string(), name: z.string() })),
  artifacts: z.array(z.object({
    artifactId: z.string(), type: z.string(), title: z.string().nullable(), data: z.unknown(), version: z.number().int().min(0), notes: z.string().optional(),
    // P3.6: the choices a PLAN_BOARD accepts (server-validated lists).
    schema: z.object({ fields: z.array(z.string()), editable: z.array(z.string()), owners: z.array(z.string()), statuses: z.array(z.string()) }).optional(),
  })),
  messages: z.array(Message),
  progress: z.object({ exchanges: z.number().int().min(0), requiredExchanges: z.number().int().min(0) }),
  integrityPolicy: z.string(),
  device: z.object({ requiresLargeScreen: z.boolean(), allowSmallScreen: z.boolean() }),
  timing: z.object({
    serverTime: z.string().datetime(), startedAt: z.string().datetime().nullable(), deadlineAt: z.string().datetime().nullable(), remainingMs: z.number().nonnegative().nullable(),
    // P3.8 additive: server-authoritative begin/grace/policy; absent on legacy contracts.
    begun: z.boolean().optional(), graceDeadlineAt: z.string().datetime().nullable().optional(), policyVersion: z.string().nullable().optional(), policyDurationMs: z.number().nullable().optional(), policyStatus: z.string().nullable().optional(),
  }),
  reportPath: z.string().nullable(),
  // P4.6: task-stage strip (names and state only; never scores or coverage).
  stages: StageStrip.optional(),
  // P4.5/P4.7: counts-only coverage diagnostics, present once input is closed.
  coverage: z.object({
    planned: z.number().int().min(0), presented: z.number().int().min(0), answered: z.number().int().min(0), notPresented: z.number().int().min(0),
    stagesPlanned: z.number().int().min(0), stagesPresented: z.number().int().min(0),
    reasons: z.record(z.string(), z.number().int().min(0)), reviewRequired: z.boolean(), notes: z.array(z.string()),
  }).optional(),
  // P2.6: system-processing state, separate from any measurement outcome.
  processing: z.object({
    state: z.enum(['NONE', 'QUEUED', 'LEASED', 'DONE', 'FAILED']),
    resultState: z.string().nullable().optional(),
    retryable: z.boolean().optional(),
    acceptedActions: z.number().int().min(0).optional(),
  }).optional(),
})

const StartSchema = z.object({ sessionId: z.string(), resumed: z.boolean(), to: z.string() })
const MessageResultSchema = z.object({ messages: z.array(Message), exchanges: z.number().int().min(0), replayed: z.boolean(), stages: StageStrip.optional() })
const ArtifactResultSchema = z.object({ artifactId: z.string(), version: z.number().int().min(1), data: z.unknown(), notes: z.string().optional(), replayed: z.boolean() })
const FinishSchema = z.object({ state: z.enum(['COMPLETE', 'SCORING']) })
const BeginSchema = z.object({ startedAt: z.string().datetime(), deadlineAt: z.string().datetime(), graceDeadlineAt: z.string().datetime().nullable().optional(), policyVersion: z.string().nullable().optional(), replayed: z.boolean() })

const path = (sessionId) => `/api/v1/assessment-sessions/${encodeURIComponent(sessionId)}`

export async function fetchAssessmentSession(sessionId) {
  const { data } = await request(path(sessionId), { schema: SessionContractSchema, defaultErrorMessage: 'Your assessment could not be loaded.' })
  // Keep the network receipt with the snapshot, not React Query cache updates.
  return { ...data, clockReceivedAt: performance.now() }
}

export async function startAssignment(assignmentId, { consent, idempotencyKey }) {
  const { data } = await request(`/api/v1/assessment-assignments/${encodeURIComponent(assignmentId)}/start`, {
    method: 'POST',
    body: { consent },
    idempotencyKey,
    schema: StartSchema,
    defaultErrorMessage: 'Your assessment could not be started.',
  })
  return data
}

// Retried safely: the same clientEventId returns the original reply.
export async function sendSessionMessage(sessionId, { clientEventId, text }) {
  const { data } = await request(`${path(sessionId)}/messages`, {
    method: 'POST',
    body: { clientEventId, text },
    idempotencyKey: clientEventId,
    schema: MessageResultSchema,
    defaultErrorMessage: 'Your answer was not sent.',
  })
  return data
}

export async function saveSessionArtifact(sessionId, artifactId, { updates, notes, ifMatch, clientEventId }) {
  const { data } = await request(`${path(sessionId)}/artifacts/${encodeURIComponent(artifactId)}`, {
    method: 'PATCH',
    body: { updates, ...(typeof notes === 'string' ? { notes } : {}), ...(clientEventId ? { clientEventId } : {}) },
    ifMatch,
    ...(clientEventId ? { idempotencyKey: clientEventId } : {}),
    schema: ArtifactResultSchema,
    defaultErrorMessage: 'Your work was not saved.',
  })
  return data
}

export async function finishSession(sessionId, { early = false } = {}) {
  const { data } = await request(`${path(sessionId)}/finish`, {
    method: 'POST',
    body: early ? { early: true } : {},
    schema: FinishSchema,
    defaultErrorMessage: 'Your assessment could not be submitted.',
  })
  return data
}

// Begins the timed phase once; the same Idempotency-Key always returns the
// original server timestamps (P3.8). Never called by dismissing the intro.
export async function beginSession(sessionId, { idempotencyKey }) {
  const { data } = await request(`${path(sessionId)}/begin`, {
    method: 'POST',
    body: {},
    idempotencyKey,
    schema: BeginSchema,
    defaultErrorMessage: 'The assessment did not start.',
  })
  return data
}
