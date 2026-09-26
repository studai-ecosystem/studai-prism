-- 0039_evidence_rating_queue.sql — Prism Campus Phase 12 (C12.01; spec §45, §48).
-- Blinded human double-rating of V3 evidence units. A rating item holds only
-- what a rater needs: the capability, the source type and the candidate's own
-- words (identity tokenised as {{candidate}}). The evidence and session ids
-- are stored as one-way hashes, so an item cannot be traced back to a
-- student from the queue. The AI level is kept for agreement computation and
-- is never shown to raters. Ratings are append-only; nothing is defaulted.

CREATE TABLE IF NOT EXISTS evidence_rating_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_ref        TEXT NOT NULL UNIQUE CHECK (evidence_ref ~ '^[0-9a-f]{64}$'),
  session_ref         TEXT NOT NULL CHECK (session_ref ~ '^[0-9a-f]{64}$'),
  capability_id       TEXT NOT NULL,
  source_type         TEXT NOT NULL CHECK (source_type IN ('DIALOGUE_TURN', 'WORK_ARTIFACT', 'ANCHOR_PROBE')),
  behavior_anchor_id  TEXT,
  excerpt             TEXT NOT NULL CHECK (length(excerpt) BETWEEN 1 AND 2000),
  ai_level            INTEGER CHECK (ai_level BETWEEN 1 AND 5),
  ai_status           TEXT CHECK (ai_status IN ('INSUFFICIENT_EVIDENCE', 'PROVISIONAL', 'SUFFICIENT', 'HUMAN_REVIEW_REQUIRED')),
  rubric_version      TEXT NOT NULL,
  enqueued_by         TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_rating_items_capability_idx ON evidence_rating_items (capability_id, created_at);

CREATE TABLE IF NOT EXISTS evidence_unit_ratings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES evidence_rating_items(id) ON DELETE RESTRICT,
  rater_id     TEXT NOT NULL,
  level        INTEGER CHECK (level BETWEEN 1 AND 5),
  cannot_rate  BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((level IS NULL) = cannot_rate),
  UNIQUE (item_id, rater_id)
);
CREATE INDEX IF NOT EXISTS evidence_unit_ratings_item_idx ON evidence_unit_ratings (item_id);

CREATE TRIGGER evidence_unit_ratings_append_only
  BEFORE UPDATE OR DELETE ON evidence_unit_ratings
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();
