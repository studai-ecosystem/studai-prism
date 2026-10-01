// POST /api/v1/entitlements/check — can the caller start an assessment in the
// active workspace (X-Prism-Workspace)? Pure read: nothing is reserved.
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'

const Check = z.object({
  action: z.literal('assessment.start'),
  assessmentDefinitionId: z.string().trim().min(1).max(80).nullable().optional(),
}).strict()

export function createEntitlementsRouter({ requireUser, campus }) {
  const router = Router()
  router.post('/entitlements/check', requireUser, campus.resolveWorkspace, asyncHandler(async (req, res) => {
    const parsed = Check.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Invalid request.', { details: parsed.error.flatten() })
    const r = await campus.resolver.resolveEntitlement({
      user: req.user,
      workspace: req.workspace,
      action: parsed.data.action,
      assignment: parsed.data.assessmentDefinitionId ? { assessmentDefinitionId: parsed.data.assessmentDefinitionId } : null,
    })
    return ok(res, {
      allowed: r.allowed,
      reason: r.reason,
      source: r.source,
      consumptionRequired: r.consumptionRequired,
      expiresAt: r.expiresAt,
      scope: r.scope,
    })
  }))
  return router
}
