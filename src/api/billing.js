// Campus billing + integrations (/api/v1, spec §38, §50 P11). Seats and
// usage are counts from the sponsored-seat ledger; a price appears only when
// finance has approved it (otherwise pricing is null).
import { z } from 'zod'
import { request } from './client.js'

const nullableStr = z.string().nullable()
const Seats = z.object({ included: z.number(), inUse: z.number(), available: z.number() })
const Usage = z.object({ started: z.number(), billable: z.number(), released: z.number() })
const BillableEvent = z.enum(['ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED', 'REPORT_GENERATED'])
const Pricing = z.object({
  platformFee: z.number().nullable(), perAssessmentRate: z.number().nullable(), reassessmentRate: z.number().nullable(),
  currency: nullableStr, approvedAt: z.string(),
}).nullable()
const Contract = z.object({
  id: z.string(), name: z.string(), status: z.enum(['ACTIVE', 'ENDED', 'CANCELLED']), termStart: z.string(), termEnd: z.string(),
  billableEvent: BillableEvent, components: z.record(z.boolean()), seats: Seats, usage: Usage,
  pricingStatus: z.enum(['NOT_SET', 'AWAITING_APPROVAL', 'APPROVED']), pricing: Pricing,
})
const Summary = z.object({
  contracts: z.array(Contract),
  otherSponsorship: z.array(z.object({ id: z.string(), status: z.string(), validFrom: z.string(), validUntil: nullableStr, seats: Seats })),
  invoiceExports: z.array(z.object({ id: z.string(), contractId: z.string(), periodStart: z.string(), periodEnd: z.string(), billableCount: z.number(), createdAt: z.string() })),
  billableEventLabels: z.record(z.string()),
})
const UsageView = z.object({ months: z.array(Usage.extend({ period: z.string() })), totals: Usage, note: z.string() })
const Integrations = z.object({
  items: z.array(z.object({ id: z.string(), kind: z.enum(['ROSTER', 'SIGN_IN']), name: z.string(), status: z.enum(['AVAILABLE', 'CONNECTED', 'NOT_CONNECTED']) })),
  signIn: z.array(z.object({ id: z.string(), name: z.string() })),
})
const InvoiceExport = z.object({ fileName: z.string(), contentType: z.string(), csv: z.string(), export: z.object({ id: z.string(), billableCount: z.number() }) })

const base = (orgId) => `/api/v1/organizations/${encodeURIComponent(orgId)}`
const clean = (f = {}) => Object.fromEntries(Object.entries(f).filter(([, v]) => v))

export const billingApi = {
  summary: (orgId) => request(`${base(orgId)}/billing`, { schema: Summary, defaultErrorMessage: 'Billing could not be loaded.' }).then((r) => r.data),
  usage: (orgId, q) => request(`${base(orgId)}/billing/usage`, { query: clean(q), schema: UsageView, defaultErrorMessage: 'Usage could not be loaded.' }).then((r) => r.data),
  exportInvoice: (orgId, body) => request(`${base(orgId)}/billing/invoice-exports`, { method: 'POST', body, schema: InvoiceExport, defaultErrorMessage: 'The usage export could not be created.' }).then((r) => r.data),
  integrations: (orgId) => request(`${base(orgId)}/integrations`, { schema: Integrations, defaultErrorMessage: 'Integrations could not be loaded.' }).then((r) => r.data),
}
