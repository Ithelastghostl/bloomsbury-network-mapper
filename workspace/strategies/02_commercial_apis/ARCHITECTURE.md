# Architecture: Strategy 2 — Commercial API Stack + Claude Synthesis

## Component Diagram

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │  DonorIngestionService                                              │
 │  ─────────────────────                                              │
 │  • Accepts CSV upload or JSON POST                                  │
 │  • Validates required fields (name, optional: DOB, address)         │
 │  • Attaches consent metadata (basis, timestamp, operator)           │
 │  • Writes DonorRecord to Postgres (donors table)                    │
 │  • Publishes job_id to Redis queue "ingest"                         │
 └─────────────────────┬───────────────────────────────────────────────┘
                       │ job_id
                       ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  EntityResolver (Claude Haiku)                                      │
 │  ─────────────────────────────                                      │
 │  • Queries CH officer_search by name                                │
 │  • Queries CC trustee_data by name                                  │
 │  • Scores candidate matches (name similarity, DOB, address)         │
 │  • Returns resolved_entity with confidence score [0.0–1.0]          │
 │  • confidence < 0.85 → writes to human_review_queue (type=ENTITY)  │
 │  • confidence ≥ 0.85 → publishes to Redis queue "fan_out"           │
 │  Note: Haiku used here (low-cost, deterministic matching task)      │
 └─────────────────────┬───────────────────────────────────────────────┘
                       │ resolved_entity
                       ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  APIOrchestrator (Prefect flow or RQ worker)                        │
 │  ──────────────────────────────────────────                         │
 │  Parallel fan-out to all sources; timeout 60s per source.           │
 │                                                                     │
 │  Free UK sources:                                                   │
 │  ├── CH officer_appointments → raw_signals table                    │
 │  ├── CH PSC register → raw_signals table                            │
 │  ├── CC GetTrusteeAndRelatedCharities → raw_signals table           │
 │  └── 360Giving GrantNav CSV (pre-loaded bulk) → raw_signals table   │
 │                                                                     │
 │  Commercial sources (parallel):                                     │
 │  ├── DonorSearch API → raw_signals table                            │
 │  └── Wealth-X (Altrata) API → raw_signals table                     │
 │                                                                     │
 │  Rate limit handling:                                               │
 │  • CH: 600 req/5 min — token bucket in Redis; back-off on 429       │
 │  • CC: undocumented limit — conservative 1 req/s; monitor 429s      │
 │  • DonorSearch: per-contract limit — configure in env; back-off     │
 │  • Wealth-X: per-contract limit — configure in env; back-off        │
 │                                                                     │
 │  Each API response stored in raw_signals (job_id, source_id,        │
 │  payload JSONB, retrieved_at).                                      │
 └─────────────────────┬───────────────────────────────────────────────┘
                       │ fan_out complete
                       ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  SynthesisAgent (Claude Sonnet — Job A)                             │
 │  ──────────────────────────────────────                             │
 │  • Loads all raw_signals for job_id                                 │
 │  • System prompt + scoring rubric sent as cached context            │
 │    (prompt cache: 5-min write, reused across batch)                 │
 │  • Produces structured DossierDraft: wealth_tier, giving_history,   │
 │    corporate_roles, network_connections, flags                      │
 │  • Every claim must include source_signal_id; absent = "Not found"  │
 │  • 80% of records use Sonnet; ambiguous or conflicting signals      │
 │    escalate to Opus (see below)                                     │
 │  • Writes dossier_draft to Postgres                                 │
 └─────────────────────┬───────────────────────────────────────────────┘
                       │ dossier_draft
                       ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  WealthScorer                                                       │
 │  ────────────                                                       │
 │  • Reads dossier_draft                                              │
 │  • Applies scoring rubric (wealth_confidence, philanthropic_count,  │
 │    network_density, adverse_flags)                                  │
 │  • wealth_confidence < 0.70 OR relationship_score < 0.60           │
 │    → writes to human_review_queue (type=UNCERTAINTY)                │
 │  • Qualifying records (score ≥ threshold) → Redis queue "job_c"     │
 │  • Non-qualifying records → archived dossiers table                 │
 └─────────────────────┬───────────────────────────────────────────────┘
                       │ (qualifying records only)
                       ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  SynthesisAgent (Claude Opus — Job C, batch API)                    │
 │  ─────────────────────────────────────────────                      │
 │  • 24h latency acceptable for Job C → use Batch API (50% discount)  │
 │  • Full lead dossier: capacity narrative, sanctions check,          │
 │    PEP indicators, adverse media synthesis, relationship path       │
 │    to Bloomsbury trustees                                           │
 │  • Also handles ambiguous entity resolution escalated from Haiku    │
 │  • Opus used here for reasoning depth on complex/sparse signals     │
 │  • Writes lead_dossier to Postgres                                  │
 └─────────────────────┬───────────────────────────────────────────────┘
                       │ lead_dossier
                       ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  HumanReviewQueue                                                   │
 │  ─────────────────                                                  │
 │  • Serves review tasks from three queues:                           │
 │    ENTITY (Checkpoint 1), UNCERTAINTY (Checkpoint 2),              │
 │    FINAL_SIGNOFF (Checkpoint 3)                                     │
 │  • Interface: markdown file in reviews/ directory                   │
 │  • Reviewer decision written back to Postgres                       │
 │  • Time budget per checkpoint defined in HUMAN_CHECKPOINTS.md       │
 └─────────────────────┬───────────────────────────────────────────────┘
                       │ approved
                       ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  DossierFormatter                                                   │
 │  ─────────────────                                                  │
 │  • Renders approved lead_dossier as markdown output file            │
 │  • Includes: signal source citations, confidence labels,            │
 │    wealth estimate caveat, human review sign-off timestamp          │
 └─────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  AuditLogger                                                        │
 │  ────────────                                                       │
 │  • Writes an audit record for every event:                          │
 │    API call (source, endpoint, timestamp, response_hash)            │
 │    Model invocation (model, prompt_hash, token_counts)              │
 │    Human decision (reviewer_id, decision, timestamp)                │
 │    Dossier release (job_id, output_path, timestamp)                 │
 │  • Audit log is append-only; no update or delete operations         │
 └─────────────────────────────────────────────────────────────────────┘
