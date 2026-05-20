-- 00001_initial_schema_down.sql
-- Drops all tables in reverse FK order, then the schema.

-- AUDIT LOG
drop table if exists app.audit_log;

-- CONFIG & OPERATIONS (leaf tables first)
drop table if exists app.rejection_log;
drop table if exists app.known_contacts;
drop table if exists app.pipeline_jobs;
drop table if exists app.quarantine;
drop table if exists app.icp_configs;
drop table if exists app.scoring_configs;

-- DISCOVERY & REVIEW (leaf tables first)
drop table if exists app.intro_outcomes;
drop table if exists app.human_decisions;
drop table if exists app.enrichment_signals;
drop table if exists app.candidate_recommendations;
drop table if exists app.seeds;

-- CORE OBJECTS (reverse dependency order)
drop table if exists app.graph_snapshots;
drop table if exists app.donation_events;
drop table if exists app.relationships;
drop table if exists app.human_identity_decisions;
drop table if exists app.identity_clusters;
drop table if exists app.canonical_entities;
drop table if exists app.evidence_spans;
drop table if exists app.entity_mentions;
drop table if exists app.extraction_runs;
drop table if exists app.documents;
drop table if exists app.runs;

-- SCHEMA
drop schema if exists app;
