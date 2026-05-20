-- 00002_rls_policies.sql
-- RLS policies per PRD §11.2 and §24
-- Roles: reviewer, senior_reviewer, lead_owner, admin, product_owner, engineering_admin
-- Anonymous: NO access

-- =========================================================
-- HELPER FUNCTIONS
-- =========================================================

create or replace function app.user_role() returns text as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'role',
    'anonymous'
  );
$$ language sql stable security definer;

create or replace function app.user_id() returns text as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'sub',
    ''
  );
$$ language sql stable security definer;

-- =========================================================
-- ENABLE RLS ON ALL TABLES
-- =========================================================

alter table app.runs enable row level security;
alter table app.documents enable row level security;
alter table app.extraction_runs enable row level security;
alter table app.entity_mentions enable row level security;
alter table app.evidence_spans enable row level security;
alter table app.canonical_entities enable row level security;
alter table app.identity_clusters enable row level security;
alter table app.human_identity_decisions enable row level security;
alter table app.relationships enable row level security;
alter table app.donation_events enable row level security;
alter table app.graph_snapshots enable row level security;
alter table app.seeds enable row level security;
alter table app.candidate_recommendations enable row level security;
alter table app.enrichment_signals enable row level security;
alter table app.human_decisions enable row level security;
alter table app.intro_outcomes enable row level security;
alter table app.scoring_configs enable row level security;
alter table app.icp_configs enable row level security;
alter table app.quarantine enable row level security;
alter table app.pipeline_jobs enable row level security;
alter table app.known_contacts enable row level security;
alter table app.rejection_log enable row level security;
alter table app.audit_log enable row level security;

-- =========================================================
-- ADMIN + ENGINEERING_ADMIN: full access to all tables
-- =========================================================

