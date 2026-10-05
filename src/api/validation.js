// V3 evidence double-rating, rater plane (/api/validation; C12.01). Raters
// use their study-runner token; nothing here reveals the candidate or the AI.
import { z } from 'zod'
import { request } from './client.js'

const Item = z.object({
  itemId: z.string(), capabilityId: z.string(), capabilityName: z.string().nullable(), sourceType: z.string(),
  excerpt: z.string(), candidateToken: z.string(), rubricVersion: z.string(), scale: z.array(z.number()),
  sourceMethod: z.object({
    behaviourId: z.string(), methodHash: z.string(), rubricHash: z.string(), anchors: z.record(z.string()),
    facts: z.array(z.string()), stimulus: z.array(z.object({ speaker: z.string(), content: z.string() })),
    workChanges: z.array(z.object({ rowId: z.string(), task: z.string(), field: z.string(), before: z.string().nullable(), after: z.string().nullable() })).optional().default([]),
  }).optional(),
}).nullable()

const opts = (token, extra = {}) => ({ legacy: true, auth: false, workspace: false, on401: 'none', headers: { 'x-rater-token': token }, ...extra })

export const RATER_TOKEN_KEY = 'prismRaterToken'

export const validationApi = {
  next: (token) => request('/api/validation/rater/next', opts(token, { schema: z.object({ item: Item }), defaultErrorMessage: 'The next item could not be loaded.' })).then((r) => r.data.item),
  rate: (token, itemId, body) => request(`/api/validation/rater/items/${encodeURIComponent(itemId)}`, opts(token, { method: 'POST', body, defaultErrorMessage: 'Your rating was not saved.' })).then((r) => r.data),
}
