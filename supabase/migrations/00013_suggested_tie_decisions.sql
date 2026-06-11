-- 00013_suggested_tie_decisions.sql
-- Human decisions on link-prediction "probably knows" suggestions.
-- Confirming a suggested tie writes a network_connection (INFERRED_CONFIRMED);
-- this table records the decision itself (confirm OR dismiss) so a dismissed
-- pair never resurfaces in the suggested-ties queue, and so confirms are
-- auditable. One decision per unordered entity pair.

-- =========================================================
-- SUGGESTED TIE DECISIONS
-- =========================================================

create table app.suggested_tie_decisions (
  decision_id  text primary key,
  entity_a     text not null references app.canonical_entities(canonical_entity_id) on delete cascade,
  entity_b     text not null references app.canonical_entities(canonical_entity_id) on delete cascade,
  decision     text not null check (decision in ('confirmed', 'dismissed')),
  reason       text,
  author       text not null default 'analyst',
  created_at   timestamptz not null default now(),
  unique (entity_a, entity_b)
);
create index on app.suggested_tie_decisions (decision);

-- =========================================================
-- RLS
-- =========================================================

alter table app.suggested_tie_decisions enable row level security;

create policy suggested_tie_decisions_select_admin on app.suggested_tie_decisions for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy suggested_tie_decisions_insert_admin on app.suggested_tie_decisions for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy suggested_tie_decisions_update_admin on app.suggested_tie_decisions for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy suggested_tie_decisions_delete_admin on app.suggested_tie_decisions for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy suggested_tie_decisions_select_authenticated on app.suggested_tie_decisions for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