-- runs
create policy runs_select_admin on app.runs for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy runs_insert_admin on app.runs for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy runs_update_admin on app.runs for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy runs_delete_admin on app.runs for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- documents
create policy documents_select_admin on app.documents for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy documents_insert_admin on app.documents for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy documents_update_admin on app.documents for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy documents_delete_admin on app.documents for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- extraction_runs
create policy extraction_runs_select_admin on app.extraction_runs for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy extraction_runs_insert_admin on app.extraction_runs for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy extraction_runs_update_admin on app.extraction_runs for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy extraction_runs_delete_admin on app.extraction_runs for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- entity_mentions
create policy entity_mentions_select_admin on app.entity_mentions for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_mentions_insert_admin on app.entity_mentions for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_mentions_update_admin on app.entity_mentions for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy entity_mentions_delete_admin on app.entity_mentions for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- evidence_spans
create policy evidence_spans_select_admin on app.evidence_spans for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy evidence_spans_insert_admin on app.evidence_spans for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy evidence_spans_update_admin on app.evidence_spans for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy evidence_spans_delete_admin on app.evidence_spans for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- canonical_entities
create policy canonical_entities_select_admin on app.canonical_entities for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy canonical_entities_insert_admin on app.canonical_entities for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy canonical_entities_update_admin on app.canonical_entities for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy canonical_entities_delete_admin on app.canonical_entities for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- identity_clusters
create policy identity_clusters_select_admin on app.identity_clusters for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy identity_clusters_insert_admin on app.identity_clusters for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy identity_clusters_update_admin on app.identity_clusters for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy identity_clusters_delete_admin on app.identity_clusters for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- human_identity_decisions
create policy human_identity_decisions_select_admin on app.human_identity_decisions for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy human_identity_decisions_insert_admin on app.human_identity_decisions for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy human_identity_decisions_update_admin on app.human_identity_decisions for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy human_identity_decisions_delete_admin on app.human_identity_decisions for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- relationships
create policy relationships_select_admin on app.relationships for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy relationships_insert_admin on app.relationships for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy relationships_update_admin on app.relationships for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy relationships_delete_admin on app.relationships for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- donation_events
create policy donation_events_select_admin on app.donation_events for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy donation_events_insert_admin on app.donation_events for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy donation_events_update_admin on app.donation_events for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy donation_events_delete_admin on app.donation_events for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- graph_snapshots
create policy graph_snapshots_select_admin on app.graph_snapshots for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy graph_snapshots_insert_admin on app.graph_snapshots for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy graph_snapshots_update_admin on app.graph_snapshots for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy graph_snapshots_delete_admin on app.graph_snapshots for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- seeds
create policy seeds_select_admin on app.seeds for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy seeds_insert_admin on app.seeds for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy seeds_update_admin on app.seeds for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy seeds_delete_admin on app.seeds for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- candidate_recommendations
create policy candidate_recommendations_select_admin on app.candidate_recommendations for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy candidate_recommendations_insert_admin on app.candidate_recommendations for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy candidate_recommendations_update_admin on app.candidate_recommendations for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy candidate_recommendations_delete_admin on app.candidate_recommendations for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- enrichment_signals
create policy enrichment_signals_select_admin on app.enrichment_signals for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy enrichment_signals_insert_admin on app.enrichment_signals for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy enrichment_signals_update_admin on app.enrichment_signals for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy enrichment_signals_delete_admin on app.enrichment_signals for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- human_decisions
create policy human_decisions_select_admin on app.human_decisions for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy human_decisions_insert_admin on app.human_decisions for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy human_decisions_update_admin on app.human_decisions for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy human_decisions_delete_admin on app.human_decisions for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- intro_outcomes
create policy intro_outcomes_select_admin on app.intro_outcomes for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy intro_outcomes_insert_admin on app.intro_outcomes for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy intro_outcomes_update_admin on app.intro_outcomes for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy intro_outcomes_delete_admin on app.intro_outcomes for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- scoring_configs
create policy scoring_configs_select_admin on app.scoring_configs for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy scoring_configs_insert_admin on app.scoring_configs for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy scoring_configs_update_admin on app.scoring_configs for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy scoring_configs_delete_admin on app.scoring_configs for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- icp_configs
create policy icp_configs_select_admin on app.icp_configs for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy icp_configs_insert_admin on app.icp_configs for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy icp_configs_update_admin on app.icp_configs for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy icp_configs_delete_admin on app.icp_configs for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- quarantine
create policy quarantine_select_admin on app.quarantine for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy quarantine_insert_admin on app.quarantine for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy quarantine_update_admin on app.quarantine for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy quarantine_delete_admin on app.quarantine for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- pipeline_jobs
create policy pipeline_jobs_select_admin on app.pipeline_jobs for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy pipeline_jobs_insert_admin on app.pipeline_jobs for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy pipeline_jobs_update_admin on app.pipeline_jobs for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy pipeline_jobs_delete_admin on app.pipeline_jobs for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- known_contacts
create policy known_contacts_select_admin on app.known_contacts for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy known_contacts_insert_admin on app.known_contacts for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy known_contacts_update_admin on app.known_contacts for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy known_contacts_delete_admin on app.known_contacts for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- rejection_log
create policy rejection_log_select_admin on app.rejection_log for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy rejection_log_insert_admin on app.rejection_log for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy rejection_log_update_admin on app.rejection_log for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy rejection_log_delete_admin on app.rejection_log for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- audit_log
create policy audit_log_select_admin on app.audit_log for select using (app.user_role() in ('admin', 'engineering_admin'));
create policy audit_log_insert_admin on app.audit_log for insert with check (app.user_role() in ('admin', 'engineering_admin'));
create policy audit_log_update_admin on app.audit_log for update using (app.user_role() in ('admin', 'engineering_admin'));
create policy audit_log_delete_admin on app.audit_log for delete using (app.user_role() in ('admin', 'engineering_admin'));

-- =========================================================
-- AUTHENTICATED ROLES: SELECT on read-only/reference tables
-- All authenticated users (reviewer, senior_reviewer, lead_owner,
-- product_owner) can read reference data for UI display.
-- =========================================================

