import { isDbConfigured, query } from '../db/pool.js'
import { LAYER_1_TRANSFERABLE_CAPABILITIES, LAYER_2_MARKETING_CAPABILITIES, CONTEXTUAL_DIGITAL_CAPABILITIES } from './competencyModelV2.js'

// In-memory fallback dataset for deterministic standalone testing
const SEEDED_BLUEPRINTS = {
  'STUDAI-JF-MKT-L1': {
    job_family_id: 'STUDAI-JF-MKT-L1',
    name: 'Early Career Marketing & Growth',
    version: '1.0.0',
    track: 'COMMERCIAL_GROWTH',
    level: 'ENTRY',
    decision_use: 'DEVELOPMENTAL',
    validation_status: 'CONTENT_REVIEW_COMPLETE',
    layer1_transferable_capabilities: Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES),
    layer2_role_capabilities: Object.values(LAYER_2_MARKETING_CAPABILITIES),
    contextual_digital_capability: CONTEXTUAL_DIGITAL_CAPABILITIES['CAP-DIG-AI-MARKETING'],
    capability_weights: {
      'CAP-L1-REASONING': 0.15,
      'CAP-L1-COMMUNICATION': 0.15,
      'CAP-L1-COLLABORATION': 0.10,
      'CAP-L1-ADAPTABILITY': 0.10,
      'CAP-L1-EXECUTION': 0.10,
      'CAP-MKT-CUST-INSIGHT': 0.10,
      'CAP-MKT-POSITIONING': 0.10,
      'CAP-MKT-EXPERIMENTATION': 0.10,
      'CAP-MKT-CHANNEL-JUDGMENT': 0.05,
      'CAP-MKT-CAMPAIGN-ANALYTICS': 0.05,
      'CAP-MKT-BUDGET-JUDGMENT': 0.05,
      'CAP-DIG-AI-MARKETING': 0.05
    },
    work_activities: [
      'WA-ANALYZE-CAMPAIGN-PERFORMANCE',
      'WA-EVALUATE-CUSTOMER-FEEDBACK',
      'WA-FORMULATE-VALUE-PROPOSITION',
      'WA-DESIGN-AB-EXPERIMENT',
      'WA-ALLOCATE-CHANNEL-BUDGET'
    ],
    occupational_mappings: {
      onet_soc: [{ code: '13-1161.00', title: 'Market Research Analysts and Marketing Specialists', weight: 0.85 }],
      esco: [{ uri: 'http://data.europa.eu/esco/occupation/2431.1', title: 'Marketing specialist' }],
      nco_2015: [{ code: '2431.0101', title: 'Advertising and Marketing Professional', nsqf_level: 6 }]
    },
    riasec_profile: {
      primary: 'ENTERPRISING',
      secondary: 'ARTISTIC',
      tertiary: 'INVESTIGATIVE',
      composite_weights: { E: 0.50, A: 0.30, I: 0.20, S: 0.00, C: 0.00, R: 0.00 }
    },
    adjacent_families: [
      { target_family_id: 'STUDAI-JF-CSU-L1', title: 'Customer Success & Retention', overlap_index: 0.65, bridge_competency: 'Customer Diagnosis & Value Communication' },
      { target_family_id: 'STUDAI-JF-PRD-L1', title: 'Product Operations', overlap_index: 0.58, bridge_competency: 'User Insight & Feature Experimentation' },
      { target_family_id: 'STUDAI-JF-SLS-L1', title: 'Inside Sales & Business Development', overlap_index: 0.52, bridge_competency: 'Positioning & Discovery Inquiry' }
    ]
  },
  'STUDAI-JF-GBO': {
    job_family_id: 'STUDAI-JF-GBO',
    name: 'Graduate Business Operations',
    version: '1.0.0',
    track: 'OPERATIONAL_EXCELLENCE',
    level: 'ENTRY',
    decision_use: 'DEVELOPMENTAL',
    validation_status: 'DEVELOPMENTAL',
    layer1_transferable_capabilities: Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES),
    layer2_role_capabilities: [],
    adjacent_families: [
      { target_family_id: 'STUDAI-JF-FIN-L1', title: 'Financial Operations', overlap_index: 0.62, bridge_competency: 'Ledger Integrity & Reconciliation' },
      { target_family_id: 'STUDAI-JF-HRT-L1', title: 'People & Talent Operations', overlap_index: 0.55, bridge_competency: 'Workflow Standardization' }
    ]
  },
  'STUDAI-JF-CSU-L1': {
    job_family_id: 'STUDAI-JF-CSU-L1',
    name: 'Customer Success & Retention',
    version: '1.0.0',
    track: 'COMMERCIAL_GROWTH',
    level: 'ENTRY',
    decision_use: 'DEVELOPMENTAL',
    validation_status: 'DEVELOPMENTAL',
    layer1_transferable_capabilities: Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES),
    layer2_role_capabilities: [
      { capability_id: 'CAP-CSU-DIAGNOSIS', name: 'Diagnostic Inquiry', weight: 0.25 },
      { capability_id: 'CAP-CSU-DEESCALATION', name: 'Customer De-escalation', weight: 0.25 },
      { capability_id: 'CAP-CSU-EXPANSION', name: 'Expansion & Commercial Upsell', weight: 0.25 }
    ],
    adjacent_families: [
      { target_family_id: 'STUDAI-JF-MKT-L1', title: 'Marketing & Growth', overlap_index: 0.65, bridge_competency: 'Customer Insight & Communication' },
      { target_family_id: 'STUDAI-JF-PRD-L1', title: 'Product Operations', overlap_index: 0.61, bridge_competency: 'User Feedback Prioritization' }
    ]
  },
  'STUDAI-JF-SLS-L1': {
    job_family_id: 'STUDAI-JF-SLS-L1',
    name: 'Inside Sales & Business Development',
    version: '1.0.0',
    track: 'COMMERCIAL_GROWTH',
    level: 'ENTRY',
    decision_use: 'DEVELOPMENTAL',
    validation_status: 'DEVELOPMENTAL',
    layer1_transferable_capabilities: Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES),
    layer2_role_capabilities: [
      { capability_id: 'CAP-SLS-DISCOVERY', name: 'Discovery & Need Analysis', weight: 0.30 },
      { capability_id: 'CAP-SLS-OBJECTION', name: 'Objection Handling & Reframing', weight: 0.35 },
      { capability_id: 'CAP-SLS-PROPOSAL', name: 'Value Proposition Delivery', weight: 0.35 }
    ],
    riasec_profile: {
      primary: 'ENTERPRISING',
      secondary: 'SOCIAL',
      tertiary: 'CONVENTIONAL',
      composite_weights: { E: 0.60, S: 0.20, C: 0.10, A: 0.10, I: 0.00, R: 0.00 }
    },
    occupational_mappings: {
      onet_soc: [{ code: '41-3091.00', title: 'Sales Representatives of Services', weight: 0.88 }],
      esco: [{ uri: 'http://data.europa.eu/esco/occupation/2433.1', title: 'Sales representative' }],
      nco_2015: [{ code: '2433.0101', title: 'Commercial Sales Professional', nsqf_level: 6 }]
    },
    adjacent_families: [
      { target_family_id: 'STUDAI-JF-MKT-L1', title: 'Marketing & Growth', overlap_index: 0.58, bridge_competency: 'Market Positioning & Messaging' },
      { target_family_id: 'STUDAI-JF-CSU-L1', title: 'Customer Success & Retention', overlap_index: 0.64, bridge_competency: 'Client Communication & Relationship Management' }
    ]
  },
  'STUDAI-JF-PRD-L1': {
    job_family_id: 'STUDAI-JF-PRD-L1',
    name: 'Product Operations & Management Associate',
    version: '1.0.0',
    track: 'PRODUCT_INNOVATION',
    level: 'ENTRY',
    decision_use: 'DEVELOPMENTAL',
    validation_status: 'DEVELOPMENTAL',
    layer1_transferable_capabilities: Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES),
    layer2_role_capabilities: [
      { capability_id: 'CAP-PRD-USER-RESEARCH', name: 'User Inquiry & Synthesis', weight: 0.30 },
      { capability_id: 'CAP-PRD-METRICS', name: 'Product Analytics & Funnel Tracking', weight: 0.35 },
      { capability_id: 'CAP-PRD-PRIORITIZATION', name: 'Roadmap & Trade-off Framing', weight: 0.35 }
    ],
    riasec_profile: {
      primary: 'INVESTIGATIVE',
      secondary: 'ENTERPRISING',
      tertiary: 'CONVENTIONAL',
      composite_weights: { I: 0.40, E: 0.30, C: 0.20, A: 0.10, S: 0.00, R: 0.00 }
    },
    occupational_mappings: {
      onet_soc: [{ code: '15-1251.00', title: 'Computer Programmers & Product Specialists', weight: 0.80 }],
      esco: [{ uri: 'http://data.europa.eu/esco/occupation/2512.1', title: 'Software and product operations' }],
      nco_2015: [{ code: '2512.0101', title: 'Product Technology Associate', nsqf_level: 6 }]
    },
    adjacent_families: [
      { target_family_id: 'STUDAI-JF-MKT-L1', title: 'Marketing & Growth', overlap_index: 0.62, bridge_competency: 'Customer Segmentation & Value Proposition' },
      { target_family_id: 'STUDAI-JF-CSU-L1', title: 'Customer Success & Retention', overlap_index: 0.60, bridge_competency: 'Feedback Prioritization & Bug Triage' }
    ]
  },
  'STUDAI-JF-HRT-L1': {
    job_family_id: 'STUDAI-JF-HRT-L1',
    name: 'People Operations & Talent Intelligence',
    version: '1.0.0',
    track: 'ORGANIZATIONAL_DEVELOPMENT',
    level: 'ENTRY',
    decision_use: 'DEVELOPMENTAL',
    validation_status: 'DEVELOPMENTAL',
    layer1_transferable_capabilities: Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES),
    layer2_role_capabilities: [
      { capability_id: 'CAP-HRT-SCREENING', name: 'Talent Sourcing & Structured Screening', weight: 0.35 },
      { capability_id: 'CAP-HRT-DEESCALATION', name: 'Employee Relations & Conflict Resolution', weight: 0.35 },
      { capability_id: 'CAP-HRT-ONBOARDING', name: 'Onboarding SLA Governance', weight: 0.30 }
    ],
    riasec_profile: {
      primary: 'SOCIAL',
      secondary: 'ENTERPRISING',
      tertiary: 'CONVENTIONAL',
      composite_weights: { S: 0.50, E: 0.25, C: 0.15, A: 0.10, I: 0.00, R: 0.00 }
    },
    occupational_mappings: {
      onet_soc: [{ code: '13-1071.00', title: 'Human Resources Specialists', weight: 0.90 }],
      esco: [{ uri: 'http://data.europa.eu/esco/occupation/2423.1', title: 'Personnel and careers professional' }],
      nco_2015: [{ code: '2423.0101', title: 'Human Resource Specialist', nsqf_level: 6 }]
    },
    adjacent_families: [
      { target_family_id: 'STUDAI-JF-GBO', title: 'Graduate Business Operations', overlap_index: 0.55, bridge_competency: 'Process Standardization & Workflow SLA' },
      { target_family_id: 'STUDAI-JF-CSU-L1', title: 'Customer Success & Retention', overlap_index: 0.52, bridge_competency: 'Interpersonal Empathy & De-escalation' }
    ]
  },
  'STUDAI-JF-FIN-L1': {
    job_family_id: 'STUDAI-JF-FIN-L1',
    name: 'Financial Operations & Commercial Analysis',
    version: '1.0.0',
    track: 'FINANCIAL_INTELLIGENCE',
    level: 'ENTRY',
    decision_use: 'DEVELOPMENTAL',
    validation_status: 'DEVELOPMENTAL',
    layer1_transferable_capabilities: Object.values(LAYER_1_TRANSFERABLE_CAPABILITIES),
    layer2_role_capabilities: [
      { capability_id: 'CAP-FIN-VARIANCE', name: 'Budget Variance & Cost Reconciliation', weight: 0.40 },
      { capability_id: 'CAP-FIN-MODELING', name: 'Unit Economics & Margin Sensitivity Modeling', weight: 0.35 },
      { capability_id: 'CAP-FIN-AUDIT', name: 'Ledger Audit & Regulatory Adherence', weight: 0.25 }
    ],
    riasec_profile: {
      primary: 'CONVENTIONAL',
      secondary: 'INVESTIGATIVE',
      tertiary: 'ENTERPRISING',
      composite_weights: { C: 0.50, I: 0.30, E: 0.20, S: 0.00, A: 0.00, R: 0.00 }
    },
    occupational_mappings: {
      onet_soc: [{ code: '13-2051.00', title: 'Financial Analysts', weight: 0.92 }],
      esco: [{ uri: 'http://data.europa.eu/esco/occupation/2412.1', title: 'Financial analyst' }],
      nco_2015: [{ code: '2412.0101', title: 'Financial Operations Officer', nsqf_level: 6 }]
    },
    adjacent_families: [
      { target_family_id: 'STUDAI-JF-GBO', title: 'Graduate Business Operations', overlap_index: 0.62, bridge_competency: 'Ledger Integrity & Metric Reporting' },
      { target_family_id: 'STUDAI-JF-MKT-L1', title: 'Marketing & Growth', overlap_index: 0.50, bridge_competency: 'Unit Economics & ROI Computation' }
    ]
  }
}

