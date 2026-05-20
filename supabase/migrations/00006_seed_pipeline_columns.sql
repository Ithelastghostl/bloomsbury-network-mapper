-- 00006_seed_pipeline_columns.sql
-- Alter existing tables to support seed-driven pipeline (Plan: Sprint 1)
-- Adds run_type, cost tracking, seed import metadata, known_contacts split,
-- candidate_recommendations route context, and relaxes pipeline_jobs uniqueness.

-- =========================================================
-- CANONICAL ENTITIES: allow non-corpus origin
-- =========================================================

alter table app.canonical_entities
  add column source text not null default 'corpus';

-- =========================================================
-- RUNS: distinguish pipeline modes + cost tracking
-- =========================================================

alter table app.runs
  add column run_type text not null default 'corpus'
    check (run_type in ('corpus', 'seed', 'hybrid'));

-- Seed runs don't use corpus/extraction versioning — make those nullable
alter table app.runs
  alter column corpus_version drop not null,
  alter column extraction_prompt_versions drop not null,
  alter column graph_build_version drop not null,
  alter column identity_resolution_version drop not null,
  alter column scoring_config_version drop not null;

alter table app.runs
  add column cost_cap_usd numeric,
  add column total_cost_usd numeric not null default 0;

-- =========================================================
-- SEEDS: import metadata + augmentation tracking
-- =========================================================

alter table app.seeds
  add column import_row_id text,
  add column tier text,
  add column funder_type text,
  add column sub_type text,
  add column augmentation_status text not null default 'not_started';

-- =========================================================
-- KNOWN CONTACTS: split candidate exclusion from introducer availability
-- =========================================================

alter table app.known_contacts
  add column exclude_as_candidate boolean not null default true,
  add column available_as_introducer boolean not null default true;

-- =========================================================
-- CANDIDATE RECOMMENDATIONS: route context for seed pipeline
-- =========================================================

alter table app.candidate_recommendations
  add column introduction_route_id text,
  add column target_seed_id text;

-- FK constraints added in 00007 after introduction_routes table exists

-- =========================================================
-- PIPELINE JOBS: relax unique constraint for seed pipeline
-- Seed pipeline creates multiple jobs per (run_id, phase) — one per entity.
-- Replace unique constraint with a regular index.
-- =========================================================

alter table app.pipeline_jobs
  drop constraint if exists pipeline_jobs_run_id_phase_key;

create index pipeline_jobs_run_id_phase_idx
  on app.pipeline_jobs (run_id, phase);
