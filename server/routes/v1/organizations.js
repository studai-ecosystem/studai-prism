// /api/v1/organizations/:orgId/* — campus organization routes (spec §19, §29, §36).
// Every route: campus flag (404 when off) → campus store (503 when absent) →
// signed-in user → organization permission via can() (404 when denied).
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { INVITABLE_ROLES } from '../../domain/permissions/roles.js'
import { permissionsForRole } from '../../domain/permissions/matrix.js'

const ORG_ID = /^[0-9a-f-]{36}$/i
const CreateInvites = z.object({
  role: z.enum(INVITABLE_ROLES),
  emails: z.array(z.string().trim().toLowerCase().email().max(254)).min(1).max(200),
  cohortId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
}).strict()

export function createOrganizationsRouter({ requireUser, campus }) {
  const router = Router()
  const { requireCampus, requireOrgPermission } = campus

  router.use('/organizations', requireCampus, requireUser)
  router.param('orgId', (_req, _res, next, orgId) => (ORG_ID.test(orgId) ? next() : next(new ApiError('NOT_FOUND', 'Not found'))))

  // Organization summary + the caller's effective permissions (UI visibility only).
  router.get('/organizations/:orgId', requireOrgPermission('org.overview.read'), asyncHandler(async (req, res) => {
    const org = await campus.repos.organizations.getOrganization(req.params.orgId)
    if (!org || org.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', 'Not found')
    const mine = req.actor.memberships.filter((m) => m.organizationId === org.id && m.status === 'ACTIVE')
    return ok(res, {
      id: org.id,
      name: org.name,
      organizationType: org.organizationType,
      roles: mine.map((m) => m.role),
      permissions: [...new Set(mine.flatMap((m) => permissionsForRole(m.role, m.scope)))],
    })
  }))

  // Invite staff or students. The response never contains tokens.
  router.post('/organizations/:orgId/invites', requireOrgPermission('org.overview.read'), asyncHandler(async (req, res) => {
    const parsed = CreateInvites.safeParse(req.body)
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Check the invitation details.', { details: parsed.error.flatten() })
    const invites = await campus.invites.createInvites({
      actor: req.actor, orgId: req.params.orgId, role: parsed.data.role, emails: parsed.data.emails,
      cohortId: parsed.data.cohortId || null, departmentId: parsed.data.departmentId || null,
    })
    return ok(res, invites, 201)
  }))

  // One sponsored session, for an authorized reader of this organization.
  // Personal sessions, other organizations' sessions and out-of-scope students
  // are all 404. Every allowed read is audited before data is returned.
  router.get('/organizations/:orgId/sessions/:sessionId', requireOrgPermission('org.overview.read'), asyncHandler(async (req, res) => {
    const sessionId = String(req.params.sessionId).slice(0, 80)
    const access = await campus.sessionScopes.authorizeSponsorRead({ actor: req.actor, organizationId: req.params.orgId, sessionId })
    if (!access) throw new ApiError('NOT_FOUND', 'Not found')
    await campus.dataAccess.record({
      req, organizationId: req.params.orgId, subjectUserId: access.scope.ownerUserId,
      resourceType: 'ASSESSMENT_SESSION', resourceId: sessionId, action: 'READ', purpose: access.via,
    })
    const { scope } = access
    return ok(res, {
      sessionId,
      ownerUserId: scope.ownerUserId,
      sponsorOrganizationId: scope.sponsorOrganizationId,
      cohortId: scope.cohortId,
      programId: scope.programId,
      visibilityPolicy: scope.visibilityPolicy,
      access: access.via,
    })
  }))

  return router
}