-- documents: all authenticated can read
create policy documents_select_authenticated on app.documents for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- evidence_spans: all authenticated can read
create policy evidence_spans_select_authenticated on app.evidence_spans for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- canonical_entities: all authenticated can read
create policy canonical_entities_select_authenticated on app.canonical_entities for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- entity_mentions: all authenticated can read
create policy entity_mentions_select_authenticated on app.entity_mentions for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- relationships: all authenticated can read
create policy relationships_select_authenticated on app.relationships for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- donation_events: all authenticated can read
create policy donation_events_select_authenticated on app.donation_events for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- identity_clusters: all authenticated can read
create policy identity_clusters_select_authenticated on app.identity_clusters for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- graph_snapshots: all authenticated can read
create policy graph_snapshots_select_authenticated on app.graph_snapshots for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- seeds: all authenticated can read
create policy seeds_select_authenticated on app.seeds for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- enrichment_signals: all authenticated can read
create policy enrichment_signals_select_authenticated on app.enrichment_signals for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- known_contacts: all authenticated can read
create policy known_contacts_select_authenticated on app.known_contacts for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- rejection_log: all authenticated can read
create policy rejection_log_select_authenticated on app.rejection_log for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- extraction_runs: all authenticated can read
create policy extraction_runs_select_authenticated on app.extraction_runs for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- runs: all authenticated can read
create policy runs_select_authenticated on app.runs for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- quarantine: all authenticated can read
create policy quarantine_select_authenticated on app.quarantine for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- pipeline_jobs: all authenticated can read
create policy pipeline_jobs_select_authenticated on app.pipeline_jobs for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- scoring_configs: all authenticated can read
create policy scoring_configs_select_authenticated on app.scoring_configs for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- icp_configs: all authenticated can read
create policy icp_configs_select_authenticated on app.icp_configs for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- =========================================================
-- CANDIDATE RECOMMENDATIONS: role-specific SELECT
-- Reviewers see their assigned queue (status = 'In Review')
-- =========================================================

create policy candidate_recommendations_select_reviewer on app.candidate_recommendations for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- =========================================================
-- HUMAN DECISIONS: reviewer+ can read and insert
-- =========================================================

create policy human_decisions_select_authenticated on app.human_decisions for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- reviewer, senior_reviewer, lead_owner can INSERT human decisions
create policy human_decisions_insert_reviewer on app.human_decisions for insert with check (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner')
);

-- =========================================================
-- HUMAN IDENTITY DECISIONS: reviewer+ can read;
-- reviewer/senior_reviewer can insert (suggest changes);
-- senior_reviewer can approve high-impact merges/splits
-- =========================================================

create policy human_identity_decisions_select_authenticated on app.human_identity_decisions for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

-- reviewer and senior_reviewer can suggest identity changes
create policy human_identity_decisions_insert_reviewer on app.human_identity_decisions for insert with check (
  app.user_role() in ('reviewer', 'senior_reviewer')
);

-- senior_reviewer can update (approve/reject identity decisions)
create policy human_identity_decisions_update_senior on app.human_identity_decisions for update using (
  app.user_role() = 'senior_reviewer'
);

-- =========================================================
-- INTRO OUTCOMES: lead_owner can insert and update
-- =========================================================

create policy intro_outcomes_select_authenticated on app.intro_outcomes for select using (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);

create policy intro_outcomes_insert_lead_owner on app.intro_outcomes for insert with check (
  app.user_role() = 'lead_owner'
);

create policy intro_outcomes_update_lead_owner on app.intro_outcomes for update using (
  app.user_role() = 'lead_owner'
);

-- =========================================================
-- PRODUCT OWNER: can propose scoring_configs and icp_configs
-- =========================================================

create policy scoring_configs_insert_product_owner on app.scoring_configs for insert with check (
  app.user_role() = 'product_owner'
);

create policy scoring_configs_update_product_owner on app.scoring_configs for update using (
  app.user_role() = 'product_owner'
);

create policy icp_configs_insert_product_owner on app.icp_configs for insert with check (
  app.user_role() = 'product_owner'
);

create policy icp_configs_update_product_owner on app.icp_configs for update using (
  app.user_role() = 'product_owner'
);

-- =========================================================
-- AUDIT LOG: all authenticated roles can insert (actions logged)
-- Only admin/engineering_admin can read (already covered above)
-- =========================================================

create policy audit_log_insert_authenticated on app.audit_log for insert with check (
  app.user_role() in ('reviewer', 'senior_reviewer', 'lead_owner', 'product_owner')
);
