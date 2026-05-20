# Architecture — Strategy 4 Hybrid Tiered Pipeline

---

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  INGESTION                                                           │
│                                                                      │
│  DonorIngestionCLI                                                   │
│    Input: CSV or JSON with name, address, known role, consent flag   │
│    Output: DonorRecord (see Data Contracts §1)                       │
│    Writes to: Postgres donors table                                  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  TIER 1 — OPEN-SOURCE ENRICHMENT (Prefect flow: tier1_pipeline)      │
│                                                                      │
│  Tier1Orchestrator                                                   │
│    Reads: DonorRecord queue from Postgres                            │
│    Fanout: dispatches all five agents concurrently per record        │
│    Writes: Tier1EnrichmentResult to Postgres tier1_results table     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ TrusteeGraphAgent                                               │ │
│  │   Source: signal.charity_commission_ew.trustee_data             │ │
│  │   Method: CC bulk download (daily ZIP) or API                   │ │
│  │           GetTrusteeAndRelatedCharities endpoint                │ │
│  │   Output: trustee_connections[] with charity_number, role, date │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ CompaniesHouseAgent                                             │ │
│  │   Sources: signal.companies_house.officer_search               │ │
│  │            signal.companies_house.officer_appointments         │ │
│  │            signal.companies_house.persons_with_significant_control│
│  │   Method: REST API, HTTP Basic Auth, 600 req/5-min pool        │ │
│  │   Output: director_roles[], psc_roles[], company_network[]     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ GrantNavAgent                                                   │ │
│  │   Source: signal.threesixtygiving.grantnav                     │ │
│  │   Method: bulk CSV download; in-memory Pandas join by          │ │
│  │           charity_number and funder name variants              │ │
│  │   Output: grants_received[], funders[]                         │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ PropertyAgent                                                   │ │
│  │   Sources: signal.hmlr.overseas_companies_property (OCOD)      │ │
│  │            signal.hmlr.price_paid                              │ │
│  │   Method: monthly CSV delta; address-match to donor record     │ │
│  │   Output: property_indicators[] with tenure, price_band        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ WebSearchAgent                                                  │ │
│  │   Sources: signal.govuk.honours_lists; media search API        │ │
│  │            (e.g., Serper.dev ~$50/month for ~5,000 queries)    │ │
│  │   Method: Claude Haiku extracts structured entities from       │ │
│  │           search result snippets; source URL retained          │ │
│  │   Output: honours[], media_mentions[], adverse_flags[]         │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ShortlistScorer (Claude Sonnet 4.6)                                 │
│    Input: Tier1EnrichmentResult per record                           │
│    Scoring dimensions:                                               │
│      - co_trusteeship_density (0–1)                                 │
│      - psc_wealth_indicator (bool + estimated band)                 │
│      - grant_history_signal (0–1)                                   │
│      - honours_signal (bool)                                         │
│      - adverse_flag (disqualifier)                                   │
│    Output: ShortlistScore (see Data Contracts §3)                   │
│    Prompt-caching: scoring rubric prompt cached (1-hour TTL)        │
│    Records above threshold (default: composite ≥ 0.65) →           │
│      ShortlistQueue in Postgres                                      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  shortlist candidates only
┌───────────────────────────────▼──────────────────────────────────────┐
│  SHORTLIST GATE — HUMAN CHECKPOINT                                   │
│                                                                      │
│  Interface: Prefect task waits on Postgres shortlist_approvals table │
│  Reviewer sees: ranked list with top 3 signals per candidate,        │
│                 score, and Tier 1 source links                       │
│  Actions: approve, reject, modify threshold, add unlisted candidate  │
│  Gate condition: Tier 2 flow does NOT start until approval record    │
│                  exists in shortlist_approvals for each candidate    │
│  Time budget: target ≤ 2 business days (see HUMAN_CHECKPOINTS.md)   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  approved shortlist only (~10–30%)
┌───────────────────────────────▼──────────────────────────────────────┐
│  TIER 2 — COMMERCIAL ENRICHMENT (Prefect flow: tier2_pipeline)       │
│                                                                      │
│  Tier2Orchestrator                                                   │
│    Reads: approved shortlist from Postgres                           │
│    Dispatches: Factary always; Wealth-X if uhnwi_flag = true;        │
│               DonorSearch if us_connected_flag = true                │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ FactaryPhiClient                                                │ │
│  │   Source: signal.factary.phi_donations_db                      │ │
│  │   Method: web UI manual lookup (no API); results exported to   │ │
│  │           CSV and uploaded to shared folder; webhook notifies  │ │
│  │           Tier2Orchestrator when ready                         │ │
│  │   Output: factary_donations[], factary_wealth_proxies[]        │ │
│  │   Latency: 1–5 business days (managed service component)      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ WealthXClient (optional — UHNWI flagged only)                   │ │
│  │   Source: signal.altrata.wealth_x                              │ │
│  │   Method: Altrata API or managed lookup; IDTA required         │ │
│  │   Output: wealth_x_profile{net_worth_estimate, source_of_wealth│ │
│  │           philanthropic_interests, associates[]}               │ │
│  │   Latency: 1–3 business days for custom lookups                │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ DonorSearchClient (optional — US-connected donors only)         │ │
│  │   Source: signal.donorsearch.wealth_screening                  │ │
│  │   Method: batch API; GDPR DPA required                        │ │
│  │   Output: donor_search_profile{capacity_score, us_giving[]}   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  WealthConfirmer (Claude Sonnet 4.6)                                 │
│    Input: Tier1EnrichmentResult + all Tier2 vendor outputs           │
│    Task: reconcile probabilistic Tier 1 signals with confirmed       │
│          Tier 2 data; flag entity resolution conflicts               │
│    Entity resolution: confidence < 0.85 → uncertainty review queue  │
│    Wealth confidence < 0.7 → uncertainty review queue               │
│    Output: ReconciledLeadRecord (see Data Contracts §5)              │
│    Batch API: 24h latency acceptable; use batch for cost savings     │
│                                                                      │
│  Job C SynthesisAgent (Claude Opus 4.7)                              │
│    Input: ReconciledLeadRecord                                       │
│    Task: produce full narrative lead dossier — wealth-band estimate  │
│          (labelled [my estimate]), network connections, giving        │
│          history, recommended approach                               │
│    Token budget: ~60k input / ~10k output per lead                  │
│    Batch API: used where 24h latency acceptable                      │
│    Output: LeadDossier (see Data Contracts §6)                       │
│                                                                      │
│  HumanReviewQueue                                                    │
│    Delivers dossiers to reviews/ folder as markdown files           │
│    Reviewer actions: approve, request revision, reject               │
│    Final approved dossiers written to output/ folder                │
│                                                                      │
│  AuditLogger                                                         │
│    All tiers: every API call, LLM prompt/response, human decision,  │
│    and data source URL written to Postgres audit_log table           │
│    Retention: see COMPLIANCE.md                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Contracts

