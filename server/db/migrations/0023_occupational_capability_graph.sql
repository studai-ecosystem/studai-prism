-- 0023_occupational_capability_graph.sql — Prism Next Occupational Capability Graph (Phases 0-4)
-- Canonical harmonization of O*NET 28, ESCO 1.1, and NCO-2015 into StudAI Job Family Blueprints

-- 1. External Taxonomy Reference Table
CREATE TABLE IF NOT EXISTS occupational_external_refs (
  ref_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system VARCHAR(32) NOT NULL, -- 'ONET_28', 'ESCO_1_1', 'NCO_2015', 'NSQF'
  source_code VARCHAR(64) NOT NULL,
  title TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_external_ref UNIQUE (source_system, source_code)
);

-- 2. Canonical Occupations Table
CREATE TABLE IF NOT EXISTS occupational_nodes (
  occ_id VARCHAR(64) PRIMARY KEY, -- e.g. 'OCC-MKT-SPECIALIST'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  riasec_code VARCHAR(6) NOT NULL, -- e.g. 'EAS'
  soc_2018 VARCHAR(16),
  isco_08 VARCHAR(16),
  nco_2015 VARCHAR(16),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Job Families Table (Master Blueprints)
CREATE TABLE IF NOT EXISTS job_family_blueprints (
  job_family_id VARCHAR(64) PRIMARY KEY, -- e.g. 'STUDAI-JF-MKT-L1'
  name TEXT NOT NULL,
  version VARCHAR(16) NOT NULL,
  track VARCHAR(32) NOT NULL DEFAULT 'COMMERCIAL_GROWTH',
  level VARCHAR(16) NOT NULL DEFAULT 'ENTRY', -- 'ENTRY', 'MID', 'SENIOR'
  decision_use VARCHAR(32) NOT NULL DEFAULT 'DEVELOPMENTAL', -- 'DEVELOPMENTAL', 'PILOT', 'CERTIFIED'
  validation_status VARCHAR(32) NOT NULL DEFAULT 'CONTENT_REVIEW_PENDING',
  layer1_transferable_capabilities JSONB NOT NULL,
  layer2_role_capabilities JSONB NOT NULL,
  contextual_digital_capability JSONB,
  work_activities JSONB NOT NULL,
  occupational_mappings JSONB NOT NULL,
  riasec_profile JSONB NOT NULL,
  adjacent_families JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Work Activities & Tasks
CREATE TABLE IF NOT EXISTS occupational_work_activities (
  activity_id VARCHAR(64) PRIMARY KEY,
  title TEXT NOT NULL,
  onet_gwa_id VARCHAR(32),
  onet_dwa_id VARCHAR(32),
  esco_skill_uri TEXT,
  cognitive_tier INT NOT NULL DEFAULT 2 CHECK (cognitive_tier BETWEEN 1 AND 4),
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 5. Capabilities & Rubric Anchors
CREATE TABLE IF NOT EXISTS occupational_capabilities (
  capability_id VARCHAR(64) PRIMARY KEY,
  name TEXT NOT NULL,
  layer VARCHAR(8) NOT NULL CHECK (layer IN ('L1', 'L2', 'DIGITAL')),
  definition TEXT NOT NULL,
  sub_constructs JSONB NOT NULL DEFAULT '[]'::jsonb,
  rubric_anchors JSONB NOT NULL, -- Array of 5 level objects with behavioral descriptors
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Graph Edges Table (Explicit Poly-Hierarchy Relationships)
CREATE TABLE IF NOT EXISTS occupational_graph_edges (
  edge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_type VARCHAR(32) NOT NULL,
  source_node_id VARCHAR(64) NOT NULL,
  edge_type VARCHAR(48) NOT NULL,
  target_node_type VARCHAR(32) NOT NULL,
  target_node_id VARCHAR(64) NOT NULL,
  weight NUMERIC(4, 3) NOT NULL DEFAULT 1.000,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_graph_edge UNIQUE (source_node_type, source_node_id, edge_type, target_node_type, target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON occupational_graph_edges (source_node_type, source_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON occupational_graph_edges (target_node_type, target_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON occupational_graph_edges (edge_type);

-- ── SEED DATA: MARKETING REFERENCE IMPLEMENTATION (STUDAI-JF-MKT-L1) ─────────

-- External Taxonomy Refs
INSERT INTO occupational_external_refs (source_system, source_code, title, metadata) VALUES
('ONET_28', '13-1161.00', 'Market Research Analysts and Marketing Specialists', '{"category": "Business and Financial Operations"}'::jsonb),
('ESCO_1_1', '2431.1', 'Marketing Specialist', '{"isco": "2431"}'::jsonb),
('NCO_2015', '2431.0101', 'Advertising and Marketing Professional', '{"nsqf": 6}'::jsonb)
ON CONFLICT (source_system, source_code) DO NOTHING;

-- Canonical Occupation Node
INSERT INTO occupational_nodes (occ_id, title, description, riasec_code, soc_2018, isco_08, nco_2015) VALUES
('OCC-MKT-SPECIALIST', 'Growth & Digital Marketing Specialist', 'Researches market conditions, optimizes acquisition channels, and evaluates customer sentiment to drive adoption.', 'EAS', '13-1161.00', '2431', '2431.0101'),
('OCC-CSU-SPECIALIST', 'Customer Success Specialist', 'Manages client accounts, resolves operational escalations, and ensures retention and renewal.', 'SEC', '43-4051.00', '3339', '3339.0101'),
('OCC-OPS-SPECIALIST', 'Business Operations Analyst', 'Diagnoses process bottlenecks, models capacity, and standardizes cross-functional workflows.', 'CIE', '13-1111.00', '2422', '2422.0101')
ON CONFLICT (occ_id) DO NOTHING;

-- Job Family Blueprint: STUDAI-JF-MKT-L1
INSERT INTO job_family_blueprints (
  job_family_id,
  name,
  version,
  track,
  level,
  decision_use,
  validation_status,
  layer1_transferable_capabilities,
  layer2_role_capabilities,
  contextual_digital_capability,
  work_activities,
  occupational_mappings,
  riasec_profile,
  adjacent_families
) VALUES (
  'STUDAI-JF-MKT-L1',
  'Early Career Marketing & Growth',
  '1.0.0',
  'COMMERCIAL_GROWTH',
  'ENTRY',
  'DEVELOPMENTAL',
  'CONTENT_REVIEW_COMPLETE',
  '[
    {"capability_id": "CAP-L1-REASONING", "name": "Reasoning & Decision Quality", "weight": 0.20, "required_evidence_threshold": 2},
    {"capability_id": "CAP-L1-COMMUNICATION", "name": "Communication & Structure", "weight": 0.20, "required_evidence_threshold": 2},
    {"capability_id": "CAP-L1-COLLABORATION", "name": "Collaboration & Navigation", "weight": 0.15, "required_evidence_threshold": 1},
    {"capability_id": "CAP-L1-ADAPTABILITY", "name": "Adaptability & Learning", "weight": 0.15, "required_evidence_threshold": 1},
    {"capability_id": "CAP-L1-EXECUTION", "name": "Execution & Ownership", "weight": 0.15, "required_evidence_threshold": 1}
  ]'::jsonb,
  '[
    {"capability_id": "CAP-MKT-CUST-INSIGHT", "name": "Customer & Audience Insight", "weight": 0.20, "critical": true},
    {"capability_id": "CAP-MKT-POSITIONING", "name": "Positioning & Messaging Judgment", "weight": 0.20, "critical": true},
    {"capability_id": "CAP-MKT-EXPERIMENTATION", "name": "Marketing Experimentation", "weight": 0.20, "critical": true},
    {"capability_id": "CAP-MKT-CHANNEL-JUDGMENT", "name": "Channel & Distribution Judgment", "weight": 0.15, "critical": false},
    {"capability_id": "CAP-MKT-CAMPAIGN-ANALYTICS", "name": "Campaign Analytics", "weight": 0.15, "critical": false},
    {"capability_id": "CAP-MKT-BUDGET-JUDGMENT", "name": "Commercial / Budget Judgment", "weight": 0.10, "critical": false}
  ]'::jsonb,
  '{
    "active": true,
    "capability_id": "CAP-DIG-AI-MARKETING",
    "name": "AI-Assisted Marketing Judgment",
    "operationalization": "Evaluates prompt design, synthetic content critical review, and AI analytics hallucination detection in campaign planning.",
    "weight": 0.10
  }'::jsonb,
  '[
    "WA-ANALYZE-CAMPAIGN-PERFORMANCE",
    "WA-EVALUATE-CUSTOMER-FEEDBACK",
    "WA-FORMULATE-VALUE-PROPOSITION",
    "WA-DESIGN-AB-EXPERIMENT",
    "WA-ALLOCATE-CHANNEL-BUDGET"
  ]'::jsonb,
  '{
    "onet_soc": [{"code": "13-1161.00", "title": "Market Research Analysts and Marketing Specialists", "weight": 0.85}],
    "esco": [{"uri": "http://data.europa.eu/esco/occupation/2431.1", "title": "Marketing specialist"}],
    "nco_2015": [{"code": "2431.0101", "title": "Advertising and Marketing Professional", "nsqf_level": 6}]
  }'::jsonb,
  '{
    "primary": "ENTERPRISING",
    "secondary": "ARTISTIC",
    "tertiary": "INVESTIGATIVE",
    "composite_weights": {"E": 0.50, "A": 0.30, "I": 0.20, "S": 0.00, "C": 0.00, "R": 0.00}
  }'::jsonb,
  '[
    {"target_family_id": "STUDAI-JF-CSU-L1", "title": "Customer Success & Retention", "overlap_index": 0.65, "bridge_competency": "Customer Diagnosis & Value Communication"},
    {"target_family_id": "STUDAI-JF-PRD-L1", "title": "Product Operations", "overlap_index": 0.58, "bridge_competency": "User Insight & Feature Experimentation"},
    {"target_family_id": "STUDAI-JF-SLS-L1", "title": "Inside Sales & Business Development", "overlap_index": 0.52, "bridge_competency": "Positioning & Discovery Inquiry"}
  ]'::jsonb
) ON CONFLICT (job_family_id) DO UPDATE SET
  layer1_transferable_capabilities = EXCLUDED.layer1_transferable_capabilities,
  layer2_role_capabilities = EXCLUDED.layer2_role_capabilities,
  contextual_digital_capability = EXCLUDED.contextual_digital_capability,
  adjacent_families = EXCLUDED.adjacent_families,
  updated_at = NOW();

-- Also register Marketing in assessment_definitions so it renders in public catalog
INSERT INTO assessment_definitions (
  assessment_definition_id,
  version,
  job_family,
  title,
  status,
  duration,
  validation_status,
  calibration_status,
  retake_policy,
  scenario_set_version,
  competency_framework_version,
  constructs,
  hardware_requirements
) VALUES (
  'prism-sim-mkt-l1',
  '1.0.0',
  'STUDAI-JF-MKT-L1',
  'Early Career Marketing & Growth Simulation',
  'active',
  45,
  'DEVELOPMENTAL',
  'PROVISIONAL',
  '{"cooldown_days": 30, "max_attempts": 3}'::jsonb,
  'v2026.mkt.1',
  'cf_v2.0_two_layer',
  '[
    {"key": "REASONING_DECISION", "title": "Reasoning & Decision Quality", "layer": "L1"},
    {"key": "COMMUNICATION", "title": "Communication & Structure", "layer": "L1"},
    {"key": "COLLABORATION", "title": "Collaboration & Navigation", "layer": "L1"},
    {"key": "ADAPTABILITY", "title": "Adaptability & Learning", "layer": "L1"},
    {"key": "EXECUTION", "title": "Execution & Ownership", "layer": "L1"},
    {"key": "CUSTOMER_INSIGHT", "title": "Customer & Audience Insight", "layer": "L2"},
    {"key": "POSITIONING", "title": "Positioning & Messaging Judgment", "layer": "L2"},
    {"key": "EXPERIMENTATION", "title": "Marketing Experimentation", "layer": "L2"},
    {"key": "CHANNEL_JUDGMENT", "title": "Channel & Distribution Judgment", "layer": "L2"},
    {"key": "CAMPAIGN_ANALYTICS", "title": "Campaign Analytics", "layer": "L2"},
    {"key": "BUDGET_JUDGMENT", "title": "Commercial / Budget Judgment", "layer": "L2"},
    {"key": "AI_MARKETING", "title": "AI-Assisted Marketing Judgment", "layer": "DIGITAL"}
  ]'::jsonb,
  '{"camera":"required_for_presence","microphone":"required_for_speech_response"}'::jsonb
) ON CONFLICT (assessment_definition_id) DO UPDATE SET
  title = EXCLUDED.title,
  constructs = EXCLUDED.constructs,
  updated_at = NOW();

-- Graph Edges for Role Neighborhood
INSERT INTO occupational_graph_edges (source_node_type, source_node_id, edge_type, target_node_type, target_node_id, weight, properties) VALUES
('JobFamily', 'STUDAI-JF-MKT-L1', 'ADJACENT_TO_ROLE', 'JobFamily', 'STUDAI-JF-CSU-L1', 0.650, '{"bridge_competency": "Customer Diagnosis & Value Communication"}'::jsonb),
('JobFamily', 'STUDAI-JF-MKT-L1', 'ADJACENT_TO_ROLE', 'JobFamily', 'STUDAI-JF-PRD-L1', 0.580, '{"bridge_competency": "User Insight & Feature Experimentation"}'::jsonb),
('JobFamily', 'STUDAI-JF-MKT-L1', 'ADJACENT_TO_ROLE', 'JobFamily', 'STUDAI-JF-SLS-L1', 0.520, '{"bridge_competency": "Positioning & Discovery Inquiry"}'::jsonb)
ON CONFLICT (source_node_type, source_node_id, edge_type, target_node_type, target_node_id) DO NOTHING;
