-- Down: remove the PROD-READY Phase 3 integrity guards and the persisted
-- session form id. The application keeps enforcing the same rules; only the
-- database-level backstop and the recorded form ids go.
ALTER TABLE v1_sessions DROP COLUMN IF EXISTS assessment_form_id;
DROP TRIGGER IF EXISTS evidence_unit_ratings_two_per_item ON evidence_unit_ratings;
DROP FUNCTION IF EXISTS prism_rating_item_limit();
DROP TRIGGER IF EXISTS capability_growth_snapshots_require_approved_pair ON capability_growth_snapshots;
DROP FUNCTION IF EXISTS prism_growth_snapshot_requires_approved_pair();
DROP TRIGGER IF EXISTS assessment_form_equivalence_requires_decision ON assessment_form_equivalence;
DROP FUNCTION IF EXISTS prism_equivalence_requires_decision();
