# Architecture — Strategy 1: Factary Outsourced

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  BLOOMSBURY INTERNAL SYSTEM                                          │
│                                                                      │
│  ┌─────────────────────┐                                             │
│  │  1. INTAKE PORTAL   │                                             │
│  │  CLI: submit.py     │                                             │
│  │  Input: CSV or JSON │                                             │
│  │  Validates consent  │                                             │
│  │  metadata schema    │                                             │
│  │  Assigns tracking_id│                                             │
│  └────────┬────────────┘                                             │
│           │ DonorRecord (validated)                                  │
│           ▼                                                          │
│  ┌─────────────────────┐                                             │
│  │  2. DONOR STORE     │                                             │
│  │  SQLite: donors.db  │                                             │
│  │  Tables:            │                                             │
│  │    donors           │                                             │
│  │    batch_submissions│                                             │
│  │    enriched_donors  │                                             │
│  │    audit_log        │                                             │
│  └────────┬────────────┘                                             │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────┐    encrypted ZIP + manifest                 │
│  │  3. SECURE TRANSFER │───────────────────────────────────────────▶│
│  │  CLI: export.py     │                                             │
│  │  Produces encrypted │◀───────────────────────────────────────────│
│  │  batch manifest     │    dossier ZIP (PDF/CSV) from Factary       │
│  │  SFTP or portal     │                                             │
│  └────────┬────────────┘                                             │
│           │ inbound dossier ZIP                                      │
│           ▼                                                          │
│  ┌─────────────────────┐                                             │
│  │  4. DOSSIER INGEST  │                                             │
│  │  CLI: ingest.py     │                                             │
│  │  Parses Factary     │                                             │
│  │  output; uses       │                                             │
│  │  Claude Haiku to    │                                             │
│  │  structure into     │                                             │
│  │  EnrichedDonor JSON │                                             │
│  │  Flags low-         │                                             │
│  │  confidence fields  │                                             │
│  └────────┬────────────┘                                             │
│           │ EnrichedDonor[]                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  5. HUMAN REVIEW WORKFLOW                                   │    │
│  │                                                             │    │
│  │  Checkpoint 1 ──▶ Checkpoint 2 ──▶ Checkpoint 3            │    │
│  │  (batch accept)    (uncertainty)    (dossier sign-off)      │    │
│  │                                                             │    │
│  │  reviews/ folder: markdown review files                     │    │
│  │  CLI: review.py --checkpoint [1|2|3] --id <tracking_id>    │    │
│  └────────────────────────────┬────────────────────────────────┘    │
│                               │ HumanReview decisions               │
│                               ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  6. OUTPUT                                                  │    │
│  │  Qualified leads (£5M+ filter) ──▶ LeadDossier.json/.md    │    │
│  │  Rejected records ──▶ audit log with reason                 │    │
│  │  All decisions ──▶ audit_log table (immutable)              │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  FACTARY (external data processor — Article 28 DPA required)        │
│                                                                      │
│  Receives: encrypted batch CSV with donor records                   │
│  Processes: proprietary UK databases + Factary Phi +                │
│             CC/CH/HMLR/honours research                              │
│  Returns: dossier ZIP with PDF or structured CSV per donor          │
│  Turnaround: 5–10 business days [my estimate]                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Contracts (JSON-schema style)

### `DonorRecord` — intake input

```json
{
  "$schema": "DonorRecord/v1",
  "tracking_id": "string (UUID, system-assigned)",
  "submitted_at": "string (ISO 8601, immutable)",
  "name": {
    "first": "string (required)",
    "last": "string (required)",
    "preferred": "string (optional)"
  },
  "email": "string | null",
  "postcode": "string | null (UK format validated)",
  "donation_history": [
    {
      "date": "string (YYYY-MM-DD)",
      "amount_gbp": "number",
      "campaign": "string | null",
      "gift_aid": "boolean"
    }
  ],
  "consent_metadata": {
    "wealth_screening_consent": "boolean (required)",
    "lawful_basis": "string — must be 'legitimate_interest' | 'consent'",
    "lia_ref": "string (reference to completed LIA document, required)",
    "privacy_notice_version": "string (required)",
    "opt_out_date": "string (ISO 8601) | null",
    "consent_recorded_at": "string (ISO 8601)"
  }
}
```

