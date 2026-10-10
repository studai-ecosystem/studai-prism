// /api/v1/integrations/hire/handoff — candidate-initiated evidence hand-off
// to StudAI Hire: INTERFACE ONLY (PROD-READY Phase 9; contract in
// docs/production/HIRE_HANDOFF_INTERFACE.md). Dark behind PRISM_EMPLOYER_LND
// (off → 404), and even when on it answers 501 until a human decision
// connects it (HA-025, with HA-005 and HA-004), like the SSO interface.
//   GET   /integrations/hire/handoff   signed-in: status NOT_CONFIGURED + the contract
//   POST  /integrations/hire/handoff   501 NOT_IMPLEMENTED
import { Router } from 'express'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ok } from '../../domain/http/errors.js'
import { requireFlag } from '../../domain/flags/index.js'
import { hireEvidenceHandoff } from '../../domain/integrations/hire/index.js'

export function createEvidenceHandoffRouter({ requireUser }) {
  const router = Router()
  router.use('/integrations/hire', requireFlag('PRISM_EMPLOYER_LND'))
  router.get('/integrations/hire/handoff', requireUser, asyncHandler(async (_req, res) => ok(res, hireEvidenceHandoff.describe())))
  router.post('/integrations/hire/handoff', requireUser, asyncHandler(async () => { hireEvidenceHandoff.begin() }))
  return router
}
