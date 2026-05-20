# Product Requirements Document
## Customer Intelligence Platform — Entity Discovery & Lead Qualification Engine

**Status:** MVP PRD v2.0 — Build-Ready
**Last Updated:** May 18, 2026
**Stack:** Supabase (Postgres + Auth + Storage + Edge Functions), Vercel (Next.js frontend + API routes), GitHub (source + CI/CD)
**Scope note:** This PRD covers the buildable MVP. Compliance, privacy, and bias monitoring are explicitly out of scope and not addressed anywhere in this document.

---

# 1. Mission

Build a customer intelligence platform that discovers high-fit leads by mining entity relationships across existing customers, donors, charities, trusts, companies, and public filings, then qualifies which surfaced candidates merit a warm introduction.

The platform converts unstructured public filings into a provenance-preserving entity graph, surfaces explainable candidates near known seeds, enriches them with external signals, and presents a ranked, evidence-backed review queue to human operators.

The outcome is a continuously improving pipeline of high-fit prospects, each tied to a specific existing contact who can broker the introduction, ranked by two independent dimensions: **Candidate Priority** (how worth pursuing) and **Evidence Confidence** (how trustworthy the data).

This is a discovery and qualification engine, not a CRM and not an outreach automation system.

---

# 2. Product Problem

Growth depends on warm introductions, but the team has no systematic way to know who exists in the wider ecosystem, who is connected to existing trusted contacts, which individuals are potentially valuable, why a specific introducer might credibly broker a relationship, and which candidates are worth manual research time.

Today, discovery is manual, slow, inconsistent, and dependent on human memory. The team has approximately 25,000 markdown filings from Companies House and related public sources covering charities, trusts, donors, companies, addresses, donations, directors, trustees, and board relationships. This data is currently trapped as text.

The product must turn that text into a queryable, explainable, trustable discovery workflow.

---

# 3. Product Principles

**Evidence first.** Every claim is traceable to source document, evidence span, extraction run, schema version, and confidence score. No fact, edge, signal, score, or recommendation is production-valid without provenance.

**Human review before action.** The system recommends. Humans decide.

**Explainability over algorithmic complexity.** Path-template scoring and transparent reason codes win over opaque ensembles. The reviewer must always be able to answer why this candidate, why this seed, what evidence, how confident, and what to do next.

**Identity resolution is reversible.** Raw mentions, provisional clusters, canonical entities, and human decisions are stored separately. No irreversible hard merges.

**Database is source of truth.** Spreadsheet is a handoff surface. Manual spreadsheet edits are not authoritative.

**Operable means production.** Run management, retries, quarantine, observability, acceptance gates, cost visibility, reviewer workflow, versioning, rollback rules, QA, and regression tests are all required before launch.

---

# 4. Goals and Non-Goals

## 4.1 Goals

The platform must surface previously unknown person-like candidates connected to existing seed contacts; explain every candidate through relationship paths and evidence spans; preserve raw mentions, provisional clusters, canonical entities, and human decisions; support document-type-specific LLM extraction; validate, normalise, and quarantine outputs before graph ingestion; build a provenance-preserving graph; support path-template scoring, shared-affiliation scoring, and Personalised PageRank; enrich candidates through tiered external sources; score candidates with separate priority and confidence dimensions; present candidate dossiers; export review queues to spreadsheet while preserving database integrity; track reviewer decisions and intro outcomes; calibrate weights after the cold-start threshold; preserve human identity decisions across re-runs; and provide operational monitoring, run metadata, and failure handling.

## 4.2 Non-Goals for v1

The platform will not provide full CRM functionality; will not automate direct outreach; will not run real-time ingestion or real-time scoring; will not support continuous incremental ingestion; will not estimate personal net worth; will not guarantee perfect entity resolution; will not use a large opaque algorithm ensemble before v1 quality is validated; will not support multiple ICPs across multiple teams; will not replace human judgement; will not treat spreadsheet edits as canonical; will not adjust scoring weights before the cold-start threshold; and will not build a rich multi-user reviewer UI before the spreadsheet-plus-dossier workflow is validated.

---

# 5. Users and Personas

**Researcher / Reviewer.** Reviews surfaced candidates, validates evidence, resolves identity warnings, and decides whether a candidate is worth pursuing. Needs a ranked queue, clear explanations, evidence spans, identity warnings, score breakdowns, structured decision labels, the ability to confirm or reject duplicates, and a notes field.

**Partnerships / Fundraising Lead.** Uses qualified candidates to request warm introductions from existing trusted contacts. Needs the recommended introducer, the suggested introduction angle, the strongest relationship path, confidence that the candidate is real and relevant, and status tracking from intro request to outcome.

**System Admin / Operator.** Runs and monitors the data pipeline, manages failures, maintains configuration versions. Needs the pipeline run dashboard, phase status, error logs, quarantine reports, cost and runtime visibility, versioned prompts, schemas, and scoring configs, and the ability to retry failed phases.

**Product Owner.** Owns the ICP, scoring logic, product outcomes, reviewer experience, and quality thresholds. Needs candidate quality metrics, review funnel metrics, rejection reason analysis, intro and conversion metrics, extraction and identity resolution quality reports, and calibration recommendations.

---

# 6. End-to-End User Journeys

## 6.1 Candidate Review

Reviewer opens the queue, filters by seed/score/confidence/status, opens a candidate dossier, reviews top reasons and identity warnings, checks evidence spans, chooses Qualified / Rejected / Needs More Research, adds a structured reason code where applicable, and the system logs the decision and updates status.

Acceptance: a decision can be made in under 2 minutes for a clear high-confidence candidate; every decision writes to `human_decisions`; rejection requires a structured reason; status updates immediately in dossier and export; dossier preserves full evidence trail.

## 6.2 Wrong-Person Rejection

Reviewer sees a weak identity match or incorrect merge, selects `Rejected — wrong person`, marks specific records as not-same-person, the system stores a human identity split decision, and future runs replay it.

Acceptance: a wrong-person decision creates both a candidate decision and an identity decision; future runs do not re-merge entities that were manually split; the error appears in Phase 6 identity-resolution failure metrics.

## 6.3 Duplicate Confirmation

Reviewer sees a possible-duplicate warning, opens the underlying mentions, selects same-person or not-same-person, the system stores the decision, the presentation row updates, and future graph builds replay it.

Acceptance: merge or split is reversible; the system records who decided, when, and why; the dossier shows decision history; the human decision overrides future automated clustering.

## 6.4 Intro Request

Lead owner opens a qualified candidate, reviews the recommended introducer and intro angle, marks `Intro Requested`, records the seed's response, and if the intro happens, records the meeting or outcome.

Acceptance: the intro outcome is linked to candidate, seed, and run; the intro-declined reason is captured; the conversion funnel updates automatically; intro outcomes are available for Phase 6 calibration.

## 6.5 Pipeline Re-Run

Admin starts a new run, the system records run metadata, documents are classified and extracted, validation and quarantine run, the graph is rebuilt, human identity decisions are replayed, candidate recommendations are regenerated, and the queue shows new, changed, and suppressed candidates.

Acceptance: existing human decisions are preserved; previously rejected same-seed candidates are suppressed; changed candidate scores are visible by run version; the graph snapshot is tagged with run ID; failed phases can be retried safely.

---

# 7. Success Metrics

## 7.1 Lead Quality

| Metric | Starting target |
|---|---:|
| Top-50 candidate human verification rate | 40%+ |
| Verified candidates worth intro request | 20%+ |
| Surfaced candidates leading to intro request | 10%+ |
| Intro requests leading to actual intro | 30%+ |
| Actual intros leading to qualified opportunity | 10%+ |
| Reviewer time per qualified candidate | under 15 minutes |
| False identity match rate in reviewed candidates | under 10% |
| Candidates with clear intro path | 80%+ |

## 7.2 Extraction Quality

| Metric | Starting target |
|---|---:|
| Entity precision | 90%+ |
| Relationship precision | 85%+ |
| Evidence span coverage | 95%+ |
| Invalid JSON rate | under 2% |
| Hallucinated relationship rate | under 5% |
| Address normalisation success | 80%+ |

## 7.3 Operational

| Metric | Target |
|---|---:|
| Candidate discovery per seed | under 5 minutes |
| Dossier page load | under 3 seconds |
| Spreadsheet export generation | under 10 minutes |
| Evidence link availability | 99%+ |
| Pipeline run completion | 95%+ successful or completed-with-warnings |
| Reviewer decision save | 99.5%+ |

