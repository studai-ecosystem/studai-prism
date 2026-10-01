// /api/v1 campus billing + integrations (spec §31.2, §38, §50 P11; C11.03,
// C11.04). Dark with the campus (PRISM_CAMPUS_ENABLED). Institution billing
// roles read seats, usage and approved prices only; contracts are created and
// activated by StudAI operations in the admin console (/api/admin/organizations).
//   GET  /organizations/:orgId/billing                  billing.read
//   GET  /organizations/:orgId/billing/usage            billing.read   ?from=&to=&contractId=
//   POST /organizations/:orgId/billing/invoice-exports  billing.read   (audited, append-only record)
//   GET  /organizations/:orgId/integrations             integrations.read
//   POST /auth/sso/start                                501 NOT_IMPLEMENTED (interface only; HA-C011)
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { ssoProvider } from '../../domain/auth/providers/index.js'

const ORG_ID = /^[0-9a-f-]{36}$/i
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const UsageQuery = z.object({ from: day.optional(), to: day.optional(), contractId: uuid.optional() }).strict()
const InvoiceBody = z.object({ contractId: uuid, periodStart: day, periodEnd: day }).strict()

export function createBillingRouter({ requireUser, campus }) {
  const router = Router()
  const { requireCampus, requireOrgPermission } = campus
  for (const p of ['/organizations/:orgId/billing', '/organizations/:orgId/integrations']) {
    router.use(p, (req, _res, next) => (ORG_ID.test(req.params.orgId) ? next() : next(new ApiError('NOT_FOUND', 'Not found'))))
  }
  const gate = (perm) => [requireCampus, requireUser, requireOrgPermission(perm)]
  const svc = () => campus.billing
  const parse = (schema, value, message) => {
    const r = schema.safeParse(value ?? {})
    if (!r.success) throw new ApiError('VALIDATION_FAILED', message, { details: r.error.flatten() })
    return r.data
  }

  router.get('/organizations/:orgId/billing', ...gate('billing.read'), asyncHandler(async (req, res) => ok(res, await svc().summary(req.actor, req.params.orgId))))
  router.get('/organizations/:orgId/billing/usage', ...gate('billing.read'), asyncHandler(async (req, res) => (
    ok(res, await svc().usage(req.actor, req.params.orgId, parse(UsageQuery, req.query, 'Choose a valid date range.')))
  )))
  router.post('/organizations/:orgId/billing/invoice-exports', ...gate('billing.read'), asyncHandler(async (req, res) => {
    const body = parse(InvoiceBody, req.body, 'Choose a contract and a period to export.')
    return ok(res, await svc().exportInvoice(req, req.actor, req.params.orgId, body, { orgAudit: campus.admin.orgAudit }))
  }))
  router.get('/organizations/:orgId/integrations', ...gate('integrations.read'), asyncHandler(async (req, res) => ok(res, await svc().integrations(req.actor, req.params.orgId))))
  router.post('/auth/sso/start', requireCampus, asyncHandler(async () => { ssoProvider.begin() }))

  return router
}
