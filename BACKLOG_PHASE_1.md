# Phase 1 Backlog — Customer Intelligence Platform MVP
## Epics, Features, and Tasks

**Scope:** Full MVP build (Milestones M0–M8 from PRD §27)
**Source of truth:** [PRD.md](./PRD.md)
**Status legend:** `[ ]` Not started · `[~]` In progress · `[x]` Done · `[!]` Blocked

### Build Order

Epics are numbered by functional area. **Execution order follows milestones:**

1. **Epic 2** (M0) — Corpus audit, gold set, ICP, identity strategy, load test
2. **Epic 1** (M1) — Infrastructure, schema, Vercel, CI/CD
3. **Epic 3** (M1) — Document classification & LLM extraction
4. **Epic 5** (M1–M2) — Run management & pipeline orchestration
5. **Epic 4** (M2) — Validation, normalisation, quarantine
6. **Epic 6** (M3) — Entity resolution & graph construction
7. **Epic 7** (M4) — Candidate discovery
8. **Epic 8** (M5) — Tiered enrichment
9. **Epic 9** (M6) — Ranking, dossier, human review
10. **Epic 10** (M6–M7) — Outcome tracking & calibration
11. **Epic 11** (M7) — Observability dashboards
12. **Epic 12** (M7) — Full-corpus dry run & QA
13. **Epic 13** (M8) — Pilot & cold-start monitoring

---

## Epic 1: Foundation — Infrastructure & Data Model (M1)

> Set up the Supabase project, Vercel frontend, GitHub CI, and deploy the full Postgres schema so all subsequent phases have a working data layer.

### Feature 1.1: Supabase Project Setup

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F1.1-T1 | Provision Supabase project (Pro tier), enable `pg_trgm`, `pgvector`, `pg_cron` extensions | §8.1, §9 | Extensions queryable; project accessible via dashboard and CLI | `[x]` |
| F1.1-T2 | Configure Supabase Auth with email-link and Google SSO | §8.1, §24 | Auth flow works for test user; session cookies issued | `[ ]` |
| F1.1-T3 | Create Supabase Storage buckets: `raw-filings`, `graph-snapshots`, `exports`, `gold-set` | §9 | Buckets exist; upload/download works via SDK | `[x]` |
| F1.1-T4 | Set up environment variables and secrets management (Supabase service-role key, anon key, project URL) | §8.1 | Env vars available in Vercel and local dev; secrets not in source | `[x]` |

### Feature 1.2: Postgres Schema Migration

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F1.2-T1 | Create `app` schema and apply full DDL from PRD §11.1 (all tables, indexes, constraints) | §11.1 | All tables exist; foreign keys enforced; indexes created | `[x]` |
| F1.2-T2 | Add `audit_log` table for admin action tracking | §24 | Audit log captures user, action, timestamp, payload | `[x]` |
| F1.2-T3 | Enable Row-Level Security on all `app.*` tables; create RLS policies for all 6 roles per §24: reviewer (assigned queue + decisions), senior_reviewer (+high-impact identity approval), lead_owner (+intro outcomes), admin (full + pipeline runs), product_owner (ICP + scoring config proposals), engineering_admin (version promotions + rollbacks); anonymous blocked | §11.2, §24 | Each role tested; admin-only run enforcement verified; config-promotion restricted to product_owner/engineering_admin; high-impact identity changes require senior_reviewer/admin | `[x]` |
| F1.2-T4 | Create migration tooling (versioned SQL files, up/down scripts) | §10.3 | Migrations are repeatable; schema version tracked | `[x]` |
| F1.2-T5 | Write schema validation tests — every table, column, index, FK, and RLS policy verified | §23.1 | Tests pass in CI; 100% of object types covered | `[x]` |

### Feature 1.3: Vercel + Next.js Project Setup

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F1.3-T1 | Initialize Next.js App Router project with TypeScript, Tailwind | §8.1 | `next dev` runs; Tailwind renders | `[x]` |
| F1.3-T2 | Link Vercel project to GitHub repo; configure preview deploys on PR, production deploy on `main` | §8.1 | PR creates preview URL; merge to `main` triggers production deploy | `[ ]` |
| F1.3-T3 | Set up Supabase client (browser + server) with auth session handling | §8.1, §24 | Server components can query Supabase; auth cookies forwarded | `[x]` |
| F1.3-T4 | Create shared API error response shape `{ error: { code, message, details } }` and typed error codes | §20.8 | All API routes use consistent error shape | `[x]` |
| F1.3-T5 | Implement `Idempotency-Key` header middleware for POST mutations | §20.9 | Repeated requests with same key return original response within 24h | `[x]` |

### Feature 1.4: GitHub CI/CD

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F1.4-T1 | Configure GitHub Actions: lint, type-check, test on every PR | §23.1, §8.1 | PR checks run and block merge on failure | `[x]` |
| F1.4-T2 | Add schema validation test suite to CI gate | §23.1 | Schema tests run and must pass before merge | `[x]` |
| F1.4-T3 | Configure Vercel deploy gate (tests pass → preview promotes to production on `main`) | §23.1 | Failed tests block production deployment | `[ ]` |

### Feature 1.5: ULID and Core Utilities

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F1.5-T1 | Add ULID generation utility (sortable, URL-safe text IDs) | §11.1 | IDs are unique, sortable, and text-typed | `[x]` |
| F1.5-T2 | Create shared TypeScript types matching the Postgres schema | §11.1 | Types match schema 1:1; used by API routes and frontend | `[x]` |
| F1.5-T3 | Create content-hash utility for document dedup (SHA-256 of content) | §11.1 | Same content produces same hash; different content produces different hash | `[x]` |

---

## Epic 2: Corpus Audit & Gold Set (M0)

> Profile the document corpus, classify document types, label gold evaluation data, document the manual baseline, and establish quality thresholds before building extraction.
> **Note:** M0 runs before infra (M1). Tasks here use local files/tools only — no Supabase dependency. Gold labels are stored as local JSON files and migrated to Supabase Storage after M1.
>
> **Corpus location:** `MKData/markdown/` — 20,444 files (1.6 GB), 4,888 unique charity registries, years 2019–2025. Filename pattern: `{registry_number}_{year}.txt`. Manifest at `workspace/corpus-manifest.json`.

### Feature 2.1: Corpus Profiling

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F2.1-T1 | Sample and profile 500+ documents: source, type, year, length, format quality, entity density | R0.1 | Profile report produced with distributions | `[x]` |
| F2.1-T2 | Classify corpus into document types: trustee filing, donation report, company filing, annual report, mixed markdown, unsupported | R0.2 | Each sampled document has a type label; distribution documented | `[x]` |
| F2.1-T3 | Document corpus metadata: total count, type breakdown, year range, quality issues, format patterns | R0.1 | Metadata report saved to project docs | `[x]` |

