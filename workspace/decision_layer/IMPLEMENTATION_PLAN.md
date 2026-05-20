# Data Engineering MVP — Implementation Plan

**Project:** Bloomsbury Network Mapper  
**Layer scope:** Data pipeline only (Layers 1–5). UI build follows separately.  
**Status:** Ready to build. Open a Claude Code session, point it at this file, start with Section 9 (folder structure), then execute sections in order.

---

## Table of Contents

1. Database Schema (full DDL)
2. Extraction Pipeline — Layer 1 (`extract_charities.py`)
3. Entity Loading Pipeline — Layer 2 (`load_entities.py`, `derive_connections.py`, `match_donors.py`)
4. Augmentation Pipeline — Layer 3 (`augment_donors.py`)
5. Embedding Pipeline — Layer 4 (`embed_chunks.py`)
6. Lead Surface — Layer 5 (`score_leads.py`)
7. Experimental Run Playbook (5k experiment)
8. Scheduled Run Design (v2 sketch)
9. File and Folder Structure
10. Prompt Templates

---

## 1. Database Schema (full DDL)

Run this in Supabase SQL editor. Extensions must be enabled first (see Section 7 prerequisites).

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- PERSONS
-- Disambiguation model: one row per person-context combination.
-- Multiple rows for "James Smith" are expected and correct.
-- The fundraising team resolves at contact time.
-- ============================================================
CREATE TABLE persons (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name               TEXT NOT NULL,
    -- Disambiguating context fields. Populated by extraction;
    -- at least one must be non-null when name is ambiguous.
    disambiguation_context  TEXT,           -- free text: "CVC trustee, appointed 2019"
    birth_year              SMALLINT,       -- year only; extracted when present
    birth_month             SMALLINT,       -- month only (1–12); CH provides month+year
    -- Primary organisation association used for disambiguation
    primary_org_id          UUID REFERENCES organisations(id) ON DELETE SET NULL,
    -- Enrichment fields
    title                   TEXT,           -- Mr, Dr, Sir, Dame, Lord, etc.
    suffix                  TEXT,           -- CBE, OBE, FCA, etc.
    linkedin_url            TEXT,
    email                   TEXT,           -- only if publicly sourced
    -- Wealth and philanthropy signals (populated by augmentation layer)
    wealth_band             TEXT CHECK (wealth_band IN ('under_1m','1m_5m','5m_25m','25m_100m','over_100m','unknown')),
    wealth_source_notes     TEXT,           -- e.g. "PSC filing: 40% stake in Acme Ltd"
    philanthropy_signal     TEXT CHECK (philanthropy_signal IN ('confirmed','probable','possible','none','unknown')),
    philanthropy_notes      TEXT,
    honours                 TEXT,           -- e.g. "CBE 2021 for services to charity"
    -- Provenance
    source_charity_number   TEXT,           -- Companies House number of source charity
    source_document_url     TEXT,
    retrieved_at            TIMESTAMPTZ,
    -- Donor/sponsor cross-reference (populated by match_donors.py)
    donor_sponsor_id        UUID REFERENCES donors_sponsors(id) ON DELETE SET NULL,
    match_score             REAL,           -- trigram similarity at time of match
    match_confirmed         BOOLEAN DEFAULT FALSE,  -- human confirmed?
    -- Lifecycle
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_persons_full_name        ON persons USING GIN (full_name gin_trgm_ops);
CREATE INDEX idx_persons_donor_sponsor_id ON persons (donor_sponsor_id);
CREATE INDEX idx_persons_primary_org_id   ON persons (primary_org_id);
CREATE INDEX idx_persons_wealth_band      ON persons (wealth_band);
CREATE INDEX idx_persons_philanthropy     ON persons (philanthropy_signal);
CREATE INDEX idx_persons_name_text        ON persons (full_name);  -- for exact-match joins

-- ============================================================
-- ORGANISATIONS
-- One row per distinct organisation. Includes charities,
-- companies, LLPs, CIOs, and any other legal entity found.
-- ============================================================
CREATE TABLE organisations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    -- Register identifiers
    companies_house_no  TEXT,           -- for companies and CIOs registered at CH
    charity_number      TEXT,           -- Charity Commission (England/Wales) number
    oscr_number         TEXT,           -- OSCR (Scotland) number
    ccni_number         TEXT,           -- CCNI (Northern Ireland) number
    -- Classification
    org_type            TEXT NOT NULL CHECK (org_type IN (
                            'charity','company','llp','cio',
                            'foundation','trust','partnership',
                            'government','sports_club','other'
                        )),
    sector              TEXT,           -- e.g. 'finance','sport','arts','education'
    -- Size signals
    income_band         TEXT CHECK (income_band IN (
                            'under_10k','10k_100k','100k_1m',
                            '1m_10m','over_10m','unknown'
                        )),
    employee_count_band TEXT,
    -- Address / geography
    registered_address  TEXT,
    postcode            TEXT,
    -- Provenance
    source_url          TEXT,
    retrieved_at        TIMESTAMPTZ,
    -- Lifecycle
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_orgs_ch_number      ON organisations (companies_house_no) WHERE companies_house_no IS NOT NULL;
CREATE UNIQUE INDEX idx_orgs_charity_number ON organisations (charity_number) WHERE charity_number IS NOT NULL;
CREATE INDEX idx_orgs_name_trgm             ON organisations USING GIN (name gin_trgm_ops);
CREATE INDEX idx_orgs_type                  ON organisations (org_type);

-- ============================================================
-- PERSON_ORG_ROLES
-- A role a person holds (or held) at an organisation.
-- Multiple roles per person per org are allowed (e.g. trustee
-- then chair).
-- ============================================================
CREATE TABLE person_org_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    role_title      TEXT NOT NULL,   -- "Trustee", "Director", "Chair", "Patron", etc.
    role_category   TEXT NOT NULL CHECK (role_category IN (
                        'trustee','director','chair','patron',
                        'ceo','cfo','coo','secretary',
                        'advisory_board','honorary','other'
                    )),
    start_date      DATE,
    end_date        DATE,            -- NULL means current
    is_current      BOOLEAN NOT NULL DEFAULT TRUE,
    -- Source
    source_type     TEXT NOT NULL CHECK (source_type IN (
                        'charity_commission','companies_house',
                        'oscr','ccni','markdown_extraction',
                        'web_research','manual'
                    )),
    source_url      TEXT,
    retrieved_at    TIMESTAMPTZ,
    -- Lifecycle
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_por_person_id   ON person_org_roles (person_id);
CREATE INDEX idx_por_org_id      ON person_org_roles (org_id);
CREATE INDEX idx_por_is_current  ON person_org_roles (is_current);
CREATE INDEX idx_por_role_cat    ON person_org_roles (role_category);
-- Composite: find all current trustees for an org
CREATE INDEX idx_por_org_current ON person_org_roles (org_id, is_current) WHERE is_current = TRUE;

-- ============================================================
-- PERSON_CONNECTIONS
-- Derived edges: two persons who share org membership.
-- Populated by derive_connections.py (SQL join over person_org_roles).
-- Do NOT write to this table directly — it is a derived cache.
-- ============================================================
CREATE TABLE person_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_a_id     UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    person_b_id     UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    -- The organisation that creates the connection
    via_org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    connection_type TEXT NOT NULL CHECK (connection_type IN (
                        'co_trustee','co_director','co_patron',
                        'co_advisory','funder_recipient','other'
                    )),
    -- Temporal overlap: both persons were current at this org simultaneously
    overlap_start   DATE,
    overlap_end     DATE,
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE if both are currently active
    -- Shortest-path hop count from a known donor (populated by score_leads.py)
    hop_count       SMALLINT,
    -- Lifecycle
    derived_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT person_connections_order CHECK (person_a_id < person_b_id)  -- avoid duplicates
);

CREATE UNIQUE INDEX idx_pc_unique ON person_connections (person_a_id, person_b_id, via_org_id);
CREATE INDEX idx_pc_person_a     ON person_connections (person_a_id);
CREATE INDEX idx_pc_person_b     ON person_connections (person_b_id);
CREATE INDEX idx_pc_hop_count    ON person_connections (hop_count);
CREATE INDEX idx_pc_is_current   ON person_connections (is_current);

-- ============================================================
-- DONOR_NETWORK_LEADS
-- The lead surface table. One row per (donor, candidate) pair.
-- Populated and refreshed by score_leads.py.
-- ============================================================
CREATE TABLE donor_network_leads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The known donor/sponsor who anchors this lead
    anchor_donor_id     UUID NOT NULL REFERENCES donors_sponsors(id) ON DELETE CASCADE,
    -- The candidate person being surfaced as a lead
    candidate_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    -- Routing: which known person is the best introducer?
    introducer_person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    -- Scoring (v1 formula defined in Section 6)
    score               REAL NOT NULL,
    score_version       TEXT NOT NULL DEFAULT 'v1',
    -- Score components (stored for transparency)
    hop_count_score     REAL,
    wealth_score        REAL,
    philanthropy_score  REAL,
    -- Readable explanation (top 3 reasons, generated by score_leads.py)
    reason_1            TEXT,
    reason_2            TEXT,
    reason_3            TEXT,
    -- Lead metadata
    lead_status         TEXT NOT NULL DEFAULT 'new' CHECK (lead_status IN (
                            'new','triaged','in_outreach',
                            'meeting_booked','donated','rejected','stale'
                        )),
    connection_path     JSONB,   -- [{person_id, org_id, role, hop}] for UI rendering
    -- Provenance
    scored_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Lifecycle
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT leads_unique UNIQUE (anchor_donor_id, candidate_person_id)
);

CREATE INDEX idx_leads_anchor_donor     ON donor_network_leads (anchor_donor_id);
CREATE INDEX idx_leads_candidate        ON donor_network_leads (candidate_person_id);
CREATE INDEX idx_leads_score            ON donor_network_leads (score DESC);
CREATE INDEX idx_leads_status           ON donor_network_leads (lead_status);
CREATE INDEX idx_leads_scored_at        ON donor_network_leads (scored_at DESC);

-- ============================================================
-- KNOWLEDGE_CHUNKS
-- pgvector embeddings for semantic search over person and
-- organisation summaries.
-- text-embedding-3-small produces 1536-dimensional vectors.
-- ============================================================
CREATE TABLE knowledge_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Source record
    entity_type     TEXT NOT NULL CHECK (entity_type IN ('person','organisation','charity_doc')),
    entity_id       UUID NOT NULL,   -- person.id or organisation.id
    chunk_index     SMALLINT NOT NULL DEFAULT 0,  -- 0 for single-chunk entities
    -- Content
    chunk_text      TEXT NOT NULL,
    token_count     SMALLINT,
    -- Vector (1536 dims for text-embedding-3-small)
    embedding       vector(1536),
    -- Provenance
    model_name      TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    embedded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Lifecycle
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunks_entity     ON knowledge_chunks (entity_type, entity_id);
CREATE INDEX idx_chunks_vector     ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);  -- tune lists = sqrt(row_count) once corpus is built

