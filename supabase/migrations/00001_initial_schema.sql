-- 00001_initial_schema.sql
-- Full DDL from PRD §11.1 + audit_log (F1.2-T2)
-- All tables in schema "app"

-- =========================================================
-- SCHEMA & EXTENSIONS
-- =========================================================

create schema if not exists app;

create extension if not exists pg_trgm;
create extension if not exists vector;   -- pgvector
create extension if not exists pg_cron;

-- =========================================================
-- CORE OBJECTS
-- =========================================================

create table app.runs (
  run_id                          text primary key,
  corpus_version                  text not null,
  schema_version                  text not null,
  extraction_prompt_versions      jsonb not null,
  graph_build_version             text not null,
  identity_resolution_version     text not null,
  scoring_config_version          text not null,
  status                          text not null,
  started_at                      timestamptz not null default now(),
  completed_at                    timestamptz,
  error                           jsonb
);

create table app.documents (
  document_id        text primary key,
  corpus_version     text not null,
  source             text not null,
  document_type      text not null,
  content_hash       text not null unique,
  storage_uri        text not null,
  year               int,
  ingested_at        timestamptz not null default now(),
  metadata           jsonb not null default '{}'::jsonb
);
create index on app.documents (document_type);
create index on app.documents (year);

create table app.extraction_runs (
  extraction_run_id  text primary key,
  run_id             text not null references app.runs(run_id),
  document_id        text not null references app.documents(document_id),
  prompt_version     text not null,
  model              text not null,
  temperature        numeric not null,
  status             text not null,
  invalid_json_retries int not null default 0,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  error              jsonb,
  unique (run_id, document_id)
);
create index on app.extraction_runs (run_id);
create index on app.extraction_runs (status);

create table app.entity_mentions (
  entity_mention_id     text primary key,
  document_id           text not null references app.documents(document_id),
  run_id                text not null references app.runs(run_id),
  entity_type           text not null,
  raw_value             text not null,
  normalised_value      text not null,
  attributes            jsonb not null default '{}'::jsonb,
  evidence_span         text not null,
  span_start            int not null,
  span_end              int not null,
  extraction_confidence numeric not null,
  validation_status     text not null,
  embedding             vector(1536),
  created_at            timestamptz not null default now()
);
create index on app.entity_mentions (run_id);
create index on app.entity_mentions (entity_type);
create index on app.entity_mentions (document_id);
create index on app.entity_mentions using gin (normalised_value gin_trgm_ops);
create index on app.entity_mentions using ivfflat (embedding vector_cosine_ops);

create table app.evidence_spans (
  evidence_id      text primary key,
  document_id      text not null references app.documents(document_id),
  run_id           text not null references app.runs(run_id),
  text             text not null,
  span_start       int not null,
  span_end         int not null,
  source_section   text,
  evidence_type    text not null,
  created_at       timestamptz not null default now()
);
create index on app.evidence_spans (document_id);

create table app.canonical_entities (
  canonical_entity_id  text primary key,
  entity_type          text not null,
  display_name         text not null,
  first_seen_run_id    text not null references app.runs(run_id),
  last_seen_run_id     text not null references app.runs(run_id),
  attributes           jsonb not null default '{}'::jsonb
);
create index on app.canonical_entities (entity_type);
create index on app.canonical_entities using gin (display_name gin_trgm_ops);

create table app.identity_clusters (
  cluster_id           text primary key,
  canonical_entity_id  text not null references app.canonical_entities(canonical_entity_id),
  run_id               text not null references app.runs(run_id),
  entity_type          text not null,
  member_mention_ids   text[] not null,
  cluster_confidence   numeric not null,
  decision_status      text not null,
  created_by           text not null,
  created_at           timestamptz not null default now()
);
create index on app.identity_clusters (run_id);
create index on app.identity_clusters (canonical_entity_id);

create table app.human_identity_decisions (
  identity_decision_id  text primary key,
  entity_a_mention_id   text not null references app.entity_mentions(entity_mention_id),
  entity_b_mention_id   text not null references app.entity_mentions(entity_mention_id),
  decision              text not null check (decision in ('same_person', 'not_same_person')),
  reason_code           text not null,
  notes                 text,
  decided_by            text not null,
  decided_at            timestamptz not null default now(),
  replay_on_future_runs boolean not null default true,
  superseded_by         text
);
create index on app.human_identity_decisions (entity_a_mention_id);
create index on app.human_identity_decisions (entity_b_mention_id);

create table app.relationships (
  relationship_id     text primary key,
  run_id              text not null references app.runs(run_id),
  source_entity_id    text not null references app.canonical_entities(canonical_entity_id),
  target_entity_id    text not null references app.canonical_entities(canonical_entity_id),
  relationship_type   text not null,
  valid_from          date,
  valid_to            date,
  evidence_id         text not null references app.evidence_spans(evidence_id),
  confidence          numeric not null,
  freshness_multiplier numeric not null,
  source_reliability  numeric not null,
  edge_weight         numeric not null,
  status              text not null
);
create index on app.relationships (run_id);
create index on app.relationships (source_entity_id);
create index on app.relationships (target_entity_id);
create index on app.relationships (relationship_type);

