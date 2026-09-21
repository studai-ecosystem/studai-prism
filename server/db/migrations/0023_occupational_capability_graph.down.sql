-- 0023_occupational_capability_graph.down.sql
DROP TABLE IF EXISTS occupational_graph_edges CASCADE;
DROP TABLE IF EXISTS occupational_capabilities CASCADE;
DROP TABLE IF EXISTS occupational_work_activities CASCADE;
DROP TABLE IF EXISTS job_family_blueprints CASCADE;
DROP TABLE IF EXISTS occupational_nodes CASCADE;
DROP TABLE IF EXISTS occupational_external_refs CASCADE;
DELETE FROM assessment_definitions WHERE assessment_definition_id = 'prism-sim-mkt-l1';