-- ============================================================
-- DONOR_DOSSIERS
-- Structured dossier output from augment_donors.py.
-- status='pending_review' until a human approves.
-- ============================================================
CREATE TABLE donor_dossiers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_sponsor_id    UUID NOT NULL REFERENCES donors_sponsors(id) ON DELETE CASCADE,
    -- Status
    status              TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN (
                            'pending_review','approved','rejected','needs_revision'
                        )),
    -- Research provenance
    research_sources    JSONB,   -- [{source_name, url, retrieved_at, relevance}]
    -- Structured content (Claude Opus output)
    summary             TEXT,
    wealth_assessment   JSONB,   -- {band, confidence, basis, sources}
    philanthropy_record JSONB,   -- [{org, role, amount_est, year, source}]
    career_history      JSONB,   -- [{org, role, start, end, source}]
    network_highlights  JSONB,   -- [{person, relationship, source}]
    reputational_flags  JSONB,   -- [{flag_type, description, source}]
    honours_awards      TEXT,
    -- Human review
    reviewed_by         TEXT,
    reviewed_at         TIMESTAMPTZ,
    reviewer_notes      TEXT,
    -- Model metadata
    gather_model        TEXT DEFAULT 'claude-sonnet-4-6',
    synthesis_model     TEXT DEFAULT 'claude-opus-4-7',
    gather_tokens_in    INTEGER,
    gather_tokens_out   INTEGER,
    synthesis_tokens_in INTEGER,
    synthesis_tokens_out INTEGER,
    -- Lifecycle
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_dossiers_donor ON donor_dossiers (donor_sponsor_id);
CREATE INDEX idx_dossiers_status       ON donor_dossiers (status);
CREATE INDEX idx_dossiers_created_at   ON donor_dossiers (created_at DESC);

-- ============================================================
-- PIPELINE_RUN_LOG
-- One row per script invocation. Observability and cost tracking.
-- ============================================================
CREATE TABLE pipeline_run_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          TEXT NOT NULL,   -- caller-supplied UUID or timestamp string
    script_name     TEXT NOT NULL,   -- 'extract_charities','load_entities', etc.
    phase           TEXT,            -- 'batch_submit','batch_poll','load', etc.
    -- Scope
    records_attempted   INTEGER,
    records_succeeded   INTEGER,
    records_failed      INTEGER,
    -- API cost tracking
    llm_tokens_in       BIGINT,
    llm_tokens_out      BIGINT,
    llm_cost_usd        NUMERIC(10,4),
    embedding_calls     INTEGER,
    embedding_cost_usd  NUMERIC(10,4),
    -- Timing
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    duration_secs   REAL GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (completed_at - started_at))
    ) STORED,
    -- Outcome
    status          TEXT NOT NULL CHECK (status IN ('running','success','partial','failed')),
    error_summary   TEXT,
    -- Raw log (structured JSON for machine consumption)
    log_json        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_run_log_run_id      ON pipeline_run_log (run_id);
CREATE INDEX idx_run_log_script      ON pipeline_run_log (script_name);
CREATE INDEX idx_run_log_status      ON pipeline_run_log (status);
CREATE INDEX idx_run_log_started_at  ON pipeline_run_log (started_at DESC);

-- ============================================================
-- ROW-LEVEL TRIGGERS: keep updated_at current
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_persons_updated_at
    BEFORE UPDATE ON persons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_organisations_updated_at
    BEFORE UPDATE ON organisations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_person_org_roles_updated_at
    BEFORE UPDATE ON person_org_roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_donor_network_leads_updated_at
    BEFORE UPDATE ON donor_network_leads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_donor_dossiers_updated_at
    BEFORE UPDATE ON donor_dossiers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Note on `donors_sponsors` table:** This table already exists in Supabase with your internal records. The schema above references it by UUID foreign key. The only assumption is: it has a UUID primary key column named `id`. If the column is named differently, update the `REFERENCES donors_sponsors(id)` clauses accordingly before running the DDL.

---

## 2. Extraction Pipeline — Layer 1

**Script:** `pipeline/extract_charities.py`

### What it does

Sends each charity's `raw_markdown_text` to Claude Sonnet 4.6 via the Batch API. Returns structured JSON identifying persons, organisations, and roles mentioned in the document. The system prompt is cached across all 25k requests (50% cost saving on input tokens).

### JSON output schema (per charity document)

```json
{
  "charity_number": "string",
  "extraction_version": "1.0",
  "persons": [
    {
      "full_name": "string",
      "title": "string | null",
      "suffix": "string | null",
      "roles": [
        {
          "role_title": "string",
          "role_category": "trustee | director | chair | patron | ceo | cfo | coo | secretary | advisory_board | honorary | other",
          "org_name": "string",
          "org_type": "charity | company | llp | cio | foundation | trust | partnership | government | sports_club | other",
          "start_date": "YYYY-MM-DD | YYYY | null",
          "end_date": "YYYY-MM-DD | YYYY | null",
          "is_current": true
        }
      ],
      "wealth_signals": ["string"],
      "philanthropy_signals": ["string"],
      "honours": "string | null",
      "disambiguation_context": "string | null"
    }
  ],
  "organisations_mentioned": [
    {
      "name": "string",
      "org_type": "charity | company | llp | cio | foundation | trust | partnership | government | sports_club | other",
      "companies_house_no": "string | null",
      "charity_number": "string | null",
      "sector": "string | null"
    }
  ],
  "extraction_confidence": "high | medium | low",
  "extraction_notes": "string | null"
}
```

### Chunking strategy

The officer and trustee section in UK charity annual reports and markdown dumps is almost always in the first 6,000 tokens. Strategy: take the first 6,000 tokens of `raw_markdown_text` only. This is sufficient for extraction and avoids wasting tokens on financial narratives, impact reports, and boilerplate governance text that appears later.

If the document is under 6,000 tokens, send the whole document. Measure in tokens using `tiktoken` with `cl100k_base` (close enough for Claude tokenisation estimation; exact Claude tokenisation is not exposed via a public counting API).

Documents flagged `extraction_confidence: low` by Claude should be retried with the full document (up to 16,000 tokens) in a second pass.

### Cost estimate

**Input (system prompt, cached):**
- System prompt length: ~800 tokens
- Cache write: first call only; 25,000 cache reads thereafter
- Cache write cost: $3.00 per million tokens [verified — Anthropic pricing, May 2026]
- Cache read cost: $0.30 per million tokens [verified]
- 800 tokens × $0.30/1M = $0.00024 per request for cached system prompt

**Input (user message, not cached):**
- Average document first 6k tokens: ~4,000 tokens actual content (markdown compresses)
- Input token cost (Batch API): $1.50 per million tokens [verified — Sonnet 4.6 batch pricing]
- 4,000 tokens × $1.50/1M = $0.006 per document

**Output:**
- Structured JSON output per document: ~600 tokens estimated [my estimate — based on 5 persons × ~80 tokens each + schema overhead]
- Output token cost (Batch API): $7.50 per million tokens [verified]
- 600 tokens × $7.50/1M = $0.0045 per document

**Per-document total:** $0.006 + $0.0045 + $0.00024 ≈ **$0.011** per document

**5k run (MVP experiment):** 5,000 × $0.011 = **~$55**
**25k full corpus:** 25,000 × $0.011 = **~$275**

These are API costs only. Infrastructure (Supabase) is already paid.

### Script: `pipeline/extract_charities.py`

```python
#!/usr/bin/env python3
"""
Layer 1: Extract persons, orgs, and roles from charity markdown documents.
Uses Claude Sonnet 4.6 Batch API with system prompt caching.

Usage:
    python pipeline/extract_charities.py \
        --limit 5000 \
        --run-id exp_5k_2026_05_05 \
        --output-dir data/extractions/
"""

import argparse
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import anthropic
import tiktoken
from supabase import create_client, Client

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

MODEL = "claude-sonnet-4-6"
MAX_TOKENS_PER_DOC = 6000
BATCH_SIZE = 100          # Anthropic Batch API accepts up to 10k; keep smaller for manageability
RETRY_LIMIT = 3
LOW_CONFIDENCE_FULL_DOC_TOKENS = 16000

SYSTEM_PROMPT = """[SEE SECTION 10 FOR FULL SYSTEM PROMPT]"""

enc = tiktoken.get_encoding("cl100k_base")


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    tokens = enc.encode(text)
    if len(tokens) <= max_tokens:
        return text
    return enc.decode(tokens[:max_tokens])


def build_batch_requests(rows: list[dict], full_doc: bool = False) -> list[dict]:
    requests = []
    for row in rows:
        max_t = LOW_CONFIDENCE_FULL_DOC_TOKENS if full_doc else MAX_TOKENS_PER_DOC
        content = truncate_to_tokens(row["raw_markdown_text"] or "", max_t)
        requests.append({
            "custom_id": row["company_number"],
            "params": {
                "model": MODEL,
                "max_tokens": 1024,
                "system": [
                    {
                        "type": "text",
                        "text": SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"}
                    }
                ],
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            f"Charity number: {row['company_number']}\n\n"
                            f"Source URL: {row.get('company_house_url', 'unknown')}\n\n"
                            f"Document:\n\n{content}"
                        )
                    }
                ]
            }
        })
    return requests


def submit_batch(client: anthropic.Anthropic, requests: list[dict]) -> str:
    batch = client.messages.batches.create(requests=requests)
    return batch.id


def poll_batch(client: anthropic.Anthropic, batch_id: str, poll_interval: int = 60) -> list[dict]:
    """Poll until batch completes. Returns list of result dicts."""
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status == "ended":
            break
        print(f"  Batch {batch_id}: {batch.request_counts}")
        time.sleep(poll_interval)

    results = []
    for result in client.messages.batches.results(batch_id):
        results.append({
            "custom_id": result.custom_id,
            "result": result
        })
    return results


def parse_result(result_item: dict) -> dict | None:
    """Extract JSON from a successful batch result. Returns None on failure."""
    r = result_item["result"]
    if r.type == "error":
        return None
    try:
        text = r.message.content[0].text
        # Claude should return raw JSON. Strip markdown fences if present.
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except (json.JSONDecodeError, IndexError, AttributeError):
        return None


def save_results(results: list[dict], output_dir: Path, run_id: str) -> tuple[int, int, list[str]]:
    """Save parsed results to output_dir. Returns (success, fail, low_confidence_ids)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    success, fail, low_conf = 0, 0, []

    for item in results:
        charity_id = item["custom_id"]
        parsed = parse_result(item)
        if parsed is None:
            fail += 1
            (output_dir / f"{charity_id}.error.json").write_text(
                json.dumps({"error": str(item["result"]), "run_id": run_id})
            )
            continue

        (output_dir / f"{charity_id}.json").write_text(json.dumps(parsed, indent=2))
        success += 1
        if parsed.get("extraction_confidence") == "low":
            low_conf.append(charity_id)

    return success, fail, low_conf


def log_run(supabase: Client, run_id: str, script: str, phase: str,
            attempted: int, succeeded: int, failed: int,
            tokens_in: int = 0, tokens_out: int = 0,
            cost_usd: float = 0.0, status: str = "success",
            error: str = None):
    supabase.table("pipeline_run_log").insert({
        "run_id": run_id,
        "script_name": script,
        "phase": phase,
        "records_attempted": attempted,
        "records_succeeded": succeeded,
        "records_failed": failed,
        "llm_tokens_in": tokens_in,
        "llm_tokens_out": tokens_out,
        "llm_cost_usd": round(cost_usd, 4),
        "status": status,
        "error_summary": error,
        "completed_at": datetime.now(timezone.utc).isoformat()
    }).execute()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=5000)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--run-id", type=str, default=f"run_{int(time.time())}")
    parser.add_argument("--output-dir", type=str, default="data/extractions")
    parser.add_argument("--retry-low-confidence", action="store_true")
    args = parser.parse_args()

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    output_dir = Path(args.output_dir)

    # Fetch charity records
    print(f"Fetching {args.limit} charity records from offset {args.offset}...")
    response = (
        supabase.table("charities")
        .select("company_number, company_house_url, raw_markdown_text")
        .range(args.offset, args.offset + args.limit - 1)
        .execute()
    )
    rows = response.data
    print(f"Fetched {len(rows)} records.")

    # Skip already-extracted (idempotency)
    rows = [r for r in rows if not (output_dir / f"{r['company_number']}.json").exists()]
    print(f"{len(rows)} records need extraction (others already done).")

    if not rows:
        print("Nothing to do.")
        return

    total_success, total_fail = 0, 0
    all_low_conf = []

    # Process in batches
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i + BATCH_SIZE]
        print(f"Submitting batch {i//BATCH_SIZE + 1}: {len(chunk)} documents...")

        requests = build_batch_requests(chunk, full_doc=args.retry_low_confidence)
        batch_id = submit_batch(anthropic_client, requests)
        print(f"  Batch ID: {batch_id}. Polling (this takes up to 24h)...")

        results = poll_batch(anthropic_client, batch_id)
        success, fail, low_conf = save_results(results, output_dir, args.run_id)
        total_success += success
        total_fail += fail
        all_low_conf.extend(low_conf)
        print(f"  Done: {success} ok, {fail} failed, {len(low_conf)} low-confidence.")

    log_run(
        supabase, args.run_id, "extract_charities", "batch_full",
        len(rows), total_success, total_fail,
        status="success" if total_fail == 0 else "partial"
    )

    if all_low_conf:
        print(f"\n{len(all_low_conf)} low-confidence extractions. Re-run with --retry-low-confidence and filter to these IDs.")
        (output_dir / "low_confidence.json").write_text(json.dumps(all_low_conf))

    print(f"\nExtraction complete: {total_success} succeeded, {total_fail} failed.")


if __name__ == "__main__":
    main()
```

