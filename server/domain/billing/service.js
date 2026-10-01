// Campus billing, contracts and integrations (spec §31.2, §38, §50 P11;
// C11.01–C11.04). Contracts are commercial configuration, never
// authorization: activating one mints a single INSTITUTION_SPONSORSHIP
// entitlement (id = contract id, seats = included seats, window = term,
// metadata = billable event) and the append-only ledger stays the only
// source of seats and usage.
//   - Billable event: ASSESSMENT_STARTED closes the seat when the engine
//     starts; ASSESSMENT_COMPLETED / REPORT_GENERATED close it when the
//     sponsored report exists (in V1 a sponsored assessment is completed when
//     its report is generated, so both count the same ledger event). The
//     billable count is always the CONSUMED ledger rows.
//   - Prices are never written by the application (K5, HA-C006) and are shown
//     to billing roles only once a human has approved them.
//   - Nothing here touches direct B2C payments (the ₹499 personal purchase).
import { ApiError } from '../http/errors.js'
import { can } from '../permissions/can.js'
import { csvCell } from '../campusAdmin/csv.js'
import { BILLABLE_EVENTS, DEFAULT_BILLABLE_EVENT } from '../entitlements/ledger.js'
import { listAuthProviders } from '../auth/providers/index.js'
import { listSisAdapters } from '../integrations/sis/index.js'

export { BILLABLE_EVENTS, DEFAULT_BILLABLE_EVENT }
export const CAMPUS_PRODUCT_CODE = 'PRISM_CAMPUS_ASSESSMENT'
// Configurable contract components (spec §38.2) — which parts a contract
// includes, never their amounts.
export const CONTRACT_COMPONENTS = Object.freeze(['platformFee', 'perCompletedAssessment', 'reassessment', 'reviewAllowance', 'customIntegrations', 'validationServices'])
export const BILLABLE_EVENT_LABELS = Object.freeze({
  ASSESSMENT_STARTED: 'Assessment started',
  ASSESSMENT_COMPLETED: 'Assessment completed',
  REPORT_GENERATED: 'Report generated',
})
const DAY = /^\d{4}-\d{2}-\d{2}$/
const validDay = (v) => typeof v === 'string' && DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
const startOf = (d) => `${d}T00:00:00.000Z`
const endOf = (d) => `${d}T23:59:59.999Z`

