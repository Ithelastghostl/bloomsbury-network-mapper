-- 00009_sweep_graph_storage.sql
-- Support storing enrichment sweep discoveries as graph nodes/edges.
-- Adds entity_articles table and makes evidence_spans work for web-sourced evidence.

-- =========================================================
-- ENTITY ARTICLES: discovered articles linked to entities
-- =========================================================

create table app.entity_articles (
  article_id        text primary key,
  entity_id         text not null references app.canonical_entities(canonical_entity_id),
  url               text not null,
  title             text not null,
  source_name       text not null,
  published_date    date,
  excerpt           text,
  article_type      text not null check (article_type in (
    'news', 'filing', 'profile', 'philanthropy', 'rich_list', 'other'
  )),
  enrichment_source text not null,
  source_layer      text not null check (source_layer in ('A', 'B', 'C')),
  sweep_run_id      text,
  created_at        timestamptz not null default now(),
  unique (entity_id, url)
);
create index on app.entity_articles (entity_id);
create index on app.entity_articles (article_type);
create index on app.entity_articles (enrichment_source);

-- =========================================================
-- ENRICHMENT EVIDENCE: web-sourced evidence for relationships
-- Unlike corpus evidence_spans (which need document_id), enrichment
-- evidence comes from APIs and web sources with a URL instead.
-- =========================================================

create table app.enrichment_evidence (
  evidence_id         text primary key,
  entity_id           text not null references app.canonical_entities(canonical_entity_id),
  source              text not null,
  source_layer        text not null check (source_layer in ('A', 'B', 'C')),
  evidence_url        text,
  evidence_text       text not null,
  confidence          numeric not null,
  sweep_run_id        text,
  created_at          timestamptz not null default now()
);
create index on app.enrichment_evidence (entity_id);
create index on app.enrichment_evidence (source);

-- =========================================================
-- SWEEP RUNS: track unified sweep executions per entity
-- =========================================================

create table app.sweep_runs (
  sweep_run_id        text primary key,
  entity_id           text not null references app.canonical_entities(canonical_entity_id),
  run_id              text references app.runs(run_id),
  layers_completed    text[] not null default '{}',
  wealth_band         text,
  wealth_score        numeric,
  signals_count       int not null default 0,
  relationships_found int not null default 0,
  articles_found      int not null default 0,
  status              text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  error               jsonb
);
create index on app.sweep_runs (entity_id);
create index on app.sweep_runs (status);

-- =========================================================
-- RLS
-- =========================================================

alter table app.entity_articles enable row level security;
alter table app.enrichment_evidence enable row level security;
alter table app.sweep_runs enable row level security;

-- Admin full access
create policy entity_articles_select_admin on app.entity_articles for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_articles_insert_admin on app.entity_articles for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_articles_update_admin on app.entity_articles for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_articles_delete_admin on app.entity_articles for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy enrichment_evidence_select_admin on app.enrichment_evidence for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy enrichment_evidence_insert_admin on app.enrichment_evidence for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy enrichment_evidence_update_admin on app.enrichment_evidence for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy enrichment_evidence_delete_admin on app.enrichment_evidence for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy sweep_runs_select_admin on app.sweep_runs for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy sweep_runs_insert_admin on app.sweep_runs for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy sweep_runs_update_admin on app.sweep_runs for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy sweep_runs_delete_admin on app.sweep_runs for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- Authenticated read access
create policy entity_articles_select_authenticated on app.entity_articles for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy enrichment_evidence_select_authenticated on app.enrichment_evidence for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy sweep_runs_select_authenticated on app.sweep_runs for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
