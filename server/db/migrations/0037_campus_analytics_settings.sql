-- 0037_campus_analytics_settings.sql — Prism Campus Phase 10 (C10.02; spec §27.2).
-- Per-organization analytics settings: the minimum aggregate group size used
-- by every campus aggregate (small-group suppression). No row means the
-- documented default (10); the floor is 5 and is enforced here as well as in
-- the service, so no configuration can report groups smaller than 5.

CREATE TABLE IF NOT EXISTS organization_analytics_settings (
  organization_id           UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  min_aggregate_group_size  INTEGER NOT NULL CHECK (min_aggregate_group_size BETWEEN 5 AND 1000),
  updated_by                TEXT NOT NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
