# Architecture: Strategy 3 — Open-Source Agentic Pipeline

**Version:** 1.0 | **Date:** 2026-05-05

---

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  INGESTION LAYER                                                             │
│                                                                              │
│  DonorIngestionCLI                                                           │
│  ├── Accepts CSV or JSON input                                               │
│  ├── Validates consent_metadata schema                                       │
│  ├── Assigns tracking_id (UUID v4)                                           │
│  └── Writes immutable donor record to SQLite (v1) / Postgres (v2)           │
│                                                                              │
│  AuditLogger  (spans all layers)                                             │
│  ├── Structured JSON logging to append-only audit table                     │
│  ├── Records: API calls, entity resolution decisions, human review events   │
│  └── Operator_id + timestamp on every write                                 │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  ENTITY RESOLUTION LAYER                                                    │
│                                                                              │
│  EntityResolutionAgent  (Claude Haiku — claude-haiku-4-5-20251001)          │
│  ├── Input: {name, email, postcode, dob_approx}                             │
│  ├── Queries CH officer_search by name; filters by postcode proximity       │
│  ├── Queries CC trustee search by name                                      │
│  ├── Scores candidate matches; assigns canonical_id + confidence (0–1.0)   │
│  ├── confidence < 0.85 → writes to human_review_queue with reason          │
│  └── Output: EntityResolutionResult (see Data Contracts §1)                │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ canonical_id
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DATA ACQUISITION LAYER  (parallel fan-out via RQ job queue)                │
│                                                                              │
│  TrusteeGraphAgent                                                           │
│  ├── Source: signal.charity_commission_ew.trustee_data                      │
│  ├── Calls GetTrusteeAndRelatedCharities for canonical_id                   │
│  ├── Builds co-trustee adjacency list: {charity_id, co_trustee_names[]}    │
│  ├── Rate limit: undocumented beta — use 1 req/s with exponential backoff  │
│  ├── Fallback: bulk download ZIP if API returns 5xx                         │
│  └── Output: TrusteeGraphResult (see Data Contracts §2)                    │
│                                                                              │
│  CompaniesHouseAgent                                                         │
│  ├── Sources: signal.companies_house.officer_appointments                   │
│  │            signal.companies_house.persons_with_significant_control       │
│  ├── Calls /officers/{officer_id}/appointments (full history)               │
│  ├── Calls /company/{company_number}/persons-with-significant-control       │
│  ├── Rate limit: 600 req / 5-min window (~2 req/s) [verified — CH API docs]│
│  │   MANDATORY: exponential backoff with jitter; never exceed 100 req/min  │
│  └── Output: CompaniesHouseResult (see Data Contracts §3)                  │
│                                                                              │
│  GrantNavAgent                                                               │
│  ├── Source: signal.threesixtygiving.grantnav                               │
│  ├── Downloads full GrantNav CSV (bulk; no per-query API)                   │
│  ├── Queries by recipient charity number and name                           │
│  └── Output: GrantNavResult (see Data Contracts §4)                        │
│                                                                              │
│  PropertyAgent                                                               │
│  ├── Source: signal.hmlr.overseas_companies_property                        │
│  ├── Downloads monthly OCOD full CSV                                        │
│  ├── Queries by proprietor_name (company name) from entity resolution      │
│  └── Output: PropertyResult (see Data Contracts §5)                        │
│                                                                              │
│  SanctionsAgent                                                              │
│  ├── Source: signal.ofsi.uk_sanctions_list                                  │
│  ├── Downloads UK Sanctions List CSV (updated multiple times/week)         │
│  ├── Fuzzy name match with threshold ≥ 0.90 required for positive flag     │
│  └── Output: SanctionsResult (see Data Contracts §6)                       │
│                                                                              │
│  WebSearchAgent                                                              │
│  ├── Source: Serper.dev API (or equivalent; ~5,000 queries/month at £39)   │
│  ├── Targeted queries: "{name} advisory board", "{name} trustee chair",    │
│  │   "{name} philanthropy", "{name} OBE CBE"                               │
│  ├── Extracts: advisory board roles, event co-attendance, honours, media   │
│  ├── Source URL required for every extracted claim                          │
│  └── Output: WebSearchResult (see Data Contracts §7)                       │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ raw signals (all agents write to shared DB)
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  SCORING + SYNTHESIS LAYER                                                  │
│                                                                              │
│  WealthScoringAgent  (Claude Sonnet — claude-sonnet-4-6)                    │
│  ├── Input: CompaniesHouseResult + PropertyResult + WebSearchResult         │
│  ├── PSC-tier deterministic: PSC filing with >25% stake → confirmed_value  │
│  ├── Probabilistic: property proxies, role seniority, grant scale →        │
│  │   wealth_tier: confirmed_5m | probable_5m | insufficient_signal         │
│  ├── System prompt + scoring rubric: CACHED (prompt cache, 5-min TTL)      │
│  └── Every figure labelled: confirmed (PSC/HMLR source) or estimated       │
│                                                                              │
│  SynthesisAgent — Job A  (Claude Sonnet — claude-sonnet-4-6)               │
│  ├── Input: all raw signals + WealthScoringResult                           │
│  ├── Produces: structured donor enrichment dossier                          │
│  ├── System prompt + dossier schema: CACHED (prompt cache, 5-min TTL)      │
│  ├── Batch API: 50% discount; 24h latency acceptable for Job A             │
│  └── Hallucination guard: every claim must cite source_url; nil = absent   │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ shortlist (wealth_tier ≠ insufficient_signal)
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  HUMAN REVIEW QUEUE  (Checkpoint 1)                                         │
│                                                                              │
│  HumanReviewQueue                                                            │
│  ├── Outputs: reviews/short_YYYYMMDD_DONORNAME.md per candidate             │
│  ├── Fundraiser confirms which candidates proceed to Job C                  │
│  └── Decision recorded in audit log with operator_id + timestamp           │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ approved leads
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  JOB C SYNTHESIS  (Batch API — 24h latency)                                 │
│                                                                              │
│  SynthesisAgent — Job C  (Claude Opus — claude-opus-4-7)                    │
│  ├── Input: full signal set + Job A dossier + human review notes            │
│  ├── Produces: full lead dossier (connections, capacity, interests, risks)  │
│  ├── System prompt + rubric: CACHED (1-hour TTL for Job C batch)            │
│  ├── Donor profile context: CACHED within a single Job C batch run         │
│  ├── Batch API: 50% discount on Opus pricing                                │
│  └── £5M+ confirmed vs. £5M+ probable always explicitly labelled           │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  HUMAN REVIEW QUEUE  (Checkpoint 2 — Final sign-off)                        │
│  └── Fundraiser approves dossier for outreach; recorded in audit log        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Contracts