All schemas are JSON-schema style. All personal data fields subject to LIA and DPIA as documented in COMPLIANCE.md.

### 1. DonorRecord (input)

```json
{
  "donor_id": "string (UUID)",
  "name_full": "string",
  "name_aliases": ["string"],
  "address_known": "string | null",
  "known_roles": ["string"],
  "consent_flag": "boolean",
  "consent_source": "string | null",
  "ingested_at": "ISO8601 datetime",
  "ingested_by": "string (fundraiser ID)"
}
```

### 2. Tier1EnrichmentResult

```json
{
  "donor_id": "string (UUID)",
  "trustee_connections": [
    {"charity_number": "string", "charity_name": "string",
     "role": "string", "start_date": "string", "end_date": "string | null",
     "source_url": "string"}
  ],
  "director_roles": [
    {"company_number": "string", "company_name": "string",
     "role": "string", "start_date": "string", "resigned_date": "string | null",
     "source_url": "string"}
  ],
  "psc_roles": [
    {"company_number": "string", "nature_of_control": "string",
     "notified_on": "string", "source_url": "string"}
  ],
  "grants_received": [
    {"funder": "string", "amount_gbp": "number", "award_date": "string",
     "recipient_name": "string", "source_url": "string"}
  ],
  "property_indicators": [
    {"address": "string", "tenure": "string", "price_band": "string",
     "source": "string"}
  ],
  "honours": ["string"],
  "adverse_flags": ["string"],
  "tier1_completed_at": "ISO8601 datetime"
}
```