### Error handling

- Parse failures: saved as `.error.json` alongside successful extractions. Re-runnable: script skips files already present.
- API errors: the Batch API itself handles retries for transient errors. Per-request failures are surfaced in the result `type == "error"` field.
- Low-confidence flag: Claude sets `extraction_confidence: low` when the document lacks a clear officer section (e.g. very short doc, unusual format). These are re-queued automatically via `--retry-low-confidence` flag with a wider token window.
- Batch polling timeout: the Batch API returns within 24h. The poll loop runs until status is `ended` with no hard timeout — this is intentional given the 24h SLA.

---

## 3. Entity Loading Pipeline — Layer 2

Three scripts. Run in order: load → derive → match.

### 3.1 `pipeline/load_entities.py`

Reads extraction JSON files, upserts into `persons`, `organisations`, and `person_org_roles`.

```python
#!/usr/bin/env python3
"""
Layer 2a: Load extracted entities into structured Supabase tables.

Usage:
    python pipeline/load_entities.py \
        --extraction-dir data/extractions/ \
        --run-id exp_5k_2026_05_05
"""

import argparse
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

ROLE_CATEGORY_MAP = {
    "trustee": "trustee", "chair": "chair", "patron": "patron",
    "director": "director", "ceo": "ceo", "cfo": "cfo",
    "coo": "coo", "secretary": "secretary",
    "advisory board member": "advisory_board", "honorary": "honorary",
}

def normalise_role_category(title: str) -> str:
    t = title.lower().strip()
    for key, cat in ROLE_CATEGORY_MAP.items():
        if key in t:
            return cat
    return "other"


def parse_date(raw: str | None) -> str | None:
    """Convert 'YYYY', 'YYYY-MM-DD' or None to ISO date string or None."""
    if not raw:
        return None
    raw = raw.strip()
    if len(raw) == 4 and raw.isdigit():
        return f"{raw}-01-01"
    if len(raw) == 10:
        return raw
    return None


def upsert_organisation(supabase: Client, org: dict, source_charity_number: str) -> str:
    """Upsert organisation, return its UUID."""
    # Check by charity_number first, then by name similarity fallback
    existing = None
    if org.get("charity_number"):
        r = supabase.table("organisations").select("id").eq(
            "charity_number", org["charity_number"]
        ).maybe_single().execute()
        existing = r.data

    if not existing and org.get("companies_house_no"):
        r = supabase.table("organisations").select("id").eq(
            "companies_house_no", org["companies_house_no"]
        ).maybe_single().execute()
        existing = r.data

    record = {
        "name": org["name"],
        "org_type": org.get("org_type", "other"),
        "companies_house_no": org.get("companies_house_no"),
        "charity_number": org.get("charity_number"),
        "sector": org.get("sector"),
        "source_url": None,
        "retrieved_at": datetime.now(timezone.utc).isoformat()
    }

    if existing:
        supabase.table("organisations").update(record).eq("id", existing["id"]).execute()
        return existing["id"]
    else:
        record["id"] = str(uuid.uuid4())
        supabase.table("organisations").insert(record).execute()
        return record["id"]


def upsert_person(supabase: Client, person: dict, source_charity_number: str) -> str:
    """Insert a new person record. Always inserts (disambiguation model)."""
    person_id = str(uuid.uuid4())
    record = {
        "id": person_id,
        "full_name": person["full_name"],
        "title": person.get("title"),
        "suffix": person.get("suffix"),
        "honours": person.get("honours"),
        "disambiguation_context": person.get("disambiguation_context"),
        "source_charity_number": source_charity_number,
        "wealth_band": "unknown",
        "philanthropy_signal": "unknown",
    }

    # Extract philanthropy / wealth signals from free-text lists
    wealth_signals = person.get("wealth_signals", [])
    philanthropy_signals = person.get("philanthropy_signals", [])
    if philanthropy_signals:
        record["philanthropy_notes"] = "; ".join(philanthropy_signals)
        record["philanthropy_signal"] = "possible"
    if wealth_signals:
        record["wealth_source_notes"] = "; ".join(wealth_signals)

    supabase.table("persons").insert(record).execute()
    return person_id


def load_extraction(supabase: Client, extraction: dict) -> tuple[int, int, int]:
    """Load one extraction JSON. Returns (persons_added, orgs_added, roles_added)."""
    charity_number = extraction.get("charity_number", "unknown")
    persons_added, orgs_added, roles_added = 0, 0, 0

    # Load organisations mentioned
    org_id_map: dict[str, str] = {}
    for org in extraction.get("organisations_mentioned", []):
        org_id = upsert_organisation(supabase, org, charity_number)
        org_id_map[org["name"]] = org_id
        orgs_added += 1

    # Load persons and their roles
    for person in extraction.get("persons", []):
        person_id = upsert_person(supabase, person, charity_number)
        persons_added += 1

        for role in person.get("roles", []):
            org_name = role.get("org_name", "")
            # Find or create org
            if org_name in org_id_map:
                org_id = org_id_map[org_name]
            else:
                synthetic_org = {
                    "name": org_name,
                    "org_type": role.get("org_type", "other")
                }
                org_id = upsert_organisation(supabase, synthetic_org, charity_number)
                org_id_map[org_name] = org_id
                orgs_added += 1

            role_record = {
                "id": str(uuid.uuid4()),
                "person_id": person_id,
                "org_id": org_id,
                "role_title": role["role_title"],
                "role_category": normalise_role_category(role["role_title"]),
                "start_date": parse_date(role.get("start_date")),
                "end_date": parse_date(role.get("end_date")),
                "is_current": role.get("is_current", True),
                "source_type": "markdown_extraction",
                "source_url": extraction.get("source_url"),
                "retrieved_at": datetime.now(timezone.utc).isoformat()
            }
            supabase.table("person_org_roles").insert(role_record).execute()
            roles_added += 1

    return persons_added, orgs_added, roles_added


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--extraction-dir", type=str, required=True)
    parser.add_argument("--run-id", type=str, default=f"run_{int(time.time())}")
    args = parser.parse_args()

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    extraction_dir = Path(args.extraction_dir)

    files = list(extraction_dir.glob("*.json"))
    files = [f for f in files if not f.name.endswith(".error.json")
             and not f.name.endswith("low_confidence.json")]
    print(f"Loading {len(files)} extraction files...")

    total_persons, total_orgs, total_roles, failures = 0, 0, 0, 0

    for f in files:
        try:
            data = json.loads(f.read_text())
            p, o, r = load_extraction(supabase, data)
            total_persons += p
            total_orgs += o
            total_roles += r
        except Exception as e:
            print(f"  ERROR loading {f.name}: {e}")
            failures += 1

    print(f"Done: {total_persons} persons, {total_orgs} orgs, {total_roles} roles. {failures} failures.")

    supabase.table("pipeline_run_log").insert({
        "run_id": args.run_id,
        "script_name": "load_entities",
        "phase": "load",
        "records_attempted": len(files),
        "records_succeeded": len(files) - failures,
        "records_failed": failures,
        "status": "success" if failures == 0 else "partial",
        "completed_at": datetime.now(timezone.utc).isoformat()
    }).execute()


if __name__ == "__main__":
    main()
```

### 3.2 `pipeline/derive_connections.py`

SQL-driven. Joins `person_org_roles` to produce `person_connections` rows for persons who share org memberships.

```python
#!/usr/bin/env python3
"""
Layer 2b: Derive person_connections from shared org memberships.
Run after load_entities.py completes.

Usage:
    python pipeline/derive_connections.py --run-id exp_5k_2026_05_05
"""

import argparse
import os
import time
from datetime import datetime, timezone

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# SQL: find all pairs of persons sharing the same org, with connection type.
# LEAST/GREATEST ensures person_a_id < person_b_id (matches the CHECK constraint).
DERIVE_SQL = """
INSERT INTO person_connections (
    id, person_a_id, person_b_id, via_org_id,
    connection_type, overlap_start, overlap_end, is_current, derived_at
)
SELECT
    gen_random_uuid(),
    LEAST(a.person_id, b.person_id)    AS person_a_id,
    GREATEST(a.person_id, b.person_id) AS person_b_id,
    a.org_id                           AS via_org_id,
    CASE
        WHEN 'trustee' IN (a.role_category, b.role_category) THEN 'co_trustee'
        WHEN 'director' IN (a.role_category, b.role_category) THEN 'co_director'
        WHEN 'patron' IN (a.role_category, b.role_category) THEN 'co_patron'
        WHEN 'advisory_board' IN (a.role_category, b.role_category) THEN 'co_advisory'
        ELSE 'other'
    END                                AS connection_type,
    GREATEST(a.start_date, b.start_date) AS overlap_start,
    LEAST(
        COALESCE(a.end_date, CURRENT_DATE),
        COALESCE(b.end_date, CURRENT_DATE)
    )                                  AS overlap_end,
    (a.is_current AND b.is_current)    AS is_current,
    NOW()                              AS derived_at
FROM person_org_roles a
JOIN person_org_roles b
    ON a.org_id = b.org_id
    AND a.person_id <> b.person_id
    AND a.person_id < b.person_id   -- avoid duplicates before LEAST/GREATEST
WHERE
    -- Only connect if temporal overlap exists (or both have no dates — assume overlap)
    (
        a.start_date IS NULL OR b.start_date IS NULL
        OR a.start_date <= COALESCE(b.end_date, CURRENT_DATE)
    )
    AND (
        b.start_date IS NULL OR a.start_date IS NULL
        OR b.start_date <= COALESCE(a.end_date, CURRENT_DATE)
    )
ON CONFLICT (person_a_id, person_b_id, via_org_id) DO UPDATE
    SET
        is_current  = EXCLUDED.is_current,
        derived_at  = EXCLUDED.derived_at,
        overlap_end = EXCLUDED.overlap_end;
"""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", type=str, default=f"run_{int(time.time())}")
    args = parser.parse_args()

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("Deriving person connections from shared org memberships...")

    # Supabase client exposes .rpc() for stored procedures.
    # For raw SQL we use the postgrest rpc or direct psycopg2.
    # Simplest approach: expose this as a Supabase RPC function.
    # Alternatively, use psycopg2 directly with DATABASE_URL.
    import psycopg2
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(DERIVE_SQL)
    rows_affected = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()

    print(f"Derived {rows_affected} connection rows (upserted).")

    supabase.table("pipeline_run_log").insert({
        "run_id": args.run_id,
        "script_name": "derive_connections",
        "phase": "derive",
        "records_attempted": rows_affected,
        "records_succeeded": rows_affected,
        "records_failed": 0,
        "status": "success",
        "completed_at": datetime.now(timezone.utc).isoformat()
    }).execute()


if __name__ == "__main__":
    main()
```

