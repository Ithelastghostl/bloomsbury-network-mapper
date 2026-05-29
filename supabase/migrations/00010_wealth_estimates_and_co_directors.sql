-- 00010_wealth_estimates_and_co_directors.sql
-- Adds dedicated wealth estimation storage, co-director edge tracking,
-- and a network net worth aggregation view.

-- =========================================================
-- WEALTH ESTIMATES: per-entity, per-sweep wealth assessments
-- =========================================================

create table app.wealth_estimates (
  wealth_estimate_id   text primary key,
  entity_id            text not null references app.canonical_entities(canonical_entity_id),
  band                 text not null check (band in ('unknown','1m_5m','5m_25m','25m_100m','100m_plus')),
  score                numeric not null,
  confidence           numeric not null,
  evidence             jsonb not null default '[]',
  sweep_run_id         text references app.sweep_runs(sweep_run_id),
  assessed_at          timestamptz not null default now(),
  unique (entity_id, sweep_run_id)
);
create index on app.wealth_estimates (entity_id);
create index on app.wealth_estimates (band);
create index on app.wealth_estimates (score desc);

-- =========================================================
-- CO-DIRECTOR EDGES: Companies House officer list discoveries
-- =========================================================

create table app.co_director_edges (
  co_director_edge_id   text primary key,
  seed_entity_id        text not null references app.canonical_entities(canonical_entity_id),
  co_director_entity_id text not null references app.canonical_entities(canonical_entity_id),
  company_number        text not null,
  company_name          text not null,
  seed_role             text,
  co_director_role      text,
  co_director_name      text not null,
  appointed_on          date,
  resigned_on           date,
  confidence            numeric not null default 0.95,
  sweep_run_id          text references app.sweep_runs(sweep_run_id),
  evidence_id           text references app.enrichment_evidence(evidence_id),
  created_at            timestamptz not null default now(),
  unique (seed_entity_id, co_director_entity_id, company_number)
);
create index on app.co_director_edges (seed_entity_id);
create index on app.co_director_edges (co_director_entity_id);
create index on app.co_director_edges (company_number);

-- =========================================================
-- NETWORK NET WORTH: aggregate wealth of 1-hop connections
-- =========================================================

create or replace view app.network_net_worth as
with latest_wealth as (
  select distinct on (entity_id)
    entity_id, band, score, confidence
  from app.wealth_estimates
  order by entity_id, assessed_at desc
),
band_value as (
  select entity_id, band, score, confidence,
    case band
      when '100m_plus'  then 100000000
      when '25m_100m'   then 50000000
      when '5m_25m'     then 12500000
      when '1m_5m'      then 2500000
      else 0
    end as midpoint_gbp
  from latest_wealth
),
-- Combine network_connections and co_director_edges for full reach
all_connections as (
  select source_entity_id as entity_id,
         coalesce(connected_entity_id, staged_entity_id) as connected_id
  from app.network_connections
  union
  select seed_entity_id, co_director_entity_id
  from app.co_director_edges
)
select
  ac.entity_id,
  count(distinct bv.entity_id) as connections_with_wealth,
  coalesce(sum(bv.midpoint_gbp), 0) as network_net_worth_gbp,
  coalesce(avg(bv.score), 0) as avg_connection_wealth_score,
  jsonb_agg(distinct jsonb_build_object(
    'connected_entity_id', bv.entity_id,
    'band', bv.band,
    'score', bv.score,
    'midpoint_gbp', bv.midpoint_gbp
  )) filter (where bv.band != 'unknown') as connection_wealth_breakdown
from all_connections ac
join band_value bv on bv.entity_id = ac.connected_id
group by ac.entity_id;

-- =========================================================
-- ENTITY WEALTH SUMMARY: combined personal + network view
-- =========================================================

create or replace view app.entity_wealth_summary as
select
  ce.canonical_entity_id as entity_id,
  ce.display_name,
  ce.entity_type,
  lw.band as personal_wealth_band,
  lw.score as personal_wealth_score,
  lw.confidence as personal_wealth_confidence,
  coalesce(nnw.connections_with_wealth, 0) as connections_with_wealth,
  coalesce(nnw.network_net_worth_gbp, 0) as network_net_worth_gbp,
  coalesce(nnw.avg_connection_wealth_score, 0) as avg_connection_wealth_score,
  case lw.band
    when '100m_plus'  then 100000000
    when '25m_100m'   then 50000000
    when '5m_25m'     then 12500000
    when '1m_5m'      then 2500000
    else 0
  end + coalesce(nnw.network_net_worth_gbp, 0) as total_ecosystem_value_gbp
from app.canonical_entities ce
left join lateral (
  select band, score, confidence
  from app.wealth_estimates we
  where we.entity_id = ce.canonical_entity_id
  order by assessed_at desc
  limit 1
) lw on true
left join app.network_net_worth nnw on nnw.entity_id = ce.canonical_entity_id;

-- =========================================================
-- RLS
-- =========================================================

alter table app.wealth_estimates enable row level security;
alter table app.co_director_edges enable row level security;

create policy wealth_estimates_select_admin on app.wealth_estimates for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy wealth_estimates_insert_admin on app.wealth_estimates for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy wealth_estimates_update_admin on app.wealth_estimates for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy wealth_estimates_delete_admin on app.wealth_estimates for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy co_director_edges_select_admin on app.co_director_edges for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy co_director_edges_insert_admin on app.co_director_edges for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy co_director_edges_update_admin on app.co_director_edges for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy co_director_edges_delete_admin on app.co_director_edges for delete using (app.user_role() in ('admin', 'engineering_admin'));

create policy wealth_estimates_select_authenticated on app.wealth_estimates for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
create policy co_director_edges_select_authenticated on app.co_director_edges for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