## 7.4 Run Stability

| Metric | Target |
|---|---:|
| Candidate score variance across identical re-runs | under 5% |
| Identity cluster stability across runs (same canonical ID survival rate) | 95%+ |
| Path reproducibility for top-50 candidates | 90%+ |

## 7.5 Baseline Comparison

The product must outperform the current manual workflow on qualified candidates per hour of reviewer time, diversity of candidate sources, time from seed selection to intro request, repeatability, and explainability. Phase 0 documents the manual baseline.

---

# 8. System Architecture Overview

```
Phase 0: Corpus Audit + Gold Set + Identity Strategy + Load Test
   ↓
Phase 1: Document Classification + LLM Extraction
   ↓
Phase 1.5: Validation + Normalisation + Quarantine
   ↓
Phase 2: Entity Resolution + Graph Construction
   ↓
Phase 3: Candidate Discovery (Path-template + PPR)
   ↓
Phase 4: Tiered Enrichment
   ↓
Phase 5: Ranking + Presentation Dedup + Dossier + Human Review
   ↓
Phase 6: Outcome Tracking + Weight Calibration
```

Each phase is independently runnable, versioned, observable, and retryable.

## 8.1 Stack Mapping

| Concern | Service |
|---|---|
| Application database | Supabase Postgres |
| Graph engine | Supabase Postgres with `pg_graph` extension, or in-process NetworkX loaded from Postgres views. Default: in-process NetworkX in Edge Functions; migrate to a dedicated graph engine only if Phase 0 load test fails. |
| Auth | Supabase Auth (email-link + Google SSO) |
| Object storage | Supabase Storage (raw markdown filings, graph snapshots, exports) |
| Background jobs | Supabase Edge Functions triggered by `pg_cron` schedules plus a `pipeline_jobs` queue table |
| LLM extraction | Anthropic Claude via batch API, called from Supabase Edge Functions |
| Search / fuzzy match | Postgres `pg_trgm` + `pgvector` extensions |
| Frontend | Next.js on Vercel, App Router, Server Components, Tailwind |
| API | Vercel API routes calling Supabase RPC and direct Postgres reads |
| Source control + CI/CD | GitHub → Vercel preview deploys → Vercel production deploy on `main` |
| Observability | Vercel Analytics + Supabase Logs + a custom `runs` dashboard in the app |

## 8.2 Why this stack

Supabase Postgres handles everything operational (mentions, clusters, entities, edges, decisions, runs, queues, vector and trigram search) in one engine, which kills the "Postgres vs separate graph DB vs separate search DB" coordination problem at MVP scale. The 25,000-document corpus produces a graph of roughly 250–800k edges (estimated in §25), which fits comfortably in memory for NetworkX inside an Edge Function. Vercel handles the reviewer UI and dossier rendering with zero ops overhead. GitHub Actions handles tests and prompt regression gates. The whole MVP can be operated by one engineer.

---

# 9. Data Stores

| Store | Purpose |
|---|---|
| Supabase Postgres | Operational source of truth: documents, mentions, entities, clusters, edges, decisions, enrichment cache, runs, scoring configs, queues |
| Supabase Storage | Raw markdown filings, graph snapshots (Parquet), spreadsheet exports, gold set labels |
| In-process NetworkX | Graph traversal and PPR, loaded per-run from Postgres views |
| `pg_trgm` indexes | Fuzzy name/address/registration-number search |
| `pgvector` indexes | Embedding-based identity matching and evidence span search |

---

# 10. Run Management

Every pipeline execution produces a reproducibility record.

## 10.1 Run Metadata

```json
{
  "run_id": "run_2026_05_18_full_corpus_v1",
  "corpus_version": "corpus_2026_05_18",
  "schema_version": "1.0.0",
  "extraction_prompt_versions": {
    "trustee_filing": "trustee_extract_v1",
    "donation_report": "donation_extract_v1",
    "company_filing": "company_extract_v1",
    "annual_report": "annual_report_extract_v1",
    "mixed_markdown": "general_extract_v1"
  },
  "graph_build_version": "graph_builder_v1",
  "identity_resolution_version": "identity_cluster_v1",
  "scoring_config_version": "scoring_v1",
  "started_at": "2026-05-18T09:00:00Z",
  "completed_at": null,
  "status": "running"
}
```

## 10.2 Pipeline Run States

`created`, `queued`, `running`, `completed`, `completed_with_warnings`, `failed_retryable`, `failed_final`, `cancelled`, `rolled_back`.

## 10.3 Requirements

- **RM1** Every run has a unique `run_id` (ULID).
- **RM2** Every artefact created by the run references `run_id`.
- **RM3** Runs are repeatable from fixed corpus, schema, prompt, graph, and scoring config versions.
- **RM4** Failed phases record error type, error message, affected records, and retry eligibility.
- **RM5** Human identity decisions from previous runs replay in every new graph build.
- **RM6** All phase jobs are idempotent by `run_id` and phase name; re-running a phase with the same inputs produces no duplicate records.

---

# 11. Data Model

## 11.1 Postgres Schema

All tables live in schema `app`. ULIDs are stored as `text` (sortable, URL-safe). Timestamps are `timestamptz`. JSON payloads are `jsonb`.

