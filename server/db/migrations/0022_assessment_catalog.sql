-- 0022_assessment_catalog.sql — Assessment Catalog & Definitions (DEF-05)
-- Authoritative, versioned catalog table for Prism workplace simulations.

CREATE TABLE IF NOT EXISTS assessment_definitions (
  assessment_definition_id     TEXT PRIMARY KEY,
  version                      TEXT NOT NULL DEFAULT '1.0.0',
  job_family                   TEXT NOT NULL,
  title                        TEXT NOT NULL,
  status                       TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('draft', 'active', 'deprecated', 'archived')),
  duration                     INTEGER NOT NULL DEFAULT 35,
  validation_status            TEXT NOT NULL DEFAULT 'DEVELOPMENTAL'
                               CHECK (validation_status IN ('DEVELOPMENTAL', 'VALIDATED', 'DEPRECATED')),
  calibration_status           TEXT NOT NULL DEFAULT 'PENDING'
                               CHECK (calibration_status IN ('PENDING', 'CALIBRATED', 'PROVISIONAL')),
  retake_policy                JSONB NOT NULL DEFAULT '{"cooldown_days": 30, "max_attempts": 3}'::jsonb,
  scenario_set_version         TEXT NOT NULL DEFAULT 'v2026.1',
  competency_framework_version TEXT NOT NULL DEFAULT 'cf_v2.0',
  constructs                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  hardware_requirements        JSONB NOT NULL DEFAULT '{"camera":"required_for_presence","microphone":"required_for_speech_response"}'::jsonb,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_defs_job_family ON assessment_definitions (job_family, status);

-- Seed approved definitions for STUDAI-JF-GBO and STUDAI-JF-CFG
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
) VALUES
(
  'prism-sim-gbo-l1',
  '1.0.0',
  'STUDAI-JF-GBO',
  'Graduate Business Operations Simulation',
  'active',
  35,
  'DEVELOPMENTAL',
  'PENDING',
  '{"cooldown_days": 30, "max_attempts": 3}'::jsonb,
  'v2026.1',
  'cf_v2.0',
  '[
    {"key": "CRITICAL_THINKING", "title": "Critical Thinking", "description": "Evidence synthesis and argument rigor"},
    {"key": "PROBLEM_SOLVING", "title": "Problem Solving", "description": "Structured breakdown under ambiguous operating conditions"},
    {"key": "COMMUNICATION", "title": "Professional Communication", "description": "Concise, clear, and audience-tailored discourse"},
    {"key": "COLLABORATION", "title": "Collaborative Behaviour", "description": "Cross-functional alignment and consensus building"},
    {"key": "AI_DIGITAL_FLUENCY", "title": "AI & Digital Fluency", "description": "Effective tool prompting, verification, and critical oversight"}
  ]'::jsonb,
  '{"camera": "required_for_presence", "microphone": "required_for_speech_response"}'::jsonb
),
(
  'prism-sim-cfg-l1',
  '1.0.0',
  'STUDAI-JF-CFG',
  'Customer-Facing Growth Simulation',
  'active',
  35,
  'DEVELOPMENTAL',
  'PENDING',
  '{"cooldown_days": 30, "max_attempts": 3}'::jsonb,
  'v2026.1',
  'cf_v2.0',
  '[
    {"key": "CRITICAL_THINKING", "title": "Critical Thinking", "description": "Client data evaluation and causality analysis"},
    {"key": "PROBLEM_SOLVING", "title": "Problem Solving", "description": "Structured objection handling and solution framing"},
    {"key": "COMMUNICATION", "title": "Professional Communication", "description": "Persuasive executive clarity and negotiation posture"},
    {"key": "COLLABORATION", "title": "Collaborative Behaviour", "description": "Stakeholder discovery and cross-functional alignment"},
    {"key": "AI_DIGITAL_FLUENCY", "title": "AI & Digital Fluency", "description": "Workflow automation and CRM co-piloting"}
  ]'::jsonb,
  '{"camera": "required_for_presence", "microphone": "required_for_speech_response"}'::jsonb
)
ON CONFLICT (assessment_definition_id) DO UPDATE SET
  version = EXCLUDED.version,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  duration = EXCLUDED.duration,
  validation_status = EXCLUDED.validation_status,
  calibration_status = EXCLUDED.calibration_status,
  retake_policy = EXCLUDED.retake_policy,
  scenario_set_version = EXCLUDED.scenario_set_version,
  competency_framework_version = EXCLUDED.competency_framework_version,
  constructs = EXCLUDED.constructs,
  hardware_requirements = EXCLUDED.hardware_requirements,
  updated_at = now();
