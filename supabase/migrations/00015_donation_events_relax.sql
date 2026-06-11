-- 00015_donation_events_relax.sql
-- Activate the dormant donation_events table (IDEA 7). As schema'd in 00001 it
-- could only be populated by the candidate pipeline: run_id was required and
-- evidence_id was a NOT NULL FK to evidence_spans. Our live giving evidence is
-- in enrichment_evidence (companies_house / web_search), not evidence_spans, and
-- has no run_id. This relaxes the table so it can hold evidence-first donation
-- records sourced from enrichment_evidence, while keeping the pipeline path valid.
--
-- RLS is already enabled with admin (CRUD) + authenticated-select policies in
-- 00002, so no policy changes are needed here.

-- run_id / evidence_id become optional (enrichment-sourced rows have neither).
alter table app.donation_events alter column run_id drop not null;
alter table app.donation_events alter column evidence_id drop not null;

-- recipient_entity_id becomes optional: evidence often names a charity we hold no
-- canonical entity for (e.g. "donated to a children's hospice"). The recipient is
-- captured in `detail`; we only set recipient_entity_id when it resolves.
alter table app.donation_events alter column recipient_entity_id drop not null;

-- confidence becomes optional: enrichment rows may have no confidence score.
alter table app.donation_events alter column confidence drop not null;

-- Provenance for enrichment-sourced rows (mirrors enrichment_evidence columns).
alter table app.donation_events add column if not exists evidence_url text;
alter table app.donation_events add column if not exists source text;
alter table app.donation_events add column if not exists detail text;

-- Evidence-first guarantee: every donation must point at some evidence, either
-- a pipeline evidence_span (evidence_id) or an enrichment source (evidence_url).
alter table app.donation_events add constraint donation_events_evidence_present
  check (evidence_id is not null or evidence_url is not null);

-- donor_entity_id lookups (the ingest's idempotency check + the dossier query)
-- are already covered by the index created in 00001, so no new index is needed.
