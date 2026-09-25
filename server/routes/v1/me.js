// GET /api/v1/me — the caller, client-visible flags, effective permissions and workspaces.
import { Router } from 'express'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ok } from '../../domain/http/errors.js'
import { clientFlags } from '../../domain/flags/index.js'
import { personalWorkspaceFor } from '../../domain/workspaces/personal.js'

export function createMeRouter({ requireUser, listWorkspaces }) {
  const router = Router()

  router.get('/me', requireUser, asyncHandler(async (req, res) => {
    const workspaces = listWorkspaces ? await listWorkspaces(req.user) : [personalWorkspaceFor(req.user)]
    return ok(res, {
      user: req.user,
      flags: clientFlags(),
      permissions: { global: [] },
      workspaces,
    })
  }))

  return router
}
