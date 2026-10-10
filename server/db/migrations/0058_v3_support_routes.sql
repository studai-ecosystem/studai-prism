-- 0058_v3_support_routes.sql — PROD-READY Phase 4: /api/v1 support routes for
-- V3 sessions (human review, accommodation, identity check). Additive only;
-- dark behind PRISM_V3_SUPPORT_ROUTES.
--
--   * report_review_requests.request_kind — the existing review queue (0045,
--     decided through /api/admin/report-reviews, 0051) now carries two kinds:
--     MOMENT (the P5.7 per-moment interpretation request, unchanged) and
--     HUMAN_REVIEW (charter §11: the one free human review of an assessment).
--     A partial unique index makes "one free review per assessment" a database
--     fact: at most one HUMAN_REVIEW request per session, ever.
--   * assessment_accommodation_requests — an accommodation request made on a
--     V3 assignment BEFORE the assessment starts (ACCOMMODATIONS_POLICY_v1).
--     A sponsored V3 session id only exists once the assessment starts, so the
--     request is keyed by (assignment, learner) and linked to the session at
--     start; an approved decision is then copied into the session's
--     v1_accommodations record (the existing activation path). The needs text
--     may reference disability: visible to the learner and to administrators
--     holding accommodations:read only; erased with the session and the account.
--
-- Identity checks reuse v1_verifications (no new column): a V3 self-declared
-- (Level 1) record stores the declared name only, never a document number.

ALTER TABLE report_review_requests
  ADD COLUMN IF NOT EXISTS request_kind TEXT NOT NULL DEFAULT 'MOMENT'
  CHECK (request_kind IN ('MOMENT', 'HUMAN_REVIEW'));

CREATE UNIQUE INDEX IF NOT EXISTS report_review_requests_one_human_review
  ON report_review_requests (session_id) WHERE request_kind = 'HUMAN_REVIEW';

CREATE TABLE IF NOT EXISTS assessment_accommodation_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   TEXT NOT NULL REFERENCES assessment_assignments (id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  organization_id UUID,
  session_id      TEXT,
  needs           TEXT NOT NULL CHECK (char_length(needs) BETWEEN 10 AND 2000),
  status          TEXT NOT NULL DEFAULT 'REQUESTED'
                  CHECK (status IN ('REQUESTED', 'APPROVED', 'DENIED', 'LAPSED')),
  modes           JSONB,
  material        BOOLEAN NOT NULL DEFAULT FALSE,
  decision_note   TEXT,
  decided_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at      TIMESTAMPTZ,
  linked_at       TIMESTAMPTZ,
  CONSTRAINT assessment_accommodation_requests_one_per_assignment UNIQUE (assignment_id, user_id),
  CONSTRAINT assessment_accommodation_requests_decision_shape
    CHECK (status NOT IN ('APPROVED', 'DENIED') OR (decided_at IS NOT NULL AND decision_note IS NOT NULL)),
  CONSTRAINT assessment_accommodation_requests_approved_modes
    CHECK (status <> 'APPROVED' OR modes IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS assessment_accommodation_requests_user_idx ON assessment_accommodation_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assessment_accommodation_requests_status_idx ON assessment_accommodation_requests (status, created_at ASC);
CREATE INDEX IF NOT EXISTS assessment_accommodation_requests_session_idx ON assessment_accommodation_requests (session_id) WHERE session_id IS NOT NULL;