Validation rules:
- `consent_metadata.lia_ref` must be a non-empty string; missing field rejects with 422.
- `consent_metadata.privacy_notice_version` must match a known version in `config/privacy_notices.json`; mismatch rejects with 422.
- Records where `opt_out_date` is set are blocked from batch submission; rejected with 403.

---

### `EnrichedDonor` — Job A output (post-Factary ingest)

```json
{
  "$schema": "EnrichedDonor/v1",
  "tracking_id": "string",
  "donor_record_ref": "string (FK → DonorRecord.tracking_id)",
  "ingested_at": "string (ISO 8601)",
  "source_vendor": "string — 'factary' | 'prospecting_for_gold'",
  "dossier_quality": "string — 'substantial' | 'partial' | 'thin'",
  "profile": {
    "full_name": "string",
    "known_aliases": ["string"],
    "occupation_current": "string | null",
    "employer_current": "string | null",
    "biography_summary": "string | null"
  },
  "wealth_indicators": [
    {
      "indicator_type": "string — 'property' | 'psc_stake' | 'honour' | 'philanthropy_scale' | 'other'",
      "description": "string",
      "value_band": "string — '<1m' | '1m-5m' | '5m-30m' | '>30m' | 'unknown'",
      "confidence": "string — 'confirmed' | 'estimated' | 'inferred'",
      "citation": {
        "source_url": "string | null",
        "source_name": "string",
        "retrieved_at": "string (ISO 8601)",
        "confidence": "string — 'high' | 'medium' | 'low'"
      }
    }
  ],
  "philanthropy_history": [
    {
      "recipient_org": "string",
      "amount_band": "string | null",
      "year": "integer | null",
      "citation": { "$ref": "#/Citation" }
    }
  ],
  "adverse_flags": {
    "sanctions_hit": "boolean",
    "pep_status": "boolean | null",
    "adverse_media_summary": "string | null",
    "adverse_media_citations": ["$ref: Citation"]
  },
  "vendor_confidence_score": "number (0–100) | null",
  "vendor_notes": "string | null"
}
```

---

### `NetworkCandidate` — Job B intermediate

```json
{
  "$schema": "NetworkCandidate/v1",
  "candidate_id": "string (UUID)",
  "source_donor_tracking_id": "string",
  "candidate_name": "string",
  "connection_type": "string — 'co_trustee' | 'co_director' | 'psc_same_company' | 'shared_philanthropy' | 'biographical'",
  "shared_entity": "string (charity name, company name, event, etc.)",
  "shared_entity_id": "string | null (CC charity number or CH company number where available)",
  "hops_from_donor": "integer (1 = direct, 2 = one intermediate, etc.)",
  "citations": ["$ref: Citation"],
  "promoted_to_lead": "boolean",
  "promotion_notes": "string | null"
}
```

---

### `QualifiedLead` — post-£5M filter

```json
{
  "$schema": "QualifiedLead/v1",
  "lead_id": "string (UUID)",
  "source_enriched_donor_id": "string",
  "qualified_at": "string (ISO 8601)",
  "qualification_basis": ["string — list of indicator_types that triggered qualification"],
  "estimated_capacity_band": "string — '1m-5m' | '5m-30m' | '>30m'",
  "capacity_confidence": "string — 'confirmed' | 'estimated'",
  "capacity_ceiling_note": "string (mandatory: structural ceiling caveat from 03_reliability_ceiling.md §4)",
  "assigned_reviewer": "string | null",
  "review_status": "string — 'pending' | 'in_review' | 'approved' | 'rejected'"
}
```

---

### `LeadDossier` — Job C output

```json
{
  "$schema": "LeadDossier/v1",
  "dossier_id": "string (UUID)",
  "lead_id": "string (FK → QualifiedLead.lead_id)",
  "created_at": "string (ISO 8601)",
  "signed_off_by": "string | null",
  "signed_off_at": "string (ISO 8601) | null",
  "summary_narrative": "string (Claude-structured, sourced)",
  "enriched_donor": { "$ref": "#/EnrichedDonor" },
  "network_candidates": ["$ref: NetworkCandidate"],
  "qualified_lead": { "$ref": "#/QualifiedLead" },
  "recommended_ask": "string | null",
  "recommended_contact_route": "string | null",
  "fundraiser_notes": "string | null",
  "citations_all": ["$ref: Citation"],
  "human_reviews": ["$ref: HumanReview"]
}
```

---

### `Citation`