```sql
-- =========================================================
-- CORE OBJECTS
-- =========================================================

create table app.runs (
  run_id                          text primary key,
  corpus_version                  text not null,
  schema_version                  text not null,
  extraction_prompt_versions      jsonb not null,
  graph_build_version             text not null,
  identity_resolution_version     text not null,
  scoring_config_version          text not null,
  status                          text not null,
  started_at                      timestamptz not null default now(),
  completed_at                    timestamptz,
  error                           jsonb
);

create table app.documents (
  document_id        text primary key,
  corpus_version     text not null,
  source             text not null,
  document_type      text not null,
  content_hash       text not null unique,
  storage_uri        text not null,
  year               int,
  ingested_at        timestamptz not null default now(),
  metadata           jsonb not null default '{}'::jsonb
);
create index on app.documents (document_type);
create index on app.documents (year);

create table app.extraction_runs (
  extraction_run_id  text primary key,
  run_id             text not null references app.runs(run_id),
  document_id        text not null references app.documents(document_id),
  prompt_version     text not null,
  model              text not null,
  temperature        numeric not null,
  status             text not null,
  invalid_json_retries int not null default 0,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  error              jsonb,
  unique (run_id, document_id)
);
create index on app.extraction_runs (run_id);
create index on app.extraction_runs (status);

create table app.entity_mentions (
  entity_mention_id     text primary key,
  document_id           text not null references app.documents(document_id),
  run_id                text not null references app.runs(run_id),
  entity_type           text not null,
  raw_value             text not null,
  normalised_value      text not null,
  attributes            jsonb not null default '{}'::jsonb,
  evidence_span         text not null,
  span_start            int not null,
  span_end              int not null,
  extraction_confidence numeric not null,
  validation_status     text not null,
  embedding             vector(1536),
  created_at            timestamptz not null default now()
);
create index on app.entity_mentions (run_id);
create index on app.entity_mentions (entity_type);
create index on app.entity_mentions (document_id);
create index on app.entity_mentions using gin (normalised_value gin_trgm_ops);
create index on app.entity_mentions using ivfflat (embedding vector_cosine_ops);

create table app.evidence_spans (
  evidence_id      text primary key,
  document_id      text not null references app.documents(document_id),
  run_id           text not null references app.runs(run_id),
  text             text not null,
  span_start       int not null,
  span_end         int not null,
  source_section   text,
  evidence_type    text not null,
  created_at       timestamptz not null default now()
);
create index on app.evidence_spans (document_id);

create table app.canonical_entities (
  canonical_entity_id  text primary key,
  entity_type          text not null,
  display_name         text not null,
  first_seen_run_id    text not null references app.runs(run_id),
  last_seen_run_id     text not null references app.runs(run_id),
  attributes           jsonb not null default '{}'::jsonb
);
create index on app.canonical_entities (entity_type);
create index on app.canonical_entities using gin (display_name gin_trgm_ops);

create table app.identity_clusters (
  cluster_id           text primary key,
  canonical_entity_id  text not null references app.canonical_entities(canonical_entity_id),
  run_id               text not null references app.runs(run_id),
  entity_type          text not null,
  member_mention_ids   text[] not null,
  cluster_confidence   numeric not null,
  decision_status      text not null,
  created_by           text not null,
  created_at           timestamptz not null default now()
);
create index on app.identity_clusters (run_id);
create index on app.identity_clusters (canonical_entity_id);

create table app.human_identity_decisions (
  identity_decision_id  text primary key,
  entity_a_mention_id   text not null references app.entity_mentions(entity_mention_id),
  entity_b_mention_id   text not null references app.entity_mentions(entity_mention_id),
  decision              text not null check (decision in ('same_person', 'not_same_person')),
  reason_code           text not null,
  notes                 text,
  decided_by            text not null,
  decided_at            timestamptz not null default now(),
  replay_on_future_runs boolean not null default true,
  superseded_by         text
);
create index on app.human_identity_decisions (entity_a_mention_id);
create index on app.human_identity_decisions (entity_b_mention_id);

create table app.relationships (
  relationship_id     text primary key,
  run_id              text not null references app.runs(run_id),
  source_entity_id    text not null references app.canonical_entities(canonical_entity_id),
  target_entity_id    text not null references app.canonical_entities(canonical_entity_id),
  relationship_type   text not null,
  valid_from          date,
  valid_to            date,
  evidence_id         text not null references app.evidence_spans(evidence_id),
  confidence          numeric not null,
  freshness_multiplier numeric not null,
  source_reliability  numeric not null,
  edge_weight         numeric not null,
  status              text not null
);
create index on app.relationships (run_id);
create index on app.relationships (source_entity_id);
create index on app.relationships (target_entity_id);
create index on app.relationships (relationship_type);

create table app.donation_events (
  donation_event_id    text primary key,
  run_id               text not null references app.runs(run_id),
  donor_entity_id      text not null references app.canonical_entities(canonical_entity_id),
  recipient_entity_id  text not null references app.canonical_entities(canonical_entity_id),
  amount               numeric,
  currency             text,
  year                 int,
  evidence_id          text not null references app.evidence_spans(evidence_id),
  confidence           numeric not null
);
create index on app.donation_events (run_id);
create index on app.donation_events (donor_entity_id);
create index on app.donation_events (recipient_entity_id);

create table app.graph_snapshots (
  snapshot_id    text primary key,
  run_id         text not null references app.runs(run_id),
  storage_uri    text not null,
  node_count     int not null,
  edge_count     int not null,
  built_at       timestamptz not null default now()
);

-- =========================================================
-- DISCOVERY & REVIEW
-- =========================================================

create table app.seeds (
  seed_id              text primary key,
  canonical_entity_id  text not null references app.canonical_entities(canonical_entity_id),
  added_by             text not null,
  added_at             timestamptz not null default now(),
  notes                text,
  active               boolean not null default true,
  seed_quality_score   numeric
);

create table app.candidate_recommendations (
  candidate_recommendation_id  text primary key,
  run_id                       text not null references app.runs(run_id),
  seed_id                      text not null references app.seeds(seed_id),
  candidate_entity_id          text not null references app.canonical_entities(canonical_entity_id),
  presentation_group_id        text,
  rank                         int not null,
  priority_score               numeric not null,
  confidence_score             numeric not null,
  status                       text not null,
  strongest_path               jsonb not null,
  reason_codes                 text[] not null,
  identity_warnings            text[] not null default '{}',
  created_at                   timestamptz not null default now(),
  unique (run_id, seed_id, candidate_entity_id)
);
create index on app.candidate_recommendations (run_id, seed_id);
create index on app.candidate_recommendations (status);
create index on app.candidate_recommendations (presentation_group_id);

create table app.enrichment_signals (
  enrichment_signal_id  text primary key,
  candidate_entity_id   text not null references app.canonical_entities(canonical_entity_id),
  source                text not null,
  external_record_id    text not null,
  signal_type           text not null,
  signal_payload        jsonb not null,
  match_confidence      numeric not null,
  retrieved_at          timestamptz not null default now(),
  cache_expires_at      timestamptz not null,
  accepted_for_scoring  boolean not null,
  status                text not null,
  unique (candidate_entity_id, source, external_record_id)
);
create index on app.enrichment_signals (candidate_entity_id);
create index on app.enrichment_signals (source);
create index on app.enrichment_signals (cache_expires_at);

create table app.human_decisions (
  human_decision_id            text primary key,
  candidate_recommendation_id  text not null references app.candidate_recommendations(candidate_recommendation_id),
  decision                     text not null,
  reason_code                  text,
  notes                        text,
  decided_by                   text not null,
  decided_at                   timestamptz not null default now(),
  cold_start_decision          boolean not null default false
);
create index on app.human_decisions (candidate_recommendation_id);
create index on app.human_decisions (decision);

create table app.intro_outcomes (
  intro_outcome_id             text primary key,
  candidate_recommendation_id  text not null references app.candidate_recommendations(candidate_recommendation_id),
  seed_id                      text not null references app.seeds(seed_id),
  intro_status                 text not null,
  decline_reason               text,
  meeting_at                   timestamptz,
  converted                    boolean,
  notes                        text,
  recorded_by                  text not null,
  recorded_at                  timestamptz not null default now()
);
create index on app.intro_outcomes (candidate_recommendation_id);

-- =========================================================
-- CONFIG & OPERATIONS
-- =========================================================

create table app.scoring_configs (
  scoring_config_version  text primary key,
  config                  jsonb not null,
  promoted_at             timestamptz not null default now(),
  promoted_by             text not null,
  rationale               text
);

create table app.icp_configs (
  icp_id      text primary key,
  config      jsonb not null,
  version     text not null,
  active      boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table app.quarantine (
  quarantine_id   text primary key,
  run_id          text not null references app.runs(run_id),
  source_phase    text not null,
  source_record   jsonb not null,
  reason_code     text not null,
  details         text,
  created_at      timestamptz not null default now(),
  resolved        boolean not null default false
);
create index on app.quarantine (run_id);
create index on app.quarantine (reason_code);

create table app.pipeline_jobs (
  job_id       text primary key,
  run_id       text not null references app.runs(run_id),
  phase        text not null,
  status       text not null,
  priority     int not null default 0,
  attempts     int not null default 0,
  max_attempts int not null default 3,
  payload      jsonb,
  error        jsonb,
  enqueued_at  timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index on app.pipeline_jobs (status, priority);
create index on app.pipeline_jobs (run_id, phase);

create table app.known_contacts (
  canonical_entity_id  text primary key references app.canonical_entities(canonical_entity_id),
  added_by             text not null,
  added_at             timestamptz not null default now(),
  source               text not null
);

create table app.rejection_log (
  rejection_log_id     text primary key,
  seed_id              text not null references app.seeds(seed_id),
  candidate_entity_id  text not null references app.canonical_entities(canonical_entity_id),
  decided_at           timestamptz not null default now(),
  reason_code          text not null,
  unique (seed_id, candidate_entity_id)
);
```

## 11.2 Row-Level Security

All `app.*` tables enable RLS. Reviewer role can read their assigned queue and write decisions. Admin role can read/write all. Anonymous role has no access.

## 11.3 Stable Canonical IDs

When the identity resolution job runs, every cluster maps to a canonical entity. The canonical-entity ID is preserved across runs by matching the strongest available signals (`registration_number` first, then high-confidence `embedding` similarity plus shared affiliations). New canonical entities are created only when no existing canonical entity matches above the merge threshold.

---

# 12. Phase 0 — Corpus Audit, Gold Set, Identity Strategy, Load Test

**Purpose.** Establish data reality, quality thresholds, ICP, identity strategy, manual baseline, and infrastructure feasibility before full build.

**Inputs.** The 25,000-document corpus, the existing customer/seed list, initial business hypotheses, the current manual workflow.

**Outputs.** Corpus profile, document taxonomy, 50–150 gold-labelled documents, documented manual baseline, ICP v1, identity resolution strategy, load test report, calibrated heuristic values, go decision on the graph engine.

