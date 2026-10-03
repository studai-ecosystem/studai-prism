// /api/admin/report-reviews — reviewer side of report interpretation review
// (P5.7, CH-29, T36). A learner's OPEN request is decided once; a CORRECT
// decision publishes a NEW report version without the withheld evidence and
// the original version stays byte-identical. Decisions are append-only.
//
//   GET  /             reports:review   OPEN cases (ids, category, learner's reason; no report content)
//   POST /:id/decide   reports:review   { decision: UPHOLD|CORRECT|REJECT, reason, correction?: { withholdEvidenceIds, note } }
import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { fail } from '../validation.js'
import { REVIEW_DECISIONS } from '../../domain/reports/v3/repository.js'
import { REVIEW_REASON_MAX, REVIEW_REASON_MIN } from '../../domain/reports/v3/service.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const Decide = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  reason: z.string().trim().min(REVIEW_REASON_MIN).max(REVIEW_REASON_MAX),
  correction: z.object({
    withholdEvidenceIds: z.array(z.string().min(1).max(128)).min(1).max(50),
    note: z.string().trim().max(REVIEW_REASON_MAX).optional().nullable(),
  }).strict().optional().nullable(),
}).strict()

let defaultCampus = null
async function defaultCtx() {
  if (!defaultCampus) {
    const { createDefaultCampusContext } = await import('../../domain/campusStore/defaultContext.js')
    defaultCampus = createDefaultCampusContext()
  }
  return defaultCampus
}

export function createReportReviewsAdminRouter({ campus = null, audit = adminAudit } = {}) {
  const router = Router()
  const ctx = async () => campus || defaultCtx()

  router.get('/', requirePermission('reports:review'), async (req, res) => {
    try { res.json(await (await ctx()).reports.listOpenReviews()) } catch (err) { fail(res, err, 'admin_report_reviews_list_failed', req) }
  })

  router.post('/:id/decide', requirePermission('reports:review'), async (req, res) => {
    try {
      if (!UUID.test(String(req.params.id))) return res.status(404).json({ error: 'Not found' })
      const parsed = Decide.safeParse(req.body || {})
      if (!parsed.success) return res.status(400).json({ error: 'A decision (UPHOLD, CORRECT or REJECT) and a specific reason are required; a correction names the evidence units to withhold.' })
      if (parsed.data.decision === 'CORRECT' && !parsed.data.correction) return res.status(400).json({ error: 'A correction names at least one evidence unit to withhold.' })
      const out = await (await ctx()).reports.decideReview({
        reviewer: { id: req.admin.id }, reviewId: req.params.id, decision: parsed.data.decision, reason: parsed.data.reason,
        correction: parsed.data.decision === 'CORRECT' ? parsed.data.correction : null, requestId: req.requestId,
      })
      await audit(req, {
        action: 'report_review_decided', entityType: 'report_review', entityId: req.params.id,
        after: { decision: out.decision.decision, publishedVersion: out.publishedVersion?.version ?? null }, reason: parsed.data.reason.slice(0, 500),
      })
      res.json({ ok: true, ...out })
    } catch (err) { fail(res, err, 'admin_report_review_decide_failed', req) }
  })

  return router
}

export default createReportReviewsAdminRouter()