### 3. ShortlistScore

```json
{
  "donor_id": "string (UUID)",
  "composite_score": "number (0.0–1.0)",
  "co_trusteeship_density": "number (0.0–1.0)",
  "psc_wealth_indicator": "boolean",
  "psc_estimated_band": "string | null",
  "grant_history_signal": "number (0.0–1.0)",
  "honours_signal": "boolean",
  "adverse_flag": "boolean",
  "shortlisted": "boolean",
  "scoring_model": "string (claude-sonnet-4-6)",
  "scored_at": "ISO8601 datetime"
}
```

### 4. ShortlistApproval (human gate)

```json
{
  "donor_id": "string (UUID)",
  "decision": "approved | rejected | modified",
  "reviewer_id": "string",
  "reviewed_at": "ISO8601 datetime",
  "notes": "string | null",
  "override_reason": "string | null"
}
```

### 5. ReconciledLeadRecord (post-Tier 2)

```json
{
  "donor_id": "string (UUID)",
  "tier1_result": "Tier1EnrichmentResult (embedded)",
  "factary_donations": [
    {"charity_name": "string", "gift_description": "string",
     "source_url": "string"}
  ],
  "factary_wealth_proxies": ["string"],
  "wealth_x_profile": {
    "net_worth_estimate_usd": "number | null",
    "net_worth_confidence": "number (0.0–1.0)",
    "source_of_wealth": "string | null",
    "philanthropic_interests": ["string"],
    "associates": ["string"]
  },
  "donor_search_profile": {
    "capacity_score": "number | null",
    "us_giving": ["string"]
  },
  "entity_resolution_confidence": "number (0.0–1.0)",
  "wealth_confirmation_confidence": "number (0.0–1.0)",
  "reconciliation_flags": ["string"],
  "reconciled_at": "ISO8601 datetime"
}
```

### 6. LeadDossier (Job C output)

```json
{
  "donor_id": "string (UUID)",
  "dossier_version": "string",
  "wealth_band_estimate": "string (labelled [my estimate])",
  "wealth_band_confidence": "number (0.0–1.0)",
  "network_summary": "string (narrative, sourced)",
  "giving_history_summary": "string (narrative, sourced)",
  "recommended_approach": "string",
  "key_connections": [
    {"name": "string", "connection_type": "string", "source": "string"}
  ],
  "signals_used": ["string (signal IDs)"],
  "synthesis_model": "string (claude-opus-4-7)",
  "synthesised_at": "ISO8601 datetime",
  "review_status": "pending | approved | rejected"
}
```

### 7. AuditLogEntry

```json
{
  "log_id": "string (UUID)",
  "donor_id": "string (UUID)",
  "tier": "1 | 2 | gate | human_review",
  "action": "string",
  "agent": "string",
  "input_summary": "string (no PII in log body)",
  "source_url": "string | null",
  "llm_model": "string | null",
  "llm_tokens_in": "number | null",
  "llm_tokens_out": "number | null",
  "timestamp": "ISO8601 datetime",
  "operator_id": "string | null"
}
```

---

## Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Language | Python 3.12 | Async support, dataclasses, strong typing |
| Orchestration | Prefect 3.x | Stage gates, human-in-the-loop pause tasks, retries, observability |
| Database | Postgres 16 | Two-tier state management requires ACID transactions; supports JSONB for flexible schema columns |
| Queue / async comms | Redis 7 (Upstash or self-hosted) | Job queues between Tier 1 and Tier 2; Tier 2 webhook notify |
| LLM | Anthropic Claude API (claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5) | Scoring (Sonnet), synthesis (Opus), entity extraction (Haiku) |
| HTTP client | httpx (async) | All API calls with retry and rate-limit backoff |
| Data processing | Pandas + DuckDB | In-memory joins on bulk CSV datasets (360Giving, HMLR) |
| Secret management | Environment variables + python-dotenv (dev); Vault or cloud secrets manager (prod) | API keys for CH, CC, Factary, Altrata, Anthropic |
| Review interface | Markdown files in reviews/ + Postgres status flags | Minimal viable; no separate frontend in v1 |

---

## Rate Limits

### Tier 1 — Free APIs

| Source | Limit | Strategy |
|---|---|---|
| Companies House API | 600 req / 5-min window (~2 req/s sustained) | Async with 2-second throttle; shared pool across agents |
| Charity Commission API (beta) | Not published — treat as ~60 req/min [my estimate] | Bulk download preferred for batch pipeline; API for individual lookups only |
| 360Giving GrantNav | No API rate limit — bulk CSV download only | Download once daily; cache locally |
| HMLR OCOD | No rate limit — monthly CSV | Download monthly; cache locally |
| HMLR Price Paid | No rate limit — bulk CSV | Download monthly; cache locally |
| GOV.UK Honours | No API — web scrape | One-time ingest; update twice yearly (New Year and Birthday Honours) |
| UK Sanctions List | No API — file download | Download weekly (multiple updates per week); local cache |
| Web search (Serper.dev) | ~5,000 queries/month on $50 plan | Budget 10 queries per record × 400 records = 4,000/month; reserve 1,000 for retries |

### Tier 2 — Commercial

| Source | Limit | Strategy |
|---|---|---|
| Factary Phi | Web UI only; no API | Manual lookup batched by fundraising team; 1–5 business day turnaround |
| Wealth-X (Altrata) | API or managed lookup; enterprise SLA | Request only for UHNWI-flagged leads; agree volume cap at contract |
| DonorSearch | API + CRM integration available | Batch submit; confirm per-record rate limits at procurement |

---

## Prompt Caching

### Tier 1 — Where Caching Applies

- **ShortlistScorer (Claude Sonnet):** The scoring rubric system prompt (~20k tokens, including all signal definitions, scoring dimensions, and output schema) is identical for every record in a batch run. Use 1-hour cache write. Cache read cost = 0.1× base input — saving ~67% on system prompt tokens across a 400-record batch.
- **WebSearchAgent extraction (Claude Haiku):** The extraction schema prompt (~5k tokens) is cached for the batch duration.

### Tier 2 — Where Batch API Applies

- **WealthConfirmer (Claude Sonnet):** 24-hour latency acceptable for reconciliation step. Use Batch API for 50% discount on input and output tokens.
- **Job C SynthesisAgent (Claude Opus):** 24-hour latency acceptable. Use Batch API. At 60k input / 10k output per lead, batch price = ($2.50/MTok × 60k + $12.50/MTok × 10k) = $0.275/lead vs $0.550 standard.

---

## Kill List for v1

The following are explicitly out of scope for the initial build and should not be added:

- OSCR (Scottish charities) and CCNI (Northern Ireland charities) — add in v2 once E&W pipeline is stable
- RelSci or BoardEx integration — POA costs; add only if Job B corporate network gaps are confirmed at prototype review
- DonorSearch — optional; include only if significant US-connected donors are identified in the shortlist
- Automated outreach or CRM write-back — pipeline produces dossiers for human fundraisers; no automated contact
- Real-time API updates — Tier 1 runs as scheduled batch (nightly or on-demand); no streaming ingestion
- Web frontend for review interface — markdown files in reviews/ directory is sufficient for v1; web UI in v2
- LexisNexis Nexis for Development Professionals — high cost; add only if reputational screening beyond UK Sanctions List is required
- Automated PECR channel routing — pipeline does not send outreach; that is a human decision after dossier review