create table app.donation_events (
  donation_event_id    text primary key,
  run_id               text not null references app.runs(run_id),
  donor_entity_id      text not null references app.canonical_entities(canonical_entity_id),
  recipient_entity_id  text not null references app.canonical_entities(canonical_entity_id),
  amount               numeric,
  currency             text,
  year                 int,
  evidence_id          text not null references app.evidence_spans(evidence_id),
  confidence           numeric not null
);
create index on app.donation_events (run_id);
create index on app.donation_events (donor_entity_id);
create index on app.donation_events (recipient_entity_id);

create table app.graph_snapshots (
  snapshot_id    text primary key,
  run_id         text not null references app.runs(run_id),
  storage_uri    text not null,
  node_count     int not null,
  edge_count     int not null,
  built_at       timestamptz not null default now()
);

-- =========================================================
-- DISCOVERY & REVIEW
-- =========================================================

create table app.seeds (
  seed_id              text primary key,
  canonical_entity_id  text not null references app.canonical_entities(canonical_entity_id),
  added_by             text not null,
  added_at             timestamptz not null default now(),
  notes                text,
  active               boolean not null default true,
  seed_quality_score   numeric
);

create table app.candidate_recommendations (
  candidate_recommendation_id  text primary key,
  run_id                       text not null references app.runs(run_id),
  seed_id                      text not null references app.seeds(seed_id),
  candidate_entity_id          text not null references app.canonical_entities(canonical_entity_id),
  presentation_group_id        text,
  rank                         int not null,
  priority_score               numeric not null,
  confidence_score             numeric not null,
  status                       text not null,
  strongest_path               jsonb not null,
  reason_codes                 text[] not null,
  identity_warnings            text[] not null default '{}',
  created_at                   timestamptz not null default now(),
  unique (run_id, seed_id, candidate_entity_id)
);
create index on app.candidate_recommendations (run_id, seed_id);
create index on app.candidate_recommendations (status);
create index on app.candidate_recommendations (presentation_group_id);

create table app.enrichment_signals (
  enrichment_signal_id  text primary key,
  candidate_entity_id   text not null references app.canonical_entities(canonical_entity_id),
  source                text not null,
  external_record_id    text not null,
  signal_type           text not null,
  signal_payload        jsonb not null,
  match_confidence      numeric not null,
  retrieved_at          timestamptz not null default now(),
  cache_expires_at      timestamptz not null,
  accepted_for_scoring  boolean not null,
  status                text not null,
  unique (candidate_entity_id, source, external_record_id)
);
create index on app.enrichment_signals (candidate_entity_id);
create index on app.enrichment_signals (source);
create index on app.enrichment_signals (cache_expires_at);

create table app.human_decisions (
  human_decision_id            text primary key,
  candidate_recommendation_id  text not null references app.candidate_recommendations(candidate_recommendation_id),
  decision                     text not null,
  reason_code                  text,
  notes                        text,
  decided_by                   text not null,
  decided_at                   timestamptz not null default now(),
  cold_start_decision          boolean not null default false
);
create index on app.human_decisions (candidate_recommendation_id);
create index on app.human_decisions (decision);

create table app.intro_outcomes (
  intro_outcome_id             text primary key,
  candidate_recommendation_id  text not null references app.candidate_recommendations(candidate_recommendation_id),
  seed_id                      text not null references app.seeds(seed_id),
  intro_status                 text not null,
  decline_reason               text,
  meeting_at                   timestamptz,
  converted                    boolean,
  notes                        text,
  recorded_by                  text not null,
  recorded_at                  timestamptz not null default now()
);
create index on app.intro_outcomes (candidate_recommendation_id);

-- =========================================================
-- CONFIG & OPERATIONS
-- =========================================================

create table app.scoring_configs (
  scoring_config_version  text primary key,
  config                  jsonb not null,
  promoted_at             timestamptz not null default now(),
  promoted_by             text not null,
  rationale               text
);

create table app.icp_configs (
  icp_id      text primary key,
  config      jsonb not null,
  version     text not null,
  active      boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table app.quarantine (
  quarantine_id   text primary key,
  run_id          text not null references app.runs(run_id),
  source_phase    text not null,
  source_record   jsonb not null,
  reason_code     text not null,
  details         text,
  created_at      timestamptz not null default now(),
  resolved        boolean not null default false
);
create index on app.quarantine (run_id);
create index on app.quarantine (reason_code);

create table app.pipeline_jobs (
  job_id       text primary key,
  run_id       text not null references app.runs(run_id),
  phase        text not null,
  status       text not null,
  priority     int not null default 0,
  attempts     int not null default 0,
  max_attempts int not null default 3,
  payload      jsonb,
  error        jsonb,
  enqueued_at  timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index on app.pipeline_jobs (status, priority);
create index on app.pipeline_jobs (run_id, phase);

create table app.known_contacts (
  canonical_entity_id  text primary key references app.canonical_entities(canonical_entity_id),
  added_by             text not null,
  added_at             timestamptz not null default now(),
  source               text not null
);

create table app.rejection_log (
  rejection_log_id     text primary key,
  seed_id              text not null references app.seeds(seed_id),
  candidate_entity_id  text not null references app.canonical_entities(canonical_entity_id),
  decided_at           timestamptz not null default now(),
  reason_code          text not null,
  unique (seed_id, candidate_entity_id)
);

-- =========================================================
-- AUDIT LOG (F1.2-T2)
-- =========================================================

create table app.audit_log (
  log_id      text primary key,
  user_id     text not null,
  action      text not null,
  resource    text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on app.audit_log (user_id);
create index on app.audit_log (action);
create index on app.audit_log (created_at);