### Feature 2.2: Gold Set Labelling

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F2.2-T1 | Select 50–150 diverse documents covering all entity types: people, organisations, addresses, registration numbers, donations, trustee/director roles, dates, evidence spans, relationships | R0.3 | Gold set covers all document types and entity types | `[x]` |
| F2.2-T2 | Create gold label schema (JSON) for manual annotations | R0.3 | Schema captures entities, relationships, evidence spans, and types | `[x]` |
| F2.2-T3 | Label the gold set with ground-truth entities, relationships, and evidence spans | R0.3 | Labels stored as local JSON files; migrated to Supabase Storage `gold-set` bucket after M1 | `[ ]` |
| F2.2-T4 | Build gold-set comparison tooling: extraction output vs. gold labels → precision/recall/F1 | R0.7 | Tool runs, outputs per-type and aggregate scores | `[x]` |
| F2.2-T5 | Define extraction and ranking quality thresholds (calibrate §7 targets against gold set) | R0.7 | Thresholds documented and approved before extraction build | `[x]` |

### Feature 2.3: ICP & Identity Strategy

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F2.3-T1 | Draft and approve ICP v1 definition | R0.4 | ICP documented as JSON config file; loaded into `icp_configs` table after M1 | `[x]` |
| F2.3-T2 | Define identity resolution features and starting thresholds per §15.3 and §15.5 | R0.5 | Feature weights and band thresholds documented | `[x]` |
| F2.3-T3 | Document current manual workflow: time per lead, sources used, decision criteria | R0.6 | Manual baseline report saved; serves as comparison target | `[ ]` |

### Feature 2.4: Load Test & Graph Engine Decision

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F2.4-T1 | Build thin end-to-end prototype covering extraction → graph build → PPR on 2,500-doc slice | R0.8 | Prototype runs end-to-end; outputs timings | `[~]` |
| F2.4-T2 | Measure: extraction throughput, cost per 1k docs, graph build time, memory footprint, PPR latency, path-template query latency | R0.8 | Load test report produced with all metrics | `[ ]` |
| F2.4-T3 | Make graph engine decision: NetworkX vs. dedicated engine. Default: NetworkX unless PPR >5min/seed at full scale | R0.9 | Decision recorded in decision log | `[ ]` |

---

## Epic 3: Document Classification & LLM Extraction (M1)

> Build Phase 1 of the pipeline: classify documents, extract structured entities/relationships/donations via Claude batch API, store with full provenance.

### Feature 3.1: Document Classification

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F3.1-T1 | Implement document classifier: route each document to one of 6 types (trustee filing, donation report, company filing, annual report, mixed markdown, unsupported) | R1.2 | Classifier runs on corpus; unsupported documents quarantined | `[x]` |
| F3.1-T2 | Store classification results in `documents.document_type` | R1.2, §11.1 | Every ingested document has a type | `[x]` |
| F3.1-T3 | Ingest documents: compute content hash, store raw markdown in Supabase Storage, create `documents` rows | §11.1, R1.9 | Documents deduplicated by content hash; storage URI valid | `[x]` |

### Feature 3.2: Extraction Prompts & Schemas

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F3.2-T1 | Write document-type-specific extraction prompts for all 5 supported types | R1.2, §13 | One prompt per type; each versioned with `prompt_version` | `[x]` |
| F3.2-T2 | Define JSON output schemas for each document type (entity mentions, relationships, donation events, evidence spans) | R1.3 | Schemas enforce required fields; post-call validation works | `[x]` |
| F3.2-T3 | Store prompt versions in extraction run metadata; note: §11.1 DDL has prompt_version, model, temperature but no schema_version column — store schema_version in run-level config or request schema addition | R1.4 | Every extraction records prompt_version, model, temperature, timestamp; schema_version tracked at run level or via approved schema addition | `[x]` |

### Feature 3.3: Claude Batch Extraction Pipeline

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F3.3-T1 | Implement Claude batch API integration (Supabase Edge Function): submit batch, poll for completion, collect results | R1.1 | Batch submitted; results collected; cost tracked | `[x]` |
| F3.3-T2 | Route documents to type-specific prompts; call Claude Sonnet 4 at temperature 0 | R1.1, R1.2 | Each document processed with correct prompt | `[x]` |
| F3.3-T3 | Implement section-aware chunking for documents exceeding context limits | R1.6 | Long documents chunked at section boundaries; cross-chunk mentions reconciled | `[x]` |
| F3.3-T4 | Implement invalid JSON retry (up to 3 attempts, then quarantine with `invalid_json`) | R1.7 | Invalid JSON retried; persistent failures quarantined | `[x]` |
| F3.3-T5 | Parse extraction output into `entity_mentions` and `evidence_spans` rows; store raw relationship and donation extractions as staging JSONL (relationships and donation_events require canonical entities from Phase 2 — final inserts happen in Epic 6) | R1.9, R1.5 | Mentions and evidence stored in Postgres; relationship/donation extractions staged as JSONL; no FK violations | `[x]` |
| F3.3-T6 | Snapshot extraction output to Supabase Storage as JSONL per run | R1.9 | JSONL file exists in storage; matches Postgres records | `[x]` |
| F3.3-T7 | Create `extraction_runs` metadata record per document extraction; columns per §11.1 DDL: extraction_run_id, run_id, document_id, prompt_version, model, temperature, status, invalid_json_retries, started_at, completed_at, error | R1.4 | Every extraction has a run record matching §11.1 schema; status tracked; errors captured as JSONB | `[x]` |

### Feature 3.4: Extraction Quality Validation

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F3.4-T1 | Run extraction on gold set; measure precision/recall/F1 against gold labels | §13 Acceptance | Metrics per entity type and aggregate | `[ ]` |
| F3.4-T2 | Measure invalid JSON rate (target: <2%) | §7.2 | Rate reported; below threshold | `[ ]` |
| F3.4-T3 | Measure evidence span coverage (target: >95%) | §7.2 | Coverage reported; above threshold | `[ ]` |
| F3.4-T4 | Build extraction regression test suite comparing against gold set | §23.1 | Tests run in CI; gate deployment | `[x]` |

---

## Epic 4: Validation, Normalisation & Quarantine (M2)

> Build Phase 1.5: validate all extraction output against schemas, normalise values, quarantine failures, preserve raw data alongside normalised.