export class OccupationalCapabilityGraph {
  async getJobFamilyBlueprint(jobFamilyId, version = 'latest') {
    if (isDbConfigured()) {
      try {
        const { getPool } = await import('./dbPg.js')
        const pool = getPool()
        const query = version === 'latest'
          ? `SELECT * FROM job_family_blueprints WHERE job_family_id = $1 ORDER BY version DESC LIMIT 1`
          : `SELECT * FROM job_family_blueprints WHERE job_family_id = $1 AND version = $2`
        const { rows } = await pool.query(query, [jobFamilyId, ...(version === 'latest' ? [] : [version])])
        if (rows[0]) return rows[0]
      } catch {
        // Fall back to memory
      }
    }
    return SEEDED_BLUEPRINTS[jobFamilyId] || null
  }

  async getAllJobFamilies() {
    if (isDbConfigured()) {
      try {
        const { getPool } = await import('./dbPg.js')
        const pool = getPool()
        const { rows } = await pool.query(`SELECT job_family_id, name, version, track, level, decision_use, validation_status, adjacent_families FROM job_family_blueprints ORDER BY name ASC`)
        if (rows.length > 0) return rows
      } catch {
        // Fall back to memory
      }
    }
    return Object.values(SEEDED_BLUEPRINTS).map(b => ({
      job_family_id: b.job_family_id,
      name: b.name,
      version: b.version,
      track: b.track,
      level: b.level,
      decision_use: b.decision_use,
      validation_status: b.validation_status,
      adjacent_families: b.adjacent_families || []
    }))
  }

  async findRoleNeighborhood(jobFamilyId, minOverlap = 0.40) {
    const blueprint = await this.getJobFamilyBlueprint(jobFamilyId)
    if (!blueprint) return []
    return (blueprint.adjacent_families || []).filter(a => a.overlap_index >= minOverlap)
  }

  async getCapabilityElicitationSpecs(capabilityId) {
    const all = {
      ...LAYER_1_TRANSFERABLE_CAPABILITIES,
      ...LAYER_2_MARKETING_CAPABILITIES,
      ...CONTEXTUAL_DIGITAL_CAPABILITIES
    }
    return all[capabilityId] || null
  }
}

export default new OccupationalCapabilityGraph()