**Env var needed:** `DATABASE_URL` — the Supabase direct Postgres connection string (available from Supabase dashboard → Settings → Database → Connection string → URI mode).

### 3.3 `pipeline/match_donors.py`

Fuzzy-matches extracted `persons` to `donors_sponsors` using `pg_trgm` trigram similarity. Threshold: 0.7. When a match is found, sets `persons.donor_sponsor_id` and `persons.match_score`. When name match is ambiguous (multiple candidates above threshold), creates the match only if one candidate is distinctly higher (delta > 0.05); otherwise logs for human review.

```python
#!/usr/bin/env python3
"""
Layer 2c: Fuzzy-match extracted persons to donors_sponsors table.
Uses pg_trgm similarity >= 0.7. Disambiguation: highest unique match wins.

Usage:
    python pipeline/match_donors.py --run-id exp_5k_2026_05_05
"""

import argparse
import os
import time
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]

SIMILARITY_THRESHOLD = 0.7
DISAMBIGUATION_DELTA = 0.05   # If top match leads next by less than this, flag as ambiguous

MATCH_SQL = """
SELECT
    p.id        AS person_id,
    p.full_name AS person_name,
    d.id        AS donor_id,
    d.full_name AS donor_name,
    similarity(p.full_name, d.full_name) AS sim
FROM persons p
CROSS JOIN donors_sponsors d
WHERE
    p.donor_sponsor_id IS NULL           -- not already matched
    AND similarity(p.full_name, d.full_name) >= %(threshold)s
ORDER BY p.id, sim DESC;
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", type=str, default=f"run_{int(time.time())}")
    args = parser.parse_args()

    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
    cur = conn.cursor()

    print(f"Running trigram match at threshold {SIMILARITY_THRESHOLD}...")
    cur.execute(MATCH_SQL, {"threshold": SIMILARITY_THRESHOLD})
    rows = cur.fetchall()

    # Group by person_id
    from collections import defaultdict
    by_person: dict = defaultdict(list)
    for row in rows:
        by_person[row["person_id"]].append(dict(row))

    matched, ambiguous, skipped = 0, 0, 0

    for person_id, candidates in by_person.items():
        candidates.sort(key=lambda x: x["sim"], reverse=True)
        best = candidates[0]

        if len(candidates) == 1:
            # Unambiguous
            cur.execute(
                "UPDATE persons SET donor_sponsor_id = %s, match_score = %s WHERE id = %s",
                (best["donor_id"], best["sim"], person_id)
            )
            matched += 1
        else:
            second = candidates[1]
            if best["sim"] - second["sim"] >= DISAMBIGUATION_DELTA:
                # Clearly best match
                cur.execute(
                    "UPDATE persons SET donor_sponsor_id = %s, match_score = %s WHERE id = %s",
                    (best["donor_id"], best["sim"], person_id)
                )
                matched += 1
            else:
                # Ambiguous — log for human review, do not auto-assign
                print(
                    f"  AMBIGUOUS: '{best['person_name']}' — "
                    f"top match '{best['donor_name']}' ({best['sim']:.3f}) vs "
                    f"'{second['donor_name']}' ({second['sim']:.3f})"
                )
                ambiguous += 1

    conn.commit()
    cur.close()
    conn.close()

    print(f"Match complete: {matched} matched, {ambiguous} ambiguous (need review), {skipped} skipped.")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    supabase.table("pipeline_run_log").insert({
        "run_id": args.run_id,
        "script_name": "match_donors",
        "phase": "match",
        "records_attempted": len(by_person),
        "records_succeeded": matched,
        "records_failed": ambiguous,
        "status": "success",
        "error_summary": f"{ambiguous} ambiguous matches require human review",
        "completed_at": datetime.now(timezone.utc).isoformat()
    }).execute()


if __name__ == "__main__":
    main()
```

**Note on `donors_sponsors.full_name`:** This SQL assumes the `donors_sponsors` table has a `full_name` text column. If your table uses separate `first_name`/`last_name`, change the match column to `CONCAT(first_name, ' ', last_name)` or add a generated column.

---

## 4. Augmentation Pipeline — Layer 3

**Script:** `pipeline/augment_donors.py`

### What it does

For each donor/sponsor in `donors_sponsors` who lacks an approved dossier in `donor_dossiers`, runs a two-phase LLM workflow:

1. **Gather phase** — Claude Sonnet 4.6 with `web_search` tool queries the sources listed below and returns a research dump as structured JSON.
2. **Synthesis phase** — Claude Opus 4.7 (no tools) reads the gathered JSON and produces a structured `donor_dossiers` record.

For donors who already have a dossier in their `donors_sponsors` record (the 40% with existing markdown dossiers), the existing content is fed directly into the synthesis phase — no web search needed.

### Research sources (agents must query all applicable)

The gather prompt (Section 10) instructs Claude to search these sources in order:

| Source | Purpose | Query pattern |
|---|---|---|
| 360Giving GrantNav | Philanthropic giving record | `site:grantnav.threesixtygiving.org "{name}"` |
| Gov.uk Honours Lists | Honours / CBE / OBE | `site:gov.uk/honours-lists "{name}"` |
| The Gazette (thegazette.co.uk) | Probate, insolvencies, appointments, notices | `site:thegazette.co.uk "{name}"` |
| Companies House (web) | Director and PSC roles | `site:find-and-update.company-information.service.gov.uk "{name}"` |
| OSCR | Scottish charity trusteeships | `site:oscr.org.uk "{name}"` |
| OpenCorporates | Global corporate roles | `site:opencorporates.com "{name}"` |
| Guardian/FT/Times public archives | Donations, profiles, philanthropy mentions | `site:theguardian.com "{name}" donation OR philanthropy` |
| PRNewswire/BusinessWire UK | Press releases, corporate announcements | `site:prnewswire.com "{name}" OR site:businesswire.com "{name}"` |
| LinkedIn (web search) | Professional profile, current role | `site:linkedin.com/in/ "{name}"` |
| Wayback Machine | Archived charity patron/donor lists | `site:web.archive.org "{name}" trustee OR patron OR donor` |
| Charity Commission annual returns | Named trustee at orgs not in current register | `site:register-of-charities.charitycommission.gov.uk "{name}"` |

### Script: `pipeline/augment_donors.py`

```python
#!/usr/bin/env python3
"""
Layer 3: Augment donor/sponsor records via two-phase LLM research.
Phase 1: Claude Sonnet 4.6 + web_search gathers public data.
Phase 2: Claude Opus 4.7 synthesises into structured dossier.

Usage:
    python pipeline/augment_donors.py \
        --limit 50 \
        --run-id exp_5k_2026_05_05 \
        --skip-with-existing-dossier
"""

import argparse
import json
import os
import time
import uuid
from datetime import datetime, timezone

import anthropic
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

GATHER_MODEL = "claude-sonnet-4-6"
SYNTHESIS_MODEL = "claude-opus-4-7"

# See Section 10 for full prompt text
GATHER_SYSTEM = """[SEE SECTION 10 — DONOR DOSSIER RESEARCH GATHER PROMPT]"""
SYNTHESIS_SYSTEM = """[SEE SECTION 10 — DONOR DOSSIER SYNTHESIS PROMPT]"""


def gather_research(client: anthropic.Anthropic, donor: dict) -> tuple[dict, dict]:
    """Phase 1: Gather research using web_search tool. Returns (gathered_data, usage)."""
    name = donor.get("full_name") or f"{donor.get('first_name','')} {donor.get('last_name','')}".strip()

    user_msg = (
        f"Research this donor for the Bloomsbury Football Foundation fundraising team.\n\n"
        f"Full name: {name}\n"
        f"Known context: {json.dumps({k: v for k, v in donor.items() if k != 'raw_markdown_text'}, indent=2)}\n\n"
        f"Existing dossier content (if any):\n{donor.get('raw_markdown_text') or 'None'}"
    )

    response = client.messages.create(
        model=GATHER_MODEL,
        max_tokens=4096,
        system=GATHER_SYSTEM,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
        messages=[{"role": "user", "content": user_msg}]
    )

    # Collect all text content blocks
    gathered_text = "\n\n".join(
        block.text for block in response.content
        if hasattr(block, "text")
    )

    usage = {
        "tokens_in": response.usage.input_tokens,
        "tokens_out": response.usage.output_tokens
    }

    # Parse as JSON if Claude returned JSON, otherwise wrap in dict
    try:
        gathered_data = json.loads(gathered_text)
    except json.JSONDecodeError:
        gathered_data = {"raw_research": gathered_text}

    return gathered_data, usage


def synthesise_dossier(client: anthropic.Anthropic, donor: dict, gathered: dict) -> tuple[dict, dict]:
    """Phase 2: Synthesise gathered research into structured dossier. Returns (dossier, usage)."""
    name = donor.get("full_name") or f"{donor.get('first_name','')} {donor.get('last_name','')}".strip()

    user_msg = (
        f"Synthesise a structured dossier for: {name}\n\n"
        f"Gathered research:\n{json.dumps(gathered, indent=2)}\n\n"
        f"Internal record:\n{json.dumps({k: v for k, v in donor.items() if k != 'raw_markdown_text'}, indent=2)}"
    )

    response = client.messages.create(
        model=SYNTHESIS_MODEL,
        max_tokens=2048,
        system=SYNTHESIS_SYSTEM,
        messages=[{"role": "user", "content": user_msg}]
    )

    text = response.content[0].text
    try:
        dossier = json.loads(text)
    except json.JSONDecodeError:
        dossier = {"summary": text, "parse_error": True}

    usage = {
        "tokens_in": response.usage.input_tokens,
        "tokens_out": response.usage.output_tokens
    }

    return dossier, usage


def save_dossier(supabase: Client, donor_id: str, dossier: dict,
                 gathered: dict, gather_usage: dict, synth_usage: dict,
                 sources: list):
    """Upsert dossier record with status='pending_review'."""
    record = {
        "donor_sponsor_id": donor_id,
        "status": "pending_review",
        "research_sources": sources,
        "summary": dossier.get("summary"),
        "wealth_assessment": dossier.get("wealth_assessment"),
        "philanthropy_record": dossier.get("philanthropy_record"),
        "career_history": dossier.get("career_history"),
        "network_highlights": dossier.get("network_highlights"),
        "reputational_flags": dossier.get("reputational_flags"),
        "honours_awards": dossier.get("honours_awards"),
        "gather_model": GATHER_MODEL,
        "synthesis_model": SYNTHESIS_MODEL,
        "gather_tokens_in": gather_usage["tokens_in"],
        "gather_tokens_out": gather_usage["tokens_out"],
        "synthesis_tokens_in": synth_usage["tokens_in"],
        "synthesis_tokens_out": synth_usage["tokens_out"],
    }

    # Upsert on donor_sponsor_id
    existing = supabase.table("donor_dossiers").select("id").eq(
        "donor_sponsor_id", donor_id
    ).maybe_single().execute()

    if existing.data:
        supabase.table("donor_dossiers").update(record).eq(
            "donor_sponsor_id", donor_id
        ).execute()
    else:
        record["id"] = str(uuid.uuid4())
        supabase.table("donor_dossiers").insert(record).execute()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--run-id", type=str, default=f"run_{int(time.time())}")
    parser.add_argument("--skip-with-existing-dossier", action="store_true")
    args = parser.parse_args()

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Fetch donors needing dossiers
    query = supabase.table("donors_sponsors").select("*").limit(args.limit)
    if args.skip_with_existing_dossier:
        # Filter out those already with an approved dossier
        existing_ids = [
            r["donor_sponsor_id"]
            for r in supabase.table("donor_dossiers")
            .select("donor_sponsor_id")
            .eq("status", "approved")
            .execute().data
        ]
        if existing_ids:
            query = query.not_.in_("id", existing_ids)

    donors = query.execute().data
    print(f"Processing {len(donors)} donors...")

    total_tokens_in, total_tokens_out, total_cost = 0, 0, 0.0
    succeeded, failed = 0, 0

    for donor in donors:
        name = donor.get("full_name") or "unknown"
        print(f"  Processing: {name}")
        try:
            gathered, g_usage = gather_research(client, donor)
            dossier, s_usage = synthesise_dossier(client, donor, gathered)
            save_dossier(
                supabase, donor["id"], dossier, gathered,
                g_usage, s_usage,
                sources=gathered.get("sources", [])
            )
            total_tokens_in += g_usage["tokens_in"] + s_usage["tokens_in"]
            total_tokens_out += g_usage["tokens_out"] + s_usage["tokens_out"]
            succeeded += 1
        except Exception as e:
            print(f"    ERROR: {e}")
            failed += 1

        # Respect rate limits
        time.sleep(0.5)

    # Cost estimate (Sonnet gather + Opus synthesis)
    # Sonnet: $3/1M in, $15/1M out (non-batch, real-time for augmentation)
    # Opus: $15/1M in, $75/1M out
    # Rough split: ~60% Sonnet tokens, 40% Opus tokens [my estimate]
    gather_cost = (total_tokens_in * 0.6 / 1e6 * 3.0) + (total_tokens_out * 0.6 / 1e6 * 15.0)
    synth_cost = (total_tokens_in * 0.4 / 1e6 * 15.0) + (total_tokens_out * 0.4 / 1e6 * 75.0)
    total_cost = gather_cost + synth_cost

    supabase.table("pipeline_run_log").insert({
        "run_id": args.run_id,
        "script_name": "augment_donors",
        "phase": "augment",
        "records_attempted": len(donors),
        "records_succeeded": succeeded,
        "records_failed": failed,
        "llm_tokens_in": total_tokens_in,
        "llm_tokens_out": total_tokens_out,
        "llm_cost_usd": round(total_cost, 4),
        "status": "success" if failed == 0 else "partial",
        "completed_at": datetime.now(timezone.utc).isoformat()
    }).execute()

    print(f"Done: {succeeded} succeeded, {failed} failed. Est. cost: ${total_cost:.2f}")


if __name__ == "__main__":
    main()
```