### Feature 4.1: Schema Validation

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F4.1-T1 | Validate every extraction record against JSON schema; reject failures to quarantine | R1.5.1 | Invalid records rejected; valid records pass through | `[x]` |
| F4.1-T2 | Quarantine records missing source document or evidence span | R1.5.2 | Missing-evidence records land in `quarantine` table with reason code | `[x]` |
| F4.1-T3 | Validate dates (plausible range), registration numbers (format), amounts (positive) | R1.5.8 | Impossible values quarantined with specific reason codes | `[x]` |
| F4.1-T4 | Quarantine records with low extraction confidence (below threshold) as `low_extraction_confidence`; do not trust extraction confidence as sole quality signal — Phase 1.5 validation refines it | R1.8, §14 | Low-confidence records quarantined; confidence refined by validation checks | `[x]` |

### Feature 4.2: Normalisation

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F4.2-T1 | Normalise UK addresses and postcodes (`libpostal` via Edge Function, fall back to regex postcode extraction) | R1.5.3 | Postcodes extracted and formatted; raw preserved; libpostal attempted first | `[x]` |
| F4.2-T2 | Normalise person names: canonical casing, title removal, alias capture | R1.5.4 | "MR JOHN SMITH" → "John Smith" with alias "Mr John Smith"; raw preserved | `[x]` |
| F4.2-T3 | Normalise Companies House and Charity Commission identifiers (regex format, zero-padding) | R1.5.5 | IDs canonical length; format-invalid IDs quarantined | `[x]` |
| F4.2-T4 | Preserve both `raw_value` and `normalised_value` on every entity mention | R1.5.7 | Both columns populated; raw never overwritten | `[x]` |

### Feature 4.3: Deduplication & Reporting

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F4.3-T1 | Deduplicate exact duplicates (same entity + same evidence span + same document) | R1.5.6 | Exact dupes removed; `duplicate_exact` quarantine entry created | `[x]` |
| F4.3-T2 | Generate validation report per run: accepted count, quarantined count by reason code, normalisation success rates | R1.5.9 | Report queryable by run_id; all quarantine codes populated | `[x]` |

---

## Epic 5: Run Management & Pipeline Orchestration (M1–M2)

> Build the run lifecycle, pipeline job queue, phase execution, retry logic, and idempotency guarantees.

### Feature 5.1: Run Lifecycle

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F5.1-T1 | Implement `POST /api/runs` — create run with ULID, accept `corpus_version`, `scoring_config_version`, `icp_id`, `seed_ids`; status=`created` | §20.1, RM1, RM2 | Run record created; all version fields + icp_id + seed_ids populated | `[x]` |
| F5.1-T2 | Implement `GET /api/runs/:run_id` and `GET /api/runs` (latest 50) | §20.1 | Runs returned with correct status and metadata | `[x]` |
| F5.1-T3 | Implement `POST /api/runs/:run_id/cancel` — set status to `cancelled` | §20.1, §10.2 | Running jobs stopped; status updated | `[x]` |
| F5.1-T4 | Implement `POST /api/runs/:run_id/retry` — retry failed phases, return `{ run_id, retried_phases[] }` | §20.1 | Failed phases retried; already-complete phases skipped | `[x]` |
| F5.1-T5 | Implement run state transitions: `created` → `queued` → `running` → `completed` / `completed_with_warnings` / `failed_retryable` / `failed_final` / `cancelled` / `rolled_back` | §10.2 | State machine enforced; invalid transitions rejected | `[x]` |

### Feature 5.2: Phase Jobs

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F5.2-T1 | Implement `pipeline_jobs` queue: enqueue phase jobs, pick by priority, track attempts | §11.1 | Jobs enqueued and dequeued correctly; priority ordering works | `[x]` |
| F5.2-T2 | Implement `POST /api/runs/:run_id/phases/:phase/start` — enqueue a phase job | §20.2 | Job created with correct run_id, phase, status=`queued` | `[x]` |
| F5.2-T3 | Implement `POST /api/runs/:run_id/phases/:phase/retry` — retry a failed phase | §20.2, §21.1 | Retry increments `attempts`; respects `max_attempts` | `[x]` |
| F5.2-T4 | Implement `GET /api/runs/:run_id/phases/:phase/report` — return phase report | §20.2 | Report includes status, records processed, errors, quarantine count | `[x]` |
| F5.2-T5 | Ensure idempotency: re-running a phase with same `(run_id, phase)` produces no duplicate records | RM6, §21.2 | Second run of same phase is a no-op or safely overwrites | `[x]` |

### Feature 5.3: Rollback

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F5.3-T1 | Implement rollback flow: mark run `rolled_back`, soft-delete artefacts via `deleted_at`, restore previous scoring config; admin or engineering_admin owns rollback threshold decisions per §29; implement pause-before-rollback decision workflow | §21.3, §29 | Rolled-back run's artefacts hidden; human decisions preserved; rollback requires threshold owner approval; pause option available | `[x]` |
| F5.3-T2 | Add `deleted_at` column to artefact tables for soft-delete support | §21.3 | Soft-delete works; queries filter on `deleted_at IS NULL` | `[x]` |

### Feature 5.4: Budget Gate & Cost Tracking

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F5.4-T1 | Implement budget gate per §25.3: before each full-corpus run, estimate expected cost and require approval; cap enrichment cost by tier thresholds; compare cost_per_qualified_candidate against manual baseline | §25.3 | Cost estimate shown; enrichment caps enforced; manual baseline comparison displayed; run blocked without approval | `[x]` |
| F5.4-T2 | Track all cost drivers per run: LLM extraction cost (tokens × pricing), LLM intro-angle generation cost, embedding generation cost, enrichment API costs (Companies House, Charity Commission, SerpAPI/news), Supabase/Vercel recurring | §25.1 | All cost drivers from §25.1 tracked per run; stored in cost tracking table | `[x]` |
| F5.4-T3 | Calculate all 6 unit economics from §25.2: cost_per_surfaced_candidate, cost_per_reviewed_candidate, cost_per_qualified_candidate, cost_per_intro_request, cost_per_successful_intro, cost_per_qualified_opportunity | §25.2 | All 6 unit costs queryable per run; shown in admin dashboard | `[x]` |

### Feature 5.5: Audit Logging & Artefact Integrity

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F5.5-T1 | Wire audit_log writes to all admin actions: pipeline runs, retries, rollbacks, user management, config promotions; explicitly cover product_owner (ICP + scoring config proposals) and engineering_admin (version promotions + rollbacks) actions per §24 | §24 | Every admin action logged with user, action, timestamp, payload; product_owner and engineering_admin actions verified | `[x]` |
| F5.5-T2 | Verify every artefact (mentions, clusters, entities, edges, snapshots, recommendations) references its `run_id` | RM2 | Orphan artefacts detected and blocked | `[x]` |
| F5.5-T3 | Verify runs are repeatable: same corpus + schema + prompt + graph + scoring config → same output | RM3 | Reproducibility tested on sample run | `[x]` |
| F5.5-T4 | Ensure failed phases record error type, message, affected records, retry eligibility | RM4 | Error details queryable; retry eligibility correct | `[x]` |
| F5.5-T5 | Write pipeline recovery tests: each phase failure → retry/rollback behaviour | §23.1 | Tests in CI; each phase covered | `[x]` |

