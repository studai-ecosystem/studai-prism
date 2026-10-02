// P8.3 free first experience — the only module that talks to /api/v1/preview.
// Public (no auth, no workspace) except the explicit claim after sign-in.
// The preview token is a scoped capability: it is kept in memory by the page
// and never placed in a URL, log or telemetry payload.
import { z } from 'zod'
import { request } from './client.js'

const ObservationSchema = z.object({
  kind: z.enum(['OBSERVED', 'NOT_FOUND']),
  mode: z.literal('PRACTICE'),
  methodVersion: z.string(),
  criterionId: z.string().nullable(),
  label: z.string(),
  why: z.string(),
  quote: z.string().nullable(),
  message: z.string().optional(),
  nextBehaviour: z.string(),
  disclaimer: z.string(),
})

export const SceneSchema = z.object({
  id: z.string(),
  mode: z.literal('PRACTICE'),
  contentStatus: z.string(),
  title: z.string(),
  briefing: z.object({
    facts: z.array(z.string()),
    participants: z.array(z.object({ name: z.string(), role: z.string() })),
    board: z.object({ title: z.string(), rows: z.array(z.object({ task: z.string(), owner: z.string().nullable(), due: z.string().nullable() })) }),
  }),
  prompt: z.string(),
  limits: z.object({ attempts: z.number().int(), maxAnswerChars: z.number().int() }),
  notice: z.string(),
})

export const AttemptSchema = z.object({
  previewToken: z.string(),
  expiresAt: z.string(),
  attemptsUsed: z.number().int(),
  attemptsRemaining: z.number().int(),
  observation: ObservationSchema,
  claimed: z.boolean(),
})

const ClaimSchema = z.object({ attemptId: z.string(), claimed: z.boolean(), alreadyClaimed: z.boolean(), observation: ObservationSchema })

const publicOpts = { auth: false, workspace: false, on401: 'throw' }

export const fetchPreviewScene = () => request('/api/v1/preview/scene', { ...publicOpts, schema: SceneSchema }).then((r) => r.data)

export const startPreview = (answer) => request('/api/v1/preview/attempts', {
  ...publicOpts, method: 'POST', body: { answer }, schema: AttemptSchema, defaultErrorMessage: 'We could not read your answer. Please try again.',
}).then((r) => r.data)

export const retryPreview = (previewToken, answer) => request('/api/v1/preview/attempts/retry', {
  ...publicOpts, method: 'POST', body: { previewToken, answer }, schema: AttemptSchema, defaultErrorMessage: 'We could not read your answer. Please try again.',
}).then((r) => r.data)

export const claimPreview = (previewToken) => request('/api/v1/preview/claim', {
  method: 'POST', workspace: false, body: { previewToken }, schema: ClaimSchema, defaultErrorMessage: 'We could not save this preview to your account.',
}).then((r) => r.data)
