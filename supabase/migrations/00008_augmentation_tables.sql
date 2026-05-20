-- 00008_augmentation_tables.sql
-- Seed augmentation runs and network connections tables.

-- =========================================================
-- SEED AUGMENTATION RUNS: LLM research + network mapping jobs
-- =========================================================

create table app.seed_augmentation_runs (
  augmentation_run_id   text primary key,
  canonical_entity_id   text not null references app.canonical_entities(canonical_entity_id),
  run_id                text references app.runs(run_id),
  phase                 text not null check (phase in ('research', 'network_mapping')),
  prompt_version        text not null,
  model                 text not null,
  status                text not null default 'pending',
  result_storage_uri    text,
  result_summary        jsonb,
  input_tokens          int,
  output_tokens         int,
  estimated_cost_usd    numeric,
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  error                 jsonb
);
create index on app.seed_augmentation_runs (canonical_entity_id, phase);
create index on app.seed_augmentation_runs (status);

-- =========================================================
-- NETWORK CONNECTIONS: discovered relationships from augmentation
-- =========================================================

create table app.network_connections (
  connection_id         text primary key,
  source_entity_id      text not null references app.canonical_entities(canonical_entity_id),
  connected_entity_id   text references app.canonical_entities(canonical_entity_id),
  staged_entity_id      text references app.staged_entities(staged_entity_id),
  connection_type       text not null,
  via_organisation      text,
  via_organisation_id   text references app.canonical_entities(canonical_entity_id),
  priority              int,
  augmentation_run_id   text references app.seed_augmentation_runs(augmentation_run_id),
  background_check      jsonb not null default '{}',
  evidence              jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  check (connected_entity_id is not null or staged_entity_id is not null)
);
create unique index on app.network_connections
  (source_entity_id, coalesce(connected_entity_id, staged_entity_id),
   connection_type, coalesce(via_organisation, '__none__'));
create index on app.network_connections (source_entity_id);
create index on app.network_connections (connected_entity_id);
create index on app.network_connections (staged_entity_id);

-- =========================================================
-- RLS
-- =========================================================

alter table app.seed_augmentation_runs enable row level security;
alter table app.network_connections enable row level security;

-- Admin full access
create policy seed_augmentation_runs_select_admin on app.seed_augmentation_runs for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy seed_augmentation_runs_insert_admin on app.seed_augmentation_runs for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy seed_augmentation_runs_update_admin on app.seed_augmentation_runs for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy seed_augmentation_runs_delete_admin on app.seed_augmentation_runs for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy network_connections_select_admin on app.network_connections for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy network_connections_insert_admin on app.network_connections for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy network_connections_update_admin on app.network_connections for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy network_connections_delete_admin on app.network_connections for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- Authenticated read access
create policy seed_augmentation_runs_select_authenticated on app.seed_augmentation_runs for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy network_connections_select_authenticated on app.network_connections for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
