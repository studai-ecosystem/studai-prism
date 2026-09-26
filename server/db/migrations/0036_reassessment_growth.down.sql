-- 0036_reassessment_growth.down.sql — reverses 0036 in reverse order.
DROP TRIGGER IF EXISTS capability_growth_snapshots_immutable ON capability_growth_snapshots;
DROP TABLE IF EXISTS capability_growth_snapshots;
DROP FUNCTION IF EXISTS growth_snapshot_no_update();
DROP TABLE IF EXISTS reassessment_cycles;
DROP TRIGGER IF EXISTS assessment_form_equivalence_decisions_append_only ON assessment_form_equivalence_decisions;
DROP TABLE IF EXISTS assessment_form_equivalence_decisions;
DROP TABLE IF EXISTS assessment_form_equivalence;