```json
{
  "$schema": "Citation/v1",
  "source_url": "string | null",
  "source_name": "string (required — e.g. 'Factary Phi', 'Companies House', 'The Times')",
  "retrieved_at": "string (ISO 8601, required)",
  "confidence": "string — 'high' | 'medium' | 'low' (required)"
}
```

Validation rule: every factual claim in `EnrichedDonor`, `NetworkCandidate`, and `LeadDossier` must reference at least one `Citation`. Claims without a citation are flagged as `unverified` and blocked from sign-off at Checkpoint 3.

---

### `HumanReview`

```json
{
  "$schema": "HumanReview/v1",
  "checkpoint_id": "string — 'cp1_batch_accept' | 'cp2_uncertainty' | 'cp3_signoff'",
  "reviewer": "string (name of fundraising staff member)",
  "decision": "string — 'proceed' | 'send_back' | 'reject' | 'escalate'",
  "notes": "string | null",
  "timestamp": "string (ISO 8601, system-set, immutable)"
}
```

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Python 3.12 | Specified requirement |
| Database | SQLite (v1) | Zero infrastructure; portable; sufficient for <10k records/year at this strategy's volume |
| CLI job runner | Python `argparse`-based scripts | `submit.py`, `export.py`, `ingest.py`, `review.py` — each does one job; no framework overhead |
| Claude SDK | `anthropic` Python SDK, `claude-haiku-4-5-20251001` | Used only for structuring inbound Factary dossiers into JSON schema; Haiku is sufficient and cheapest for structured extraction from already-researched text |
| File transfer | SFTP (FileZilla client or `paramiko` in `export.py`) | Factary does not offer an API; transfer is file-based |
| Encryption | GPG symmetric encryption for batch ZIPs | Simple; no PKI infrastructure required at v1 |
| Schema validation | `jsonschema` Python library | Validates `DonorRecord` consent_metadata at intake |

---

## Where Claude Is Used

This strategy uses Claude minimally. Factary performs the research. Claude's role is limited to:

1. **Dossier structuring** (`ingest.py`): Factary returns PDF or loosely structured CSV. Claude Haiku parses this into the `EnrichedDonor` JSON schema. Prompt instructs Claude to extract only what is present in the source text — it must not infer, supplement, or extrapolate. Every extracted field must cite the Factary-provided source reference.

2. **Summary narrative generation** (`review.py --summarise`): On request during Checkpoint 3, Claude Haiku drafts a one-paragraph summary narrative for `LeadDossier.summary_narrative` from the structured `EnrichedDonor` data. Reviewer edits before sign-off.

**Model choice:** `claude-haiku-4-5-20251001` — structured extraction from short, pre-researched text does not require Sonnet or Opus. Estimated cost: £0.01–0.05 per dossier [my estimate — Haiku at $1/MTok input; typical Factary dossier ~5k tokens].

**Model that must NOT be used here:** The pipeline must not invoke Opus or Sonnet for "gap-filling" or "inferring likely capacity from limited data" — this is the hallucination vector. Claude is a formatter and summariser only.

---

## Rate Limit Handling

Factary is not an API. There are no rate limits to handle. Transfer is batch file-based:

- `export.py` produces a single encrypted ZIP per batch submission.
- Factary returns a single encrypted ZIP per batch.
- `ingest.py` processes the returned ZIP; no concurrency required.
- Claude API calls in `ingest.py` are sequential per dossier; Haiku's rate limits (400k tokens/min on Tier 1) are not reachable at the volumes this strategy handles.

---

## Kill List for v1

The following are explicitly out of scope for v1:

| Deferred item | Reason |
|---|---|
| Web portal / browser UI | CLI is sufficient; adds build time with no data quality benefit |
| CRM integration (Raiser's Edge / Salesforce sync) | Adds complexity; v1 output is Markdown + JSON files for manual import |
| Automated sanctions re-screening on a schedule | Factary screens at time of dossier; v1 re-screening is a manual step |
| Scottish (OSCR) and NI (CCNI) trustee data | Factary's own sources may cover this; v1 does not add independent pulls |
| Email notifications on batch completion | Fundraiser checks the `ingest.py` output manually in v1 |
| Multi-user access controls | Single-user SQLite model is sufficient for v1; migrate to Postgres for multi-user |
| Automated Article 14 notice dispatch | Compliance obligation remains; v1 defers to a manual process with a checklist |
| Network graph visualisation | Out of scope for outsourced model; no internal graph is built |
