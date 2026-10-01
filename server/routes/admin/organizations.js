// /api/admin/organizations — campus operations for StudAI staff (Campus
// Phase 11, C11.05; spec §38, §50 P11). Existing admin RBAC + audit.
//
//   GET  /                         organizations:read  every organization
//   GET  /:orgId                   organizations:read  memberships (counts), sponsorship pools + ledger counts, contracts, invoice exports
//   POST /:orgId/contracts         contracts:manage    { ..., reason } create a DRAFT contract (no prices — K5, HA-C006)
//   POST /contracts/:id/activate   contracts:manage    { reason } mint the sponsorship pool (idempotent)
//   POST /contracts/:id/close      contracts:manage    { status: ENDED|CANCELLED, reason }
//
// No endpoint writes prices; no endpoint reads or changes direct B2C payments.

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let defaultCampus = null
async function defaultCtx() {
  if (!defaultCampus) {
    const { createDefaultCampusContext } = await import('../../domain/campusStore/defaultContext.js')
    defaultCampus = createDefaultCampusContext()
  }
  return defaultCampus
}

const fail = (res, err, msg, req) => {
  if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Not found.' })
  if (err?.code === 'VALIDATION_FAILED') return res.status(400).json({ error: err.message })
  if (err?.code === 'CONFLICT') return res.status(409).json({ error: err.message })
  if (err?.code === 'CAMPUS_STORE_UNAVAILABLE') return res.status(503).json({ error: 'The campus store is not available.' })
  logger.captureException(err, { msg, requestId: req.requestId })
  return res.status(500).json({ error: 'Internal server error' })
}
const reasonOf = (body) => {
  const r = String(body?.reason || '').trim()
  return r.length >= 10 ? r.slice(0, 500) : null
}

// `campus` and `audit` are injected by tests; the console uses the defaults.
export function createOrganizationsAdminRouter({ campus = null, audit = adminAudit } = {}) {
  const router = Router()
  const ctx = async () => campus || defaultCtx()

  router.get('/', requirePermission('organizations:read'), async (req, res) => {
    try {
      const c = await ctx()
      const orgs = await c.store.organizations.listOrganizations()
      const rows = []
      for (const o of orgs) {
        const contracts = await c.store.billing.listContracts(o.id)
        rows.push({ id: o.id, name: o.name, slug: o.slug, organizationType: o.organizationType, status: o.status, createdAt: o.createdAt, activeContracts: contracts.filter((x) => x.status === 'ACTIVE').length })
      }
      res.json({ rows, total: rows.length, page: 1, pageSize: Math.max(1, rows.length) })
    } catch (err) { fail(res, err, 'admin_organizations_list_failed', req) }
  })

  router.get('/:orgId', requirePermission('organizations:read'), async (req, res) => {
    try {
      if (!UUID.test(req.params.orgId)) return res.status(404).json({ error: 'Not found.' })
      res.json(await (await ctx()).billing.organizationDetail(req.params.orgId))
    } catch (err) { fail(res, err, 'admin_organization_detail_failed', req) }
  })

  router.post('/:orgId/contracts', requirePermission('contracts:manage'), async (req, res) => {
    try {
      if (!UUID.test(req.params.orgId)) return res.status(404).json({ error: 'Not found.' })
      const reason = reasonOf(req.body)
      if (!reason) return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required.' })
      const { name, termStart, termEnd, includedSeats, billableEvent, components } = req.body || {}
      const contract = await (await ctx()).billing.createContract(req.params.orgId, { name, termStart, termEnd, includedSeats, billableEvent, components }, { adminId: req.admin.id })
      await audit(req, {
        action: 'campus_contract_created', entityType: 'campus_contract', entityId: contract.id,
        after: { organizationId: contract.organizationId, status: contract.status, includedSeats: contract.includedSeats, billableEvent: contract.billableEvent, termStart: contract.termStart, termEnd: contract.termEnd },
        reason,
      })
      res.status(201).json({ ok: true, contract })
    } catch (err) { fail(res, err, 'admin_contract_create_failed', req) }
  })

  router.post('/contracts/:id/activate', requirePermission('contracts:manage'), async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found.' })
      const reason = reasonOf(req.body)
      if (!reason) return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required.' })
      const { contract, entitlement, replayed } = await (await ctx()).billing.activateContract(req.params.id, { adminId: req.admin.id })
      if (!replayed) {
        await audit(req, {
          action: 'campus_contract_activated', entityType: 'campus_contract', entityId: contract.id,
          before: { status: 'DRAFT' }, after: { status: contract.status, entitlementId: entitlement.id, seats: entitlement.quantity, billableEvent: contract.billableEvent },
          reason,
        })
      }
      res.json({ ok: true, contract, replayed })
    } catch (err) { fail(res, err, 'admin_contract_activate_failed', req) }
  })

  router.post('/contracts/:id/close', requirePermission('contracts:manage'), async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found.' })
      const reason = reasonOf(req.body)
      if (!reason) return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required.' })
      const { before, after } = await (await ctx()).billing.closeContract(req.params.id, { adminId: req.admin.id, status: req.body?.status, reason })
      await audit(req, {
        action: 'campus_contract_closed', entityType: 'campus_contract', entityId: after.id,
        before: { status: before.status }, after: { status: after.status }, reason,
      })
      res.json({ ok: true, contract: after })
    } catch (err) { fail(res, err, 'admin_contract_close_failed', req) }
  })

  return router
}

export default createOrganizationsAdminRouter()
