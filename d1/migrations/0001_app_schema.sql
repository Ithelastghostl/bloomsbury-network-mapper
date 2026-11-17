-- 0001_app_schema.sql
-- Cloudflare D1 (SQLite) port of supabase/migrations/00001..00016 (schema `app`).
-- Final state of all 43 tables after the 16 Postgres migrations, in one file.
-- Tables lose the `app.` prefix: SQLite has no schemas.
--
-- Type rules (MIGRATION-PLAN.md section 2.6):
--   text -> TEXT; int/integer -> INTEGER; numeric -> REAL; boolean -> INTEGER 0/1;
--   jsonb -> TEXT holding JSON; text[] -> TEXT holding a JSON array;
--   timestamptz -> TEXT ISO 8601 UTC (YYYY-MM-DDTHH:MM:SS.sssZ); date -> TEXT YYYY-MM-DD;
--   now() default -> strftime('%Y-%m-%dT%H:%M:%fZ','now').
-- Column order matches Postgres (columns added by ALTER TABLE come last, in migration order).
-- What did not port, and why: d1/PORT-NOTES.md.

-- =========================================================
-- CORE OBJECTS (00001, extended by 00004, 00006, 00015)
-- =========================================================

CREATE TABLE runs (
  run_id                          TEXT NOT NULL PRIMARY KEY,
  corpus_version                  TEXT,
  schema_version                  TEXT NOT NULL,
  extraction_prompt_versions      TEXT,
  graph_build_version             TEXT,
  identity_resolution_version     TEXT,
  scoring_config_version          TEXT,
  status                          TEXT NOT NULL,
  started_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at                    TEXT,
  error                           TEXT,
  run_type                        TEXT NOT NULL DEFAULT 'corpus'
    CHECK (run_type IN ('corpus', 'seed', 'hybrid')),
  cost_cap_usd                    REAL,
  total_cost_usd                  REAL NOT NULL DEFAULT 0
);

