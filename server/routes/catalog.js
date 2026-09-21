import { Router } from 'express'
import { isProduction } from '../lib/security.js'
import { query, isDbConfigured } from '../db/pool.js'
import logger from '../lib/logger.js'

const router = Router()

// Default approved developmental definitions for local dev / tests when DB is not spun up
const DEV_SEEDED_DEFINITIONS = [
  {
    assessment_definition_id: 'prism-sim-gbo-l1',
    id: 'prism-sim-gbo-l1',
    version: '1.0.0',
    job_family: 'STUDAI-JF-GBO',
    title: 'Graduate Business Operations Simulation',
    level: 'L1',
    status: 'active',
    duration: 35,
    duration_minutes: 35,
    format: 'Adaptive Workplace Simulation',
    validation_status: 'DEVELOPMENTAL',
    calibration_status: 'PENDING',
    is_calibrated: false,
    conformal_calibration_status: 'provisional_fallback',
    launch_path: '/briefing?family=STUDAI-JF-GBO',
    retake_policy: { cooldown_days: 30, max_attempts: 3 },
    scenario_set_version: 'v2026.1',
    competency_framework_version: 'cf_v2.0',
    constructs: [
      { key: 'CRITICAL_THINKING', title: 'Critical Thinking', description: 'Evidence synthesis and argument rigor' },
      { key: 'PROBLEM_SOLVING', title: 'Problem Solving', description: 'Structured breakdown under ambiguous operating conditions' },
      { key: 'COMMUNICATION', title: 'Professional Communication', description: 'Concise, clear, and audience-tailored discourse' },
      { key: 'COLLABORATION', title: 'Collaborative Behaviour', description: 'Cross-functional alignment and consensus building' },
      { key: 'AI_DIGITAL_FLUENCY', title: 'AI & Digital Fluency', description: 'Effective tool prompting, verification, and critical oversight' },
    ],
    hardware_requirements: {
      camera: 'required_for_presence',
      microphone: 'required_for_speech_response',
    },
  },
  {
    assessment_definition_id: 'prism-sim-cfg-l1',
    id: 'prism-sim-cfg-l1',
    version: '1.0.0',
    job_family: 'STUDAI-JF-CFG',
    title: 'Customer-Facing Growth Simulation',
    level: 'L1',
    status: 'active',
    duration: 35,
    duration_minutes: 35,
    format: 'Adaptive Workplace Simulation',
    validation_status: 'DEVELOPMENTAL',
    calibration_status: 'PENDING',
    is_calibrated: false,
    conformal_calibration_status: 'provisional_fallback',
    launch_path: '/briefing?family=STUDAI-JF-CFG',
    retake_policy: { cooldown_days: 30, max_attempts: 3 },
    scenario_set_version: 'v2026.1',
    competency_framework_version: 'cf_v2.0',
    constructs: [
      { key: 'CRITICAL_THINKING', title: 'Critical Thinking', description: 'Client data evaluation and causality analysis' },
      { key: 'PROBLEM_SOLVING', title: 'Problem Solving', description: 'Structured objection handling and solution framing' },
      { key: 'COMMUNICATION', title: 'Professional Communication', description: 'Persuasive executive clarity and negotiation posture' },
      { key: 'COLLABORATION', title: 'Collaborative Behaviour', description: 'Stakeholder discovery and cross-functional alignment' },
      { key: 'AI_DIGITAL_FLUENCY', title: 'AI & Digital Fluency', description: 'Workflow automation and CRM co-piloting' },
    ],
    hardware_requirements: {
      camera: 'required_for_presence',
      microphone: 'required_for_speech_response',
    },
  },
]

router.get('/', async (req, res) => {
  try {
    if (isDbConfigured()) {
      const result = await query(
        `SELECT assessment_definition_id, version, job_family, title, status, duration,
                validation_status, calibration_status, retake_policy, scenario_set_version,
                competency_framework_version, constructs, hardware_requirements
         FROM assessment_definitions
         WHERE status = 'active'
         ORDER BY job_family ASC`
      )
      if (result && result.rows && result.rows.length > 0) {
        const catalog = result.rows.map((row) => ({
          ...row,
          id: row.assessment_definition_id,
          is_calibrated: row.calibration_status === 'CALIBRATED',
          conformal_calibration_status: row.calibration_status === 'CALIBRATED' ? 'empirical' : 'provisional_fallback',
          launch_path: `/briefing?family=${encodeURIComponent(row.job_family)}`,
        }))
        return res.json({
          status: 'success',
          source: 'database',
          timestamp: new Date().toISOString(),
          catalog,
          count: catalog.length,
        })
      }
    }

    if (isProduction()) {
      logger.error('catalog_db_unavailable_in_production', {
        detail: 'Assessment catalog database is unconfigured or unavailable in production. Static fallback rejected (DEF-05).',
      })
      return res.status(503).json({
        error: 'CATALOG_TEMPORARILY_UNAVAILABLE',
        message: 'Assessment catalog is temporarily unavailable. Please try again shortly.',
      })
    }

    return res.json({
      status: 'success',
      source: 'local_development_seed',
      timestamp: new Date().toISOString(),
      catalog: DEV_SEEDED_DEFINITIONS,
      count: DEV_SEEDED_DEFINITIONS.length,
    })
  } catch (err) {
    logger.error('catalog_fetch_failed', { detail: err.message })
    if (isProduction()) {
      return res.status(503).json({
        error: 'CATALOG_TEMPORARILY_UNAVAILABLE',
        message: 'Assessment catalog is temporarily unavailable. Please try again shortly.',
      })
    }
    return res.json({
      status: 'success',
      source: 'local_development_seed',
      timestamp: new Date().toISOString(),
      catalog: DEV_SEEDED_DEFINITIONS,
      count: DEV_SEEDED_DEFINITIONS.length,
    })
  }
})

export default router
