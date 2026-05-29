-- 00011_batch_ingest_helpers.sql
-- pg_trgm entity matching RPC and batch ingest summary view.

-- Ensure pg_trgm is available
create extension if not exists pg_trgm schema public;

-- =========================================================
-- RPC: fuzzy entity match using pg_trgm similarity
-- =========================================================

create or replace function app.match_entities_by_name(
  search_name text,
  min_similarity float default 0.3,
  max_results int default 5
)
returns table (
  canonical_entity_id text,
  display_name text,
  entity_type text,
  similarity float
)
language sql stable
as $$
  select
    ce.canonical_entity_id,
    ce.display_name,
    ce.entity_type,
    public.similarity(lower(ce.display_name), lower(search_name)) as similarity
  from app.canonical_entities ce
  where public.similarity(lower(ce.display_name), lower(search_name)) >= min_similarity
  order by similarity desc
  limit max_results;
$$;

-- GIN index to accelerate trgm searches
create index if not exists idx_canonical_entities_display_name_trgm
  on app.canonical_entities using gin (display_name public.gin_trgm_ops);

-- =========================================================
-- VIEW: batch ingest summary — joins sweep_runs with entity details
-- =========================================================

create or replace view app.batch_ingest_summary as
select
  sr.sweep_run_id,
  sr.run_id,
  sr.entity_id,
  ce.display_name,
  ce.entity_type,
  sr.status,
  sr.wealth_band,
  sr.wealth_score,
  sr.signals_count,
  sr.relationships_found,
  sr.articles_found,
  sr.layers_completed,
  sr.started_at,
  sr.completed_at,
  (select count(*) from app.network_connections nc
   where nc.source_entity_id = sr.entity_id) as total_connections,
  (select count(*) from app.co_director_edges cde
   where cde.seed_entity_id = sr.entity_id) as total_co_directors,
  (select count(*) from app.enrichment_evidence ee
   where ee.entity_id = sr.entity_id) as total_evidence
from app.sweep_runs sr
join app.canonical_entities ce on ce.canonical_entity_id = sr.entity_id
order by sr.started_at desc;
