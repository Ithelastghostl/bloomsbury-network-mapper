-- 00014_tags_and_cohorts.sql
-- Structured tagging (IDEA 9) and lead cohorts (IDEA 10): free-form + pick-list
-- analyst tags on entities, and named, status-bearing groupings of entities the
-- analyst curates for outreach. Pure additive — no existing tables touched.

-- =========================================================
-- ENTITY TAGS: analyst tags per entity (pick-list or free-text)
-- =========================================================

create table app.entity_tags (
  tag_id      text primary key,
  entity_id   text not null references app.canonical_entities(canonical_entity_id) on delete cascade,
  tag         text not null,
  author      text not null default 'analyst',
  created_at  timestamptz not null default now(),
  unique (entity_id, tag)
);
create index on app.entity_tags (entity_id);

-- =========================================================
-- LEAD COHORTS: named, curated groupings of entities for outreach
-- =========================================================

create table app.lead_cohorts (
  cohort_id    text primary key,
  name         text not null,
  description  text,
  status       text not null default 'active',
  created_by   text not null default 'analyst',
  created_at   timestamptz not null default now()
);

-- =========================================================
-- LEAD COHORT MEMBERS: entities belonging to a cohort
-- =========================================================

create table app.lead_cohort_members (
  cohort_id  text not null references app.lead_cohorts(cohort_id) on delete cascade,
  entity_id  text not null references app.canonical_entities(canonical_entity_id) on delete cascade,
  added_by   text not null default 'analyst',
  added_at   timestamptz not null default now(),
  primary key (cohort_id, entity_id)
);

-- =========================================================
-- RLS
-- =========================================================

alter table app.entity_tags enable row level security;
alter table app.lead_cohorts enable row level security;
alter table app.lead_cohort_members enable row level security;

create policy entity_tags_select_admin on app.entity_tags for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_tags_insert_admin on app.entity_tags for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_tags_update_admin on app.entity_tags for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_tags_delete_admin on app.entity_tags for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy lead_cohorts_select_admin on app.lead_cohorts for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy lead_cohorts_insert_admin on app.lead_cohorts for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy lead_cohorts_update_admin on app.lead_cohorts for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy lead_cohorts_delete_admin on app.lead_cohorts for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy lead_cohort_members_select_admin on app.lead_cohort_members for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy lead_cohort_members_insert_admin on app.lead_cohort_members for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy lead_cohort_members_update_admin on app.lead_cohort_members for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy lead_cohort_members_delete_admin on app.lead_cohort_members for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy entity_tags_select_authenticated on app.entity_tags for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy lead_cohorts_select_authenticated on app.lead_cohorts for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy lead_cohort_members_select_authenticated on app.lead_cohort_members for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
