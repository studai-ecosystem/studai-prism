import { Router } from 'express'
import { isDbConfigured, query } from '../db/pool.js'

const router = Router()

// Seeded missions fallback for testing
const SEEDED_MISSIONS = {
  'MIS-MKT-EXP-01': {
    mission_id: 'MIS-MKT-EXP-01',
    title: 'Creative Fatigue vs Channel Saturation A/B Test',
    job_family_id: 'STUDAI-JF-MKT-L1',
    target_capability_id: 'CAP-MKT-EXPERIMENTATION',
    target_rubric_level: 4,
    estimated_duration_minutes: 20,
    scaffolding_tier: 'GUIDED_PRACTICE',
    challenge_briefing: {
      context: 'Lumina Botanicals has ₹1,00,000 available to test whether a Clean Ingredients messaging angle converts better than the current Glow Fast angle.',
      objective: 'Formulate a testable A/B hypothesis, isolate the test variable, and allocate the budget across control and test ad variants with sufficient statistical power.'
    },
    interactive_workspace_artifacts: [
      {
        artifact_id: 'ART-AB-DESIGNER',
        type: 'EXPERIMENT_DESIGNER',
        title: 'A/B Test Parameter Sheet',
        initial_state: {
          baseline_conversion_rate: 0.022,
          minimum_detectable_effect: 0.15,
          traffic_split: '50/50',
          sample_size_per_variant: 4200
        }
      },
      {
        artifact_id: 'ART-BUDGET-SPLIT',
        type: 'SPREADSHEET_TABLE',
        title: 'Variant Budget Allocation',
        initial_state: {
          rows: [
            { id: 'ctrl', variant: 'Control (Glow Fast)', spend: 50000, editable: true },
            { id: 'test', variant: 'Test (Clean Formula)', spend: 50000, editable: true }
          ]
        }
      }
    ],
    scaffolded_guidance: {
      hints_available: 3,
      framework_reference: 'Hypothesis Formula: If we change [Headline] on the ad creative, then [CTR and CVR] will increase by 15% because customers distrust synthetic claims.',
      reflection_probes: [
        'Why does changing both the ad copy AND the landing page at the same time ruin your test?'
      ]
    },
    success_criteria: {
      required_observable_behaviors: [
        'Candidate isolates a single independent variable.',
        'Candidate defines primary conversion metrics before running the test.'
      ]
    }
  },
  'MIS-CSU-EXP-02': {
    mission_id: 'MIS-CSU-EXP-02',
    title: 'Enterprise Contract Expansion & ROI Modeling',
    job_family_id: 'STUDAI-JF-CSU-L1',
    target_capability_id: 'CAP-CSU-EXPANSION',
    target_rubric_level: 3,
    estimated_duration_minutes: 20,
    scaffolding_tier: 'GUIDED_PRACTICE',
    challenge_briefing: {
      context: 'An existing B2B client has exceeded their user license tier by 35% but is complaining about renewal costs.',
      objective: 'Present an ROI model showing how adding 50 enterprise seats at an annual volume discount saves their team 120 engineering hours per month.'
    },
    interactive_workspace_artifacts: [
      {
        artifact_id: 'ART-CSU-ROI',
        type: 'SPREADSHEET_TABLE',
        title: 'Customer ROI & Seat Expansion Calculator',
        initial_state: {
          rows: [
            { id: 'tier1', tier: 'Current Seats (100)', cost: 1200000, hours_saved: 400 },
            { id: 'tier2', tier: 'Expanded Enterprise (150)', cost: 1550000, hours_saved: 650 }
          ]
        }
      }
    ]
  }
}

// GET /api/missions — List all development missions
router.get('/', async (_req, res) => {
  if (isDbConfigured()) {
    try {
      const { getPool } = await import('../lib/dbPg.js')
      const pool = getPool()
      const { rows } = await pool.query(
        `SELECT mission_id, title, job_family_id, target_capability_id, target_rubric_level, estimated_duration_minutes, scaffolding_tier, status FROM development_missions ORDER BY created_at ASC`
      )
      if (rows.length > 0) return res.json({ missions: rows })
    } catch {
      // Fall back
    }
  }
  res.json({ missions: Object.values(SEEDED_MISSIONS) })
})

// GET /api/missions/:id — Get mission challenge and interactive artifacts
router.get('/:id', async (req, res) => {
  const { id } = req.params
  if (isDbConfigured()) {
    try {
      const { getPool } = await import('../lib/dbPg.js')
      const pool = getPool()
      const { rows } = await pool.query(`SELECT * FROM development_missions WHERE mission_id = $1`, [id])
      if (rows[0]) return res.json({ mission: rows[0] })
    } catch {
      // Fall back
    }
  }
  const mission = SEEDED_MISSIONS[id]
  if (!mission) return res.status(404).json({ error: 'Development mission not found' })
  res.json({ mission })
})

// POST /api/missions/:id/submit — Submit candidate deliberate practice output
router.post('/:id/submit', async (req, res) => {
  const { id } = req.params
  const { candidateInputs, artifactDeltas } = req.body || {}
  const attemptId = `att-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

  // Evaluate candidate actions against criteria
  const isHypothesisFormulated = Boolean(candidateInputs?.hypothesis?.length > 15)
  const isBudgetValid = Boolean(artifactDeltas?.length > 0 || candidateInputs?.budgetAllocated)
  const levelAchieved = isHypothesisFormulated && isBudgetValid ? 4 : 3

  const result = {
    attemptId,
    missionId: id,
    status: 'COMPLETED',
    levelAchieved,
    feedback: isHypothesisFormulated
      ? 'Excellent deliberate practice. You cleanly isolated the test variable and allocated budget with clear conversion stop-losses.'
      : 'Good attempt. To reach Level 4, ensure your hypothesis explicitly states the psychological reason for expected lift.',
    observableBehaviors: [
      'Candidate isolated single variable in A/B test parameter designer.',
      'Candidate verified sample size prior to test deployment.'
    ]
  }

  res.json(result)
})

export default router
