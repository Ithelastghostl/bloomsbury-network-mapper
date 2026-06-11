-- 00016_human_overrides.sql
-- Human-wins overrides and route-level outcome attribution.
--
-- IDEA 14 (human wealth override): a `wealth_overrides` table lets an analyst
-- correct an entity's wealth band by hand. Per the platform rule that human
-- decisions always win, the override is read wherever wealth is consumed and
-- supersedes the automated band.
--
-- IDEA 15 (route-level outcome attribution): the action_item snapshot already
-- freezes root_supporter + via_orgs; this records the same introducer and
-- institution on the intro_outcomes row written when an action progresses, so
-- conversion can be sliced by introducer and by channel.
--
-- Pure additive — no existing tables are modified, only extended with nullable
-- columns.

-- =========================================================
-- WEALTH OVERRIDES: human-corrected wealth band per entity.
-- One live override per entity (unique entity_id); the latest correction wins.
-- Never overrides a human decision with automated logic — this IS the human
-- decision, and it is read ahead of the automated band.
-- =========================================================

create table app.wealth_overrides (
  override_id  text primary key,
  entity_id    text not null unique references app.canonical_entities(canonical_entity_id) on delete cascade,
  band         text not null,
  reason       text,
  author       text not null default 'analyst',
  created_at   timestamptz not null default now()
);
create index on app.wealth_overrides (entity_id);

-- =========================================================
-- INTRO OUTCOMES: route-level attribution columns.
-- Captures the introducer (root supporter) and institution (via organisation)
-- frozen on the action_item, so the Outcomes report can group conversion by
-- introducer and by channel without re-deriving the path.
-- =========================================================

alter table app.intro_outcomes add column introducer_name text;
alter table app.intro_outcomes add column via_organisation text;

-- =========================================================
-- RLS
-- =========================================================

alter table app.wealth_overrides enable row level security;

create policy wealth_overrides_select_admin on app.wealth_overrides for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy wealth_overrides_insert_admin on app.wealth_overrides for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy wealth_overrides_update_admin on app.wealth_overrides for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy wealth_overrides_delete_admin on app.wealth_overrides for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy wealth_overrides_select_authenticated on app.wealth_overrides for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
