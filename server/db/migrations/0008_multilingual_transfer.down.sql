DROP TRIGGER IF EXISTS trg_external_ratings_no_update ON external_ratings;
DROP FUNCTION IF EXISTS external_ratings_no_update();
DROP TABLE IF EXISTS external_ratings;
ALTER TABLE assessment_timeline DROP COLUMN IF EXISTS language;