---

## 5. Embedding Pipeline — Layer 4

**Script:** `pipeline/embed_chunks.py`

Embeds person and organisation summaries using `text-embedding-3-small` (1536 dimensions). Does not embed raw markdown — only clean, synthesised summaries produced by the extraction and augmentation layers.

### What gets embedded

- **Persons:** A 2–3 sentence summary constructed from `full_name`, `title`, `suffix`, `disambiguation_context`, `philanthropy_notes`, `wealth_source_notes`, `honours`, and their top 3 current roles from `person_org_roles`.
- **Organisations:** Name + `org_type` + `sector` + top 5 current trustees (names only).

### Chunk size

400 tokens maximum, 50 token overlap. For persons and orgs, the summary typically fits in a single chunk. Multi-chunk behaviour activates for any entity whose summary exceeds 400 tokens (e.g. a person with 20+ trustee roles).

```python
#!/usr/bin/env python3
"""
Layer 4: Embed person and organisation summaries into knowledge_chunks.
Uses text-embedding-3-small (1536 dims).

Usage:
    python pipeline/embed_chunks.py \
        --entity-type person \
        --run-id exp_5k_2026_05_05
"""

import argparse
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Generator

import openai
import tiktoken
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

EMBED_MODEL = "text-embedding-3-small"
CHUNK_TOKENS = 400
CHUNK_OVERLAP = 50
BATCH_SIZE = 100   # OpenAI embeddings API allows up to 2048 inputs per call

enc = tiktoken.get_encoding("cl100k_base")


def chunk_text(text: str) -> list[str]:
    tokens = enc.encode(text)
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + CHUNK_TOKENS, len(tokens))
        chunks.append(enc.decode(tokens[start:end]))
        if end == len(tokens):
            break
        start = end - CHUNK_OVERLAP
    return chunks


def build_person_summary(supabase: Client, person: dict) -> str:
    roles = supabase.table("person_org_roles").select(
        "role_title, organisations(name)"
    ).eq("person_id", person["id"]).eq("is_current", True).limit(5).execute().data

    role_parts = [
        f"{r['role_title']} at {r['organisations']['name']}"
        for r in roles if r.get("organisations")
    ]

    parts = []
    name = " ".join(filter(None, [person.get("title"), person["full_name"], person.get("suffix")]))
    parts.append(name)
    if person.get("disambiguation_context"):
        parts.append(person["disambiguation_context"])
    if role_parts:
        parts.append("Roles: " + "; ".join(role_parts))
    if person.get("philanthropy_notes"):
        parts.append("Philanthropy: " + person["philanthropy_notes"])
    if person.get("wealth_source_notes"):
        parts.append("Wealth signals: " + person["wealth_source_notes"])
    if person.get("honours"):
        parts.append("Honours: " + person["honours"])

    return " | ".join(parts)


def build_org_summary(supabase: Client, org: dict) -> str:
    trustees = supabase.table("person_org_roles").select(
        "persons(full_name)"
    ).eq("org_id", org["id"]).eq("is_current", True).limit(5).execute().data

    trustee_names = [t["persons"]["full_name"] for t in trustees if t.get("persons")]

    parts = [org["name"], f"Type: {org['org_type']}"]
    if org.get("sector"):
        parts.append(f"Sector: {org['sector']}")
    if org.get("income_band"):
        parts.append(f"Income band: {org['income_band']}")
    if trustee_names:
        parts.append("Current trustees: " + ", ".join(trustee_names))

    return " | ".join(parts)


def embed_batch(client: openai.OpenAI, texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [r.embedding for r in response.data]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entity-type", choices=["person", "organisation", "both"], default="both")
    parser.add_argument("--run-id", type=str, default=f"run_{int(time.time())}")
    args = parser.parse_args()

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)

    entity_types = ["person", "organisation"] if args.entity_type == "both" else [args.entity_type]

    total_chunks, total_calls = 0, 0

    for etype in entity_types:
        table = "persons" if etype == "person" else "organisations"
        entities = supabase.table(table).select("*").execute().data
        print(f"Embedding {len(entities)} {etype} records...")

        # Remove already-embedded
        entities = [
            e for e in entities
            if not supabase.table("knowledge_chunks")
            .select("id").eq("entity_type", etype)
            .eq("entity_id", e["id"]).limit(1).execute().data
        ]
        print(f"  {len(entities)} without embeddings.")

        pending_texts, pending_meta = [], []

        for entity in entities:
            if etype == "person":
                summary = build_person_summary(supabase, entity)
            else:
                summary = build_org_summary(supabase, entity)

            chunks = chunk_text(summary)
            for idx, chunk in enumerate(chunks):
                pending_texts.append(chunk)
                pending_meta.append({
                    "entity_type": etype,
                    "entity_id": entity["id"],
                    "chunk_index": idx,
                    "chunk_text": chunk,
                    "token_count": len(enc.encode(chunk))
                })

        # Embed in batches
        for i in range(0, len(pending_texts), BATCH_SIZE):
            batch_texts = pending_texts[i:i + BATCH_SIZE]
            batch_meta = pending_meta[i:i + BATCH_SIZE]
            embeddings = embed_batch(openai_client, batch_texts)
            total_calls += 1

            records = [
                {
                    "id": str(uuid.uuid4()),
                    "entity_type": meta["entity_type"],
                    "entity_id": meta["entity_id"],
                    "chunk_index": meta["chunk_index"],
                    "chunk_text": meta["chunk_text"],
                    "token_count": meta["token_count"],
                    "embedding": emb,
                    "model_name": EMBED_MODEL,
                    "embedded_at": datetime.now(timezone.utc).isoformat()
                }
                for meta, emb in zip(batch_meta, embeddings)
            ]
            supabase.table("knowledge_chunks").insert(records).execute()
            total_chunks += len(records)
            print(f"  Embedded batch {i//BATCH_SIZE + 1}: {len(records)} chunks")

    # Cost: text-embedding-3-small = $0.02 per 1M tokens [verified]
    total_tokens = sum(len(enc.encode(t)) for t in pending_texts)
    cost_usd = total_tokens / 1e6 * 0.02

    supabase.table("pipeline_run_log").insert({
        "run_id": args.run_id,
        "script_name": "embed_chunks",
        "phase": "embed",
        "records_attempted": len(pending_texts),
        "records_succeeded": total_chunks,
        "records_failed": 0,
        "embedding_calls": total_calls,
        "embedding_cost_usd": round(cost_usd, 4),
        "status": "success",
        "completed_at": datetime.now(timezone.utc).isoformat()
    }).execute()

    print(f"Done: {total_chunks} chunks across {total_calls} API calls. Est. cost: ${cost_usd:.4f}")


if __name__ == "__main__":
    main()
```

### Embedding cost estimate

- Persons: 5,000 records × ~200 tokens avg summary = 1,000,000 tokens → $0.02 [verified]
- Organisations: 15,000 unique orgs × ~100 tokens = 1,500,000 tokens → $0.03 [verified]
- **Total for 5k experiment: ~$0.05** — negligible.

---

## 6. Lead Surface — Layer 5

**Script:** `pipeline/score_leads.py`

### Scoring formula v1

For each (donor, candidate) pair reachable within 3 hops in `person_connections`:

```
score = (hop_score × 0.4) + (wealth_score × 0.35) + (philanthropy_score × 0.25)
```

**hop_score** (0–100):
- hop_count = 1 → 100
- hop_count = 2 → 60
- hop_count = 3 → 30
- hop_count > 3 → 0 (excluded from lead surface)

**wealth_score** (0–100):
- `over_100m` → 100
- `25m_100m` → 85
- `5m_25m` → 65
- `1m_5m` → 40
- `under_1m` → 10
- `unknown` → 25 (default — we cannot confirm absence of wealth)

**philanthropy_score** (0–100):
- `confirmed` → 100
- `probable` → 70
- `possible` → 40
- `none` → 0
- `unknown` → 20

### SQL query template for "leads for donor X"