All contracts are JSON-schema style. `?` suffix = optional field.

### Contract 1: EntityResolutionResult

```json
{
  "tracking_id": "string (UUID v4)",
  "canonical_id": "string (UUID v4)",
  "input_name": "string",
  "matched_ch_officer_id": "string?",
  "matched_cc_trustee_id": "string?",
  "confidence": "number (0.0–1.0)",
  "confidence_basis": "string (e.g. 'name+postcode exact', 'name only')",
  "resolution_status": "enum: resolved | ambiguous | no_match",
  "requires_human_review": "boolean",
  "resolved_at": "string (ISO 8601)"
}
```

### Contract 2: TrusteeGraphResult

```json
{
  "canonical_id": "string",
  "subject_name": "string",
  "trustee_roles": [
    {
      "charity_number": "string",
      "charity_name": "string",
      "role": "string",
      "appointed": "string (ISO 8601 date)?",
      "resigned": "string (ISO 8601 date)?",
      "status": "enum: current | former"
    }
  ],
  "co_trustees": [
    {
      "co_trustee_name": "string",
      "shared_charities": ["string (charity_number)"],
      "connection_strength": "number (0.0–1.0)"
    }
  ],
  "source": "enum: cc_api | cc_bulk_download",
  "retrieved_at": "string (ISO 8601)"
}
```

### Contract 3: CompaniesHouseResult

```json
{
  "canonical_id": "string",
  "officer_id": "string?",
  "appointments": [
    {
      "company_number": "string",
      "company_name": "string",
      "company_type": "string",
      "role": "string",
      "appointed": "string (ISO 8601 date)?",
      "resigned": "string (ISO 8601 date)?",
      "status": "enum: active | resigned"
    }
  ],
  "psc_records": [
    {
      "company_number": "string",
      "company_name": "string",
      "nature_of_control": ["string"],
      "notified_on": "string (ISO 8601 date)?",
      "ceased_on": "string (ISO 8601 date)?",
      "status": "enum: active | ceased"
    }
  ],
  "retrieved_at": "string (ISO 8601)"
}
```

### Contract 4: GrantNavResult

```json
{
  "canonical_id": "string",
  "grants_received": [
    {
      "funder_name": "string",
      "recipient_name": "string",
      "recipient_charity_number": "string?",
      "amount_gbp": "number",
      "award_date": "string (ISO 8601 date)",
      "description": "string?",
      "source_url": "string (GrantNav permalink)"
    }
  ],
  "total_grants_gbp": "number",
  "grant_count": "integer",
  "retrieved_at": "string (ISO 8601)"
}
```

### Contract 5: PropertyResult

```json
{
  "canonical_id": "string",
  "overseas_property_titles": [
    {
      "title_number": "string",
      "tenure": "enum: freehold | leasehold",
      "proprietor_name": "string",
      "country_of_incorporation": "string",
      "correspondence_address": "string?",
      "date_registered": "string (ISO 8601 date)?",
      "roe_number": "string?"
    }
  ],
  "source": "signal.hmlr.overseas_companies_property",
  "retrieved_at": "string (ISO 8601)"
}
```

### Contract 6: SanctionsResult

```json
{
  "canonical_id": "string",
  "sanctions_match": "boolean",
  "match_confidence": "number (0.0–1.0)?",
  "matched_entries": [
    {
      "unique_id": "string",
      "full_name": "string",
      "aliases": ["string"],
      "regime": "string",
      "designation_type": "string",
      "source_url": "string"
    }
  ],
  "pep_flag": "boolean",
  "pep_basis": "string?",
  "checked_at": "string (ISO 8601)"
}
```

