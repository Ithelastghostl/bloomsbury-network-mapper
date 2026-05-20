-- 00007_seed_import_staging_tables.sql
-- New tables for seed import, entity staging, aliases, and introduction routes.

-- =========================================================
-- BOOTSTRAP NAME MATCH FUNCTION (pg_trgm)
-- Used by seed_bootstrap phase for conservative name matching.
-- =========================================================

create or replace function app.bootstrap_name_match(
  search_name text,
  match_threshold numeric default 0.6,
  result_limit int default 5
)
returns table (
  canonical_entity_id text,
  display_name text,
  similarity numeric,
  attributes jsonb
)
language sql stable security definer
as $$
  select
    ce.canonical_entity_id,
    ce.display_name,
    similarity(ce.display_name, search_name)::numeric as similarity,
    ce.attributes
  from app.canonical_entities ce
  where ce.entity_type = 'person'
    and similarity(ce.display_name, search_name) >= match_threshold
  order by similarity(ce.display_name, search_name) desc
  limit result_limit;
$$;

-- =========================================================
-- SEED IMPORTS: spreadsheet upload tracking
-- =========================================================

create table app.seed_imports (
  import_id       text primary key,
  import_type     text not null check (import_type in ('hnw_targets', 'supporters')),
  file_name       text not null,
  row_count       int not null,
  processed_count int not null default 0,
  status          text not null default 'pending',
  imported_by     text not null,
  imported_at     timestamptz not null default now(),
  error           jsonb
);

-- =========================================================
-- SEED IMPORT ROWS: parsed spreadsheet rows
-- =========================================================

create table app.seed_import_rows (
  row_id               text primary key,
  import_id            text not null references app.seed_imports(import_id),
  row_number           int not null,
  raw_data             jsonb not null,
  first_name           text not null,
  last_name            text not null,
  tier                 text,
  primary_affiliation  text,
  introduced_by_raw    text,
  email                text,
  funder_type          text,
  sub_type             text,
  canonical_entity_id  text references app.canonical_entities(canonical_entity_id),
  introducer_entity_id text references app.canonical_entities(canonical_entity_id),
  status               text not null default 'pending',
  error                text,
  created_at           timestamptz not null default now()
);
create index on app.seed_import_rows (import_id);
create index on app.seed_import_rows (canonical_entity_id);

-- =========================================================
-- STAGED ENTITIES: LLM-discovered people before promotion
-- =========================================================

create table app.staged_entities (
  staged_entity_id    text primary key,
  display_name        text not null,
  entity_type         text not null default 'person',
  attributes          jsonb not null default '{}',
  source              text not null,
  source_run_id       text,
  match_candidate_id  text references app.canonical_entities(canonical_entity_id),
  match_confidence    numeric,
  promotion_status    text not null default 'pending'
    check (promotion_status in ('pending', 'promoted', 'rejected', 'merged')),
  promoted_entity_id  text references app.canonical_entities(canonical_entity_id),
  created_at          timestamptz not null default now()
);
create index on app.staged_entities (promotion_status);
create index on app.staged_entities using gin (display_name gin_trgm_ops);

-- =========================================================
-- ENTITY ALIASES: merge model (no FK rewrites)
-- =========================================================

create table app.entity_aliases (
  alias_id            text primary key,
  alias_entity_id     text not null,
  canonical_entity_id text not null references app.canonical_entities(canonical_entity_id),
  alias_source        text not null,
  created_at          timestamptz not null default now(),
  unique (alias_entity_id, canonical_entity_id)
);
create index on app.entity_aliases (alias_entity_id);
create index on app.entity_aliases (canonical_entity_id);

-- =========================================================
-- INTRODUCTION ROUTES: warm paths between entities
-- =========================================================

create table app.introduction_routes (
  route_id              text primary key,
  target_entity_id      text not null references app.canonical_entities(canonical_entity_id),
  introducer_entity_id  text not null references app.canonical_entities(canonical_entity_id),
  route_type            text not null check (route_type in (
    'spreadsheet_declared', 'network_inferred', 'corpus_discovered'
  )),
  warmth_tier           int check (warmth_tier between 1 and 4),
  via_entity_id         text references app.canonical_entities(canonical_entity_id),
  via_organisation      text,
  evidence              jsonb not null default '{}',
  source                text not null,
  created_at            timestamptz not null default now()
);
create unique index on app.introduction_routes
  (target_entity_id, introducer_entity_id, route_type, coalesce(via_entity_id, '__none__'));
create index on app.introduction_routes (target_entity_id);
create index on app.introduction_routes (introducer_entity_id);

-- =========================================================
-- ADD FK from candidate_recommendations to introduction_routes
-- (column added in 00006, FK deferred until table exists)
-- =========================================================

alter table app.candidate_recommendations
  add constraint candidate_recommendations_introduction_route_id_fkey
    foreign key (introduction_route_id) references app.introduction_routes(route_id);

alter table app.candidate_recommendations
  add constraint candidate_recommendations_target_seed_id_fkey
    foreign key (target_seed_id) references app.seeds(seed_id);

-- =========================================================
-- RLS: enable on new tables + admin/authenticated policies
-- (follows pattern from 00002_rls_policies.sql)
-- =========================================================

alter table app.seed_imports enable row level security;
alter table app.seed_import_rows enable row level security;
alter table app.staged_entities enable row level security;
alter table app.entity_aliases enable row level security;
alter table app.introduction_routes enable row level security;

-- Admin full access
create policy seed_imports_select_admin on app.seed_imports for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy seed_imports_insert_admin on app.seed_imports for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy seed_imports_update_admin on app.seed_imports for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy seed_imports_delete_admin on app.seed_imports for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy seed_import_rows_select_admin on app.seed_import_rows for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy seed_import_rows_insert_admin on app.seed_import_rows for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy seed_import_rows_update_admin on app.seed_import_rows for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy seed_import_rows_delete_admin on app.seed_import_rows for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy staged_entities_select_admin on app.staged_entities for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy staged_entities_insert_admin on app.staged_entities for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy staged_entities_update_admin on app.staged_entities for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy staged_entities_delete_admin on app.staged_entities for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy entity_aliases_select_admin on app.entity_aliases for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_aliases_insert_admin on app.entity_aliases for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_aliases_update_admin on app.entity_aliases for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_aliases_delete_admin on app.entity_aliases for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy introduction_routes_select_admin on app.introduction_routes for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy introduction_routes_insert_admin on app.introduction_routes for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy introduction_routes_update_admin on app.introduction_routes for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy introduction_routes_delete_admin on app.introduction_routes for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- Authenticated read access
create policy seed_imports_select_authenticated on app.seed_imports for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy seed_import_rows_select_authenticated on app.seed_import_rows for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy staged_entities_select_authenticated on app.staged_entities for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy entity_aliases_select_authenticated on app.entity_aliases for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy introduction_routes_select_authenticated on app.introduction_routes for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- Senior reviewer+ can promote/reject staged entities
create policy staged_entities_update_senior on app.staged_entities for update using (
  app.user_role() in ('senior_reviewer', 'lead_owner')
);