---

## Epic 6: Entity Resolution & Graph Construction (M3)

> Build Phase 2: cluster mentions into canonical entities, apply identity decisions, construct the weighted provenance-preserving graph, export snapshots.

### Feature 6.1: Identity Clustering

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F6.1-T1 | Implement match confidence formula: name similarity (pg_trgm) + embedding similarity (pgvector cosine) + shared org + shared address + role overlap | §15.3 | Match scores computed; formula weights configurable | `[x]` |
| F6.1-T2 | Implement identity decision bands: auto-cluster ≥0.90, provisional 0.75–0.89, possible-dup 0.55–0.74, separate <0.55 | §15.2 | Mentions clustered according to bands | `[x]` |
| F6.1-T3 | Implement auto-merge blockers: incompatible DOB, conflicting registration IDs, prior human split, incompatible roles, common-name-only | §15.4 | Blocked merges do not auto-cluster even at high confidence | `[x]` |
| F6.1-T4 | Generate embeddings for entity mentions and store in `embedding` column | §11.1 | Embeddings generated via OpenAI ada-002; stored in pgvector column | `[x]` |
| F6.1-T5 | Create identity clusters in `identity_clusters` table with cluster_confidence and decision_status; store rationale as structured JSONB in a supplementary log (table has no rationale column per §11.1 DDL) | §11.1, R2.3 | Clusters created; each has cluster_confidence and decision_status; rationale stored in supplementary log | `[x]` |
| F6.1-T6 | Map clusters to canonical entities; preserve canonical entity IDs across re-runs | §11.3, R2.9 | Same person resolves to same canonical_entity_id across runs | `[x]` |

### Feature 6.2: Human Identity Decisions & Entity API

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F6.2-T1 | Implement `GET /api/entities/:canonical_entity_id` — return entity with mentions, clusters, attributes | §20.4 | Entity returned with full detail | `[x]` |
| F6.2-T2 | Implement `POST /api/identity/merge` — store same-person decision; reviewers can suggest, high-impact merges require senior_reviewer/admin approval per §24 | §20.4, §24 | Decision stored in `human_identity_decisions`; high-impact approval enforced; future runs replay it | `[x]` |
| F6.2-T3 | Implement `POST /api/identity/split` — store not-same-person decision; reviewers can suggest, high-impact splits require senior_reviewer/admin approval per §24 | §20.4, §24 | Split decision stored; high-impact approval enforced; future auto-merge blocked for these mentions | `[x]` |
| F6.2-T4 | Implement `GET /api/identity/decisions?entity_id=` — query decisions | §20.4 | Decisions returned for specified entity | `[x]` |
| F6.2-T5 | Implement human-decision replay: during graph build, load all `replay_on_future_runs=true` decisions and enforce them | R2.8, §15.5, RM5 | Replayed decisions override auto-clustering; conflicts logged in quarantine with `identity_conflict` | `[x]` |
| F6.2-T6 | Write human decision replay tests (all decision types) | §23.1 | Tests in CI; 100% of decision types covered | `[x]` |
| F6.2-T7 | Verify all merges and splits are reversible | R2.4 | Reversibility tested; no irreversible hard merges | `[x]` |

### Feature 6.3: Graph Construction

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F6.3-T1 | Build graph from canonical entities and relationships: directed, typed, weighted edges per §15.6; raw mentions stay separate from canonical entities | R2.1, R2.2 | Graph has correct edge types; multiple edge types between same nodes allowed; mentions not collapsed | `[x]` |
| F6.3-T2 | Implement edge weight formula: `relationship_strength × evidence_confidence × freshness_decay × source_reliability`; store freshness on every edge; ensure weights, confidence, and freshness decay applied throughout discovery | §15.7, R2.6, R3.5 | Edge weights computed correctly; heuristics from Appendix A applied; freshness_multiplier populated | `[x]` |
| F6.3-T3 | Model donations as `donation_events` nodes (not edges) with MADE_DONATION and RECEIVED_BY edges | R2.7 | Donation events are nodes; connected by typed edges | `[x]` |
| F6.3-T4 | Quarantine edges missing evidence before insert attempt (evidence_id is NOT NULL in schema — must divert to quarantine_items, not insert-then-fix) | R2.5 | Edges without evidence_id diverted to quarantine before insert; no FK violations | `[x]` |
| F6.3-T5 | Load graph into NetworkX for traversal and PPR computation | §8.1, §8.2 | Graph loads from Postgres views; NetworkX operations work | `[x]` |
| F6.3-T6 | Export graph snapshot to Supabase Storage as Parquet (nodes.parquet, edges.parquet) tagged with run_id | R2.10 | Snapshot files exist; tagged with correct run_id | `[x]` |
| F6.3-T7 | Write identity resolution tests (30+ cases covering merge, split, provisional, blocked, replay) | §23.1 | Tests cover all scenarios; in CI | `[x]` |

---

## Epic 7: Candidate Discovery (M4)

> Build Phase 3: path-template scoring, shared-affiliation scoring, Personalised PageRank, candidate eligibility filtering, seed quality scoring.

### Feature 7.1: Path-Template Scoring

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F7.1-T1 | Define and implement path templates per §16.1 (trustee co-service, donation chain, director-trustee bridge) | R3.2 | Templates run against graph; candidates surfaced | `[x]` |
| F7.1-T2 | Implement path score formula: `template_weight × avg(edge_weight) × length_penalty × evidence_confidence` | §16.2 | Scores computed correctly for various path lengths | `[x]` |
| F7.1-T3 | Implement `candidate_path_score = strongest_path + 0.25 × log(1 + additional_paths)` | §16.2 | Multi-path candidates score higher than single-path | `[x]` |
| F7.1-T4 | Return shortest path and strongest path per candidate | R3.7 | Both paths available per candidate recommendation | `[x]` |

### Feature 7.2: Shared-Affiliation & PPR

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F7.2-T1 | Implement shared-affiliation scoring: shared charity, trust, company, donation target, board network; address weighted lower | R3.3, §16.1 | Affiliation scores computed; address gets lower weight | `[x]` |
| F7.2-T2 | Implement Personalised PageRank using NetworkX: `alpha=0.85`, personalization on seed | R3.4, §16.1 | PPR runs per seed; returns ranked candidate list | `[x]` |
| F7.2-T3 | Support single-seed discovery and multi-seed intersection/union | R3.1 | Both modes work; intersection returns candidates connected to all seeds | `[x]` |

