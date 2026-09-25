// /api/v1/workspaces — the caller's workspaces (spec §4.2, §7.2).
//   GET  /workspaces               PERSONAL + campus workspaces from ACTIVE memberships
//   POST /workspaces/:id/activate  validates access; returns permissions + entitlement summary
import { Router } from 'express'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok, list } from '../../domain/http/errors.js'

const ID = /^(personal|[0-9a-f-]{36})$/i

export function createWorkspacesRouter({ requireUser, campus }) {
  const router = Router()

  router.get('/workspaces', requireUser, asyncHandler(async (req, res) => {
    const workspaces = await campus.workspaceService.listWorkspaces(req.user)
    return list(res, workspaces, { limit: workspaces.length })
  }))

  router.post('/workspaces/:id/activate', requireUser, asyncHandler(async (req, res) => {
    if (!ID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    const workspace = await campus.workspaceService.getWorkspace(req.user, req.params.id)
    if (!workspace) throw new ApiError('NOT_FOUND', 'Not found')
    const entitlement = workspace.type === 'CAMPUS_ADMIN'
      ? null
      : await campus.resolver.resolveEntitlement({ user: req.user, workspace, action: 'assessment.start' })
    return ok(res, {
      workspace,
      permissions: workspace.permissions,
      entitlements: entitlement && {
        canStartAssessment: entitlement.allowed,
        reason: entitlement.reason,
        source: entitlement.source,
        expiresAt: entitlement.expiresAt,
      },
    })
  }))

  return router
}