```sql
-- Leads for a given anchor donor, ranked by score.
-- Replace :anchor_donor_id with the donors_sponsors.id UUID.
SELECT
    dnl.id,
    dnl.score,
    dnl.reason_1,
    dnl.reason_2,
    dnl.reason_3,
    dnl.lead_status,
    dnl.connection_path,
    p.full_name        AS candidate_name,
    p.title            AS candidate_title,
    p.suffix           AS candidate_suffix,
    p.wealth_band,
    p.philanthropy_signal,
    p.philanthropy_notes,
    p.wealth_source_notes,
    p.honours,
    ip.full_name       AS introducer_name,
    dnl.hop_count_score,
    dnl.wealth_score,
    dnl.philanthropy_score,
    dnl.scored_at
FROM donor_network_leads dnl
JOIN persons p  ON p.id  = dnl.candidate_person_id
LEFT JOIN persons ip ON ip.id = dnl.introducer_person_id
WHERE dnl.anchor_donor_id = :anchor_donor_id
  AND dnl.lead_status NOT IN ('rejected', 'stale')
ORDER BY dnl.score DESC
LIMIT 50;
```

### View definition for fundraising team consumption

```sql
CREATE OR REPLACE VIEW v_top_leads AS
SELECT
    ds.id                               AS donor_id,
    ds.full_name                        AS donor_name,
    dnl.id                              AS lead_id,
    dnl.score,
    CASE
        WHEN dnl.score >= 75 THEN 'High'
        WHEN dnl.score >= 40 THEN 'Medium'
        ELSE 'Low'
    END                                 AS score_tier,
    dnl.reason_1,
    dnl.reason_2,
    dnl.reason_3,
    p.full_name                         AS candidate_name,
    p.wealth_band,
    p.philanthropy_signal,
    ip.full_name                        AS introducer_name,
    dnl.lead_status,
    dnl.scored_at
FROM donor_network_leads dnl
JOIN donors_sponsors ds ON ds.id = dnl.anchor_donor_id
JOIN persons p          ON p.id  = dnl.candidate_person_id
LEFT JOIN persons ip    ON ip.id  = dnl.introducer_person_id
WHERE dnl.lead_status NOT IN ('rejected', 'stale')
ORDER BY dnl.score DESC;
```

### Script: `pipeline/score_leads.py`

```python
#!/usr/bin/env python3
"""
Layer 5: Score and surface leads for each donor.
Reads person_connections graph, scores candidates, writes to donor_network_leads.

Usage:
    python pipeline/score_leads.py --run-id exp_5k_2026_05_05
"""

import argparse
import json
import os
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]

MAX_HOPS = 3
HOP_SCORES = {1: 100, 2: 60, 3: 30}
WEALTH_SCORES = {
    "over_100m": 100, "25m_100m": 85, "5m_25m": 65,
    "1m_5m": 40, "under_1m": 10, "unknown": 25
}
PHILANTHROPY_SCORES = {
    "confirmed": 100, "probable": 70, "possible": 40, "none": 0, "unknown": 20
}
WEIGHT_HOP = 0.40
WEIGHT_WEALTH = 0.35
WEIGHT_PHILANTHROPY = 0.25


def build_adjacency(cur) -> dict[str, list[tuple[str, str, str]]]:
    """Load person_connections into adjacency list. Returns {person_id: [(neighbour_id, via_org_id, connection_type)]}."""
    cur.execute("SELECT person_a_id, person_b_id, via_org_id, connection_type FROM person_connections")
    adj = defaultdict(list)
    for row in cur.fetchall():
        adj[row["person_a_id"]].append((row["person_b_id"], row["via_org_id"], row["connection_type"]))
        adj[row["person_b_id"]].append((row["person_a_id"], row["via_org_id"], row["connection_type"]))
    return adj


def bfs_from(seed_person_id: str, adj: dict, max_hops: int) -> dict[str, dict]:
    """BFS from seed. Returns {person_id: {hop_count, path}}."""
    visited = {seed_person_id: {"hop_count": 0, "path": []}}
    queue = deque([seed_person_id])
    while queue:
        current = queue.popleft()
        current_hop = visited[current]["hop_count"]
        if current_hop >= max_hops:
            continue
        for neighbour, via_org, conn_type in adj.get(current, []):
            if neighbour not in visited:
                path = visited[current]["path"] + [{"person_id": current, "via_org_id": via_org, "connection_type": conn_type, "hop": current_hop + 1}]
                visited[neighbour] = {"hop_count": current_hop + 1, "path": path}
                queue.append(neighbour)
    return visited


def compute_score(hop_count: int, wealth_band: str, philanthropy_signal: str) -> tuple[float, float, float, float]:
    hop_s = HOP_SCORES.get(hop_count, 0)
    wealth_s = WEALTH_SCORES.get(wealth_band or "unknown", 25)
    phil_s = PHILANTHROPY_SCORES.get(philanthropy_signal or "unknown", 20)
    score = (hop_s * WEIGHT_HOP) + (wealth_s * WEIGHT_WEALTH) + (phil_s * WEIGHT_PHILANTHROPY)
    return round(score, 2), float(hop_s), float(wealth_s), float(phil_s)


def build_reasons(hop_count: int, wealth_band: str, philanthropy_signal: str,
                  philanthropy_notes: str, via_org_name: str) -> tuple[str, str, str]:
    r1 = f"{hop_count}-hop connection" + (f" via {via_org_name}" if via_org_name else "")
    r2 = f"Wealth band: {wealth_band.replace('_', '–')}".replace("m", "m GBP")
    r3 = f"Philanthropy signal: {philanthropy_signal}" + (f" — {philanthropy_notes[:80]}" if philanthropy_notes else "")
    return r1, r2, r3


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", type=str, default=f"run_{int(time.time())}")
    args = parser.parse_args()

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
    cur = conn.cursor()

    print("Loading adjacency graph...")
    adj = build_adjacency(cur)
    print(f"  {len(adj)} persons in graph.")

    # Get all donors with matched person records
    cur.execute("""
        SELECT ds.id AS donor_id, p.id AS person_id
        FROM donors_sponsors ds
        JOIN persons p ON p.donor_sponsor_id = ds.id
        WHERE p.match_confirmed = TRUE OR p.match_score >= 0.80
    """)
    donor_person_pairs = cur.fetchall()
    print(f"Processing {len(donor_person_pairs)} donor–person pairs...")

    # Get all candidate persons with wealth/philanthropy data
    cur.execute("SELECT id, wealth_band, philanthropy_signal, philanthropy_notes FROM persons")
    person_data = {row["id"]: dict(row) for row in cur.fetchall()}

    # Get org names for path rendering
    cur.execute("SELECT id, name FROM organisations")
    org_names = {row["id"]: row["name"] for row in cur.fetchall()}

    total_leads = 0

    for pair in donor_person_pairs:
        donor_id = pair["donor_id"]
        seed_person_id = pair["person_id"]

        reachable = bfs_from(seed_person_id, adj, MAX_HOPS)

        records = []
        for candidate_id, info in reachable.items():
            if candidate_id == seed_person_id:
                continue
            hop = info["hop_count"]
            if hop > MAX_HOPS:
                continue

            cdata = person_data.get(candidate_id, {})
            score, hop_s, wealth_s, phil_s = compute_score(
                hop, cdata.get("wealth_band"), cdata.get("philanthropy_signal")
            )

            # Introducer: the person at hop-1 on the path
            path = info["path"]
            introducer_id = path[-1]["person_id"] if path else None
            via_org_id = path[-1]["via_org_id"] if path else None
            via_org_name = org_names.get(via_org_id, "") if via_org_id else ""

            r1, r2, r3 = build_reasons(
                hop, cdata.get("wealth_band", "unknown"),
                cdata.get("philanthropy_signal", "unknown"),
                cdata.get("philanthropy_notes"),
                via_org_name
            )

            records.append({
                "id": str(uuid.uuid4()),
                "anchor_donor_id": donor_id,
                "candidate_person_id": candidate_id,
                "introducer_person_id": introducer_id,
                "score": score,
                "score_version": "v1",
                "hop_count_score": hop_s,
                "wealth_score": wealth_s,
                "philanthropy_score": phil_s,
                "reason_1": r1,
                "reason_2": r2,
                "reason_3": r3,
                "lead_status": "new",
                "connection_path": json.dumps(path),
                "scored_at": datetime.now(timezone.utc).isoformat()
            })

        if records:
            # Upsert via psycopg2 for performance
            for rec in records:
                cur.execute("""
                    INSERT INTO donor_network_leads
                        (id, anchor_donor_id, candidate_person_id, introducer_person_id,
                         score, score_version, hop_count_score, wealth_score, philanthropy_score,
                         reason_1, reason_2, reason_3, lead_status, connection_path, scored_at)
                    VALUES
                        (%(id)s, %(anchor_donor_id)s, %(candidate_person_id)s, %(introducer_person_id)s,
                         %(score)s, %(score_version)s, %(hop_count_score)s, %(wealth_score)s, %(philanthropy_score)s,
                         %(reason_1)s, %(reason_2)s, %(reason_3)s, %(lead_status)s, %(connection_path)s, %(scored_at)s)
                    ON CONFLICT (anchor_donor_id, candidate_person_id) DO UPDATE
                        SET score = EXCLUDED.score,
                            scored_at = EXCLUDED.scored_at,
                            reason_1 = EXCLUDED.reason_1,
                            reason_2 = EXCLUDED.reason_2,
                            reason_3 = EXCLUDED.reason_3,
                            hop_count_score = EXCLUDED.hop_count_score,
                            wealth_score = EXCLUDED.wealth_score,
                            philanthropy_score = EXCLUDED.philanthropy_score,
                            introducer_person_id = EXCLUDED.introducer_person_id,
                            connection_path = EXCLUDED.connection_path
                """, rec)
            total_leads += len(records)

    conn.commit()
    cur.close()
    conn.close()

    print(f"Done: {total_leads} lead records upserted.")

    supabase.table("pipeline_run_log").insert({
        "run_id": args.run_id,
        "script_name": "score_leads",
        "phase": "score",
        "records_attempted": len(donor_person_pairs),
        "records_succeeded": len(donor_person_pairs),
        "records_failed": 0,
        "status": "success",
        "completed_at": datetime.now(timezone.utc).isoformat()
    }).execute()


if __name__ == "__main__":
    main()
```

---

## 7. Experimental Run Playbook (5k experiment)

### Prerequisites

**Step 1 — Enable Supabase extensions.**
Run in Supabase SQL editor (Settings → SQL Editor):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**Step 2 — Run the full DDL from Section 1.**
Paste and execute. If tables already exist from a previous attempt, drop them first with:
```sql
DROP TABLE IF EXISTS donor_network_leads, knowledge_chunks, donor_dossiers,
    person_connections, person_org_roles, persons, organisations,
    pipeline_run_log CASCADE;
```

**Step 3 — Set environment variables.**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="eyJ..."          # Service role key, NOT anon key
export DATABASE_URL="postgresql://postgres:...@db.your-project.supabase.co:5432/postgres"
```

The `DATABASE_URL` is available from: Supabase Dashboard → Settings → Database → Connection string → URI mode. Use the "Session mode" URI (port 5432), not "Transaction mode" (port 6543), because `derive_connections.py` uses DDL and multi-statement transactions.

**Step 4 — Install Python dependencies.**
```bash
pip install anthropic openai supabase tiktoken psycopg2-binary python-dotenv
```

**Step 5 — Confirm `donors_sponsors` table structure.**
Run:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'donors_sponsors' ORDER BY ordinal_position;
```
Verify: there is a UUID primary key column. If it's not named `id`, update the FK references in the DDL before running.