### Feature 7.3: Seeds, Known Contacts & Eligibility

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F7.3-T1 | Implement seeds CRUD API (internal/admin only): create, read, update, deactivate seeds in `seeds` table; restricted to admin role per §24 | §11.1, §24 | Seeds created with canonical_entity_id, added_by, notes; active flag toggleable; admin-only access enforced | `[x]` |
| F7.3-T2 | Implement known_contacts management: add/remove entities from `known_contacts` | §11.1, §16.3 | Known contacts populated; used for filtering | `[x]` |
| F7.3-T3 | Implement candidate eligibility checks: person-like, has path to seed, has qualifying signal, confidence ≥0.40 | §16.3 | Ineligible entities excluded | `[x]` |
| F7.3-T4 | Filter out known contacts, prior leads, rejection log entries for same seed, excluded intermediaries, and generic service entities | R3.6, §16.3 | Known/rejected/excluded/prior-lead/generic-service entities never appear in results | `[x]` |
| F7.3-T5 | Write rejected candidates to `rejection_log` when reviewer rejects | §11.1, R3.6 | Rejection log populated; same-seed rejections suppressed in future runs | `[x]` |
| F7.3-T6 | Implement seed quality score per §16.4: ≥0.70 normal, 0.40–0.69 show warning, <0.40 cap at top 25 + require higher confidence + block Tier 2/3 enrichment unless manually approved | §16.4 | Seeds scored per band; weak seeds capped at 25, higher confidence required, Tier 2/3 blocked without approval; mid-range seeds show warning | `[x]` |
| F7.3-T7 | Generate reason codes per candidate | R3.8 | Every candidate has at least one reason code | `[x]` |
| F7.3-T8 | Support top-50 default queue and top-200 analytics export | R3.10 | Both limits work; default is 50 | `[x]` |

### Feature 7.4: Discovery API & Validation

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F7.4-T1 | Implement `POST /api/discovery/query` — run discovery for given seeds | §20.5 | Returns candidate recommendations with paths and reason codes | `[x]` |
| F7.4-T2 | Implement `GET /api/runs/:run_id/candidates?seed_id=&status=&limit=` and `GET /api/candidates/:candidate_recommendation_id` | §20.5 | Filtered candidate list returned; single candidate detail returned | `[x]` |
| F7.4-T3 | Store candidate recommendations in `candidate_recommendations` table | §11.1 | Records stored with all required fields | `[x]` |
| F7.4-T4 | Run discovery against 5–10 validation seeds; compare against human baseline | R3.9 | Comparison report produced; results reviewed | `[ ]` |
| F7.4-T5 | Write path scoring tests (20+ paths) | §23.1 | Tests in CI; scoring math verified | `[x]` |

---

## Epic 8: Tiered Enrichment (M5)

> Build Phase 4: Tier 1 (Companies House, Charity Commission), Tier 2 (Wikidata, news), Tier 3 (manual), with caching, retry, and ambiguous-match handling.

### Feature 8.1: Enrichment Framework

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F8.1-T1 | Define pluggable enrichment module interface: candidate entity in → structured signal payload out | R4.1 | Interface defined; modules implement it | `[x]` |
| F8.1-T2 | Implement enrichment lifecycle states: `not_started` through `manual_required` | §17.2 | State transitions work correctly | `[x]` |
| F8.1-T3 | Implement enrichment cache with source-specific TTL (CH: 30d, CC: 30d, Wikidata: 90d, news: 7d) | R4.8 | Cache hits skip API call; stale cache refreshed | `[x]` |
| F8.1-T4 | Implement retry with exponential backoff (1s, 4s, 16s, then `failed_retryable`) | R4.9 | Rate limits handled; failures logged | `[x]` |

### Feature 8.2: Tier 1 — Companies House & Charity Commission

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F8.2-T1 | Implement Companies House API enrichment module: officer search, company lookup | R4.2, §17.1 | Module returns structured signals; match confidence with feature breakdown computed | `[x]` |
| F8.2-T2 | Implement Charity Commission API enrichment module: charity search, trustee lookup | R4.2, §17.1 | Module returns structured signals; match confidence with feature breakdown computed | `[x]` |
| F8.2-T3 | Ensure every external record includes match confidence with feature breakdown (name match, ID match, role match) | R4.5 | Feature breakdown stored in signal_payload; reviewable in dossier | `[x]` |
| F8.2-T4 | Run Tier 1 on all candidates above eligibility threshold | R4.2 | All eligible candidates enriched | `[x]` |

### Feature 8.3: Tier 2 — Wikidata & News

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F8.3-T1 | Implement Wikidata enrichment module: entity search, property extraction | §17.1 | Module returns structured signals with match confidence | `[x]` |
| F8.3-T2 | Implement Wikipedia enrichment module: article lookup, summary extraction | §17.1 | Wikipedia results returned with structured summary and match confidence | `[x]` |
| F8.3-T3 | Implement news enrichment module (SerpAPI or equivalent): recent mentions | §17.1 | News results returned with freshness metadata | `[x]` |
| F8.3-T4 | Gate Tier 2 on Priority >0.50; note: Priority scoring (F9.1) must be built before this gate can run end-to-end — wire as dependency | R4.3 | Below-threshold candidates skip Tier 2; dependency on F9.1 documented | `[x]` |

### Feature 8.4: Tier 3 & Ambiguous Handling

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F8.4-T1 | Implement Tier 3 manual-research trigger: reviewer marks candidate for deep research; notes field available | R4.4, §17.1 | "Mark for deep research" action creates manual_required status | `[x]` |
| F8.4-T2 | Handle ambiguous matches (0.55–0.74): store but do not accept for scoring | R4.6 | Ambiguous signals stored with `accepted_for_scoring=false` | `[x]` |
| F8.4-T3 | Handle conflicting signals: store conflict, surface warning in dossier | R4.7 | Conflicts visible in dossier enrichment section | `[x]` |

### Feature 8.5: Enrichment API

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F8.5-T1 | Implement `POST /api/candidates/:id/enrich` — trigger enrichment for a candidate | §20.6 | Enrichment job enqueued; signals stored on completion | `[x]` |
| F8.5-T2 | Implement `GET /api/candidates/:id/enrichment` — return enrichment signals | §20.6 | All signals for candidate returned with match confidence | `[x]` |
| F8.5-T3 | Implement `POST /api/enrichment/refresh` — refresh stale caches | §20.6 | Stale signals re-fetched; TTL reset | `[x]` |
| F8.5-T4 | Write enrichment matching tests: ambiguous matches not scored; all sources covered | §23.1 | Tests in CI; all source types tested | `[x]` |

---

## Epic 9: Ranking, Dossier & Human Review (M6)

> Build Phase 5: two-score ranking, presentation dedup, candidate dossier, review queue, intro-angle generation, spreadsheet export, decision capture.