### Contract 7: WebSearchResult

```json
{
  "canonical_id": "string",
  "extracted_signals": [
    {
      "signal_type": "enum: advisory_board | event_attendance | honour | adverse_media | philanthropy | other",
      "description": "string",
      "source_url": "string",
      "source_date": "string (ISO 8601 date)?",
      "confidence": "enum: high | medium | low"
    }
  ],
  "queries_run": ["string"],
  "retrieved_at": "string (ISO 8601)"
}
```

---

## Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Python 3.12 | Async support; mature ecosystem for HTTP clients and data parsing |
| Database (v1) | SQLite | Zero-config; full DSAR deletion runnable from single script |
| Database (v2) | Postgres | Multi-user, concurrent writes; migration via Alembic |
| Job queue | RQ (Redis Queue) | Simple Python-native queue; supports fan-out; Redis for state |
| Claude SDK | `anthropic` Python SDK (latest) | Supports batch API, prompt caching, structured outputs |
| HTTP client | `httpx` (async) | Async HTTP; retry/backoff via `tenacity` |
| Logging | `structlog` → JSON | Structured JSON audit trail; queryable |
| CLI | `click` | Simple CLI for DonorIngestionCLI and admin commands |
| Schema validation | `pydantic` v2 | Validates all data contracts at runtime |
| Testing | `pytest` + `pytest-asyncio` | Unit + integration tests; gold-set regression |
| Search API | Serper.dev (or Brave Search API) | Stable programmatic search; ~£39/month for 5,000 queries |

---

## Rate Limits and Backoff

### Companies House API
**600 requests per 5-minute window** [verified — CH API documentation]

```
Max sustained rate: ~2 req/s
Recommended practical rate: 1 req/s to leave headroom
Backoff strategy: exponential with jitter
  - First retry: 2s
  - Second retry: 4s + random(0, 1)
  - Third retry: 8s + random(0, 2)
  - Max retries: 5; then dead-letter queue + alert
```

For a batch of 100 records × ~5 CH calls each = 500 calls → ~8 minutes at 1 req/s.
Schedule batch runs during off-peak hours (overnight) to avoid rate throttling.

### Charity Commission API
Rate limit threshold not published (beta) — treat conservatively at 0.5 req/s.
Fallback: bulk download ZIP (daily update) if API returns 429 or 5xx.

### HMLR OCOD + 360Giving GrantNav
Bulk CSV downloads — no API rate limit. Download monthly/daily and cache locally.

### UK Sanctions List
Download on pipeline start; cache for 24h before re-fetch.

---

## Prompt Caching Strategy

| Agent | Cache content | TTL | Saving |
|---|---|---|---|
| WealthScoringAgent | System prompt + scoring rubric (~20k tokens) | 5-min (reused across all donors in batch) | ~90% discount on repeated input tokens |
| SynthesisAgent — Job A | System prompt + dossier schema (~20k tokens) | 5-min (reused across all donors in batch) | ~90% discount on repeated input tokens |
| SynthesisAgent — Job C | System prompt + rubric + batch instructions (~30k tokens) | 1-hour TTL (Job C batch runs take longer) | ~90% discount on repeated input tokens |
| SynthesisAgent — Job C (donor context) | Per-donor context (~15k tokens) cached within single Job C batch | 5-min (back-to-back Opus calls on same donor) | Applied where multiple enrichment passes needed |
| EntityResolutionAgent | System prompt only (~5k tokens) | 5-min | Modest saving; Haiku is cheap baseline |

Cache writes use 5-min TTL (1.25x base input cost) unless the batch run will clearly exceed 5 minutes, in which case 1-hour TTL (2x base input cost) is used for Job C.

---

## Batch API Usage

| Job | Model | Batch? | Latency | Saving |
|---|---|---|---|---|
| Job A — donor enrichment | Claude Sonnet | Yes | Up to 24h | 50% on input + output |
| Job B — entity matching | Claude Haiku | Yes | Up to 24h | 50% on input + output |
| Job C — lead dossier | Claude Opus | Yes | Up to 24h | 50% on input + output |

Batch API is used by default. Standard (synchronous) API is used only for:
- Human-review-triggered re-runs where a fundraiser needs a result same-day
- Entity resolution where confidence < 0.85 and human review is waiting

---

## v1 Kill List (explicitly out of scope)

The following will NOT be built in v1:

- Web UI (fundraiser interaction is via CLI and markdown review files)
- CRM integration (dossiers delivered as files; CRM import is manual in v1)
- Email or SMS notifications to fundraisers or prospects
- Multi-user authentication (single-operator v1; v2 adds auth if needed)
- Real-time API webhooks
- OSCR (Scottish charities) and CCNI (Northern Ireland) integrations (v2 extension)
- Honours list scraping (gov.uk/honours — no API; deferred to v2)
- Automated outreach scheduling
- Dashboard / analytics UI
