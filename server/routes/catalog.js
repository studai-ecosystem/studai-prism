import { Router } from 'express'

const router = Router()

/**
 * Dynamic Assessment Catalog API
 * Enables StudAI Career and StudAI Hire to dynamically discover calibrated
 * workplace simulations and active job families.
 */
router.get('/', (req, res) => {
  const catalog = [
    {
      id: 'prism-sim-bizops-l1',
      job_family: 'STUDAI-JF-BIZOPS-L1',
      title: 'Business Operations & Strategic Execution',
      level: 'L1',
      target_experience: 'Early Career (0-3 years)',
      duration_minutes: 30,
      format: 'Adaptive Workplace Simulation',
      status: 'active',
      is_calibrated: true,
      conformal_calibration_status: 'provisional_fallback', // switches to empirical when N >= 30
      launch_path: '/briefing?family=STUDAI-JF-BIZOPS-L1',
      constructs: [
        { key: 'CRITICAL_THINKING', title: 'Critical Thinking', description: 'Evidence synthesis and argument rigor' },
        { key: 'PROBLEM_SOLVING', title: 'Problem Solving', description: 'Hypothesis testing and structured breakdown' },
        { key: 'COMMUNICATION', title: 'Professional Communication', description: 'Clarity, conciseness, and stakeholder tailoring' },
        { key: 'COLLABORATION', title: 'Collaboration & Influence', description: 'Cross-functional alignment and consensus building' },
        { key: 'ADAPTABILITY', title: 'Adaptability & Learning', description: 'Pivot under ambiguity and feedback incorporation' },
      ],
      hardware_requirements: {
        camera: 'required_for_presence',
        microphone: 'required_for_speech_response',
        screen_sharing: 'optional',
      },
    },
    {
      id: 'prism-sim-growth-l1',
      job_family: 'STUDAI-JF-GROWTH-L1',
      title: 'Growth & Product Marketing Execution',
      level: 'L1',
      target_experience: 'Early Career (0-3 years)',
      duration_minutes: 30,
      format: 'Adaptive Workplace Simulation',
      status: 'active',
      is_calibrated: true,
      conformal_calibration_status: 'provisional_fallback',
      launch_path: '/briefing?family=STUDAI-JF-GROWTH-L1',
      constructs: [
        { key: 'CRITICAL_THINKING', title: 'Critical Thinking', description: 'Campaign data evaluation and causality analysis' },
        { key: 'COMMUNICATION', title: 'Copy & Narrative Craft', description: 'Audience resonance and messaging precision' },
        { key: 'ADAPTABILITY', title: 'Experimentation Agility', description: 'Rapid hypothesis iteration from metric feedback' },
      ],
      hardware_requirements: {
        camera: 'required_for_presence',
        microphone: 'required_for_speech_response',
      },
    },
  ]

  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    catalog,
    count: catalog.length,
  })
})

export default router
