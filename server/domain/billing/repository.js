// Campus billing store (C11.01) — memory + Postgres adapters with the same
// interface: contracts, finance-only pricing (read-only here, K5), the
// append-only invoice export record, and the usage ledger read straight from
// the entitlement ledger (view campus_usage_ledger in Postgres).
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'
import { iso } from '../campusStore/pgUtil.js'

const pad = (n) => String(n).padStart(2, '0')
const date = (v) => (v == null ? null : (v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10)))
const PATCHABLE = ['status', 'entitlementId', 'activatedBy', 'activatedAt', 'endedBy', 'endedAt', 'endReason']

export function createBillingRepoMemory(db) {
  db.contracts ||= new Map()
  db.contractPricing ||= new Map()
  db.invoiceExports ||= []
  const now = () => db.clock().toISOString()
  return {
    async createContract(input) {
      const row = {
        id: db.id(), organizationId: input.organizationId, name: input.name, status: 'DRAFT',
        termStart: input.termStart, termEnd: input.termEnd, includedSeats: input.includedSeats, billableEvent: input.billableEvent,
        components: clone(input.components), entitlementId: null, createdBy: input.createdBy,
        activatedBy: null, activatedAt: null, endedBy: null, endedAt: null, endReason: null, createdAt: now(), updatedAt: now(),
      }
      db.contracts.set(row.id, row)
      return clone(row)
    },
    async getContract(id) {
      return clone(db.contracts.get(String(id)) || null)
    },
    async listContracts(organizationId) {
      return [...db.contracts.values()].filter((c) => c.organizationId === organizationId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(clone)
    },
    // Moves a contract from one of `fromStatuses` only (compare-and-set), so
    // two concurrent activations or cancellations cannot both apply.
    async transitionContract(id, fromStatuses, patch) {
      const row = db.contracts.get(String(id))
      if (!row || !fromStatuses.includes(row.status)) return null
      for (const k of PATCHABLE) if (k in patch) row[k] = patch[k]
      row.updatedAt = now()
      return clone(row)
    },
    async getPricing(contractId) {
      return clone(db.contractPricing.get(String(contractId)) || null)
    },
    async appendInvoiceExport(input) {
      const row = Object.freeze({ id: db.id(), ...input, createdAt: now() })
      db.invoiceExports.push(row)
      return clone(row)
    },
    async listInvoiceExports(organizationId) {
      return db.invoiceExports.filter((x) => x.organizationId === organizationId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(clone)
    },
    async usageEvents({ organizationId, entitlementIds = null, from = null, to = null }) {
      return db.consumptions
        .filter((c) => {
          const e = db.entitlements.get(c.entitlementId)
          if (!e || e.sourceType !== 'INSTITUTION_SPONSORSHIP' || e.organizationId !== organizationId) return false
          if (entitlementIds && !entitlementIds.includes(c.entitlementId)) return false
          return (!from || c.createdAt >= from) && (!to || c.createdAt <= to)
        })
        .map((c) => ({ entitlementId: c.entitlementId, sessionId: c.sessionId, event: c.event, createdAt: c.createdAt }))
    },
  }
}

export function createBillingRepoPg({ query }) {
  const contract = (r) => r && ({
    id: r.id, organizationId: r.organization_id, name: r.name, status: r.status, termStart: date(r.term_start), termEnd: date(r.term_end),
    includedSeats: r.included_seats, billableEvent: r.billable_event, components: r.components || {}, entitlementId: r.entitlement_id,
    createdBy: r.created_by, activatedBy: r.activated_by, activatedAt: iso(r.activated_at), endedBy: r.ended_by, endedAt: iso(r.ended_at),
    endReason: r.end_reason, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  })
  const num = (v) => (v == null ? null : Number(v))
  const cols = { status: 'status', entitlementId: 'entitlement_id', activatedBy: 'activated_by', activatedAt: 'activated_at', endedBy: 'ended_by', endedAt: 'ended_at', endReason: 'end_reason' }
  return {
    async createContract(input) {
      try {
        const { rows: [r] } = await query(
          `INSERT INTO campus_contracts (organization_id, name, status, term_start, term_end, included_seats, billable_event, components, created_by)
           VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7::jsonb, $8) RETURNING *`,
          [input.organizationId, input.name, input.termStart, input.termEnd, input.includedSeats, input.billableEvent, JSON.stringify(input.components), input.createdBy],
        )
        return contract(r)
      } catch (err) {
        if (err.code === '23514' || err.code === '22007' || err.code === '22008') throw new ApiError('VALIDATION_FAILED', 'Those contract details are not valid.')
        throw err
      }
    },
    async getContract(id) {
      const { rows: [r] } = await query('SELECT * FROM campus_contracts WHERE id = $1', [id])
      return contract(r) || null
    },
    async listContracts(organizationId) {
      const { rows } = await query('SELECT * FROM campus_contracts WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId])
      return rows.map(contract)
    },
    async transitionContract(id, fromStatuses, patch) {
      const sets = []
      const params = [id, fromStatuses]
      for (const [k, c] of Object.entries(cols)) {
        if (!(k in patch)) continue
        params.push(patch[k])
        sets.push(`${c} = $${params.length}`)
      }
      const { rows: [r] } = await query(
        `UPDATE campus_contracts SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND status = ANY($2) RETURNING *`,
        params,
      )
      return contract(r) || null
    },
    async getPricing(contractId) {
      const { rows: [r] } = await query('SELECT * FROM campus_contract_pricing WHERE contract_id = $1', [contractId])
      return r ? {
        contractId: r.contract_id, platformFee: num(r.platform_fee), perAssessmentRate: num(r.per_assessment_rate), reassessmentRate: num(r.reassessment_rate),
        currency: r.currency, approvedBy: r.approved_by, approvedAt: iso(r.approved_at),
      } : null
    },
    async appendInvoiceExport(input) {
      const { rows: [r] } = await query(
        `INSERT INTO invoice_exports (organization_id, contract_id, period_start, period_end, billable_event, billable_count, file_ref, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [input.organizationId, input.contractId, input.periodStart, input.periodEnd, input.billableEvent, input.billableCount, input.fileRef ?? null, input.createdBy],
      )
      return {
        id: r.id, organizationId: r.organization_id, contractId: r.contract_id, periodStart: date(r.period_start), periodEnd: date(r.period_end),
        billableEvent: r.billable_event, billableCount: r.billable_count, fileRef: r.file_ref, createdBy: r.created_by, createdAt: iso(r.created_at),
      }
    },
    async listInvoiceExports(organizationId) {
      const { rows } = await query('SELECT * FROM invoice_exports WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId])
      return rows.map((r) => ({
        id: r.id, organizationId: r.organization_id, contractId: r.contract_id, periodStart: date(r.period_start), periodEnd: date(r.period_end),
        billableEvent: r.billable_event, billableCount: r.billable_count, fileRef: r.file_ref, createdBy: r.created_by, createdAt: iso(r.created_at),
      }))
    },
    async usageEvents({ organizationId, entitlementIds = null, from = null, to = null }) {
      const where = ['organization_id = $1']
      const params = [organizationId]
      if (entitlementIds) { params.push(entitlementIds); where.push(`entitlement_id = ANY($${params.length}::uuid[])`) }
      if (from) { params.push(from); where.push(`created_at >= $${params.length}`) }
      if (to) { params.push(to); where.push(`created_at <= $${params.length}`) }
      const { rows } = await query(`SELECT * FROM campus_usage_ledger WHERE ${where.join(' AND ')} ORDER BY created_at ASC`, params)
      return rows.map((r) => ({ entitlementId: r.entitlement_id, sessionId: r.session_id, event: r.event, createdAt: iso(r.created_at) }))
    },
  }
}