---

### Run order

```
RUN_ID="exp_5k_$(date +%Y%m%d_%H%M%S)"
```

**Step 6 — Layer 1: Extract charities (submit batch).**
```bash
python pipeline/extract_charities.py \
    --limit 5000 \
    --run-id "$RUN_ID" \
    --output-dir data/extractions/
```
Estimated time: 5 minutes to submit batch + up to 24 hours for Anthropic to process.
Check batch status: the script polls automatically. It will print batch ID. You can also check `platform.anthropic.com/batches`.

**Step 7 — Layer 1: Retry low-confidence extractions (after batch completes).**
```bash
# Only if data/extractions/low_confidence.json exists and has entries
python pipeline/extract_charities.py \
    --retry-low-confidence \
    --run-id "${RUN_ID}_retry" \
    --output-dir data/extractions/
```
Estimated time: 1–4 hours for a second batch.

**Step 8 — Layer 2a: Load entities.**
```bash
python pipeline/load_entities.py \
    --extraction-dir data/extractions/ \
    --run-id "$RUN_ID"
```
Estimated time: 30–90 minutes for 5,000 records (Supabase API calls; no LLM).

**Step 9 — Layer 2b: Derive connections.**
```bash
python pipeline/derive_connections.py --run-id "$RUN_ID"
```
Estimated time: 2–10 minutes (single SQL upsert over full table).

**Step 10 — Layer 2c: Match donors.**
```bash
python pipeline/match_donors.py --run-id "$RUN_ID"
```
Estimated time: 5–20 minutes depending on `donors_sponsors` table size.

Manually review ambiguous matches:
```sql
SELECT full_name, disambiguation_context, match_score, donor_sponsor_id
FROM persons
WHERE match_score IS NOT NULL AND match_confirmed = FALSE
ORDER BY match_score DESC;
```
Update `match_confirmed = TRUE` on confident matches before running Layer 5.

**Step 11 — Layer 3: Augment donors (run on 60% without dossiers first).**
```bash
python pipeline/augment_donors.py \
    --limit 100 \
    --run-id "$RUN_ID" \
    --skip-with-existing-dossier
```
Start with `--limit 100` to verify quality. Estimated time: 2–4 hours (real-time API, not batch).
Human review dossiers in `donor_dossiers` table where `status = 'pending_review'` before running at scale.

**Step 12 — Layer 4: Embed entities.**
```bash
python pipeline/embed_chunks.py --entity-type both --run-id "$RUN_ID"
```
Estimated time: 10–30 minutes.

**Step 13 — Layer 5: Score leads.**
```bash
python pipeline/score_leads.py --run-id "$RUN_ID"
```
Estimated time: 5–20 minutes (in-memory BFS, no LLM).

**Step 14 — Check results.**
```sql
-- How many leads surfaced?
SELECT COUNT(*) FROM donor_network_leads;

-- Distribution by score tier
SELECT
    CASE WHEN score >= 75 THEN 'High'
         WHEN score >= 40 THEN 'Medium'
         ELSE 'Low' END AS tier,
    COUNT(*)
FROM donor_network_leads
GROUP BY 1;

-- Top 10 leads
SELECT * FROM v_top_leads LIMIT 10;

-- Pipeline run costs
SELECT script_name, records_succeeded, records_failed, llm_cost_usd, embedding_cost_usd
FROM pipeline_run_log
WHERE run_id LIKE 'exp_5k_%'
ORDER BY started_at;
```

---

### Success check: manual spot-check on 5 donors

Pick 5 donors from your gold set (known-good records with verified networks). For each:

1. Find their `persons` record: `SELECT * FROM persons WHERE full_name ILIKE '%<name>%';`
2. Verify their matched `donor_sponsor_id` is correct.
3. Pull their leads: `SELECT * FROM v_top_leads WHERE donor_id = '<id>' LIMIT 20;`
4. For each lead: does the connection path make sense? (Does person A really share a trustee role with person B at the stated org?)
5. For the top 3 leads per donor: look up the stated organisation in `person_org_roles`. Verify the role records are real and the dates plausible.
6. Check at least one dossier in `donor_dossiers` for a donor with `status = 'approved'`: is the wealth band plausible given what you know?

Document findings in `data/spot_check_results.md`.

---

### Go/no-go criteria for scaling to 25k

**Go:**
- Spot-check passes for 4 of 5 donors (connection paths verifiably correct).
- Extraction confidence: fewer than 15% of 5k documents flagged `extraction_confidence: low`.
- Zero hallucinated organisations (i.e. org names in `person_org_roles` that do not exist in reality) found in spot-check.
- Total cost for 5k run within 30% of estimate ($55 extraction + $5 load/derive + augmentation batch cost).
- At least one lead per anchor donor surfaces with score ≥ 60.

**No-go (investigate before proceeding):**
- More than 25% of documents produce `extraction_confidence: low` — the system prompt needs tuning.
- Match rate between `persons` and `donors_sponsors` below 50% for donors expected to appear in charity registers — the trigram threshold or name normalisation needs work.
- Any verifiably invented person-org connection in spot-check — the extraction prompt needs a stricter factuality instruction.
- Cost overrun > 50% of estimate — recheck token counts and model selection.

---

## 8. Scheduled Run Design (v2 sketch)

### What changes for monthly/biweekly runs

The first run (Section 7) builds the corpus from scratch. Subsequent runs are incremental: process only new or updated records, then re-derive and re-score.

**Key changes:**

1. **Extract only new/updated charities.**
   Add a `last_extracted_at` column to the `charities` table:
   ```sql
   ALTER TABLE charities ADD COLUMN IF NOT EXISTS last_extracted_at TIMESTAMPTZ;
   ```
   The extraction script queries only records where `last_extracted_at IS NULL OR updated_at > last_extracted_at`. After successful extraction, update `last_extracted_at = now()`.

2. **Incremental entity loading.**
   `load_entities.py` already skips files that exist in the output directory. For scheduled runs, only new extraction JSON files appear. The upsert logic in `upsert_organisation` handles updates (updates the record if CH/charity number matches).

3. **Handle resigned roles (person departed from trustee role).**
   The Charity Commission and Companies House registers update when a trustee resigns. On refresh, if the extraction returns `is_current: false` for a role that previously had `is_current: true`, the load script updates `person_org_roles.is_current = false` and `end_date` accordingly.
   
   The re-run of `derive_connections.py` then recalculates `person_connections.is_current` based on current role states. Leads in `donor_network_leads` that depended entirely on now-ended connections will have their score drop (or be removed if hop_count > MAX_HOPS). The `score_leads.py` script upserts — lower scores overwrite higher ones.

4. **Re-score only affected leads.**
   For efficiency, add a `persons.connections_updated_at` timestamp. `score_leads.py` can accept `--since` flag and only re-BFS from donors whose network changed.

5. **Dossier refresh.**
   `augment_donors.py` with `--refresh-stale-days 60` would re-gather research for any dossier older than 60 days. Existing approved dossiers stay `approved`; refreshed content enters as `pending_review` again for human sign-off.

### Handling changed data

| Change | How detected | How handled |
|---|---|---|
| Person resigned as trustee | Next extraction returns `is_current: false` | `load_entities.py` upserts role with `is_current=false`; `derive_connections.py` re-runs; affected leads re-scored lower |
| New trustee appointed | Next extraction returns new person or new role | New `person_org_roles` row; new `person_connections` derived; new leads scored |
| Organisation dissolved | CH register shows dissolved status | `organisations.org_type` note; roles end-dated; connections go `is_current=false` |
| Donor wealth signal updated | Human updates `persons.wealth_band` | `score_leads.py --run-id refresh_<date>` re-scores that person's connected leads |
| New charity in corpus | `charities.last_extracted_at IS NULL` | Processed on next scheduled run |

### Suggested orchestration

**Option A — GitHub Actions cron (recommended for MVP v2):**
```yaml
# .github/workflows/pipeline_refresh.yml
name: Pipeline Refresh
on:
  schedule:
    - cron: '0 2 1 * *'   # 02:00 UTC on the 1st of each month
  workflow_dispatch:        # allow manual trigger
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r requirements.txt
      - run: python pipeline/extract_charities.py --limit 25000
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
      # ... subsequent steps
```
Limitation: GitHub Actions has a 6-hour job timeout. The Batch API submission completes in minutes; the poll loop can be split into a separate workflow triggered by completion webhook (Anthropic does not currently offer batch completion webhooks — use a poll-and-exit pattern instead, or use Prefect).

**Option B — Prefect Cloud (recommended once pipeline stabilises):**
```python
# pipeline/flows/monthly_refresh.py
from prefect import flow, task
from prefect.schedules import CronSchedule

@flow(name="monthly-refresh", schedule=CronSchedule(cron="0 2 1 * *"))
def monthly_refresh():
    extract_task()          # submits batch, returns batch_id
    wait_for_batch()        # Prefect task that polls with sleep
    load_task()
    derive_task()
    match_task()
    augment_task(limit=200)
    embed_task()
    score_task()
```
Prefect Cloud free tier supports up to 3 concurrent flows and unlimited task runs. The batch polling can use Prefect's `time.sleep` without hitting GitHub Actions limits.

---

## 9. File and Folder Structure

```
bloomsbury-network-mapper/
├── pipeline/
│   ├── __init__.py
│   ├── extract_charities.py      # Layer 1
│   ├── load_entities.py          # Layer 2a
│   ├── derive_connections.py     # Layer 2b
│   ├── match_donors.py           # Layer 2c
│   ├── augment_donors.py         # Layer 3
│   ├── embed_chunks.py           # Layer 4
│   ├── score_leads.py            # Layer 5
│   └── flows/
│       └── monthly_refresh.py    # Prefect flow (v2)
├── sql/
│   ├── 001_extensions.sql        # CREATE EXTENSION statements
│   ├── 002_schema.sql            # Full DDL from Section 1
│   ├── 003_views.sql             # v_top_leads and any future views
│   └── 004_seed.sql              # Test fixtures for development
├── data/
│   ├── extractions/              # JSON output from extract_charities.py (gitignored)
│   └── spot_check_results.md     # Human-written spot-check notes
├── tests/
│   ├── test_extract.py           # Unit tests for JSON parsing, chunking
│   ├── test_load.py              # Tests for entity upsert logic
│   ├── test_score.py             # Tests for scoring formula
│   └── fixtures/
│       ├── sample_extraction.json
│       └── sample_charity.md
├── .github/
│   └── workflows/
│       └── pipeline_refresh.yml
├── requirements.txt
├── .env.example
└── workspace/
    └── decision_layer/
        └── IMPLEMENTATION_PLAN.md   # This file
```

**`.env.example`:**
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

**`requirements.txt`:**
```
anthropic>=0.40.0
openai>=1.50.0
supabase>=2.10.0
psycopg2-binary>=2.9.9
tiktoken>=0.7.0
python-dotenv>=1.0.0
prefect>=3.0.0    # optional, for v2 orchestration
```

---

## 10. Prompt Templates

### 10.1 Charity Markdown Extraction — Claude Sonnet 4.6

**System message** (cached across all 25k requests):

