-- 0051_report_review_decisions.sql — P5.7 reviewed correction (CH-29, T36).
-- A reviewer's decision on a learner's report review request (0045). The
-- history is append-only: a decision row is never updated or deleted, so what
-- was decided, by whom and why stays reproducible. A CORRECT decision names
-- the evidence units to withhold (correction_json.withholdEvidenceIds); the
-- units themselves are not mutated — the report service treats the list as a
-- provenance flag and publishes a NEW report version built without them.
-- Additive; no learner content beyond the reviewer's reason text.
CREATE TABLE IF NOT EXISTS report_review_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       UUID NOT NULL REFERENCES report_review_requests (id),
  reviewer_id     TEXT NOT NULL,
  decision        TEXT NOT NULL CHECK (decision IN ('UPHOLD', 'CORRECT', 'REJECT')),
  reason          TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000),
  correction_json JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_review_decisions_correction_shape
    CHECK (decision <> 'CORRECT' OR correction_json IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS report_review_decisions_review_idx ON report_review_decisions (review_id, created_at ASC);

-- Decisions never change once written (same guard as 0033 versions).
CREATE TRIGGER report_review_decisions_append_only
  BEFORE UPDATE OR DELETE ON report_review_decisions
  FOR EACH ROW EXECUTE FUNCTION campus_reject_mutation();
