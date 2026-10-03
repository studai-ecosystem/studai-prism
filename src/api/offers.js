// /api/payment/config — the offer as the SERVER can deliver it (P8.4/P8.6):
// configured amount (PROPOSED until finance approves), tax label, purchasability
// with named blockers, allowance, window, limits and the proposed policy.
// Public; nothing here is a secret. No tax rate is ever computed client-side.
import { z } from 'zod'
import { request } from './client.js'

const BlockerSchema = z.object({ code: z.string(), message: z.string() })
export const OfferSchema = z.object({
  code: z.string(),
  version: z.string(),
  title: z.string(),
  status: z.string(),
  purchasable: z.boolean(),
  priceStatus: z.string().optional(),
  availability: z.object({ purchasable: z.boolean(), priceStatus: z.string(), blockers: z.array(BlockerSchema) }).passthrough().nullable().optional(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  taxTreatment: z.string().nullable().optional(),
  taxLabel: z.string().nullable().optional(),
  testMode: z.boolean().optional(),
  windowDays: z.number().nullable(),
  included: z.record(z.any()).nullable(),
  limits: z.array(z.string()),
  policy: z.record(z.any()).nullable(),
  policyVersion: z.string().optional(),
})

const ConfigSchema = z.object({
  enabled: z.boolean().optional(),
  dummyMode: z.boolean().optional(),
  devSessionAvailable: z.boolean().optional(),
  offer: OfferSchema.nullable().optional(),
  offers: z.array(OfferSchema).optional(),
}).passthrough()

export const fetchOffers = () => request('/api/payment/config', { auth: false, workspace: false, on401: 'throw', schema: ConfigSchema, legacy: true }).then((r) => r.data)