CREATE TABLE documents (
  document_id        TEXT NOT NULL PRIMARY KEY,
  corpus_version     TEXT NOT NULL,
  source             TEXT NOT NULL,
  document_type      TEXT NOT NULL,
  content_hash       TEXT NOT NULL UNIQUE,
  storage_uri        TEXT NOT NULL,
  year               INTEGER,
  ingested_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  metadata           TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX documents_document_type_idx ON documents (document_type);
CREATE INDEX documents_year_idx ON documents (year);

CREATE TABLE extraction_runs (
  extraction_run_id    TEXT NOT NULL PRIMARY KEY,
  run_id               TEXT NOT NULL REFERENCES runs(run_id),
  document_id          TEXT NOT NULL REFERENCES documents(document_id),
  prompt_version       TEXT NOT NULL,
  model                TEXT NOT NULL,
  temperature          REAL NOT NULL,
  status               TEXT NOT NULL,
  invalid_json_retries INTEGER NOT NULL DEFAULT 0,
  started_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at         TEXT,
  error                TEXT,
  deleted_at           TEXT,
  UNIQUE (run_id, document_id)
);
CREATE INDEX extraction_runs_run_id_idx ON extraction_runs (run_id);
CREATE INDEX extraction_runs_status_idx ON extraction_runs (status);

-- `embedding vector(1536)` is not stored in D1 (see PORT-NOTES: Vectorize).
CREATE TABLE entity_mentions (
  entity_mention_id     TEXT NOT NULL PRIMARY KEY,
  document_id           TEXT NOT NULL REFERENCES documents(document_id),
  run_id                TEXT NOT NULL REFERENCES runs(run_id),
  entity_type           TEXT NOT NULL,
  raw_value             TEXT NOT NULL,
  normalised_value      TEXT NOT NULL,
  attributes            TEXT NOT NULL DEFAULT '{}',
  evidence_span         TEXT NOT NULL,
  span_start            INTEGER NOT NULL,
  span_end              INTEGER NOT NULL,
  extraction_confidence REAL NOT NULL,
  validation_status     TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at            TEXT
);
CREATE INDEX entity_mentions_run_id_idx ON entity_mentions (run_id);
CREATE INDEX entity_mentions_entity_type_idx ON entity_mentions (entity_type);
CREATE INDEX entity_mentions_document_id_idx ON entity_mentions (document_id);

CREATE TABLE evidence_spans (
  evidence_id      TEXT NOT NULL PRIMARY KEY,
  document_id      TEXT NOT NULL REFERENCES documents(document_id),
  run_id           TEXT NOT NULL REFERENCES runs(run_id),
  text             TEXT NOT NULL,
  span_start       INTEGER NOT NULL,
  span_end         INTEGER NOT NULL,
  source_section   TEXT,
  evidence_type    TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT
);
CREATE INDEX evidence_spans_document_id_idx ON evidence_spans (document_id);

CREATE TABLE canonical_entities (
  canonical_entity_id  TEXT NOT NULL PRIMARY KEY,
  entity_type          TEXT NOT NULL,
  display_name         TEXT NOT NULL,
  first_seen_run_id    TEXT NOT NULL REFERENCES runs(run_id),
  last_seen_run_id     TEXT NOT NULL REFERENCES runs(run_id),
  attributes           TEXT NOT NULL DEFAULT '{}',
  source               TEXT NOT NULL DEFAULT 'corpus'
);
CREATE INDEX canonical_entities_entity_type_idx ON canonical_entities (entity_type);

CREATE TABLE identity_clusters (
  cluster_id           TEXT NOT NULL PRIMARY KEY,
  canonical_entity_id  TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  run_id               TEXT NOT NULL REFERENCES runs(run_id),
  entity_type          TEXT NOT NULL,
  member_mention_ids   TEXT NOT NULL,
  cluster_confidence   REAL NOT NULL,
  decision_status      TEXT NOT NULL,
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX identity_clusters_run_id_idx ON identity_clusters (run_id);
CREATE INDEX identity_clusters_canonical_entity_id_idx ON identity_clusters (canonical_entity_id);

CREATE TABLE human_identity_decisions (
  identity_decision_id  TEXT NOT NULL PRIMARY KEY,
  entity_a_mention_id   TEXT NOT NULL REFERENCES entity_mentions(entity_mention_id),
  entity_b_mention_id   TEXT NOT NULL REFERENCES entity_mentions(entity_mention_id),
  decision              TEXT NOT NULL CHECK (decision IN ('same_person', 'not_same_person')),
  reason_code           TEXT NOT NULL,
  notes                 TEXT,
  decided_by            TEXT NOT NULL,
  decided_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  replay_on_future_runs INTEGER NOT NULL DEFAULT 1,
  superseded_by         TEXT
);
CREATE INDEX human_identity_decisions_entity_a_mention_id_idx ON human_identity_decisions (entity_a_mention_id);
CREATE INDEX human_identity_decisions_entity_b_mention_id_idx ON human_identity_decisions (entity_b_mention_id);

CREATE TABLE relationships (
  relationship_id      TEXT NOT NULL PRIMARY KEY,
  run_id               TEXT NOT NULL REFERENCES runs(run_id),
  source_entity_id     TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  target_entity_id     TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  relationship_type    TEXT NOT NULL,
  valid_from           TEXT,
  valid_to             TEXT,
  evidence_id          TEXT NOT NULL REFERENCES evidence_spans(evidence_id),
  confidence           REAL NOT NULL,
  freshness_multiplier REAL NOT NULL,
  source_reliability   REAL NOT NULL,
  edge_weight          REAL NOT NULL,
  status               TEXT NOT NULL,
  deleted_at           TEXT
);
CREATE INDEX relationships_run_id_idx ON relationships (run_id);
CREATE INDEX relationships_source_entity_id_idx ON relationships (source_entity_id);
CREATE INDEX relationships_target_entity_id_idx ON relationships (target_entity_id);
CREATE INDEX relationships_relationship_type_idx ON relationships (relationship_type);

CREATE TABLE donation_events (
  donation_event_id    TEXT NOT NULL PRIMARY KEY,
  run_id               TEXT REFERENCES runs(run_id),
  donor_entity_id      TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  recipient_entity_id  TEXT REFERENCES canonical_entities(canonical_entity_id),
  amount               REAL,
  currency             TEXT,
  year                 INTEGER,
  evidence_id          TEXT REFERENCES evidence_spans(evidence_id),
  confidence           REAL,
  deleted_at           TEXT,
  evidence_url         TEXT,
  source               TEXT,
  detail               TEXT,
  CONSTRAINT donation_events_evidence_present
    CHECK (evidence_id IS NOT NULL OR evidence_url IS NOT NULL)
);
CREATE INDEX donation_events_run_id_idx ON donation_events (run_id);
CREATE INDEX donation_events_donor_entity_id_idx ON donation_events (donor_entity_id);
CREATE INDEX donation_events_recipient_entity_id_idx ON donation_events (recipient_entity_id);

CREATE TABLE graph_snapshots (
  snapshot_id    TEXT NOT NULL PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES runs(run_id),
  storage_uri    TEXT NOT NULL,
  node_count     INTEGER NOT NULL,
  edge_count     INTEGER NOT NULL,
  built_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);

-- =========================================================
-- DISCOVERY & REVIEW (00001, extended by 00004, 00006, 00007, 00012, 00016)
-- =========================================================

CREATE TABLE seeds (
  seed_id              TEXT NOT NULL PRIMARY KEY,
  canonical_entity_id  TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  added_by             TEXT NOT NULL,
  added_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notes                TEXT,
  active               INTEGER NOT NULL DEFAULT 1,
  seed_quality_score   REAL,
  import_row_id        TEXT,
  tier                 TEXT,
  funder_type          TEXT,
  sub_type             TEXT,
  augmentation_status  TEXT NOT NULL DEFAULT 'not_started'
);

CREATE TABLE candidate_recommendations (
  candidate_recommendation_id  TEXT NOT NULL PRIMARY KEY,
  run_id                       TEXT NOT NULL REFERENCES runs(run_id),
  seed_id                      TEXT NOT NULL REFERENCES seeds(seed_id),
  candidate_entity_id          TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  presentation_group_id        TEXT,
  rank                         INTEGER NOT NULL,
  priority_score               REAL NOT NULL,
  confidence_score             REAL NOT NULL,
  status                       TEXT NOT NULL,
  strongest_path               TEXT NOT NULL,
  reason_codes                 TEXT NOT NULL,
  identity_warnings            TEXT NOT NULL DEFAULT '[]',
  created_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at                   TEXT,
  introduction_route_id        TEXT
    CONSTRAINT candidate_recommendations_introduction_route_id_fkey REFERENCES introduction_routes(route_id),
  target_seed_id               TEXT
    CONSTRAINT candidate_recommendations_target_seed_id_fkey REFERENCES seeds(seed_id),
  UNIQUE (run_id, seed_id, candidate_entity_id)
);
CREATE INDEX candidate_recommendations_run_id_seed_id_idx ON candidate_recommendations (run_id, seed_id);
CREATE INDEX candidate_recommendations_status_idx ON candidate_recommendations (status);
CREATE INDEX candidate_recommendations_presentation_group_id_idx ON candidate_recommendations (presentation_group_id);

CREATE TABLE enrichment_signals (
  enrichment_signal_id  TEXT NOT NULL PRIMARY KEY,
  candidate_entity_id   TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  source                TEXT NOT NULL,
  external_record_id    TEXT NOT NULL,
  signal_type           TEXT NOT NULL,
  signal_payload        TEXT NOT NULL,
  match_confidence      REAL NOT NULL,
  retrieved_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cache_expires_at      TEXT NOT NULL,
  accepted_for_scoring  INTEGER NOT NULL,
  status                TEXT NOT NULL,
  deleted_at            TEXT,
  UNIQUE (candidate_entity_id, source, external_record_id)
);
CREATE INDEX enrichment_signals_candidate_entity_id_idx ON enrichment_signals (candidate_entity_id);
CREATE INDEX enrichment_signals_source_idx ON enrichment_signals (source);
CREATE INDEX enrichment_signals_cache_expires_at_idx ON enrichment_signals (cache_expires_at);

CREATE TABLE human_decisions (
  human_decision_id            TEXT NOT NULL PRIMARY KEY,
  candidate_recommendation_id  TEXT NOT NULL REFERENCES candidate_recommendations(candidate_recommendation_id),
  decision                     TEXT NOT NULL,
  reason_code                  TEXT,
  notes                        TEXT,
  decided_by                   TEXT NOT NULL,
  decided_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cold_start_decision          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX human_decisions_candidate_recommendation_id_idx ON human_decisions (candidate_recommendation_id);
CREATE INDEX human_decisions_decision_idx ON human_decisions (decision);

CREATE TABLE intro_outcomes (
  intro_outcome_id             TEXT NOT NULL PRIMARY KEY,
  candidate_recommendation_id  TEXT REFERENCES candidate_recommendations(candidate_recommendation_id),
  seed_id                      TEXT REFERENCES seeds(seed_id),
  intro_status                 TEXT NOT NULL,
  decline_reason               TEXT,
  meeting_at                   TEXT,
  converted                    INTEGER,
  notes                        TEXT,
  recorded_by                  TEXT NOT NULL,
  recorded_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  entity_id                    TEXT REFERENCES canonical_entities(canonical_entity_id),
  introducer_name              TEXT,
  via_organisation             TEXT,
  CONSTRAINT intro_outcomes_anchor_check
    CHECK (candidate_recommendation_id IS NOT NULL OR entity_id IS NOT NULL)
);
CREATE INDEX intro_outcomes_candidate_recommendation_id_idx ON intro_outcomes (candidate_recommendation_id);
CREATE INDEX intro_outcomes_entity_id_idx ON intro_outcomes (entity_id);

-- =========================================================
-- CONFIG & OPERATIONS (00001, extended by 00005, 00006)
-- =========================================================

CREATE TABLE scoring_configs (
  scoring_config_version  TEXT NOT NULL PRIMARY KEY,
  config                  TEXT NOT NULL,
  promoted_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  promoted_by             TEXT NOT NULL,
  rationale               TEXT
);

CREATE TABLE icp_configs (
  icp_id      TEXT NOT NULL PRIMARY KEY,
  config      TEXT NOT NULL,
  version     TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE quarantine (
  quarantine_id   TEXT NOT NULL PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(run_id),
  source_phase    TEXT NOT NULL,
  source_record   TEXT NOT NULL,
  reason_code     TEXT NOT NULL,
  details         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX quarantine_run_id_idx ON quarantine (run_id);
CREATE INDEX quarantine_reason_code_idx ON quarantine (reason_code);

-- 00005 made (run_id, phase) unique; 00006 reverted it to a plain index. Final state: plain index.
CREATE TABLE pipeline_jobs (
  job_id       TEXT NOT NULL PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(run_id),
  phase        TEXT NOT NULL,
  status       TEXT NOT NULL,
  priority     INTEGER NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  payload      TEXT,
  error        TEXT,
  enqueued_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at   TEXT,
  finished_at  TEXT
);
CREATE INDEX pipeline_jobs_status_priority_idx ON pipeline_jobs (status, priority);
CREATE INDEX pipeline_jobs_run_id_phase_idx ON pipeline_jobs (run_id, phase);

CREATE TABLE known_contacts (
  canonical_entity_id      TEXT NOT NULL PRIMARY KEY REFERENCES canonical_entities(canonical_entity_id),
  added_by                 TEXT NOT NULL,
  added_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  source                   TEXT NOT NULL,
  exclude_as_candidate     INTEGER NOT NULL DEFAULT 1,
  available_as_introducer  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE rejection_log (
  rejection_log_id     TEXT NOT NULL PRIMARY KEY,
  seed_id              TEXT NOT NULL REFERENCES seeds(seed_id),
  candidate_entity_id  TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  decided_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reason_code          TEXT NOT NULL,
  UNIQUE (seed_id, candidate_entity_id)
);

CREATE TABLE audit_log (
  log_id      TEXT NOT NULL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_log_user_id_idx ON audit_log (user_id);
CREATE INDEX audit_log_action_idx ON audit_log (action);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at);

-- =========================================================
-- SEED IMPORT AND STAGING (00007)
-- =========================================================

CREATE TABLE seed_imports (
  import_id       TEXT NOT NULL PRIMARY KEY,
  import_type     TEXT NOT NULL CHECK (import_type IN ('hnw_targets', 'supporters')),
  file_name       TEXT NOT NULL,
  row_count       INTEGER NOT NULL,
  processed_count INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  imported_by     TEXT NOT NULL,
  imported_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  error           TEXT
);

CREATE TABLE seed_import_rows (
  row_id               TEXT NOT NULL PRIMARY KEY,
  import_id            TEXT NOT NULL REFERENCES seed_imports(import_id),
  row_number           INTEGER NOT NULL,
  raw_data             TEXT NOT NULL,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL,
  tier                 TEXT,
  primary_affiliation  TEXT,
  introduced_by_raw    TEXT,
  email                TEXT,
  funder_type          TEXT,
  sub_type             TEXT,
  canonical_entity_id  TEXT REFERENCES canonical_entities(canonical_entity_id),
  introducer_entity_id TEXT REFERENCES canonical_entities(canonical_entity_id),
  status               TEXT NOT NULL DEFAULT 'pending',
  error                TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX seed_import_rows_import_id_idx ON seed_import_rows (import_id);
CREATE INDEX seed_import_rows_canonical_entity_id_idx ON seed_import_rows (canonical_entity_id);

CREATE TABLE staged_entities (
  staged_entity_id    TEXT NOT NULL PRIMARY KEY,
  display_name        TEXT NOT NULL,
  entity_type         TEXT NOT NULL DEFAULT 'person',
  attributes          TEXT NOT NULL DEFAULT '{}',
  source              TEXT NOT NULL,
  source_run_id       TEXT,
  match_candidate_id  TEXT REFERENCES canonical_entities(canonical_entity_id),
  match_confidence    REAL,
  promotion_status    TEXT NOT NULL DEFAULT 'pending'
    CHECK (promotion_status IN ('pending', 'promoted', 'rejected', 'merged')),
  promoted_entity_id  TEXT REFERENCES canonical_entities(canonical_entity_id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX staged_entities_promotion_status_idx ON staged_entities (promotion_status);

CREATE TABLE entity_aliases (
  alias_id            TEXT NOT NULL PRIMARY KEY,
  alias_entity_id     TEXT NOT NULL,
  canonical_entity_id TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  alias_source        TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (alias_entity_id, canonical_entity_id)
);
CREATE INDEX entity_aliases_alias_entity_id_idx ON entity_aliases (alias_entity_id);
CREATE INDEX entity_aliases_canonical_entity_id_idx ON entity_aliases (canonical_entity_id);

CREATE TABLE introduction_routes (
  route_id              TEXT NOT NULL PRIMARY KEY,
  target_entity_id      TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  introducer_entity_id  TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  route_type            TEXT NOT NULL CHECK (route_type IN (
    'spreadsheet_declared', 'network_inferred', 'corpus_discovered'
  )),
  warmth_tier           INTEGER CHECK (warmth_tier BETWEEN 1 AND 4),
  via_entity_id         TEXT REFERENCES canonical_entities(canonical_entity_id),
  via_organisation      TEXT,
  evidence              TEXT NOT NULL DEFAULT '{}',
  source                TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX introduction_routes_route_key_uidx ON introduction_routes
  (target_entity_id, introducer_entity_id, route_type, coalesce(via_entity_id, '__none__'));
CREATE INDEX introduction_routes_target_entity_id_idx ON introduction_routes (target_entity_id);
CREATE INDEX introduction_routes_introducer_entity_id_idx ON introduction_routes (introducer_entity_id);

-- =========================================================
-- AUGMENTATION (00008)
-- =========================================================

CREATE TABLE seed_augmentation_runs (
  augmentation_run_id   TEXT NOT NULL PRIMARY KEY,
  canonical_entity_id   TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  run_id                TEXT REFERENCES runs(run_id),
  phase                 TEXT NOT NULL CHECK (phase IN ('research', 'network_mapping')),
  prompt_version        TEXT NOT NULL,
  model                 TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',
  result_storage_uri    TEXT,
  result_summary        TEXT,
  input_tokens          INTEGER,
  output_tokens         INTEGER,
  estimated_cost_usd    REAL,
  started_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at          TEXT,
  error                 TEXT
);
CREATE INDEX seed_augmentation_runs_canonical_entity_id_phase_idx ON seed_augmentation_runs (canonical_entity_id, phase);
CREATE INDEX seed_augmentation_runs_status_idx ON seed_augmentation_runs (status);

CREATE TABLE network_connections (
  connection_id         TEXT NOT NULL PRIMARY KEY,
  source_entity_id      TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  connected_entity_id   TEXT REFERENCES canonical_entities(canonical_entity_id),
  staged_entity_id      TEXT REFERENCES staged_entities(staged_entity_id),
  connection_type       TEXT NOT NULL,
  via_organisation      TEXT,
  via_organisation_id   TEXT REFERENCES canonical_entities(canonical_entity_id),
  priority              INTEGER,
  augmentation_run_id   TEXT REFERENCES seed_augmentation_runs(augmentation_run_id),
  background_check      TEXT NOT NULL DEFAULT '{}',
  evidence              TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (connected_entity_id IS NOT NULL OR staged_entity_id IS NOT NULL)
);
CREATE UNIQUE INDEX network_connections_edge_key_uidx ON network_connections
  (source_entity_id, coalesce(connected_entity_id, staged_entity_id),
   connection_type, coalesce(via_organisation, '__none__'));
CREATE INDEX network_connections_source_entity_id_idx ON network_connections (source_entity_id);
CREATE INDEX network_connections_connected_entity_id_idx ON network_connections (connected_entity_id);
CREATE INDEX network_connections_staged_entity_id_idx ON network_connections (staged_entity_id);

-- =========================================================
-- SWEEP GRAPH STORAGE (00009)
-- =========================================================

CREATE TABLE entity_articles (
  article_id        TEXT NOT NULL PRIMARY KEY,
  entity_id         TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  url               TEXT NOT NULL,
  title             TEXT NOT NULL,
  source_name       TEXT NOT NULL,
  published_date    TEXT,
  excerpt           TEXT,
  article_type      TEXT NOT NULL CHECK (article_type IN (
    'news', 'filing', 'profile', 'philanthropy', 'rich_list', 'other'
  )),
  enrichment_source TEXT NOT NULL,
  source_layer      TEXT NOT NULL CHECK (source_layer IN ('A', 'B', 'C')),
  sweep_run_id      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (entity_id, url)
);
CREATE INDEX entity_articles_entity_id_idx ON entity_articles (entity_id);
CREATE INDEX entity_articles_article_type_idx ON entity_articles (article_type);
CREATE INDEX entity_articles_enrichment_source_idx ON entity_articles (enrichment_source);

CREATE TABLE enrichment_evidence (
  evidence_id         TEXT NOT NULL PRIMARY KEY,
  entity_id           TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  source              TEXT NOT NULL,
  source_layer        TEXT NOT NULL CHECK (source_layer IN ('A', 'B', 'C')),
  evidence_url        TEXT,
  evidence_text       TEXT NOT NULL,
  confidence          REAL NOT NULL,
  sweep_run_id        TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX enrichment_evidence_entity_id_idx ON enrichment_evidence (entity_id);
CREATE INDEX enrichment_evidence_source_idx ON enrichment_evidence (source);

CREATE TABLE sweep_runs (
  sweep_run_id        TEXT NOT NULL PRIMARY KEY,
  entity_id           TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  run_id              TEXT REFERENCES runs(run_id),
  layers_completed    TEXT NOT NULL DEFAULT '[]',
  wealth_band         TEXT,
  wealth_score        REAL,
  signals_count       INTEGER NOT NULL DEFAULT 0,
  relationships_found INTEGER NOT NULL DEFAULT 0,
  articles_found      INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  started_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at        TEXT,
  error               TEXT
);
CREATE INDEX sweep_runs_entity_id_idx ON sweep_runs (entity_id);
CREATE INDEX sweep_runs_status_idx ON sweep_runs (status);

-- =========================================================
-- WEALTH AND CO-DIRECTORS (00010)
-- =========================================================

CREATE TABLE wealth_estimates (
  wealth_estimate_id   TEXT NOT NULL PRIMARY KEY,
  entity_id            TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  band                 TEXT NOT NULL CHECK (band IN ('unknown','1m_5m','5m_25m','25m_100m','100m_plus')),
  score                REAL NOT NULL,
  confidence           REAL NOT NULL,
  evidence             TEXT NOT NULL DEFAULT '[]',
  sweep_run_id         TEXT REFERENCES sweep_runs(sweep_run_id),
  assessed_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (entity_id, sweep_run_id)
);
CREATE INDEX wealth_estimates_entity_id_idx ON wealth_estimates (entity_id);
CREATE INDEX wealth_estimates_band_idx ON wealth_estimates (band);
CREATE INDEX wealth_estimates_score_idx ON wealth_estimates (score DESC);

CREATE TABLE co_director_edges (
  co_director_edge_id   TEXT NOT NULL PRIMARY KEY,
  seed_entity_id        TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  co_director_entity_id TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id),
  company_number        TEXT NOT NULL,
  company_name          TEXT NOT NULL,
  seed_role             TEXT,
  co_director_role      TEXT,
  co_director_name      TEXT NOT NULL,
  appointed_on          TEXT,
  resigned_on           TEXT,
  confidence            REAL NOT NULL DEFAULT 0.95,
  sweep_run_id          TEXT REFERENCES sweep_runs(sweep_run_id),
  evidence_id           TEXT REFERENCES enrichment_evidence(evidence_id),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (seed_entity_id, co_director_entity_id, company_number)
);
CREATE INDEX co_director_edges_seed_entity_id_idx ON co_director_edges (seed_entity_id);
CREATE INDEX co_director_edges_co_director_entity_id_idx ON co_director_edges (co_director_entity_id);
CREATE INDEX co_director_edges_company_number_idx ON co_director_edges (company_number);

-- =========================================================
-- ANALYST HYGIENE AND LEAD SCORES (00012)
-- =========================================================

CREATE TABLE entity_notes (
  note_id     TEXT NOT NULL PRIMARY KEY,
  entity_id   TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id) ON DELETE CASCADE,
  author      TEXT NOT NULL DEFAULT 'analyst',
  body        TEXT NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX entity_notes_entity_id_created_at_idx ON entity_notes (entity_id, created_at DESC);

CREATE TABLE connection_overrides (
  override_id           TEXT NOT NULL PRIMARY KEY,
  connection_id         TEXT REFERENCES network_connections(connection_id),
  co_director_edge_id   TEXT REFERENCES co_director_edges(co_director_edge_id),
  source_entity_id      TEXT REFERENCES canonical_entities(canonical_entity_id),
  connected_entity_id   TEXT REFERENCES canonical_entities(canonical_entity_id),
  action                TEXT NOT NULL DEFAULT 'remove' CHECK (action IN ('remove', 'downweight')),
  reason                TEXT,
  author                TEXT NOT NULL DEFAULT 'analyst',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (
    connection_id IS NOT NULL
    OR co_director_edge_id IS NOT NULL
    OR (source_entity_id IS NOT NULL AND connected_entity_id IS NOT NULL)
  )
);
CREATE INDEX connection_overrides_source_entity_id_connected_entity_id_idx ON connection_overrides (source_entity_id, connected_entity_id);
CREATE INDEX connection_overrides_connection_id_idx ON connection_overrides (connection_id);
CREATE INDEX connection_overrides_co_director_edge_id_idx ON connection_overrides (co_director_edge_id);

CREATE TABLE lead_scores (
  entity_id      TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id) ON DELETE CASCADE,
  config_version TEXT NOT NULL,
  composite      INTEGER NOT NULL,
  connectivity   INTEGER NOT NULL,
  wealth         INTEGER NOT NULL,
  paths          INTEGER NOT NULL,
  affinity       INTEGER NOT NULL,
  min_hops       INTEGER,
  path_count     INTEGER NOT NULL DEFAULT 0,
  category       TEXT,
  computed_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (entity_id, config_version)
);
CREATE INDEX lead_scores_config_version_composite_idx ON lead_scores (config_version, composite DESC);

-- =========================================================
-- SUGGESTED TIES (00013), TAGS AND COHORTS (00014), OVERRIDES (00016)
-- =========================================================

CREATE TABLE suggested_tie_decisions (
  decision_id  TEXT NOT NULL PRIMARY KEY,
  entity_a     TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id) ON DELETE CASCADE,
  entity_b     TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id) ON DELETE CASCADE,
  decision     TEXT NOT NULL CHECK (decision IN ('confirmed', 'dismissed')),
  reason       TEXT,
  author       TEXT NOT NULL DEFAULT 'analyst',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (entity_a, entity_b)
);
CREATE INDEX suggested_tie_decisions_decision_idx ON suggested_tie_decisions (decision);

CREATE TABLE entity_tags (
  tag_id      TEXT NOT NULL PRIMARY KEY,
  entity_id   TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT 'analyst',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (entity_id, tag)
);
CREATE INDEX entity_tags_entity_id_idx ON entity_tags (entity_id);

CREATE TABLE lead_cohorts (
  cohort_id    TEXT NOT NULL PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  created_by   TEXT NOT NULL DEFAULT 'analyst',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE lead_cohort_members (
  cohort_id  TEXT NOT NULL REFERENCES lead_cohorts(cohort_id) ON DELETE CASCADE,
  entity_id  TEXT NOT NULL REFERENCES canonical_entities(canonical_entity_id) ON DELETE CASCADE,
  added_by   TEXT NOT NULL DEFAULT 'analyst',
  added_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (cohort_id, entity_id)
);

CREATE TABLE wealth_overrides (
  override_id  TEXT NOT NULL PRIMARY KEY,
  entity_id    TEXT NOT NULL UNIQUE REFERENCES canonical_entities(canonical_entity_id) ON DELETE CASCADE,
  band         TEXT NOT NULL,
  reason       TEXT,
  author       TEXT NOT NULL DEFAULT 'analyst',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX wealth_overrides_entity_id_idx ON wealth_overrides (entity_id);