**Requirements.**
- **R0.1** Profile at least 500 documents by source, type, year, length, format quality, entity density.
- **R0.2** Classify the corpus into types: trustee filing, donation report, company filing, annual report, mixed markdown, unsupported.
- **R0.3** Label a gold evaluation set of 50–150 documents covering people, organisations, addresses, registration numbers, donations, trustee/director roles, dates, evidence spans, relationship types.
- **R0.4** Approve v1 ICP before scoring is built.
- **R0.5** Define identity resolution features (name, address, organisation, role overlap, embedding similarity) and thresholds (see §15.5).
- **R0.6** Document the current manual workflow including time per lead and source usage.
- **R0.7** Define extraction and ranking quality thresholds (start from §7, calibrate against gold set).
- **R0.8** Run the load test on a 2,500-document slice through a thin end-to-end prototype. Measure extraction throughput, cost per 1,000 docs, graph build time, memory footprint, PPR latency, path-template query latency.
- **R0.9** Make the graph engine decision: stay on in-process NetworkX in Edge Functions, or migrate to a dedicated graph engine (Neo4j AuraDB or Memgraph Cloud). Default: NetworkX, unless PPR exceeds 5 minutes per seed at full-corpus scale.

**Acceptance.** 500-document sample profiled, gold set labelled, manual baseline documented, ICP approved, identity thresholds set, graph engine decided, quality thresholds approved.

---

# 13. Phase 1 — Document Classification and LLM Extraction

**Purpose.** Convert markdown filings into structured mentions, relationships, donation events, and evidence spans using document-type-specific prompts.

**Inputs.** Classified documents, document-type-specific extraction prompts, versioned JSON schemas, gold set for benchmarking.

**Outputs.** Entity mentions, relationship records, donation events, evidence spans, extraction run metadata, quarantined records.

| Document type | Extraction focus |
|---|---|
| Trustee filing | People, roles, dates, charity IDs |
| Donation report | Donor, recipient, amount, year |
| Company filing | Directors, PSCs, addresses, companies |
| Annual report | Trustees, donations, narrative affiliations |
| Mixed markdown | General entities and relationships |
| Unsupported | Quarantine |

**Requirements.**
- **R1.1** Use Anthropic Claude via the batch API for cost efficiency. Model: `claude-sonnet-4-20250514`. Temperature: 0.
- **R1.2** Classify each document before extraction; route to a document-type-specific prompt.
- **R1.3** Schema-constrained JSON output using a JSON Schema enforced post-call.
- **R1.4** Record prompt version, model, schema version, temperature, and timestamp for every extraction.
- **R1.5** Every extracted fact must include source document ID and evidence span.
- **R1.6** Documents exceeding context limits use section-aware chunking; cross-chunk mentions are reconciled in post-processing.
- **R1.7** Invalid JSON is retried up to 3 times, then quarantined with reason `invalid_json`.
- **R1.8** Extraction confidence is captured but not trusted as the sole quality signal; Phase 1.5 validation refines it.
- **R1.9** Output is stored in Postgres (`entity_mentions`, `evidence_spans`, `relationships`, `donation_events`) and snapshotted to Supabase Storage as JSONL.

**Acceptance.** Invalid JSON rate under 2%; evidence span coverage above 95%; precision/recall measured against gold set; prompts versioned; failed extractions quarantined with reason codes; chunking and reconciliation tested.

---

# 14. Phase 1.5 — Validation, Normalisation, Quarantine

**Purpose.** Prevent invalid or unsupported LLM output from entering the graph.

**Inputs.** Phase 1 extraction output.

**Outputs.** Validated records, normalised values, quarantine queue, validation report.

**Requirements.**
- **R1.5.1** Validate every record against the JSON schema; reject failures.
- **R1.5.2** Quarantine records missing source document or evidence span.
- **R1.5.3** Normalise UK addresses and postcodes (use `libpostal` via Edge Function, fall back to regex postcode extraction).
- **R1.5.4** Normalise person names (canonical casing, title removal, alias capture).
- **R1.5.5** Normalise Companies House and Charity Commission identifiers (regex format check; pad with zeros to canonical length).
- **R1.5.6** Deduplicate exact duplicates (same entity, same evidence span, same document).
- **R1.5.7** Preserve raw and normalised values.
- **R1.5.8** Validate dates (plausible range), registration numbers (format), positive amounts.
- **R1.5.9** Produce a validation report per run.

**Quarantine reason codes.** `invalid_json`, `missing_evidence_span`, `unsupported_document_type`, `low_extraction_confidence`, `invalid_registration_number`, `impossible_date`, `ambiguous_relationship`, `duplicate_exact`, `normalisation_failed`, `source_unavailable`, `ambiguous_external_match`, `identity_conflict`.

**Acceptance.** Schema validation rejects invalid records; quarantine reasons reported; raw and normalised values preserved; exact duplicates removed; validation report generated per run.

---

# 15. Phase 2 — Entity Resolution and Graph Construction

**Purpose.** Build a provenance-preserving graph with reversible identity clustering and persistent human decisions.

**Inputs.** Validated extraction records, human identity decisions from prior runs, identity thresholds, edge weighting config.

**Outputs.** Identity clusters, canonical entities, graph snapshot, fuzzy and vector search indexes, graph build report.

## 15.1 Identity Layers

`Raw Document → Extracted Mention → Candidate Cluster → Canonical Entity → Human-Verified Entity`.

## 15.2 Identity Decision Bands

| Match confidence | Behaviour |
|---:|---|
| ≥0.90 | Auto-cluster, high confidence |
| 0.75–0.89 | Provisional cluster, visible warning |
| 0.55–0.74 | Possible duplicate, do not merge |
| under 0.55 | Keep separate |

## 15.3 Match Confidence Formula

```
match_confidence =
  0.30 × name_similarity (pg_trgm)
+ 0.25 × embedding_similarity (pgvector cosine)
+ 0.20 × shared_organisation_score
+ 0.15 × shared_address_score
+ 0.10 × role_overlap_score
```

## 15.4 Auto-Merge Blockers

Auto-merge is blocked if any of: incompatible date of birth; conflicting registration identifiers; prior human split decision exists; mutually incompatible active roles in the same period; match relies only on a common name with no corroborating feature.

## 15.5 Conflict Rule: Human Decision Always Wins

When a human identity decision exists between two mentions, the auto-clusterer must respect it on every re-run. If new evidence after a human merge auto-suggests a split, the human merge holds; the conflict is logged in `quarantine` with reason `identity_conflict` and surfaced in the next reviewer queue as an `identity_warning` on the affected candidate. If new evidence after a human split auto-suggests a merge, the human split holds, the conflict is logged identically. The human decision is overridden only by a newer human decision from a senior reviewer.

## 15.6 Graph Edge Types

| Edge type | Source → Target |
|---|---|
| TRUSTEE_OF | Person → Charity/Trust |
| DIRECTOR_OF | Person → Company |
| REGISTERED_AT | Entity → Address |
| MADE_DONATION | Entity → DonationEvent |
| RECEIVED_BY | DonationEvent → Charity |
| MENTIONED_IN | Entity → Document |
| CO_OCCURS_WITH | Person → Person |
| SHARES_AFFILIATION_WITH | Entity → Entity |

## 15.7 Edge Weight Formula

```
edge_weight = relationship_strength × evidence_confidence × freshness_decay × source_reliability
```

Starting heuristics in Appendix A.

## 15.8 Requirements

- **R2.1** Graph supports directed, typed, weighted edges; multiple edge types between the same nodes are allowed.
- **R2.2** Raw mentions stay separate from canonical entities.
- **R2.3** Provisional clusters include confidence and rationale.
- **R2.4** All merges and splits are reversible.
- **R2.5** Every edge stores full provenance; edges without evidence are quarantined.
- **R2.6** Relationship freshness is stored on every edge.
- **R2.7** Donations are modelled as `donation_events` nodes, not edges with attributes.
- **R2.8** Human identity decisions replay during graph construction (§15.5).
- **R2.9** Canonical entity IDs persist across re-runs.
- **R2.10** Graph snapshots are exportable to Supabase Storage as Parquet (nodes.parquet, edges.parquet), tagged with `run_id`.

**Acceptance.** Graph builds on representative slice; production edges have evidence; clusters include confidence and rationale; human merge/split decisions replay correctly; snapshot reproducible by run ID.

---

# 16. Phase 3 — Candidate Discovery

**Purpose.** Surface previously unknown person-like candidates near known seeds through explainable relationship paths and graph proximity.

**Inputs.** Populated graph, seed entities, ICP config, known contact list, prior rejection list, candidate ceiling, edge weighting config.

**Outputs.** Candidate recommendations, path instances, reason codes, seed quality score, discovery report.

## 16.1 v1 Discovery Methods

**Path-template scoring.** Business-relevant path patterns with template weights. Examples:

