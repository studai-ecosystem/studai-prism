-- PROD-READY Phase 3 (multi-instance and data-integrity readiness, S6).
-- Database guards for rules the application already enforces, so a direct
-- SQL write or a race between two API instances cannot break them, plus the
-- assessment form id persisted on the session. 0036 and 0039 are frozen and
-- unchanged; everything here is additive and reversed by the .down.sql.

-- 1. A form-equivalence pair becomes (or stays) APPROVED only with a matching
-- decision: the LATEST decision row for the pair must be APPROVED and cite
-- the same evidence. Checked at COMMIT (deferred), so the admin plane's
-- order — decision row first, then the pair update, one transaction — and a
-- pair inserted together with its decision both pass, while a bare UPDATE or
-- INSERT of an APPROVED pair fails. Erasure's pseudonymisation of decided_by
-- does not fire it (only status / evidence_ref / decided_at changes do).
CREATE OR REPLACE FUNCTION prism_equivalence_requires_decision() RETURNS trigger AS $$
DECLARE
  cur RECORD;
  latest RECORD;
BEGIN
  SELECT status, evidence_ref INTO cur FROM assessment_form_equivalence
   WHERE form_a_id = NEW.form_a_id AND form_b_id = NEW.form_b_id;
  IF NOT FOUND OR cur.status <> 'APPROVED' THEN
    RETURN NULL;
  END IF;
  SELECT status, evidence_ref INTO latest FROM assessment_form_equivalence_decisions
   WHERE form_a_id = NEW.form_a_id AND form_b_id = NEW.form_b_id
   ORDER BY decided_at DESC, id DESC LIMIT 1;
  IF NOT FOUND OR latest.status <> 'APPROVED' OR latest.evidence_ref IS DISTINCT FROM cur.evidence_ref THEN
    RAISE EXCEPTION 'form equivalence pair % / % cannot be APPROVED without an APPROVED decision row citing the same evidence', NEW.form_a_id, NEW.form_b_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER assessment_form_equivalence_requires_decision
  AFTER INSERT OR UPDATE OF status, evidence_ref, decided_at ON assessment_form_equivalence
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION prism_equivalence_requires_decision();

-- 2. A growth snapshot is written only on an APPROVED pair (never PENDING or
-- REJECTED). The pair row is share-locked, so a concurrent decision cannot
-- change it underneath the insert.
CREATE OR REPLACE FUNCTION prism_growth_snapshot_requires_approved_pair() RETURNS trigger AS $$
DECLARE
  pair_status TEXT;
BEGIN
  SELECT status INTO pair_status FROM assessment_form_equivalence
   WHERE form_a_id = NEW.form_a_id AND form_b_id = NEW.form_b_id FOR SHARE;
  IF pair_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'growth snapshots need an APPROVED form pair (% / % is %)', NEW.form_a_id, NEW.form_b_id, COALESCE(pair_status, 'missing')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capability_growth_snapshots_require_approved_pair
  BEFORE INSERT ON capability_growth_snapshots
  FOR EACH ROW EXECUTE FUNCTION prism_growth_snapshot_requires_approved_pair();

-- 3. At most two human ratings per queued evidence item (K101: "two
-- independent raters per item"). The item row is locked first, so
-- concurrent inserts for one item are serialised and the third is refused.
-- The application takes the same lock (validation repository).
CREATE OR REPLACE FUNCTION prism_rating_item_limit() RETURNS trigger AS $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM 1 FROM evidence_rating_items WHERE id = NEW.item_id FOR UPDATE;
  SELECT count(*) INTO n FROM evidence_unit_ratings WHERE item_id = NEW.item_id;
  IF n >= 2 THEN
    RAISE EXCEPTION 'evidence rating item % already has its two ratings', NEW.item_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_unit_ratings_two_per_item
  BEFORE INSERT ON evidence_unit_ratings
  FOR EACH ROW EXECUTE FUNCTION prism_rating_item_limit();

-- 4. The assessment form a session was taken on, persisted with the session
-- (NULL = not recorded; readers then fall back to today's catalog). Set by
-- the store when a session is created and never changed afterwards, so a
-- later bank version bump cannot remap an old session to a new form.
-- Backfill: the single form id the session's evidence units carry (sessions
-- whose units name more than one form are left NULL rather than guessed).
ALTER TABLE v1_sessions ADD COLUMN IF NOT EXISTS assessment_form_id TEXT;

UPDATE v1_sessions s
   SET assessment_form_id = u.form_id
  FROM (
    SELECT session_id, min(assessment_form_id) AS form_id
      FROM behavioral_evidence_units
     WHERE assessment_form_id IS NOT NULL
     GROUP BY session_id
    HAVING count(DISTINCT assessment_form_id) = 1
  ) u
 WHERE s.session_id = u.session_id
   AND s.assessment_form_id IS NULL;