### Feature 9.1: Two-Score Ranking

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F9.1-T1 | Implement capacity signal calculator: aggregate donation history, foundation/trust involvement, senior roles, directorships, board memberships, philanthropic affiliations, leadership roles, institutional connections | §18.3 | Capacity signal is observable-only; never presented as net worth or giving capacity | `[x]` |
| F9.1-T2 | Implement candidate priority score: introability 30%, affinity 25%, capacity signal 20%, influence 15%, strategic fit 10% | §18.1 | Priority score computed per candidate with breakdown | `[x]` |
| F9.1-T3 | Implement evidence confidence score: identity 35%, relationship 30%, source corroboration 20%, freshness 15% | §18.2 | Confidence score computed per candidate with breakdown | `[x]` |
| F9.1-T4 | Store both scores on `candidate_recommendations` | §11.1 | Both `priority_score` and `confidence_score` populated | `[x]` |

### Feature 9.2: Presentation Deduplication

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F9.2-T1 | Implement presentation-layer dedup: candidates above merge threshold (0.75) collapsed into one row; note: PRD §27 M4 includes this — consider moving to M4 or accepting M6 dependency | §18.4, R5.6 | Collapsed row uses highest score; aggregates evidence; runs before producing review queue | `[x]` |
| F9.2-T2 | Allow reviewer to split or confirm presentation-row groupings; feed to `human_identity_decisions` | §18.4 | Split/confirm actions work; decisions stored | `[x]` |

### Feature 9.3: Candidate Dossier

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F9.3-T1 | Implement `GET /api/candidates/:id/dossier` — return full dossier data | §20.5, R5.7 | Dossier includes all sections from §18.7; one dossier per candidate | `[x]` |
| F9.3-T2 | Build dossier UI page: summary, paths, evidence table, roles, enrichment signals, identity notes, decision panel | §18.7 | All sections render; evidence links resolve | `[x]` |
| F9.3-T3 | Show score breakdowns (priority and confidence) with expandable detail | R5.1, R5.2 | Scores shown separately with component breakdown | `[x]` |
| F9.3-T4 | Show recommended introducer and strongest path | R5.3, R5.4 | Introducer name and path visible on dossier | `[x]` |
| F9.3-T5 | Write dossier rendering tests (all sections) | §23.1 | Tests in CI; all dossier sections verified | `[x]` |

### Feature 9.4: Introduction Angle Generation

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F9.4-T1 | Generate deterministic skeleton from strongest evidence-backed path | §18.8 step 1–2 | Skeleton uses only path facts; no hallucinated content | `[x]` |
| F9.4-T2 | Optionally rephrase skeleton with Claude; validate every entity/date/role/org in output appears in input facts | §18.8 step 3–4 | LLM output fact-checked; failed validation falls back to skeleton | `[x]` |
| F9.4-T3 | Show both versions (skeleton + natural) to reviewer | §18.8 step 6, R5.5 | Both versions visible on dossier | `[x]` |

### Feature 9.5: Review Queue

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F9.5-T1 | Build review queue UI: sortable/filterable table with all fields from §18.6 | §18.6 | Queue loads; filters by seed, score, confidence, status work | `[x]` |
| F9.5-T2 | Implement reviewer workflow state transitions for all 11 states: Discovered → Enriched → Ready for Review → In Review → Qualified → Intro Requested → Intro Made → Meeting → Opportunity → Converted / Rejected; enforce valid transition rules | §18.9 | All 11 states implemented; valid transitions enforced; invalid transitions rejected with error | `[x]` |
| F9.5-T3 | Implement decision capture: `POST /api/candidates/:id/decision` with structured labels from §18.10 (Qualified, Rejected — wrong person, Rejected — weak connection, Rejected — bad fit, Rejected — already known, Needs more research); require structured reason code on all rejections per §6.1; cold-start flag applied before 100 decisions across 10 seeds | §20.7, R5.9, R5.12, §18.10, §6.1 | Decisions stored in `human_decisions`; rejection requires structured reason code; cold-start flag applied before threshold; decisions persist across re-runs | `[x]` |
| F9.5-T4 | Implement identity decision capture from wrong-person rejection or duplicate confirmation | R5.10, §6.2, §6.3 | Wrong-person creates both candidate decision and identity decision | `[x]` |
| F9.5-T5 | Implement intro outcome tracking: `POST /api/candidates/:id/intro-status` | §20.7, R5.11 | Intro outcomes stored in `intro_outcomes` with all fields | `[x]` |

### Feature 9.6: Spreadsheet Export

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F9.6-T1 | Implement `GET /api/exports/spreadsheet?run_id=` — generate CSV with all columns from §18.11 | §20.7, R5.8 | CSV includes all 20 columns; dossier links resolve | `[x]` |
| F9.6-T2 | Ensure no duplicate rows: natural key is `(run_id, candidate_recommendation_id)` | §18.12 | Re-export produces identical row set | `[x]` |
| F9.6-T3 | Implement CSV decision import: `POST /api/decisions/import` accepting `candidate_recommendation_id`, `decision`, `reason_code`, `notes` | §20.7, §18.12 | Imported decisions validated and stored; invalid rows rejected with reasons | `[x]` |
| F9.6-T4 | Write export integrity tests: IDs, links, completeness | §23.1 | Tests in CI; full export verified | `[x]` |

---

## Epic 10: Outcome Tracking & Calibration (M6–M7)

> Build Phase 6: structured decision logging, intro funnel tracking, cold-start gate enforcement, calibration report generation.

### Feature 10.1: Decision & Outcome Logging

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F10.1-T1 | Verify decision logging completeness (F9.5-T3 handles write path): ensure all §18.10 labels used; validate reason code distribution; add calibration-specific views for R6.1 | R6.1 | All decisions queryable for calibration; reason codes match §18.10 | `[x]` |
| F10.1-T2 | Verify intro funnel logging completeness (F9.5-T5 handles write path): ensure full funnel tracked intro request → intro outcome → meeting → conversion; add calibration-specific views for R6.2 | R6.2 | Funnel stages queryable for calibration; linked to candidate, seed, run | `[x]` |
| F10.1-T3 | Flag cold-start decisions (`cold_start_decision=true`) before 100 decisions across 10 seeds | §18.5, R6.3 | Flag set correctly; threshold enforcement works | `[x]` |

### Feature 10.2: Calibration

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F10.2-T1 | Enforce cold-start gate: no weight updates until threshold met (100 decisions, 10 seeds) | R6.3, §19.1 | System blocks calibration below threshold | `[x]` |
| F10.2-T2 | Generate calibration report: rejection reason distribution, score band vs. qualification rate, false positive causes | R6.4, §19.2 | Report produced when threshold met | `[x]` |
| F10.2-T3 | Implement scoring config versioning: `POST` new config to `scoring_configs` with rationale; require human approval; promotion gate checks validation seed ranking quality, false positive rate, top candidate explainability per §23.3 | R6.5, §23.3 | Config versioned; old configs preserved; approval required; promotion gate enforces all 4 criteria from §23.3 | `[x]` |