```
Seed Person → TRUSTEE_OF → Charity ← TRUSTEE_OF ← Candidate Person
Seed Trust → MADE_DONATION → DonationEvent → RECEIVED_BY → Charity ← TRUSTEE_OF ← Candidate Person
Seed Company → DIRECTOR_OF ← Person → TRUSTEE_OF → Charity
```

**Shared-affiliation scoring.** Shared charity, trust, company, donation target, board network; shared address weighted lower.

**Personalised PageRank.** Run NetworkX PPR seeded from the known contact with `alpha=0.85`, `personalization` vector concentrated on the seed.

**Human baseline comparison.** For 5–10 seeds, compare algorithmic output against manually curated candidates before expanding the algorithm set.

## 16.2 Path Score Formula

```
path_score = template_weight × average(edge_weight across path) × path_length_penalty × path_evidence_confidence
```

| Path length | Multiplier |
|---:|---:|
| 1 edge | 1.00 |
| 2 edges | 0.85 |
| 3 edges | 0.65 |
| 4+ edges | excluded by default |

```
candidate_path_score = strongest_path_score + 0.25 × log(1 + number_of_additional_qualifying_paths)
```

## 16.3 Candidate Eligibility

A candidate must be a person-like entity, have at least one path to a seed, have at least one qualifying role/donation/affiliation/signal, meet minimum evidence confidence (≥0.40), not already be in `known_contacts`, not be in `rejection_log` for the same seed, and not be an excluded intermediary or generic service entity unless explicitly allowed.

## 16.4 Seed Quality Score

```
seed_quality_score =
  0.30 × strong_edge_count_score
+ 0.25 × recent_edge_score
+ 0.20 × affiliation_count_score
+ 0.15 × historical_intro_success_score
+ 0.10 × identity_confidence_score
```

| Seed quality | Behaviour |
|---:|---|
| ≥0.70 | Normal discovery |
| 0.40–0.69 | Show warning, normal output |
| under 0.40 | Cap output at top 25, require higher confidence, block Tier 2/3 enrichment unless manually approved |

## 16.5 Requirements

- **R3.1** Support single-seed discovery and multi-seed intersection/union.
- **R3.2** Path-template scoring implemented.
- **R3.3** Shared-affiliation scoring implemented.
- **R3.4** Personalised PageRank implemented.
- **R3.5** Edge weights, confidence, and freshness decay applied throughout.
- **R3.6** Filter known contacts, prior leads, rejected candidates, excluded entities.
- **R3.7** Return shortest path and strongest path per candidate.
- **R3.8** Return reason codes per candidate.
- **R3.9** Compare output against human baseline for 5–10 seeds before expanding algorithm set.
- **R3.10** Support top-50 default review queue and top-200 analytics export.

**Acceptance.** Discovery runs for 5–10 validation seeds; every candidate has strongest path and reason code; outputs compared against human baseline; weak-seed warnings work; rejected and known contacts filtered.

---

# 17. Phase 4 — Tiered Enrichment

**Purpose.** Add external signals to candidates without wasted API calls and with source-level confidence preserved.

**Inputs.** Candidate recommendations, candidate clusters, enrichment source config, priority and confidence thresholds.

**Outputs.** Enrichment signals, match confidence records, enrichment cache, enrichment status report.

## 17.1 Tiers

| Tier | Sources (v1) | Behaviour |
|---|---|---|
| Tier 1 | Companies House API, Charity Commission API | Run on all eligible candidates |
| Tier 2 | Wikidata, Wikipedia, Google News (via SerpAPI or equivalent) | Run on Priority >0.50 |
| Tier 3 | Manual research handoff (link to candidate dossier + research notes field) | Manual trigger by reviewer only |

Tier 3 in v1 is a manual workflow surface, not an automated source. The reviewer clicks "Mark for deep research" on a candidate; the system flags it and a researcher fills the notes field. No automated scraping of LinkedIn, paid databases, or property records in v1.

## 17.2 Lifecycle States

`not_started`, `queued`, `in_progress`, `matched`, `ambiguous_match`, `no_result`, `failed_retryable`, `failed_final`, `stale`, `manual_required`.

## 17.3 Requirements

- **R4.1** Enrichment modules are pluggable with a standard interface: candidate entity in, structured signal payload out.
- **R4.2** Tier 1 runs on all candidates above the eligibility threshold.
- **R4.3** Tier 2 runs only above the medium-priority threshold.
- **R4.4** Tier 3 is reviewer-triggered only.
- **R4.5** Every external record includes a match confidence with feature breakdown.
- **R4.6** Ambiguous matches (confidence 0.55–0.74) are stored but not accepted for scoring.
- **R4.7** Conflicting signals are stored and surfaced in the dossier.
- **R4.8** Cache enrichment results in `enrichment_signals` with source-specific TTL (Companies House: 30 days, Charity Commission: 30 days, Wikidata: 90 days, news: 7 days).
- **R4.9** Retry logic handles rate limits with exponential backoff (1s, 4s, 16s, then mark `failed_retryable`).

## 17.4 Failure Behaviour

| Failure | Behaviour |
|---|---|
| API unavailable | Retry with backoff, then mark source unavailable for the run |
| Rate limit | Pause source, continue pipeline |
| Ambiguous match | Store unresolved, do not score |
| Conflicting match | Store conflict, show warning |
| No result | Record negative result with timestamp |
| Stale cache | Refresh if TTL expired |
| Partial response | Store partial, mark incomplete |

**Acceptance.** Tier 1 works for eligible candidates; ambiguous matches not scored; cache and TTL work; failed retries logged; match confidence stored per signal.

---

# 18. Phase 5 — Ranking, Presentation Dedup, Dossier, Human Review

**Purpose.** Present ranked, explainable, reviewable candidate opportunities while separating priority from confidence.

**Inputs.** Candidate recommendations, enrichment signals, ICP config, known contacts, prior decisions, identity clusters.

**Outputs.** Review queue, candidate dossiers, spreadsheet export, human decisions, identity decisions, intro outcomes.

## 18.1 Candidate Priority Score

```
priority_score =
  0.30 × introability_score
+ 0.25 × affinity_score
+ 0.20 × capacity_signal_score
+ 0.15 × influence_score
+ 0.10 × strategic_fit_score
```

## 18.2 Evidence Confidence Score

```
confidence_score =
  0.35 × identity_confidence
+ 0.30 × relationship_confidence
+ 0.20 × source_corroboration_score
+ 0.15 × freshness_score
```

## 18.3 Capacity Signal

Capacity Signal is an observable-only aggregate: donation history, foundation or trust involvement, senior company roles, directorships, board memberships, repeated philanthropic affiliations, public leadership roles, relevant institutional connections. It is never presented as estimated personal wealth, liquidity, willingness to donate, or actual giving capacity unless directly evidenced.

## 18.4 Presentation Deduplication

Before producing candidate lists, run a presentation-layer dedup pass.

- Candidates above the presentation-merge threshold (0.75) are collapsed into one presentation row.
- The collapsed row uses the highest score and aggregates evidence from all underlying candidates.
- The underlying graph remains unchanged.
- The reviewer can split a presentation row or confirm a same-person decision; both feed `human_identity_decisions`.

## 18.5 Cold-Start Decision Handling

Decisions made before the cold-start threshold (100 decisions across 10 seeds) are flagged `cold_start_decision = true` but are retained. They are eligible for inclusion in the first calibration once the threshold is reached, with the product owner reviewing distribution before they feed weight updates. Decisions are never discarded.

## 18.6 Review Queue Fields

Candidate ID, candidate name, candidate type, priority score, confidence score, recommended introducer, strongest intro path, top 3 reason codes, identity warning, reviewer status, last updated, action button.

## 18.7 Candidate Dossier

```markdown
# Candidate Dossier: [Candidate Name]

## Summary
- Candidate type
- Priority score (breakdown available)
- Evidence confidence score (breakdown available)
- Recommended introducer
- Suggested introduction angle
- Aggregated mentions / clusters: [N] (expand)

## Why this candidate was surfaced
- Path 1: [description with weight]
- Path 2: [description with weight]
- Shared affiliations
- Discovery methods used

## Relationship path to seed
[Seed] → [Relationship] → [Intermediate] → [Relationship] → [Candidate]

## Evidence
| Claim | Evidence span | Source document | Confidence |

## Known roles and affiliations
| Entity | Role | Start | End | Confidence |

## Enrichment signals
| Source | Signal | Match confidence | Freshness |

## Identity resolution notes
- Possible duplicates
- Conflicting data
- Missing data
- Underlying mentions

## Reviewer decision
- Status
- Notes
- Outcome
- Identity decision
```

