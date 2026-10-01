// server/routes/jobFamilies.js — Occupational Capability Graph & Blueprints API
import { Router } from 'express'
import occupationalGraph from '../lib/occupationalGraph.js'

const router = Router()

// GET /api/job-families — List all active job family blueprints
router.get('/', async (_req, res) => {
  try {
    const families = await occupationalGraph.getAllJobFamilies()
    res.json({ job_families: families })
  } catch (err) {
    res.status(500).json({ error: 'Could not retrieve job families', detail: err.message })
  }
})

// GET /api/job-families/:id — Get detailed blueprint specification
router.get('/:id', async (req, res) => {
  try {
    const blueprint = await occupationalGraph.getJobFamilyBlueprint(req.params.id)
    if (!blueprint) return res.status(404).json({ error: 'Job family blueprint not found' })
    const bp = {
      ...blueprint,
      capabilities: blueprint.layer2_role_capabilities || []
    }
    res.json({ blueprint: bp })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch blueprint', detail: err.message })
  }
})

// GET /api/job-families/:id/neighborhood — Get adjacent role families & mobility pathways
router.get('/:id/neighborhood', async (req, res) => {
  try {
    const minOverlap = parseFloat(req.query.minOverlap) || 0.40
    const neighborhood = await occupationalGraph.findRoleNeighborhood(req.params.id, minOverlap)
    res.json({
      job_family_id: req.params.id,
      adjacent_roles: neighborhood,
      edges: neighborhood
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute role neighborhood', detail: err.message })
  }
})

// POST /api/job-families/explore — explain roles from SELF-REPORTED interests
// and DEMONSTRATED capability evidence (spec §18). Nothing is assumed: no
// interests supplied → no interest reasons; no percentages or scores.
router.post('/explore', async (req, res) => {
  try {
    const { default: roleAffinityEngine, sanitizeInterests } = await import('../lib/roleAffinityEngine.js')
    const body = req.body || {}
    if (body.candidateInterests !== undefined && body.candidateInterests !== null && !sanitizeInterests(body.candidateInterests)) {
      return res.status(422).json({ error: 'Interest ratings must be numbers between 0 and 1.', code: 'VALIDATION_FAILED' })
    }
    const families = await occupationalGraph.getAllJobFamilies()
    const fullBlueprints = await Promise.all(
      families.map(f => occupationalGraph.getJobFamilyBlueprint(f.job_family_id))
    )
    // Capability evidence only comes from the server's own ledger, never
    // from the request body (a client cannot assert its own capabilities).
    const results = roleAffinityEngine.evaluateAffinity({
      candidateInterests: body.candidateInterests ?? null,
      capabilityProfile: {},
      blueprints: fullBlueprints.filter(Boolean)
    })
    res.json({
      success: true,
      basis: sanitizeInterests(body.candidateInterests) ? 'SELF_REPORTED_INTERESTS' : 'NONE',
      recommendations: results
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute role exploration' })
  }
})

export default router