export function createBillingService({ repos, clock = () => new Date() }) {
  const billing = () => {
    if (!repos?.billing) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Billing is temporarily unavailable.')
    return repos.billing
  }

  function requireBilling(actor, organizationId) {
    if (!can(actor, 'billing.read', { organizationId }).allowed) throw new ApiError('NOT_FOUND', 'Not found')
  }

  async function activeOrg(organizationId) {
    const org = await repos.organizations.getOrganization(organizationId)
    if (!org || org.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', 'Not found')
    return org
  }

  // Only a human-approved price is ever visible (K5).
  async function approvedPricing(contractId) {
    const p = await billing().getPricing(contractId)
    if (!p || !p.approvedAt || !p.approvedBy) return { pricingStatus: p ? 'AWAITING_APPROVAL' : 'NOT_SET', pricing: null }
    return {
      pricingStatus: 'APPROVED',
      pricing: { platformFee: p.platformFee, perAssessmentRate: p.perAssessmentRate, reassessmentRate: p.reassessmentRate, currency: p.currency, approvedAt: p.approvedAt },
    }
  }

  const countEvents = (events) => ({
    started: events.filter((e) => e.event === 'RESERVED').length,
    billable: events.filter((e) => e.event === 'CONSUMED').length,
    released: events.filter((e) => e.event === 'RELEASED').length,
  })

  function validateContract(input) {
    const name = String(input.name || '').trim()
    if (!name || name.length > 160) throw new ApiError('VALIDATION_FAILED', 'Give the contract a name of up to 160 characters.')
    if (!validDay(input.termStart) || !validDay(input.termEnd) || input.termEnd < input.termStart) throw new ApiError('VALIDATION_FAILED', 'The term needs a start date and an end date on or after it.')
    if (!Number.isInteger(input.includedSeats) || input.includedSeats < 1 || input.includedSeats > 100000) throw new ApiError('VALIDATION_FAILED', 'Included seats must be a whole number from 1 to 100000.')
    const billableEvent = input.billableEvent || DEFAULT_BILLABLE_EVENT
    if (!BILLABLE_EVENTS.includes(billableEvent)) throw new ApiError('VALIDATION_FAILED', 'Choose when an assessment becomes billable.')
    const components = {}
    for (const [k, v] of Object.entries(input.components || {})) {
      if (!CONTRACT_COMPONENTS.includes(k) || typeof v !== 'boolean') throw new ApiError('VALIDATION_FAILED', 'Contract components are yes/no options only; amounts are set by finance.')
      components[k] = v
    }
    return { name, termStart: input.termStart, termEnd: input.termEnd, includedSeats: input.includedSeats, billableEvent, components }
  }

  const service = {
    // ── StudAI operations (admin console; admin RBAC + audit in the route) ──
    async createContract(organizationId, input, { adminId }) {
      await activeOrg(organizationId)
      const v = validateContract(input)
      return billing().createContract({ organizationId, ...v, createdBy: `admin:${adminId}` })
    },

    // DRAFT → ACTIVE, minting the sponsorship pool. Idempotent: activating an
    // ACTIVE contract replays it; a concurrent activation creates no second pool.
    async activateContract(contractId, { adminId }) {
      const c = await billing().getContract(contractId)
      if (!c) throw new ApiError('NOT_FOUND', 'Not found')
      if (c.status === 'ACTIVE') return { contract: c, entitlement: await service.livePool(c.entitlementId), replayed: true }
      if (c.status !== 'DRAFT') throw new ApiError('CONFLICT', 'Only a draft contract can be activated.')
      await activeOrg(c.organizationId)
      if (endOf(c.termEnd) <= clock().toISOString()) throw new ApiError('VALIDATION_FAILED', 'This contract term has already ended.')
      let entitlement = await repos.entitlements.getEntitlement(c.id)
      if (!entitlement) {
        try {
          // Minted SUSPENDED: it grants nothing until the contract is live.
          entitlement = await repos.entitlements.createEntitlement({
            id: c.id, organizationId: c.organizationId, sourceType: 'INSTITUTION_SPONSORSHIP', sourceReferenceId: `contract:${c.id}`,
            productCode: CAMPUS_PRODUCT_CODE, quantity: c.includedSeats, validFrom: startOf(c.termStart), validUntil: endOf(c.termEnd),
            status: 'SUSPENDED', metadata: { contractId: c.id, billableEvent: c.billableEvent },
          })
        } catch (err) {
          // A concurrent activation created the pool first (same id): use it.
          if (err?.code !== '23505' && err?.code !== 'CONFLICT') throw err
          entitlement = await repos.entitlements.getEntitlement(c.id)
        }
      }
      const next = await billing().transitionContract(c.id, ['DRAFT'], { status: 'ACTIVE', entitlementId: entitlement.id, activatedBy: `admin:${adminId}`, activatedAt: clock().toISOString() })
      if (!next) {
        const now = await billing().getContract(c.id)
        if (now?.status === 'ACTIVE') return { contract: now, entitlement: await service.livePool(c.id), replayed: true }
        // Cancelled while we minted the pool: it must never grant a seat.
        await repos.entitlements.setStatus(entitlement.id, 'REVOKED', ['SUSPENDED', 'ACTIVE'])
        throw new ApiError('CONFLICT', 'Only a draft contract can be activated.')
      }
      return { contract: next, entitlement: await service.livePool(c.id), replayed: false }
    },

    // SUSPENDED → ACTIVE only (a cancel that already revoked the pool wins).
    async livePool(entitlementId) {
      return (await repos.entitlements.setStatus(entitlementId, 'ACTIVE', ['SUSPENDED'])) || repos.entitlements.getEntitlement(entitlementId)
    },

    // DRAFT → CANCELLED; ACTIVE → ENDED or CANCELLED. The pool stops granting
    // new starts (EXPIRED / REVOKED); started assessments still finish and
    // settle on the ledger.
    async closeContract(contractId, { adminId, status, reason }) {
      if (!['ENDED', 'CANCELLED'].includes(status)) throw new ApiError('VALIDATION_FAILED', 'Choose to end or cancel the contract.')
      const c = await billing().getContract(contractId)
      if (!c) throw new ApiError('NOT_FOUND', 'Not found')
      const from = status === 'ENDED' ? ['ACTIVE'] : ['DRAFT', 'ACTIVE']
      const next = await billing().transitionContract(c.id, from, { status, endedBy: `admin:${adminId}`, endedAt: clock().toISOString(), endReason: String(reason).slice(0, 500) })
      if (!next) throw new ApiError('CONFLICT', status === 'ENDED' ? 'Only an active contract can be ended.' : 'This contract is already closed.')
      // Use the row the compare-and-set returned (an activation may have landed
      // since the first read) and any pool minted under the contract's id.
      const poolStatus = status === 'ENDED' ? 'EXPIRED' : 'REVOKED'
      for (const id of new Set([next.entitlementId, c.id].filter(Boolean))) {
        await repos.entitlements.setStatus(id, poolStatus, ['SUSPENDED', 'ACTIVE'])
      }
      return { before: c, after: next }
    },

    // Operations view of one organization (admin console).
    async organizationDetail(organizationId) {
      const org = await repos.organizations.getOrganization(organizationId)
      if (!org) throw new ApiError('NOT_FOUND', 'Not found')
      const memberships = await repos.campusAdmin.listOrgMemberships(organizationId)
      const byRole = {}
      for (const m of memberships) {
        byRole[m.role] ||= { ACTIVE: 0, INVITED: 0, SUSPENDED: 0, REMOVED: 0 }
        byRole[m.role][m.status] = (byRole[m.role][m.status] || 0) + 1
      }
      const pools = await repos.entitlements.listEntitlements({ organizationId, sourceTypes: ['INSTITUTION_SPONSORSHIP'] })
      const entitlements = []
      for (const e of pools) {
        entitlements.push({
          id: e.id, source: e.metadata?.contractId ? 'CONTRACT' : 'MANUAL', status: e.status, validFrom: e.validFrom, validUntil: e.validUntil,
          seats: { included: e.quantity, inUse: e.consumedQuantity, available: Math.max(0, e.quantity - e.consumedQuantity) },
          billableEvent: e.metadata?.billableEvent || DEFAULT_BILLABLE_EVENT,
          ledger: countEvents(await billing().usageEvents({ organizationId, entitlementIds: [e.id] })),
        })
      }
      return {
        organization: { id: org.id, name: org.name, slug: org.slug, organizationType: org.organizationType, status: org.status, createdAt: org.createdAt },
        memberships: { total: memberships.length, byRole },
        entitlements,
        contracts: await billing().listContracts(organizationId),
        invoiceExports: (await billing().listInvoiceExports(organizationId)).slice(0, 20),
      }
    },

    // ── Institution billing roles (/api/v1; billing.read) ──
    async summary(actor, organizationId) {
      requireBilling(actor, organizationId)
      const contracts = await billing().listContracts(organizationId)
      const pools = await repos.entitlements.listEntitlements({ organizationId, sourceTypes: ['INSTITUTION_SPONSORSHIP'] })
      const poolById = new Map(pools.map((p) => [p.id, p]))
      const items = []
      for (const c of contracts.filter((x) => x.status !== 'DRAFT')) {
        const pool = c.entitlementId ? poolById.get(c.entitlementId) : null
        items.push({
          id: c.id, name: c.name, status: c.status, termStart: c.termStart, termEnd: c.termEnd,
          billableEvent: c.billableEvent, components: c.components,
          seats: pool ? { included: pool.quantity, inUse: pool.consumedQuantity, available: pool.status === 'ACTIVE' ? Math.max(0, pool.quantity - pool.consumedQuantity) : 0 } : { included: c.includedSeats, inUse: 0, available: 0 },
          usage: countEvents(pool ? await billing().usageEvents({ organizationId, entitlementIds: [pool.id] }) : []),
          ...(await approvedPricing(c.id)),
        })
      }
      const linked = new Set(contracts.map((c) => c.entitlementId).filter(Boolean))
      const otherPools = pools.filter((p) => !linked.has(p.id)).map((p) => ({
        id: p.id, status: p.status, validFrom: p.validFrom, validUntil: p.validUntil,
        seats: { included: p.quantity, inUse: p.consumedQuantity, available: p.status === 'ACTIVE' ? Math.max(0, p.quantity - p.consumedQuantity) : 0 },
      }))
      const exportsList = (await billing().listInvoiceExports(organizationId)).slice(0, 20)
        .map((x) => ({ id: x.id, contractId: x.contractId, periodStart: x.periodStart, periodEnd: x.periodEnd, billableCount: x.billableCount, createdAt: x.createdAt }))
      return { contracts: items, otherSponsorship: otherPools, invoiceExports: exportsList, billableEventLabels: BILLABLE_EVENT_LABELS }
    },

    // Usage ledger by UTC month: started (seat reserved), billable (seat
    // consumed on the contract's billable event) and released (returned).
    async usage(actor, organizationId, { from = null, to = null, contractId = null } = {}) {
      requireBilling(actor, organizationId)
      let entitlementIds = null
      if (contractId) {
        const c = await billing().getContract(contractId)
        if (!c || c.organizationId !== organizationId) throw new ApiError('NOT_FOUND', 'Not found')
        entitlementIds = c.entitlementId ? [c.entitlementId] : []
      }
      if ((from && !validDay(from)) || (to && !validDay(to)) || (from && to && to < from)) throw new ApiError('VALIDATION_FAILED', 'Choose a valid date range.')
      const events = entitlementIds && entitlementIds.length === 0 ? [] : await billing().usageEvents({ organizationId, entitlementIds, from: from ? startOf(from) : null, to: to ? endOf(to) : null })
      const months = new Map()
      for (const e of events) {
        const period = String(e.createdAt).slice(0, 7)
        if (!months.has(period)) months.set(period, [])
        months.get(period).push(e)
      }
      return {
        months: [...months.keys()].sort().map((period) => ({ period, ...countEvents(months.get(period)) })),
        totals: countEvents(events),
        note: 'Counts come from the sponsored-seat ledger. Months are in UTC.',
      }
    },

    // Invoice integration point: an audited CSV of billable counts for one
    // contract and period (prices only when approved), recorded append-only.
    async exportInvoice(req, actor, organizationId, { contractId, periodStart, periodEnd }, { orgAudit }) {
      requireBilling(actor, organizationId)
      const c = await billing().getContract(contractId)
      if (!c || c.organizationId !== organizationId || c.status === 'DRAFT') throw new ApiError('NOT_FOUND', 'Not found')
      if (!validDay(periodStart) || !validDay(periodEnd) || periodEnd < periodStart) throw new ApiError('VALIDATION_FAILED', 'Choose a period with an end date on or after its start date.')
      if ((new Date(startOf(periodEnd)) - new Date(startOf(periodStart))) / 86_400_000 > 366) throw new ApiError('VALIDATION_FAILED', 'Export at most one year at a time.')
      const events = c.entitlementId ? await billing().usageEvents({ organizationId, entitlementIds: [c.entitlementId], from: startOf(periodStart), to: endOf(periodEnd) }) : []
      const billable = events.filter((e) => e.event === 'CONSUMED').length
      const pool = c.entitlementId ? await repos.entitlements.getEntitlement(c.entitlementId) : null
      const { pricing } = await approvedPricing(c.id)
      const rows = [
        ['Contract', 'Period start', 'Period end', 'Billable event', 'Billable assessments', 'Included seats', 'Seats in use'],
        [c.name, periodStart, periodEnd, BILLABLE_EVENT_LABELS[c.billableEvent], billable, c.includedSeats, pool ? pool.consumedQuantity : 0],
      ]
      if (pricing) rows.push([], ['Rate per billable assessment', 'Currency'], [pricing.perAssessmentRate ?? '', pricing.currency ?? ''])
      const footnote = ['Counts come from the sponsored-seat ledger (UTC). Prices appear only after finance approval.']
      const csv = [...rows, [], footnote].map((r) => r.map(csvCell).join(',')).join('\r\n')
      const record = await billing().appendInvoiceExport({ organizationId, contractId: c.id, periodStart, periodEnd, billableEvent: c.billableEvent, billableCount: billable, fileRef: null, createdBy: actor.userId })
      await orgAudit(req, organizationId, 'billing.invoice_exported', 'CONTRACT', c.id, { periodStart, periodEnd, billableCount: billable })
      return { fileName: `prism-usage-${periodStart}-to-${periodEnd}.csv`, contentType: 'text/csv', csv, export: { id: record.id, billableCount: billable } }
    },

    // Honest integration status: CSV roster import is available; no SIS or
    // SSO connection exists until one is configured (HA-C011).
    async integrations(actor, organizationId) {
      if (!can(actor, 'integrations.read', { organizationId }).allowed) throw new ApiError('NOT_FOUND', 'Not found')
      const sis = listSisAdapters()
      const sso = listAuthProviders().find((p) => p.kind === 'SSO')
      return {
        items: [
          ...sis.map((a) => ({ id: `sis-${a.id}`, kind: 'ROSTER', name: a.name, status: a.status })),
          { id: 'sis-direct', kind: 'ROSTER', name: 'Student information system', status: 'NOT_CONNECTED' },
          { id: 'sso', kind: 'SIGN_IN', name: sso?.name || 'Single sign-on', status: sso?.status === 'ENABLED' ? 'CONNECTED' : 'NOT_CONNECTED' },
        ],
        signIn: listAuthProviders().filter((p) => p.status === 'ENABLED').map((p) => ({ id: p.id, name: p.name })),
      }
    },
  }
  return service
}
