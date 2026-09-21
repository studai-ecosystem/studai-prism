-- 0024_behavioral_evidence_ledger.sql — Evidence Ledger & Development Missions (Phases 7-10)

-- 1. Atomic Behavioral Evidence Units Table
CREATE TABLE IF NOT EXISTS behavioral_evidence_units (
  evidence_id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  attempt_id VARCHAR(64),
  blueprint_id VARCHAR(64) NOT NULL,
  capability_id VARCHAR(64) NOT NULL,
  capability_layer VARCHAR(32) NOT NULL DEFAULT 'LAYER_2_ROLE_SPECIFIC',
  source_turn INTEGER NOT NULL,
  source_artifact_id VARCHAR(64),
  candidate_action JSONB NOT NULL DEFAULT '{}'::jsonb,
  observable_behavior TEXT NOT NULL,
  rubric_level INTEGER NOT NULL CHECK (rubric_level BETWEEN 1 AND 5),
  rubric_label VARCHAR(64) NOT NULL,
  confidence_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED_CONSENSUS',
  judge_agreement JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_session ON behavioral_evidence_units (session_id, capability_id);
CREATE INDEX IF NOT EXISTS idx_evidence_blueprint ON behavioral_evidence_units (blueprint_id);

-- 2. Development Missions Table
CREATE TABLE IF NOT EXISTS development_missions (
  mission_id VARCHAR(64) PRIMARY KEY,
  title TEXT NOT NULL,
  job_family_id VARCHAR(64) NOT NULL,
  target_capability_id VARCHAR(64) NOT NULL,
  target_rubric_level INTEGER NOT NULL DEFAULT 3,
  estimated_duration_minutes INTEGER NOT NULL DEFAULT 20,
  scaffolding_tier VARCHAR(32) NOT NULL DEFAULT 'GUIDED_PRACTICE'
    CHECK (scaffolding_tier IN ('HIGH_SCAFFOLDING', 'GUIDED_PRACTICE', 'AUTONOMOUS_CHALLENGE')),
  challenge_briefing JSONB NOT NULL,
  interactive_workspace_artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  scaffolded_guidance JSONB NOT NULL DEFAULT '{}'::jsonb,
  success_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Candidate Mission Attempts Table
CREATE TABLE IF NOT EXISTS candidate_mission_attempts (
  attempt_id VARCHAR(64) PRIMARY KEY,
  candidate_id VARCHAR(64) NOT NULL,
  mission_id VARCHAR(64) NOT NULL REFERENCES development_missions(mission_id),
  session_id VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
  candidate_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  observable_behaviors JSONB NOT NULL DEFAULT '[]'::jsonb,
  resulting_evidence_level INTEGER,
  feedback_summary TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_attempts_candidate ON candidate_mission_attempts (candidate_id, mission_id);

-- ── SEED INITIAL DEVELOPMENT MISSIONS ─────────────────────────────────────────

INSERT INTO development_missions (
  mission_id,
  title,
  job_family_id,
  target_capability_id,
  target_rubric_level,
  estimated_duration_minutes,
  scaffolding_tier,
  challenge_briefing,
  interactive_workspace_artifacts,
  scaffolded_guidance,
  success_criteria
) VALUES (
  'MIS-MKT-EXP-01',
  'A/B Experimentation & Budget Reallocation',
  'STUDAI-JF-MKT-L1',
  'CAP-MKT-EXPERIMENTATION',
  4,
  20,
  'GUIDED_PRACTICE',
  '{
    "context": "Lumina Botanicals has ₹1,00,000 available to test whether a Clean Ingredients messaging angle converts better than the current Glow Fast angle.",
    "objective": "Formulate a testable A/B hypothesis, isolate the test variable, and allocate the budget across control and test ad variants with sufficient statistical power."
  }'::jsonb,
  '[
    {
      "artifact_id": "ART-AB-DESIGNER",
      "type": "EXPERIMENT_DESIGNER",
      "title": "A/B Test Parameter Sheet",
      "initial_state": {
        "baseline_conversion_rate": 0.022,
        "minimum_detectable_effect": 0.15,
        "traffic_split": "50/50",
        "sample_size_per_variant": 4200
      }
    },
    {
      "artifact_id": "ART-BUDGET-SPLIT",
      "type": "SPREADSHEET_TABLE",
      "title": "Variant Budget Allocation",
      "initial_state": {
        "rows": [
          {"id": "ctrl", "variant": "Control (Glow Fast)", "spend": 50000, "editable": true},
          {"id": "test", "variant": "Test (Clean Formula)", "spend": 50000, "editable": true}
        ]
      }
    }
  ]'::jsonb,
  '{
    "hints_available": 3,
    "framework_reference": "Hypothesis Formula: If we change [Headline] on the ad creative, then [CTR and CVR] will increase by 15% because customers distrust synthetic claims.",
    "reflection_probes": [
      "Why does changing both the ad copy AND the landing page at the same time ruin your test?"
    ]
  }'::jsonb,
  '{
    "required_observable_behaviors": [
      "Candidate isolates a single independent variable.",
      "Candidate defines primary conversion metrics before running the test."
    ]
  }'::jsonb
), (
  'MIS-CSU-EXP-02',
  'Enterprise Contract Expansion & ROI Modeling',
  'STUDAI-JF-CSU-L1',
  'CAP-CSU-EXPANSION',
  3,
  20,
  'GUIDED_PRACTICE',
  '{
    "context": "An existing B2B client has exceeded their user license tier by 35% but is complaining about renewal costs.",
    "objective": "Present an ROI model showing how adding 50 enterprise seats at an annual volume discount saves their team 120 engineering hours per month."
  }'::jsonb,
  '[
    {
      "artifact_id": "ART-CSU-ROI",
      "type": "SPREADSHEET_TABLE",
      "title": "Customer ROI & Seat Expansion Calculator",
      "initial_state": {
        "rows": [
          {"id": "tier1", "tier": "Current Seats (100)", "cost": 1200000, "hours_saved": 400},
          {"id": "tier2", "tier": "Expanded Enterprise (150)", "cost": 1550000, "hours_saved": 650}
        ]
      }
    }
  ]'::jsonb,
  '{
    "hints_available": 2,
    "framework_reference": "Cost per Hour Saved: Value generated = (Hours saved * Hourly engineering cost) - Added subscription cost."
  }'::jsonb,
  '{
    "required_observable_behaviors": [
      "Candidate reframes cost increase as net productivity gain.",
      "Candidate proactively offers annual billing discount."
    ]
  }'::jsonb
) ON CONFLICT (mission_id) DO UPDATE SET
  title = EXCLUDED.title,
  challenge_briefing = EXCLUDED.challenge_briefing,
  interactive_workspace_artifacts = EXCLUDED.interactive_workspace_artifacts;
