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

// POST /api/job-families/explore — Evaluate role affinity based on candidate RIASEC & work preferences
router.post('/explore', async (req, res) => {
  try {
    const { default: roleAffinityEngine } = await import('../lib/roleAffinityEngine.js')
    const { candidateInterests = { E: 0.5, A: 0.3, I: 0.2 }, capabilityProfile = {} } = req.body || {}
    const families = await occupationalGraph.getAllJobFamilies()
    const fullBlueprints = await Promise.all(
      families.map(f => occupationalGraph.getJobFamilyBlueprint(f.job_family_id))
    )
    const results = roleAffinityEngine.evaluateAffinity({
      candidateInterests,
      capabilityProfile,
      blueprints: fullBlueprints.filter(Boolean)
    })
    res.json({
      success: true,
      recommendations: results
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute role affinity', detail: err.message })
  }
})

export default router
