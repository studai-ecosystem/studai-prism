-- 0050_content_review.sql — P4.8 content review tooling for authored
-- assessment forms. Reviewer attachments (exemplar / counterexample / note),
-- comments, role-checked review decisions and draft edits that always create
-- a NEW form version (form_id = content_id:version). Published or draft
-- versions are never updated in place: every row is append-only and no row
-- references a learner, a session or an evidence unit. Additive.
CREATE TABLE IF NOT EXISTS content_attachments (
  id            UUID PRIMARY KEY,
  form_id       TEXT NOT NULL,
  version       TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('EXEMPLAR', 'COUNTEREXAMPLE', 'NOTE')),
  behaviour_id  TEXT,
  text          TEXT NOT NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_attachments_form_idx ON content_attachments (form_id, version, created_at);

CREATE TABLE IF NOT EXISTS content_comments (
  id          UUID PRIMARY KEY,
  form_id     TEXT NOT NULL,
  version     TEXT NOT NULL,
  author      TEXT,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_comments_form_idx ON content_comments (form_id, version, created_at);

CREATE TABLE IF NOT EXISTS content_review_decisions (
  id             UUID PRIMARY KEY,
  form_id        TEXT NOT NULL,
  version        TEXT NOT NULL,
  reviewer_role  TEXT NOT NULL CHECK (reviewer_role IN ('CONTENT', 'MEASUREMENT', 'ACCESSIBILITY')),
  reviewer_id    TEXT,
  decision       TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REQUEST_CHANGES', 'REJECT')),
  reason         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_review_decisions_form_idx ON content_review_decisions (form_id, version, created_at);

-- A draft edit is a new immutable version of the whole package.
CREATE TABLE IF NOT EXISTS content_form_drafts (
  form_id       TEXT PRIMARY KEY,
  content_id    TEXT NOT NULL,
  version       TEXT NOT NULL,
  derived_from  TEXT,
  package_json  JSONB NOT NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_id, version)
);
