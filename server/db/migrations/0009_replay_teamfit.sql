-- Track 5 — counterfactual replay (practice ledger) + team-fit simulation.
--
-- 5.1 practice_replays: the SEPARATE practice ledger. Replay turns and their
--     practice-only micro feedback live here and ONLY here — nothing in this
--     table feeds reports, credentials, item_responses, or calibration.
--     Every row is permanently labeled practice.
CREATE TABLE IF NOT EXISTS practice_replays (
  replay_id          UUID PRIMARY KEY,
  source_session_id  UUID NOT NULL,           -- the completed certified session being replayed
  exchange_no        INT NOT NULL,            -- the moment being replayed
  moment             JSONB,                   -- {dimension, kind, magnitude} from moment detection
  turns              JSONB DEFAULT '[]'::jsonb, -- [{role, content, practiceLevels?}] practice conversation
  is_practice        BOOLEAN NOT NULL DEFAULT TRUE CHECK (is_practice), -- structurally always true
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_practice_replays_source ON practice_replays (source_session_id);

-- 5.2 team-fit: avatar twins composed from CONSENTED assessed profiles.
CREATE TABLE IF NOT EXISTS teams (
  team_id     UUID PRIMARY KEY,
  name        TEXT NOT NULL,                  -- org-facing label, no member PII
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id             UUID NOT NULL REFERENCES teams ON DELETE CASCADE,
  member_session_id   UUID NOT NULL,          -- the member's own assessment session
  consent_verified_at TIMESTAMPTZ NOT NULL,   -- when the teamfit_profile_use scope was verified
  PRIMARY KEY (team_id, member_session_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_session ON team_members (member_session_id);

CREATE TABLE IF NOT EXISTS teamfit_sessions (
  teamfit_id           UUID PRIMARY KEY,
  team_id              UUID NOT NULL REFERENCES teams,
  candidate_session_id UUID,                  -- candidate's prism session (nullable: external candidates)
  turns                JSONB DEFAULT '[]'::jsonb,
  observations         JSONB,                 -- QUALITATIVE only — schema-enforced no numeric fit
  created_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teamfit_sessions_candidate ON teamfit_sessions (candidate_session_id);