### Feature 10.3: Quality Monitoring

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F10.3-T1 | Monitor extraction quality drift across runs | R6.6 | Metrics tracked per run; drift visible | `[x]` |
| F10.3-T2 | Monitor identity resolution failure rates across runs | R6.7 | False match rate tracked per run | `[x]` |
| F10.3-T3 | Surface failure modes by reason code | R6.8 | Reason code breakdown available per run | `[x]` |

---

## Epic 11: Observability & Admin Dashboards (M7)

> Build the operational dashboards, metrics, and SLO monitoring as Next.js admin routes.

### Feature 11.1: Pipeline Dashboard

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F11.1-T1 | Build `/admin/runs` dashboard: list runs, status, phase progress, errors | §22.1 | Runs listed with live status; errors expandable | `[x]` |
| F11.1-T2 | Implement quarantine API routes: `GET /api/quarantine?run_id=&reason=` and `POST /api/quarantine/:id/resolve`; build `/admin/quarantine` view with filter and resolve action | §20.3, §22.1 | API routes work; quarantine records shown; resolvable | `[x]` |
| F11.1-T3 | Build `/admin/costs` view: LLM cost, API cost, cost per qualified candidate | §22.2 | Cost metrics displayed per run | `[x]` |

### Feature 11.2: Quality Dashboards

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F11.2-T1 | Extraction quality dashboard: docs processed, invalid JSON rate, evidence coverage | §22.2 | Metrics per run; trends visible | `[x]` |
| F11.2-T2 | Identity resolution dashboard: cluster count, merge/split count, false match reasons | §22.2 | Metrics per run; identity health visible | `[x]` |
| F11.2-T3 | Graph health dashboard: node count, edge count, build time, memory usage | §22.2 | Metrics per snapshot; trends visible | `[x]` |

### Feature 11.3: Enrichment Dashboard

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F11.3-T1 | Enrichment dashboard: success rate by source, ambiguous match rate, API failure rate, cache hit rate | §22.2 | Enrichment health visible per run and per source | `[x]` |

### Feature 11.4: Review & Outcome Dashboards

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F11.4-T1 | Reviewer workflow dashboard: time to decision, decision distribution, rejection reasons | §22.2 | Review metrics visible; filterable by reviewer, seed, time | `[x]` |
| F11.4-T2 | Outcome funnel dashboard: intro request rate → intro success → meeting → conversion | §22.2 | Funnel visualised; rates computed | `[x]` |
| F11.4-T3 | Discovery dashboard: candidates per seed, path diversity, weak seed count | §22.2 | Discovery quality metrics per run | `[x]` |

### Feature 11.5: Rollback Criteria Monitoring

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F11.5-T1 | Monitor rollback trigger conditions per §29: hallucination rate, false identity match rate, reviewer rejection spike, graph reproducibility, export integrity, enrichment reliability, cost overrun, human decision replay fidelity, evidence span availability; each threshold has a defined owner; dashboard shows pause/rollback recommendation | §29 | Alerts or dashboard flags when any criterion breaches threshold; threshold owners assigned; pause/rollback workflow integrated | `[x]` |

---

## Epic 12: Full-Corpus Dry Run & QA (M7)

> Run the complete pipeline on the full 25k corpus, verify all acceptance criteria, fix issues, and confirm production readiness.

### Feature 12.1: Full-Corpus Run

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F12.1-T1 | Run full pipeline on 25k documents: classify → extract → validate → graph → discover → enrich → rank | §27 M7 | Pipeline completes (or completes with warnings); all phases have reports | `[ ]` |
| F12.1-T2 | Verify all SLOs from §22.3: discovery <5min/seed, dossier <3s, export <10min, evidence links 99%+, run completion 95%+, decision save 99.5%+ | §22.3 | All SLOs met or documented with remediation plan | `[ ]` |
| F12.1-T3 | Verify run stability: score variance <5% across identical re-runs, identity cluster stability 95%+, top-50 path reproducibility 90%+ | §7.4 | Stability metrics measured and within targets | `[ ]` |

### Feature 12.2: QA Gate

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F12.2-T1 | All CI-gated test suites pass: schema, extraction regression, golden docs, identity, human decision replay, path scoring, dossier, enrichment, export, pipeline recovery | §23.1 | Green CI across all suites | `[ ]` |
| F12.2-T2 | Prompt promotion gate verified per §23.2: precision stable on gold set, hallucination rate stable, evidence span coverage above threshold, invalid JSON rate below threshold, sample candidate rankings reviewed | §23.2 | Gate blocks prompt versions that degrade on any of the 5 criteria | `[x]` |
| F12.2-T3 | Scoring config promotion gate verified per §23.3: validation seed ranking quality improves or stable, false positive rate no material increase, top candidates remain explainable, config version and rationale recorded | §23.3 | Gate blocks configs that degrade on any of the 4 criteria | `[x]` |
| F12.2-T4 | Verify Appendix B build-ready checklist: all items checked before production promotion | Appendix B | All checklist items verified and documented | `[ ]` |

---

## Epic 13: Pilot & Cold-Start Monitoring (M8)

> Run the human pilot with 5–10 seeds, collect reviewer decisions, monitor cold-start, validate the end-to-end workflow.

### Feature 13.1: Pilot Execution

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F13.1-T1 | Select and onboard 5–10 pilot seeds | §28.2, §31 item 1 | Seeds in `seeds` table; active | `[ ]` |
| F13.1-T2 | Run discovery + enrichment (Tier 1 only) + ranking for pilot seeds on a 500–2,500 doc slice per §28.2; no automatic weight learning | §28.2 | Candidates surfaced from doc slice; Tier 1 enrichment only; dossiers and spreadsheet export available; no weight updates | `[ ]` |
| F13.1-T3 | Reviewers use queue and dossier; make decisions; request intros | §6.1–6.4 | Decisions logged; intros tracked | `[ ]` |
| F13.1-T4 | Monitor cold-start decision accumulation toward 100-decision threshold | §19.1 | Decision count visible; cold-start flag correctly applied | `[ ]` |

### Feature 13.2: Pilot Review

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F13.2-T1 | Measure lead quality metrics against §7.1 targets | §7.1 | Metrics reported; gaps identified | `[ ]` |
| F13.2-T2 | Compare against manual baseline from Phase 0 | §7.5 | Platform outperforms manual on qualified/hour, diversity, time-to-intro | `[ ]` |
| F13.2-T3 | Collect reviewer feedback on trust, usability, and explanation quality | §28.2 exit criteria | Feedback documented; critical issues addressed | `[ ]` |
| F13.2-T4 | Decision: proceed to limited production or iterate | §28.3 | Go/no-go recorded | `[ ]` |

