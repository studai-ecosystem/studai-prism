-- 0039_evidence_rating_queue.down.sql — reverses 0039_evidence_rating_queue.sql.
DROP TRIGGER IF EXISTS evidence_unit_ratings_append_only ON evidence_unit_ratings;
DROP TABLE IF EXISTS evidence_unit_ratings;
DROP TABLE IF EXISTS evidence_rating_items;
