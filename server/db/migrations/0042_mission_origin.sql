-- 0042_mission_origin.sql — P2.8 practice origin.
-- A practice attempt records WHY it was started: the learner's own goal, or
-- one approved assessment moment (session id + opportunity id). Only the
-- identifiers are kept — never transcript text, scores or evidence — so a
-- practice attempt links to an assessment without reading it. Additive and
-- nullable: existing attempts are unchanged.
ALTER TABLE mission_attempts
  ADD COLUMN IF NOT EXISTS origin_json JSONB;