```
You are a structured data extraction engine for a UK charity intelligence pipeline.

Your task is to read a charity document and extract all named individuals, their roles, and the organisations they are connected to. You output a single JSON object conforming exactly to the schema below. No markdown formatting. No prose. JSON only.

EXTRACTION RULES:

1. Extract every named person mentioned in the document — trustees, directors, patrons, advisors, honorary officers, and any other named individuals with a stated role.

2. For each person, extract every role they hold at every organisation mentioned. If the same person holds multiple roles at different organisations, list each role separately in the "roles" array.

3. Role categories must be one of: trustee, director, chair, patron, ceo, cfo, coo, secretary, advisory_board, honorary, other. Assign the closest match. If a role title is "Board Member", use "director". If "Honorary President", use "honorary".

4. Organisation types must be one of: charity, company, llp, cio, foundation, trust, partnership, government, sports_club, other.

5. Dates: extract start and end dates where stated. Format: YYYY-MM-DD if full date known, YYYY if only year known. If a role has no stated end date and appears current, leave end_date null and set is_current to true.

6. Wealth signals: capture any phrases indicating personal wealth, property ownership, significant shareholding, or commercial success. Examples: "founded X company", "major shareholder in Y", "sold Z business". Do not invent — only extract what is stated.

7. Philanthropy signals: capture any phrases indicating charitable giving, patronage of other organisations, endowments, or named donations. Examples: "donated £500k to", "patron of", "established the X Foundation".

8. Honours: capture any post-nominal letters or named honours mentioned (CBE, OBE, MBE, etc.).

9. Disambiguation context: if a person's name is common and context is available to distinguish them (their primary employer, location, a specific role description), populate disambiguation_context with that context in one short phrase. Examples: "Goldman Sachs partner, trustee from 2019", "retired GP, chair since 2021".

10. Extraction confidence: set to "high" if the document has a clear officers/trustees section with full names and roles. Set to "medium" if officers are mentioned but details are partial. Set to "low" if the document is very short, has no officer section, or names are ambiguous throughout.

11. CRITICAL: do not invent or infer. If a field is not stated in the document, use null. Never populate a field with a plausible guess.

OUTPUT SCHEMA:

{
  "charity_number": "string — from the header provided by the caller",
  "extraction_version": "1.0",
  "persons": [
    {
      "full_name": "string — full name as written in the document",
      "title": "string | null — Mr, Mrs, Dr, Prof, Sir, Dame, Lord, Lady, etc.",
      "suffix": "string | null — post-nominal letters only: CBE, OBE, MBE, FCA, etc.",
      "roles": [
        {
          "role_title": "string — exact role title as written",
          "role_category": "trustee | director | chair | patron | ceo | cfo | coo | secretary | advisory_board | honorary | other",
          "org_name": "string — name of the organisation where this role is held",
          "org_type": "charity | company | llp | cio | foundation | trust | partnership | government | sports_club | other",
          "start_date": "string | null — YYYY-MM-DD or YYYY",
          "end_date": "string | null — YYYY-MM-DD or YYYY; null if current",
          "is_current": true
        }
      ],
      "wealth_signals": ["string — verbatim phrase from document indicating wealth"],
      "philanthropy_signals": ["string — verbatim phrase indicating philanthropy"],
      "honours": "string | null",
      "disambiguation_context": "string | null — one phrase to distinguish this person from others with the same name"
    }
  ],
  "organisations_mentioned": [
    {
      "name": "string",
      "org_type": "charity | company | llp | cio | foundation | trust | partnership | government | sports_club | other",
      "companies_house_no": "string | null",
      "charity_number": "string | null",
      "sector": "string | null"
    }
  ],
  "extraction_confidence": "high | medium | low",
  "extraction_notes": "string | null — brief note if something unusual affected extraction"
}
```

**User message** (per document):

```
Charity number: {company_number}

Source URL: {company_house_url}

Document:

{truncated_markdown_content}
```

---

### 10.2 Donor Dossier Research Gather — Claude Sonnet 4.6 with web_search

**System message:**

```
You are a prospect researcher for a UK charity fundraising team. Your job is to gather public information about a named individual and return it as structured JSON. You have access to web search.

RESEARCH PROCEDURE:

Search each of the following sources in order. For each source, use the person's full name in quotes in the search query. Record every piece of information found, including the source URL and the date you retrieved it.

REQUIRED SEARCHES (conduct all that are applicable):

1. 360Giving GrantNav — philanthropic giving record
   Query: site:grantnav.threesixtygiving.org "{full_name}"
   What to extract: grant amounts, recipient organisations, dates, funder names.

2. Gov.uk Honours Lists — CBE/OBE/MBE and other honours
   Query: site:gov.uk/honours "{full_name}"
   What to extract: honour type, year, citation ("for services to...").

3. The Gazette — probate notices, company appointments, insolvency notices
   Query: site:thegazette.co.uk "{full_name}"
   What to extract: notice type, date, any associated companies or estate values.

4. Companies House (web) — director and PSC roles
   Query: site:find-and-update.company-information.service.gov.uk "{full_name}"
   What to extract: company names, appointment dates, resigned dates, PSC nature of control.

5. OSCR — Scottish charity trusteeships
   Query: site:oscr.org.uk "{full_name}"
   What to extract: charity names, roles, dates.

6. OpenCorporates — global corporate roles
   Query: site:opencorporates.com "{full_name}"
   What to extract: company names, jurisdictions, dates.

7. Guardian/FT/Times — philanthropy mentions, profiles, donations
   Query: site:theguardian.com "{full_name}" donation OR philanthropy OR trustee
   Also: site:ft.com "{full_name}" charity OR foundation
   What to extract: donation amounts, organisations supported, dates, context.

8. PRNewswire/BusinessWire UK — press releases
   Query: site:prnewswire.com "{full_name}" OR site:businesswire.com "{full_name}"
   What to extract: role announcements, company affiliations, deals.

9. LinkedIn (web search only — do not attempt to log in or scrape)
   Query: site:linkedin.com/in/ "{full_name}"
   What to extract: current employer, job title, career summary if visible in search snippet.

10. Wayback Machine — archived charity patron/donor lists
    Query: site:web.archive.org "{full_name}" trustee OR patron OR donor
    What to extract: historical trustee positions, donor acknowledgements.

11. Charity Commission annual returns
    Query: site:register-of-charities.charitycommission.gov.uk "{full_name}"
    What to extract: trustee positions, charity names, active/removed status.

ACCURACY RULES:

- Only record information that is directly stated in a retrieved source. Do not infer, estimate, or extrapolate.
- If a source returns no results, record it in "sources_searched_with_no_results".
- If the search returns results for a different person with the same name, note this ambiguity in "name_collision_notes".
- Do not record any information about private individuals that was not published by the individual or by an authoritative public register.

OUTPUT FORMAT — return a single JSON object:

{
  "subject_name": "string",
  "research_date": "ISO 8601 date",
  "sources": [
    {
      "source_name": "string — e.g. '360Giving GrantNav'",
      "url": "string",
      "retrieved_at": "ISO 8601 datetime",
      "findings": "string — what was found at this source"
    }
  ],
  "sources_searched_with_no_results": ["string — source names"],
  "name_collision_notes": "string | null — note if ambiguity between individuals with the same name was detected",
  "philanthropic_giving": [
    {
      "recipient_org": "string",
      "amount_stated": "string | null — exact figure as stated, including currency",
      "year": "integer | null",
      "source_url": "string",
      "source_name": "string"
    }
  ],
  "corporate_roles": [
    {
      "company_name": "string",
      "role_title": "string",
      "start_date": "string | null",
      "end_date": "string | null",
      "is_current": true,
      "source_url": "string"
    }
  ],
  "charity_trusteeships": [
    {
      "charity_name": "string",
      "role_title": "string",
      "start_date": "string | null",
      "end_date": "string | null",
      "is_current": true,
      "source_url": "string"
    }
  ],
  "honours": "string | null — e.g. 'CBE 2021 for services to education'",
  "press_mentions": [
    {
      "headline": "string",
      "publication": "string",
      "date": "string",
      "url": "string",
      "summary": "string — one sentence"
    }
  ],
  "raw_notes": "string | null — anything relevant that does not fit the structured fields above"
}
```

**User message** (per donor):

```
Research this donor for the Bloomsbury Football Foundation fundraising team.

Full name: {full_name}

Known context: {json_of_internal_record_fields_excluding_raw_markdown}

Existing dossier content (if any):
{raw_markdown_text or 'None'}
```

---

### 10.3 Donor Dossier Synthesis — Claude Opus 4.7

**System message:**

```
You are a senior prospect research analyst at a UK charity. You have been given a research dump about a named individual, gathered from public sources. Your task is to synthesise this into a structured, factual dossier that a fundraising director can act on.

SYNTHESIS RULES:

1. Every claim in the dossier must be traceable to a source in the gathered research. If a piece of information cannot be sourced, do not include it.

2. Wealth assessment: assign a wealth band based only on what can be reasonably inferred from confirmed public information (property sales, PSC stakes, probate, press mentions of transactions). Do not guess. If you cannot estimate with reasonable confidence, use band "unknown" and confidence "low".

3. Philanthropy record: list only confirmed charitable activities — trusteeships, named donations, patron acknowledgements. Do not infer philanthropic interest from wealth alone.

4. Career history: list roles in reverse chronological order. Mark current roles explicitly.

5. Network highlights: identify up to 5 named individuals who appear in the research as connected to the subject — co-trustees, co-directors, or persons mentioned alongside them in philanthropy contexts. These are network expansion targets.

6. Reputational flags: note any adverse press mentions, insolvency notices, disqualifications, or sanctions. If none found, leave array empty. Do not omit this field.

7. Summary: write 3–5 sentences. State: who they are (professionally), their philanthropic track record, their estimated wealth level and its basis, and one concrete reason they might be interested in Bloomsbury Football Foundation specifically (based on their stated interests or network — do not fabricate).

8. Tone: plain professional British English. No marketing language. No hedging phrases like "it could be argued". State what the evidence shows; flag what is uncertain with "not confirmed in public record".

OUTPUT FORMAT — return a single JSON object:

{
  "summary": "string — 3–5 sentences",
  "wealth_assessment": {
    "band": "over_100m | 25m_100m | 5m_25m | 1m_5m | under_1m | unknown",
    "confidence": "high | medium | low",
    "basis": "string — what specific evidence supports this band",
    "sources": ["string — source URLs"]
  },
  "philanthropy_record": [
    {
      "org": "string",
      "role": "string — e.g. 'Trustee', 'Named donor', 'Patron'",
      "amount_est": "string | null — as stated in source",
      "year": "integer | null",
      "source": "string — URL"
    }
  ],
  "career_history": [
    {
      "org": "string",
      "role": "string",
      "start": "string | null",
      "end": "string | null — null if current",
      "is_current": true,
      "source": "string — URL"
    }
  ],
  "network_highlights": [
    {
      "person": "string — full name",
      "relationship": "string — e.g. 'co-trustee at X Foundation since 2020'",
      "source": "string — URL"
    }
  ],
  "reputational_flags": [
    {
      "flag_type": "adverse_press | insolvency | disqualification | sanctions | other",
      "description": "string",
      "source": "string — URL",
      "date": "string | null"
    }
  ],
  "honours_awards": "string | null",
  "foundation_fit_note": "string | null — one sentence: specific reason this person might have affinity with Bloomsbury Football Foundation, based only on confirmed interests or network connections"
}
```

**User message** (per donor):

```
Synthesise a structured dossier for: {full_name}

Gathered research:
{json_of_gathered_research}

Internal record:
{json_of_donors_sponsors_record_fields}
```

---

*End of implementation plan. A Claude Code session should open this file, create the folder structure in Section 9, write the SQL from Section 1, then implement each script in layer order (1 → 2 → 3 → 4 → 5). Run the experiment playbook in Section 7 to validate before scaling.*
