// Assessment Workspace V3 session API (spec §12, §32). A thin wrapper over the
// shared client (src/api/client.js is the only place that calls fetch); every
// call carries the active workspace header.
import { z } from 'zod'
import { request } from '../../../api/client.js'

const Message = z.object({ speaker: z.string(), role: z.string().nullable(), content: z.string(), isUser: z.boolean().optional() })

export const SessionContractSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['IN_PROGRESS', 'SCORING', 'SCORING_FAILED', 'COMPLETED']),
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
  artifacts: z.array(z.object({ artifactId: z.string(), type: z.string(), title: z.string().nullable(), data: z.unknown(), version: z.number().int().min(0), notes: z.string().optional() })),
  messages: z.array(Message),
  progress: z.object({ exchanges: z.number().int().min(0), requiredExchanges: z.number().int().min(0) }),
  integrityPolicy: z.string(),
  device: z.object({ requiresLargeScreen: z.boolean(), allowSmallScreen: z.boolean() }),
  timing: z.object({ serverTime: z.string(), startedAt: z.string().nullable(), deadlineAt: z.string().nullable(), remainingMs: z.number().nullable() }),
  reportPath: z.string().nullable(),
})

const StartSchema = z.object({ sessionId: z.string(), resumed: z.boolean(), to: z.string() })
const MessageResultSchema = z.object({ messages: z.array(Message), exchanges: z.number().int().min(0), replayed: z.boolean() })
const ArtifactResultSchema = z.object({ artifactId: z.string(), version: z.number().int().min(1), data: z.unknown(), notes: z.string().optional(), replayed: z.boolean() })
const FinishSchema = z.object({ state: z.enum(['COMPLETE', 'SCORING']) })

const path = (sessionId) => `/api/v1/assessment-sessions/${encodeURIComponent(sessionId)}`

export async function fetchAssessmentSession(sessionId) {
  const { data } = await request(path(sessionId), { schema: SessionContractSchema, defaultErrorMessage: 'Your assessment could not be loaded.' })
  return data
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