---

## Epic 14: Wealth Intelligence, Prospect Augmentation & Dossier Storage (M9)

> Mine and estimate individual net worth, run augmentation on leads, validate seed-to-HNW linkage, store personal dossiers as a graph, and assess introduction targets for donation potential based on giving history.

### Feature 14.1: Net Worth & Transaction Value Estimation

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F14.1-T1 | Build net worth estimation engine: aggregate Companies House directorships, property records, Rich List mentions, foundation assets, known transaction values into a wealth band (not a point estimate) | §18.3 | Each individual assigned a wealth band (e.g. £1M–5M, £5M–25M, £25M–100M, £100M+) with evidence sources listed | `[ ]` |
| F14.1-T2 | Mine transaction values from Charity Commission filings: extract donation amounts, grant values, trustee-related financial flows from corpus | §11.1 | Transaction values extracted and stored in `donation_events` with amount, currency, year, and evidence_id | `[ ]` |
| F14.1-T3 | Calculate overall net worth potential per individual: combine wealth band, transaction history, foundation involvement, and institutional affiliations into a composite score | §18.1 | Net worth potential score stored on `enrichment_signals`; breakdown visible in dossier | `[ ]` |
| F14.1-T4 | Implement web mining fallback for thin-data individuals: targeted web_search queries for Companies House filings, charity trusteeships, news mentions, Rich List appearances | — | Thin-data individuals (< 5 signals) automatically trigger web mining; results stored as enrichment signals | `[ ]` |

### Feature 14.2: Lead Augmentation & Prospect Database

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F14.2-T1 | Run full augmentation pipeline (research + network mapping) on all discovered leads using v10 prompts | Plan §Sprint 2–3 | Each lead has a completed `seed_augmentation_runs` record for both research and network_mapping phases | `[ ]` |
| F14.2-T2 | Store augmented lead profiles in prospect database: enrichment signals, network connections, wealth indicators, giving history | §11.1 | Prospect data queryable via API; linked to `canonical_entities` and `enrichment_signals` | `[ ]` |
| F14.2-T3 | Build prospect search and filter API: search by name, wealth band, affinity signals, connection depth | §20 | `GET /api/prospects?wealth_band=&affinity=&min_connections=` returns filtered results | `[ ]` |

### Feature 14.3: Seed-to-HNW Validation via HNW Table

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F14.3-T1 | Cross-reference seeds against HNW target spreadsheet: match by name + affiliation to validate which seeds have known HNW connections | Plan §Fix #8 | Each seed-to-HNW link has a match confidence score and source attribution (spreadsheet row, corpus filing, or augmentation) | `[ ]` |
| F14.3-T2 | Pinpoint lead source for each HNW match: trace whether the connection was declared in spreadsheet, discovered via network mapping, or found in corpus cross-reference | Plan §Phase ordering | Each HNW match has a `route_type` (spreadsheet_declared, network_inferred, corpus_discovered) and the originating seed identified | `[ ]` |
| F14.3-T3 | Build HNW validation dashboard: show seed → HNW linkages with confidence, source, and introduction route | — | Dashboard shows all validated seed-to-HNW connections; filterable by confidence and route type | `[ ]` |

### Feature 14.4: Personal Dossier Graph Storage

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F14.4-T1 | Design dossier graph schema: each individual's dossier stored as a sub-graph with nodes for roles, affiliations, donations, connections, and wealth indicators | §18.7 | Schema documented; dossier nodes and edges defined with types | `[ ]` |
| F14.4-T2 | Implement dossier graph storage in database: create `app.dossier_nodes` and `app.dossier_edges` tables linked to `canonical_entity_id` | §11.1 | Dossier graph persisted per individual; queryable by entity | `[ ]` |
| F14.4-T3 | Build dossier graph API: `GET /api/entities/:id/dossier-graph` returns the full sub-graph for rendering | §20 | API returns nodes and edges in a format suitable for graph visualisation (e.g. D3/Cytoscape) | `[ ]` |
| F14.4-T4 | Integrate dossier graph into existing dossier UI page: render interactive sub-graph alongside the tabular dossier | §18.7 | Dossier page shows both table view and graph view; user can toggle between them | `[ ]` |

### Feature 14.5: Donation Potential Assessment for Introduction Targets

| ID | Task | PRD Ref | Acceptance | Status |
|---|---|---|---|---|
| F14.5-T1 | Analyse introduction targets' previous donation history: aggregate all known donations from `donation_events`, enrichment signals, and augmentation results | §18.1, §18.3 | Each introduction target has a donation history summary with total given, recipient categories, and frequency | `[ ]` |
| F14.5-T2 | Map institutional giving patterns: identify which charities, foundations, and causes each target donates to; flag alignment with BFF's mission (youth, sport, community) | §18.1 | Institutional giving profile stored; affinity score reflects cause alignment | `[ ]` |
| F14.5-T3 | Calculate donation potential score: combine giving history, wealth band, cause alignment, and peer giving patterns into a composite donation likelihood score | §18.1 | Donation potential score stored on `candidate_recommendations`; breakdown visible in dossier | `[ ]` |
| F14.5-T4 | Surface donation potential in review queue: add donation history column and donation potential score to the review table | §18.6 | Reviewers can sort/filter by donation potential; giving history visible without opening full dossier | `[ ]` |

---

## Summary

| Epic | Feature Count | Task Count | Milestone |
|---|---:|---:|---|
| 1. Foundation | 5 | 20 | M1 |
| 2. Corpus Audit & Gold Set | 4 | 14 | M0 |
| 3. Document Classification & LLM Extraction | 4 | 17 | M1 |
| 4. Validation, Normalisation & Quarantine | 3 | 10 | M2 |
| 5. Run Management & Pipeline Orchestration | 5 | 20 | M1–M2 |
| 6. Entity Resolution & Graph Construction | 3 | 20 | M3 |
| 7. Candidate Discovery | 4 | 20 | M4 |
| 8. Tiered Enrichment | 5 | 19 | M5 |
| 9. Ranking, Dossier & Human Review | 6 | 23 | M6 |
| 10. Outcome Tracking & Calibration | 3 | 9 | M6–M7 |
| 11. Observability & Admin Dashboards | 5 | 11 | M7 |
| 12. Full-Corpus Dry Run & QA | 2 | 7 | M7 |
| 13. Pilot & Cold-Start Monitoring | 2 | 8 | M8 |
| 14. Wealth Intelligence, Prospect Augmentation & Dossier Storage | 5 | 18 | M9 |
| **Totals** | **56** | **216** | |