```

---

## Data Contracts (JSON-schema style)

### 1. DonorRecord (input)
```json
{
  "type": "object",
  "required": ["job_id", "name", "consent"],
  "properties": {
    "job_id":    { "type": "string", "format": "uuid" },
    "name":      { "type": "string" },
    "dob_year":  { "type": "integer", "minimum": 1920 },
    "dob_month": { "type": "integer", "minimum": 1, "maximum": 12 },
    "address":   { "type": "string" },
    "email":     { "type": "string", "format": "email" },
    "consent": {
      "type": "object",
      "required": ["lawful_basis", "recorded_at", "recorded_by"],
      "properties": {
        "lawful_basis":  { "type": "string", "enum": ["legitimate_interest", "consent"] },
        "recorded_at":  { "type": "string", "format": "date-time" },
        "recorded_by":  { "type": "string" },
        "opt_out":      { "type": "boolean", "default": false }
      }
    }
  }
}
```

### 2. ResolvedEntity
```json
{
  "type": "object",
  "required": ["job_id", "confidence", "candidates"],
  "properties": {
    "job_id":       { "type": "string", "format": "uuid" },
    "confidence":   { "type": "number", "minimum": 0, "maximum": 1 },
    "selected_id":  { "type": "string", "description": "CH officer_id or CC charity number + trustee_id" },
    "candidates":   {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source":     { "type": "string" },
          "source_id":  { "type": "string" },
          "name":       { "type": "string" },
          "dob_month":  { "type": "integer" },
          "dob_year":   { "type": "integer" },
          "address":    { "type": "string" },
          "score":      { "type": "number" }
        }
      }
    },
    "escalated": { "type": "boolean" }
  }
}
```

### 3. RawSignal
```json
{
  "type": "object",
  "required": ["job_id", "source_signal_id", "payload", "retrieved_at"],
  "properties": {
    "job_id":           { "type": "string", "format": "uuid" },
    "source_signal_id": {
      "type": "string",
      "description": "stable signal ID from 04_signal_inventory.md, e.g. signal.companies_house.officer_appointments"
    },
    "payload":          { "type": "object", "description": "raw API response (JSONB)" },
    "retrieved_at":     { "type": "string", "format": "date-time" },
    "http_status":      { "type": "integer" },
    "error":            { "type": ["string", "null"] }
  }
}
```

### 4. DossierDraft (Job A output)
```json
{
  "type": "object",
  "required": ["job_id", "name", "wealth_tier", "philanthropic_history", "corporate_roles", "network_connections", "flags"],
  "properties": {
    "job_id":    { "type": "string", "format": "uuid" },
    "name":      { "type": "string" },
    "wealth_tier": {
      "type": "object",
      "properties": {
        "band":       { "type": "string", "enum": ["<1m", "1m-5m", "5m-30m", "30m+", "unknown"] },
        "confidence": { "type": "number" },
        "label":      { "type": "string", "enum": ["verified", "vendor_estimate", "my_estimate"] },
        "source_ids": { "type": "array", "items": { "type": "string" } }
      }
    },
    "philanthropic_history": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "recipient":   { "type": "string" },
          "amount":      { "type": ["number", "null"] },
          "date":        { "type": ["string", "null"] },
          "source_id":   { "type": "string" }
        }
      }
    },
    "corporate_roles": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "company":   { "type": "string" },
          "role":      { "type": "string" },
          "start":     { "type": ["string", "null"] },
          "end":       { "type": ["string", "null"] },
          "source_id": { "type": "string" }
        }
      }
    },
    "network_connections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "connected_to": { "type": "string" },
          "via":          { "type": "string", "description": "shared entity or relationship type" },
          "source_id":    { "type": "string" }
        }
      }
    },
    "flags": {
      "type": "object",
      "properties": {
        "sanctions_match":   { "type": "boolean" },
        "pep_indicator":     { "type": "boolean" },
        "adverse_media":     { "type": "boolean" },
        "us_bias_warning":   { "type": "boolean", "description": "true if commercial data returned no UK-specific results" }
      }
    },
    "synthesised_by": { "type": "string", "enum": ["sonnet", "opus"] },
    "synthesised_at": { "type": "string", "format": "date-time" }
  }
}
```

### 5. WealthScore
```json
{
  "type": "object",
  "required": ["job_id", "wealth_confidence", "relationship_score", "philanthropic_count", "qualifies_for_job_c"],
  "properties": {
    "job_id":               { "type": "string", "format": "uuid" },
    "wealth_confidence":    { "type": "number", "minimum": 0, "maximum": 1 },
    "relationship_score":   { "type": "number", "minimum": 0, "maximum": 1 },
    "philanthropic_count":  { "type": "integer" },
    "adverse_flag_count":   { "type": "integer" },
    "qualifies_for_job_c":  { "type": "boolean" },
    "escalate_to_human":    { "type": "boolean" },
    "scored_at":            { "type": "string", "format": "date-time" }
  }
}
```

### 6. LeadDossier (Job C output)
```json
{
  "type": "object",
  "required": ["job_id", "capacity_narrative", "sanctions_clear", "relationship_path", "reviewer_sign_off"],
  "properties": {
    "job_id": { "type": "string", "format": "uuid" },
    "capacity_narrative": {
      "type": "string",
      "description": "Sourced narrative of £5M+ capacity estimate; must include [estimate] label if not verified"
    },
    "sanctions_clear":    { "type": "boolean" },
    "pep_status":         { "type": "string", "enum": ["clear", "flagged", "unknown"] },
    "adverse_media_summary": { "type": ["string", "null"] },
    "relationship_path":  {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "hop":        { "type": "integer" },
          "entity":     { "type": "string" },
          "via":        { "type": "string" },
          "source_id":  { "type": "string" }
        }
      }
    },
    "reviewer_sign_off": {
      "type": "object",
      "properties": {
        "reviewer_id": { "type": "string" },
        "decision":    { "type": "string", "enum": ["approved", "rejected", "edited"] },
        "notes":       { "type": ["string", "null"] },
        "signed_at":   { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

### 7. AuditEvent
```json
{
  "type": "object",
  "required": ["event_id", "event_type", "job_id", "timestamp"],
  "properties": {
    "event_id":   { "type": "string", "format": "uuid" },
    "event_type": {
      "type": "string",
      "enum": ["api_call", "model_invocation", "human_decision", "dossier_released", "error"]
    },
    "job_id":     { "type": "string", "format": "uuid" },
    "timestamp":  { "type": "string", "format": "date-time" },
    "detail": {
      "type": "object",
      "description": "Type-specific payload (API endpoint + status; model + token counts; reviewer + decision)"
    }
  }
}
```

---

## Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Language | Python 3.12 | Async support; Anthropic SDK native |
| Database | Postgres 16 | JSONB for raw API payloads; structured tables for dossiers; multiple API responses require relational storage (SQLite excluded) |
| Job queue | Redis 7 + RQ (or Prefect 3) | Redis for token-bucket rate limiting and job queuing; RQ for simple worker pools; Prefect if DAG visibility required |
| LLM SDK | anthropic Python SDK (latest) | Native batch API and prompt-caching support |
| API client | httpx (async) | Async fan-out; retry middleware |
| Serialisation | Pydantic v2 | Schema validation at ingest and API response parse |
| Output | Markdown files in reviews/ | Human-readable; no UI dependency for v1 |

---

## Claude Model Assignment

| Task | Model | Reason |
|---|---|---|
| Entity matching (name disambiguation, candidate scoring) | claude-haiku-4-5 | High-volume, deterministic — cost-sensitive; fast |
| Job A synthesis (donor enrichment dossier) | claude-sonnet-4-6 | Balance of quality and cost; 80% of records |
| Ambiguous entity resolution escalations | claude-opus-4-6 or claude-opus-4-7 | Reasoning depth needed for conflicting signals |
| Job C lead dossiers (£5M+ capacity, adverse media) | claude-opus-4-6 or claude-opus-4-7 (Batch API) | Highest-stakes output; 24h latency acceptable → 50% cost saving |

Note: Opus 4.7 uses a new tokeniser that generates up to 35% more tokens for the same text [verified — platform.claude.com/docs, accessed 2026-05-05]. Factor into cost projections when upgrading.

---

## Prompt Caching

Two caching opportunities apply:

1. **System prompt + scoring rubric (Job A Sonnet).** The rubric for what constitutes a "confirmed" vs "estimated" wealth signal is identical across every record in a batch. Cache the system prompt (estimated ~3,000–5,000 tokens) as a 5-minute cache write at batch start. Cache reads cost $0.30/MTok vs $3.00/MTok standard — 90% discount on those tokens for all subsequent records in the batch.

2. **Job C Opus context.** The sanctions evaluation framework and relationship-path instructions are shared across all Job C leads in a batch. Same 5-minute cache write applied; 90% discount on cache reads.

At 100 records/batch with ~20k of 30k input tokens cached per record, estimated saving: ~20% on total input token spend for Job A [my estimate — consistent with 06_cost_models.md calculation].

---

## Batch API Usage

Job C (lead dossier generation via Claude Opus) is the primary batch API candidate:
- 24h latency is acceptable for final dossier production — human review is the bottleneck, not the model call.
- Batch API provides 50% discount on both input and output tokens [verified — platform.claude.com/docs].
- Job C per-lead cost: $0.275 batch vs $0.550 standard [verified from 06_cost_models.md].
- Jobs A and B should use standard API for first-pass synthesis where lower latency is preferred during a batch run; batch API can be applied to Job A if overnight runs are acceptable.

---

## Rate Limit Handling

| Source | Limit | Implementation |
|---|---|---|
| Companies House | 600 req / 5-min window [verified] | Redis token bucket; refill every 300s; back-off on HTTP 429 with exponential retry (max 3 attempts) |
| Charity Commission EW | Undocumented [beta API] [my estimate] | Conservative 1 req/s ceiling; monitor 429 responses; bulk download preferred for batch runs |
| 360Giving GrantNav | No documented API rate limit | Pre-load full CSV bulk download at batch start; no per-record API calls |
| DonorSearch | Per-contract; configure in env | Hard limit in config; queue back-pressure if limit approached |
| Wealth-X (Altrata) | Per-contract; configure in env | Same pattern as DonorSearch |
| Anthropic Claude API | Tier-based (Tier 1–4 + Enterprise) | SDK handles retries; configure max_retries=3, timeout=120s |

---

## IDTA / UK Adequacy Decision Handling

Three US-origin vendors (DonorSearch, Wealth-X/Altrata, iWave/Kindsight) are restricted transfer destinations under UK GDPR Chapter V. The pipeline must not make any API call that sends UK personal data to these vendors until a valid transfer mechanism is in place. Implementation:

- `consent.transfer_mechanism` field in DonorRecord must be populated before fan-out step reaches any US-vendor endpoint.
- APIOrchestrator checks `transfer_mechanism != null` for US vendors; raises `TransferMechanismMissingError` otherwise.
- Valid values: `"idta"` (UK International Data Transfer Agreement), `"scc"` (UK-adapted Standard Contractual Clauses), `"adequacy"` (not currently applicable — no US adequacy decision as of 2026-05-05).
- Anthropic (Claude API): DPA with Anthropic required before processing personal data in prompts; treat as US transfer; IDTA or SCCs required.
- See COMPLIANCE.md for full IDTA requirements per vendor.

---

## Kill List for v1

The following items are explicitly out of scope for the v1 prototype and must not be built:

- Real-time dossier generation (sub-1-minute latency) — batch pipeline only
- LexisNexis Nexis integration — deferred to v2 if PEP/adverse media gaps require it
- BoardEx / RelSci integration — deferred; relationship-path data from CH + CC is sufficient for v1 network mapping
- WealthEngine integration — US bias documented; not justified until DonorSearch UK coverage verified
- OSCR Scottish charities API integration — deferred; add alongside CC bulk download in v2
- CCNI Northern Ireland charities — deferred (CSV export only; not worth automation at v1 scale)
- Web scraping (Honours Lists, press releases) — deferred; manually curated inputs for v1
- CRM push integration (Raiser's Edge, Salesforce) — deferred; dossier markdown files are v1 output
- Multi-tenancy — single-organisation deployment only
- User authentication layer — file-system access control sufficient for v1
