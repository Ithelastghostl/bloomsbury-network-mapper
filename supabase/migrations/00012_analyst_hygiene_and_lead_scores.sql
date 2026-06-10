-- 00012_analyst_hygiene_and_lead_scores.sql
-- Analyst hygiene surfaces (persistent entity notes, connection suppressions),
-- persisted lead scores keyed to a scoring-config version, and CRM-originated
-- intro outcomes (relaxes the candidate-pipeline-only FK requirement).

-- =========================================================
-- ENTITY NOTES: persistent analyst notes per entity
-- =========================================================

create table app.entity_notes (
  note_id     text primary key,
  entity_id   text not null references app.canonical_entities(canonical_entity_id) on delete cascade,
  author      text not null default 'analyst',
  body        text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on app.entity_notes (entity_id, created_at desc);

-- =========================================================
-- CONNECTION OVERRIDES: human suppression/downweight of edges.
-- Suppressions are recorded, never hard-deleted, and must be
-- replayed by every graph/path computation (human decisions win).
-- An override targets a stored edge (network_connections or
-- co_director_edges row) and/or an entity pair for derived edges.
-- =========================================================

create table app.connection_overrides (
  override_id           text primary key,
  connection_id         text references app.network_connections(connection_id),
  co_director_edge_id   text references app.co_director_edges(co_director_edge_id),
  source_entity_id      text references app.canonical_entities(canonical_entity_id),
  connected_entity_id   text references app.canonical_entities(canonical_entity_id),
  action                text not null default 'remove' check (action in ('remove', 'downweight')),
  reason                text,
  author                text not null default 'analyst',
  created_at            timestamptz not null default now(),
  check (
    connection_id is not null
    or co_director_edge_id is not null
    or (source_entity_id is not null and connected_entity_id is not null)
  )
);
create index on app.connection_overrides (source_entity_id, connected_entity_id);
create index on app.connection_overrides (connection_id);
create index on app.connection_overrides (co_director_edge_id);

-- =========================================================
-- LEAD SCORES: persisted Lead Generator scores per config version
-- =========================================================

create table app.lead_scores (
  entity_id      text not null references app.canonical_entities(canonical_entity_id) on delete cascade,
  config_version text not null,
  composite      integer not null,
  connectivity   integer not null,
  wealth         integer not null,
  paths          integer not null,
  affinity       integer not null,
  min_hops       integer,
  path_count     integer not null default 0,
  category       text,
  computed_at    timestamptz not null default now(),
  primary key (entity_id, config_version)
);
create index on app.lead_scores (config_version, composite desc);

-- =========================================================
-- INTRO OUTCOMES: allow CRM action-backlog outcomes.
-- Originally outcomes anchored to candidate_recommendations + seeds
-- (run pipeline). CRM actions anchor to a canonical entity instead,
-- so the pipeline anchors become optional with a presence check.
-- =========================================================

alter table app.intro_outcomes alter column candidate_recommendation_id drop not null;
alter table app.intro_outcomes alter column seed_id drop not null;
alter table app.intro_outcomes add column entity_id text references app.canonical_entities(canonical_entity_id);
alter table app.intro_outcomes add constraint intro_outcomes_anchor_check
  check (candidate_recommendation_id is not null or entity_id is not null);
create index on app.intro_outcomes (entity_id);

-- =========================================================
-- RLS
-- =========================================================

alter table app.entity_notes enable row level security;
alter table app.connection_overrides enable row level security;
alter table app.lead_scores enable row level security;

create policy entity_notes_select_admin on app.entity_notes for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_notes_insert_admin on app.entity_notes for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_notes_update_admin on app.entity_notes for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_notes_delete_admin on app.entity_notes for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy connection_overrides_select_admin on app.connection_overrides for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy connection_overrides_insert_admin on app.connection_overrides for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy connection_overrides_update_admin on app.connection_overrides for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy connection_overrides_delete_admin on app.connection_overrides for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy lead_scores_select_admin on app.lead_scores for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy lead_scores_insert_admin on app.lead_scores for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy lead_scores_update_admin on app.lead_scores for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy lead_scores_delete_admin on app.lead_scores for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy entity_notes_select_authenticated on app.entity_notes for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy connection_overrides_select_authenticated on app.connection_overrides for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy lead_scores_select_authenticated on app.lead_scores for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
