-- 00004_soft_delete.sql
-- Add deleted_at column to artefact tables for soft-delete support (PRD §21.3)

alter table app.entity_mentions add column if not exists deleted_at timestamptz;
alter table app.evidence_spans add column if not exists deleted_at timestamptz;
alter table app.extraction_runs add column if not exists deleted_at timestamptz;
alter table app.relationships add column if not exists deleted_at timestamptz;
alter table app.donation_events add column if not exists deleted_at timestamptz;
alter table app.candidate_recommendations add column if not exists deleted_at timestamptz;
alter table app.enrichment_signals add column if not exists deleted_at timestamptz;
alter table app.graph_snapshots add column if not exists deleted_at timestamptz;