## 18.8 Suggested Introduction Angle

Hybrid template + LLM with hard fact-grounding.

1. Select the strongest evidence-backed path.
2. Generate a deterministic skeleton from the path facts.
3. Optionally rephrase with Claude using only the provided facts and a strict instruction to add nothing not present.
4. Validate that every named entity, date, role, and organisation in the LLM output appears in the input facts.
5. If validation fails, fall back to the deterministic skeleton.
6. Show both versions to the reviewer.

Example skeleton: "Candidate appears connected to Seed A through shared involvement with Charity X. Seed A donated to Charity X in 2023. Candidate B has served as trustee of Charity X since 2021."

## 18.9 Reviewer Workflow States

`Discovered`, `Enriched`, `Ready for Review`, `In Review`, `Qualified`, `Intro Requested`, `Intro Made`, `Meeting`, `Opportunity`, `Converted`, `Rejected`.

## 18.10 Structured Decision Labels

| Decision | Meaning |
|---|---|
| Qualified | Worth pursuing |
| Rejected — wrong person | Entity resolution failure |
| Rejected — weak connection | Path not meaningful |
| Rejected — bad fit | Not aligned to ICP |
| Rejected — already known | CRM gap |
| Needs more research | Insufficient confidence |
| Intro requested | Seed was asked |
| Intro declined | Seed would not introduce |
| Meeting booked | Successful intro outcome |
| Converted | Became qualified opportunity |

## 18.11 Spreadsheet Export Format

Columns: Candidate ID, Run ID, Candidate Name, Candidate Type, Priority Score, Confidence Score, Recommended Introducer, Intro Path, Shared Affiliations, Strongest Evidence, Capacity Signal, Affinity Signal, Influence Signal, Identity Warnings, Aggregated Mentions, Suggested Angle (Skeleton), Suggested Angle (Natural), Reviewer Status, Rejection Reason, Dossier Link.

## 18.12 Spreadsheet Source-of-Truth Rule

The spreadsheet is a handoff surface, not the system of record. Every row includes stable candidate ID and run ID. Reviewer decisions are captured through the web app, not by editing the spreadsheet. The app provides a "decisions import" flow that accepts a CSV with `candidate_recommendation_id`, `decision`, `reason_code`, and `notes` columns; rows are validated and applied through the `/decisions` API. Any other spreadsheet edits are advisory only. Re-exporting a spreadsheet does not create duplicate rows because `(run_id, candidate_recommendation_id)` is the natural key.

## 18.13 Requirements

- **R5.1** Priority and confidence scores shown separately.
- **R5.2** Score breakdown and reason codes shown.
- **R5.3** Recommended introducer shown.
- **R5.4** Strongest path and evidence shown.
- **R5.5** Suggested intro angle generated with grounded hybrid method.
- **R5.6** Presentation dedup runs before producing the queue.
- **R5.7** Candidate dossier provided per candidate.
- **R5.8** Spreadsheet export available.
- **R5.9** Human decisions captured through the app.
- **R5.10** Human identity decisions captured.
- **R5.11** Intro and conversion outcomes tracked.
- **R5.12** All decisions persist across re-runs.

**Acceptance.** Spreadsheet export includes all fields; dossier links resolve; reviewer decisions write to the database; presentation dedup works and is reversible; intro-angle generation validates against facts; rejected same-seed candidates suppressed in future outputs.

---

# 19. Phase 6 — Outcome Tracking and Weight Calibration

**Purpose.** Use structured decisions and intro outcomes to improve scoring over time.

**Inputs.** Human decisions, intro outcomes, conversion outcomes, run metadata, candidate scores, rejection reasons.

**Outputs.** Monitoring dashboards, calibration reports, suggested config changes, versioned scoring config updates.

## 19.1 Cold-Start Gate

No automatic or semi-automatic weight updates until at least 100 reviewer decisions across at least 10 distinct seeds. Before the threshold, Phase 6 emits monitoring only. Cold-start decisions are retained and eligible for first calibration.

## 19.2 Calibration Process

Every 100 reviewed candidates after the gate: export reviewed outcomes; inspect rejection reason distribution; inspect top false positive causes; compare score bands against qualification rate; propose weight and threshold changes; test against validation seeds; compare old vs new ranking quality; approve new scoring config; version and deploy; monitor drift.

## 19.3 Requirements

- **R6.1** Log every reviewer decision with structured reason code.
- **R6.2** Log intro request, intro outcome, meeting outcome, conversion outcome.
- **R6.3** Enforce cold-start threshold.
- **R6.4** Produce a calibration report once threshold is met.
- **R6.5** Human sign-off required before first scoring config update.
- **R6.6** Monitor extraction quality drift across runs.
- **R6.7** Monitor identity resolution failure rates across runs.
- **R6.8** Surface failure modes by reason code.

**Acceptance.** Decisions tracked; funnel outcomes tracked; cold-start gate enforced; calibration report generatable; scoring config changes versioned.

---

# 20. Internal API Contracts

Implemented as Vercel API routes (Next.js Route Handlers) hitting Supabase via the service-role key, and Supabase Edge Functions for long-running phase work. All routes require Supabase Auth session cookies. Response shape is JSON; errors return `{ error: { code, message, details } }` with appropriate HTTP status.

## 20.1 Runs

```
POST   /api/runs                      → { run_id }
GET    /api/runs/:run_id              → Run
POST   /api/runs/:run_id/cancel       → { ok }
POST   /api/runs/:run_id/retry        → { run_id, retried_phases[] }
GET    /api/runs                      → Run[] (latest 50)
```

Body for `POST /api/runs`:
```json
{
  "corpus_version": "corpus_2026_05_18",
  "scoring_config_version": "scoring_v1",
  "icp_id": "major_donor_v1",
  "seed_ids": ["seed_abc", "seed_def"]
}
```

## 20.2 Phases

```
POST /api/runs/:run_id/phases/:phase/start  → { job_id }
POST /api/runs/:run_id/phases/:phase/retry  → { job_id }
GET  /api/runs/:run_id/phases/:phase/report → PhaseReport
```

`:phase` is one of `classify`, `extract`, `validate`, `graph`, `discover`, `enrich`, `rank`.

## 20.3 Quarantine

```
GET   /api/quarantine?run_id=…&reason=…   → QuarantineRecord[]
POST  /api/quarantine/:id/resolve         → { ok }
```

## 20.4 Graph and Identity

```
GET   /api/entities/:canonical_entity_id           → Entity
POST  /api/identity/merge                          → { identity_decision_id }
POST  /api/identity/split                          → { identity_decision_id }
GET   /api/identity/decisions?entity_id=…          → HumanIdentityDecision[]
```

Body for `POST /api/identity/merge`:
```json
{
  "entity_a_mention_id": "mention_001",
  "entity_b_mention_id": "mention_184",
  "reason_code": "shared_name_address_org",
  "notes": "Same trustee role at Charity X"
}
```

## 20.5 Discovery and Candidates

```
POST  /api/discovery/query                                       → CandidateRecommendation[]
GET   /api/runs/:run_id/candidates?seed_id=…&status=…&limit=…    → CandidateRecommendation[]
GET   /api/candidates/:candidate_recommendation_id               → CandidateRecommendation
GET   /api/candidates/:candidate_recommendation_id/dossier       → Dossier
```

## 20.6 Enrichment

```
POST  /api/candidates/:candidate_recommendation_id/enrich   → { job_id }
GET   /api/candidates/:candidate_recommendation_id/enrichment → EnrichmentSignal[]
POST  /api/enrichment/refresh                                → { job_id }
```

## 20.7 Decisions and Outcomes

```
POST  /api/candidates/:candidate_recommendation_id/decision      → { human_decision_id }
POST  /api/candidates/:candidate_recommendation_id/intro-status  → { intro_outcome_id }
POST  /api/decisions/import                                      → { imported, rejected }
GET   /api/exports/spreadsheet?run_id=…                          → CSV
```

Body for `POST /api/candidates/:id/decision`:
```json
{
  "decision": "qualified",
  "reason_code": null,
  "notes": "Strong fit, trusteeship overlap with seed."
}
```

## 20.8 Error Codes

`bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `unprocessable_entity`, `internal_error`. Errors include a stable `code` for clients to switch on and a human-readable `message`.

## 20.9 Idempotency

All `POST` mutations accept an optional `Idempotency-Key` header. Repeated requests with the same key within 24 hours return the original response.

---

# 21. Error Handling, Retry, Rollback

## 21.1 Phase Failure Behaviour

| Phase | Failure | Behaviour |
|---|---|---|
| Phase 1 | Invalid LLM output | Retry up to 3 times, then quarantine |
| Phase 1 | Document too long | Chunk and retry |
| Phase 1.5 | Schema invalid | Reject record, log reason |
| Phase 2 | Graph build fails | Do not publish snapshot |
| Phase 3 | Seed not found | Mark seed failed, continue other seeds |
| Phase 4 | API rate limit | Backoff, pause source, continue pipeline |
| Phase 4 | Ambiguous external match | Store ambiguous, do not score |
| Phase 5 | Export fails | Retry export, preserve candidate data |
| Phase 6 | Calibration fails | Keep current scoring config |

## 21.2 Idempotency

All phase jobs are idempotent by `(run_id, phase)`. Re-running with the same inputs and config produces no duplicate records.

## 21.3 Rollback

Rollback is required when the graph build fails after partial write; candidate recommendations are generated from an invalid snapshot; a scoring config is promoted incorrectly; or a spreadsheet export contains corrupt IDs. Rollback preserves raw input data and human decisions.

Rollback flow: mark the run `rolled_back`; soft-delete artefacts tagged with the run ID via a `deleted_at` column (no hard delete); restore the previous scoring config if it was promoted by this run.

---

# 22. Observability and SLOs

## 22.1 Dashboards (built as Next.js routes in `/admin`)

Pipeline runs, extraction quality, quarantine, identity resolution, graph health, candidate discovery, enrichment, reviewer workflow, outcome funnel, cost.

## 22.2 Metrics

| Area | Metrics |
|---|---|
| Extraction | documents processed, invalid JSON, evidence coverage |
| Validation | accepted vs quarantined records |
| Identity | cluster count, merge/split count, false match reasons |
| Graph | nodes, edges, build time, memory use |
| Discovery | candidates per seed, path diversity, weak seed count |
| Enrichment | success rate, ambiguous match rate, API failures |
| Review | time to decision, decision distribution, rejection reasons |
| Outcome | intro request rate, intro success, meeting, conversion |
| Cost | LLM cost, API cost, cost per qualified candidate |

## 22.3 SLOs

| Process | Target |
|---|---:|
| Candidate discovery per seed | under 5 minutes |
| Dossier page load (p95) | under 3 seconds |
| Spreadsheet export generation | under 10 minutes |
| Evidence link availability | 99%+ |
| Pipeline run completion | 95%+ |
| Reviewer decision save | 99.5%+ |
| Candidate score variance across identical re-runs | under 5% |
| Identity cluster stability across runs | 95%+ |
| Top-50 path reproducibility | 90%+ |

Full-corpus extraction and graph-build SLOs are set after Phase 0 load test.

---

# 23. QA and Test Strategy

## 23.1 Test Types and Coverage

| Test type | Purpose | Coverage target | Deployment gate? |
|---|---|---:|---|
| Schema validation tests | Objects conform to contracts | 100% of object types | Yes |
| Extraction regression tests | Prevent prompt/model degradation | All document types | Yes |
| Golden document tests | Compare extraction against labels | 50–150 docs | Yes |
| Identity resolution tests | Validate merge/split logic | 30+ cases | Yes |
| Human decision replay tests | Decisions persist across reruns | 100% of decision types | Yes |
| Path scoring tests | Validate scoring math | 20+ paths | Yes |
| Dossier rendering tests | Evidence and paths display | All dossier sections | Yes |
| Enrichment matching tests | Ambiguous matches not scored | All sources | Yes |
| Export integrity tests | Spreadsheet IDs and links work | Full export | Yes |
| Pipeline recovery tests | Failed phases retry/rollback | Each phase | Yes |
| Load tests | Concurrent reviewer + pipeline behaviour | n=10 reviewers, 1 run | Observational |

All "Yes" tests run on every PR via GitHub Actions and must pass before Vercel promotes the deploy from preview to production.

## 23.2 Prompt Promotion Gate

A new extraction prompt version can be promoted only if precision does not decline on the gold set; hallucination rate does not increase; evidence span coverage remains above threshold; invalid JSON rate remains below threshold; and sample candidate rankings are reviewed.

## 23.3 Scoring Config Promotion Gate

A scoring config can be promoted only if validation seed ranking quality improves or remains stable; false positive rate does not materially increase; top candidates remain explainable; config version and rationale are recorded.

---

# 24. Access Control

Supabase Auth + RLS. Roles are stored as a `role` claim on the user.

| Role | Permissions |
|---|---|
| `reviewer` | Read assigned queue, read dossiers, write decisions, suggest identity changes |
| `senior_reviewer` | All reviewer perms + approve high-impact identity merges/splits |
| `lead_owner` | All reviewer perms + manage qualified candidates and intro outcomes |
| `admin` | Run pipeline, retry jobs, export data, manage users |
| `product_owner` | Edit ICP, propose scoring config changes |
| `engineering_admin` | Promote prompt/schema/scoring versions, rollback runs |

Requirements: only `admin` can trigger full pipeline runs; only `product_owner` or `engineering_admin` can promote scoring config; reviewers can suggest identity changes; senior reviewer or admin must approve high-impact identity changes; all admin actions are logged in an `audit_log` table.

---

# 25. Cost Model

## 25.1 Cost Drivers

| Driver | Estimate for 25k docs |
|---|---|
| LLM extraction | 25,000 docs × avg 4,000 input tokens + 800 output tokens × Claude Sonnet 4 batch pricing. Estimated $180–$260 per full corpus run. |
| LLM intro-angle generation | 50 candidates per seed × 10 seeds × 800 tokens. Estimated $1–$3 per discovery run. |
| Companies House API | Free (10 req/sec rate limit). |
| Charity Commission API | Free. |
| Wikidata / Wikipedia | Free. |
| News API (SerpAPI) | $50/month starter tier. |
| Supabase | Pro tier, $25/month, sufficient for 25k docs + graph at MVP scale. |
| Vercel | Pro tier, $20/month. |
| Embedding generation (pgvector) | One-off $30–$50 for 25k docs via Anthropic embeddings or OpenAI ada-002. |
| Total monthly recurring | Approximately $95/month plus one-off extraction costs per run. |

## 25.2 Unit Economics

The product calculates and dashboards:

```
cost_per_surfaced_candidate
cost_per_reviewed_candidate
cost_per_qualified_candidate
cost_per_intro_request
cost_per_successful_intro
cost_per_qualified_opportunity
```

## 25.3 Budget Gate

Before each full-corpus run: expected cost is estimated and approved; enrichment cost is capped by tier thresholds; cost per qualified candidate is compared against manual baseline.

---

# 26. Ownership and RACI

Single-engineer MVP. Roles are duties, not necessarily distinct people.

| Area | Responsible | Accountable |
|---|---|---|
| PRD | Product Owner | Sponsor |
| Data model | Engineer | Engineer |
| Extraction prompts | Engineer | Engineer |
| Identity resolution | Engineer | Engineer |
| Scoring model | Product Owner | Sponsor |
| Enrichment integrations | Engineer | Engineer |
| Reviewer workflow | Product Owner | Product Owner |
| QA | Engineer | Engineer |
| Pipeline operations | Engineer | Engineer |
| Pilot rollout | Product Owner | Sponsor |

When the team grows past one engineer, RACI is revisited.

---

# 27. Delivery Plan

| Milestone | Scope | Estimate |
|---|---|---:|
| M0 | Corpus audit, gold set, ICP, identity strategy, load test, heuristics calibration | 2–3 weeks |
| M1 | Supabase project setup, schema migration, extraction prototype on 500-doc sample | 2 weeks |
| M2 | Validation, normalisation, schema hardening, quarantine flow | 1–2 weeks |
| M3 | Entity clustering, graph construction, identity persistence | 1–2 weeks |
| M4 | Path-template scoring, PPR, presentation dedup | 1–2 weeks |
| M5 | Tier 1 enrichment (Companies House, Charity Commission), Tier 2 (Wikidata, news) | 2 weeks |
| M6 | Two-score model, intro-angle generation, dossier UI, spreadsheet export | 2 weeks |
| M7 | Full-corpus dry run, QA, observability dashboards | 1–2 weeks |
| M8 | Human pilot with 5–10 seeds, cold-start monitoring | 2–4 weeks |

**Expected MVP delivery: 14–19 weeks.**

---

# 28. Rollout Plan

## 28.1 Alpha

Scope: labelled examples, 500-doc sample, internal review only.
Exit: extraction thresholds met; evidence spans reliable; candidate path explanations work.

## 28.2 Pilot

Scope: 5–10 seeds, 500–2,500 doc slice, Tier 1 enrichment only, spreadsheet + dossier, no automatic weight learning.
Exit: reviewers trust outputs; rejection reasons understood; qualification targets approached; cost acceptable.

## 28.3 Limited Production

Scope: full corpus, limited reviewer set, full review queue, Tier 1 + controlled Tier 2.
Exit: pipeline stable; cost within budget; decisions and outcomes tracked; identity errors under threshold.

## 28.4 Production v1

Scope: full corpus, approved users, regular scheduled batch runs, outcome tracking, manual calibration after cold-start threshold.

---

# 29. Rollback Criteria

Rollback or pause if hallucinated relationship rate exceeds threshold; false identity match rate exceeds threshold; reviewer rejection rate spikes materially; graph build is non-reproducible; spreadsheet exports contain broken IDs or links; enrichment matches become unreliable; cost exceeds approved budget by agreed threshold; human identity decisions are not replayed correctly; evidence spans become unavailable.

---

# 30. Decision Log

| Decision | Options considered | v1 choice |
|---|---|---|
| Stack | Various | Supabase + Vercel + GitHub |
| Application DB | Various | Supabase Postgres |
| Graph engine | Neo4j / Memgraph / NetworkX / pg_graph | In-process NetworkX, loaded from Postgres views, contingent on load test |
| Auth | Auth0 / Clerk / Supabase Auth | Supabase Auth |
| Background jobs | Inngest / Trigger.dev / Supabase Edge Functions + pg_cron | Supabase Edge Functions + pg_cron + jobs table |
| LLM | OpenAI / Anthropic | Anthropic Claude Sonnet 4, batch API, temperature 0 |
| Embeddings | OpenAI ada-002 / Anthropic embeddings / Voyage | OpenAI ada-002 (cheapest at MVP scale) via pgvector |
| Frontend | Next.js / Remix / SvelteKit | Next.js App Router |
| Search | Algolia / Typesense / Postgres | Postgres pg_trgm + pgvector |
| Candidate scoring | One score / two scores | Two scores: priority + confidence |
| Discovery method | Full ensemble / path scoring / PPR | Path-template + shared affiliation + PPR |
| Entity resolution | None / hard merge / provisional | Provisional clusters, reversible, human decisions persist |
| Output format | UI / spreadsheet / both | Both: web dossier + spreadsheet export |
| Enrichment | All sources / tiered | Tiered (Tier 1 auto, Tier 2 thresholded, Tier 3 manual) |
| Feedback granularity | Binary / structured reasons | Structured |
| Donations modelling | Edge / event node | Event node |
| Capacity scoring | Net worth proxy / capacity signal | Capacity Signal only |
| Cold-start weights | Learn day one / bootstrap | Bootstrap, retain decisions, calibrate after threshold |
| Intro angle | Template / LLM / hybrid | Hybrid with fact validation |
| Presentation dedup | Graph-level / UI-level | UI-level reversible |
| Spreadsheet authority | Yes / no | No, database canonical; CSV import only via app |
| Conflict on human decision | Auto wins / human wins | Human always wins, conflict logged |
| Cold-start decisions | Discard / retain | Retain, flag, eligible for first calibration |

---

# 31. Open Items (Non-Blocking)

These do not block the MVP build but should be resolved during M0–M2:

1. Which existing customers are the first 10 pilot seeds?
2. What is the v1 ICP exact definition?
3. Approved candidate ceiling per seed beyond the top-50 default.
4. Pipeline run cadence in production v1 (weekly / monthly / on-demand).
5. Handoff path into existing CRM workflow.
6. Support process for bad candidate outputs.

---

# 32. Deferred to v2

| Item | Reason | Trigger for v2 work |
|---|---|---|
| Incremental ingestion | Snapshot re-runs are tractable at 25k docs | Corpus exceeds ~100k or weekly refresh is required |
| Full algorithm ensemble | Explainable v1 must be validated first | Candidate quality plateaus despite path-template tuning |
| Rich multi-user reviewer UI | Web dossier + spreadsheet is faster to ship | Reviewer throughput becomes the bottleneck |
| Multi-ICP support | Single ICP keeps v1 focused | Other teams adopt the platform |
| Automatic weight learning | Cold-start risk is too high | First manual calibration succeeds and decision volume supports automation |
| Cross-corpus federation | Out of initial scope | New corpora materially extend coverage |
| Real-time scoring | Batch satisfies the use case | A workflow requires sub-minute response |
| Outreach automation | Humans act in v1 | Clear operational demand and controls |
| CRM writeback | Handoff only in v1 | Qualified leads need structured CRM sync |
| LinkedIn / paid database enrichment | Manual research is sufficient for v1 | Tier 3 manual workflow becomes the bottleneck |

---

# Appendix A — Starting Heuristics

All values calibrated in Phase 0 against the gold set; refined in Phase 6 after cold-start threshold.

## A.1 Edge Base Strengths

| Relationship type | Starting strength |
|---|---:|
| TRUSTEE_OF active role | 1.00 |
| DIRECTOR_OF active role | 0.90 |
| DONATED_TO with amount/date | 0.85 |
| Shared board membership | 0.80 |
| REGISTERED_AT same address | 0.30 |
| CO_OCCURS_WITH same document | 0.20 |

## A.2 Freshness Decay

| Age | Multiplier |
|---|---:|
| 0–2 years | 1.00 |
| 3–5 years | 0.75 |
| 6–10 years | 0.50 |
| 10+ years | 0.25 |
| Unknown date | 0.60 |

## A.3 Score Weights

**Candidate Priority Score.** Introability 30%, Affinity 25%, Capacity Signal 20%, Influence 15%, Strategic Fit 10%.

**Evidence Confidence Score.** Identity confidence 35%, Relationship confidence 30%, Source corroboration 20%, Freshness 15%.

## A.4 Thresholds

| Threshold | Starting value |
|---|---:|
| Presentation merge confidence | 0.75 |
| Auto-merge confidence | 0.90 |
| Provisional cluster confidence | 0.75 |
| Cold-start decision count | 100 decisions across 10 seeds |
| Tier 2 enrichment trigger | Priority >0.50 |
| Tier 3 enrichment trigger | Reviewer-triggered only |
| Edge quarantine | Confidence under 0.40 or no evidence span |
| Weak seed threshold | Seed quality under 0.40 |
| Path length cutoff | 3 edges max by default |

---

# Appendix B — Build-Ready Checklist

Promote to build when:

- [ ] Supabase project provisioned and schema migration applied.
- [ ] Vercel project linked to GitHub repo.
- [ ] GitHub Actions CI configured with all gated tests.
- [ ] Anthropic API key provisioned with batch access.
- [ ] Companies House and Charity Commission API access verified.
- [ ] Phase 0 corpus audit complete.
- [ ] Gold set labelled.
- [ ] Manual baseline documented.
- [ ] Graph engine decision recorded.
- [ ] Data contracts approved.
- [ ] API contracts approved.
- [ ] Scoring formulas approved.
- [ ] Acceptance criteria approved.
- [ ] QA plan approved.
- [ ] Observability dashboards specified.
- [ ] SLOs specified.
- [ ] Cost model approved.
- [ ] Rollout plan approved.
- [ ] Rollback criteria approved.
- [ ] Pilot seed list approved.

---

# Final Product Statement

```
Evidence-first extraction
+ validation and quarantine
+ reversible identity resolution
+ provenance-preserving graph
+ explainable path discovery
+ selective tiered enrichment
+ two-score ranking
+ presentation deduplication
+ dossier-backed human review
+ structured intro outcome tracking
+ calibrated feedback loop
+ observable, retryable, versioned operations
+ Supabase + Vercel + GitHub
```

The system is successful when it helps reviewers find credible, explainable, high-fit candidates faster than manual research, while preserving enough evidence and operational control that the team trusts the recommendations enough to act.
