# Architecture — Strategy 5: Human-Led + Claude Copilot

## Component Overview

This is a **human workflow with Claude as a tool**, not an automated pipeline. There is no job queue, no orchestration layer, and no scheduled runs. The researcher works sequentially through a prioritised donor list. Claude is invoked on demand for specific subtasks.

```
+---------------------------+
| ResearcherWorkstation     |
|  - Donor list (CSV/SQLite)|
|  - Working folder         |
|  - Audit log (SQLite)     |
+---------------------------+
            |
            | python copilot.py enrich --donor "..." --postcode "..."
            v
+---------------------------+
| CopilotCLI (Python CLI)   |
|  - Claude SDK (Sonnet)    |
|  - Lookup orchestration   |
|  - JSON schema validation |
+---------------------------+
            |
    +-------+--------+--------+
    |        |        |        |
    v        v        v        v
+-------+ +----+ +-------+ +--------+
|  CH   | | CC | |360Give| |Web     |
|  API  | | API| | CSV   | |search  |
|(OGL)  | |(OGL| |(CC BY)| |(manual)|
+-------+ +----+ +-------+ +--------+
            |
            v
+---------------------------+
| StructuredOutput          |
|  - JSON per signal        |
|  - Formatted summary .md  |
+---------------------------+
            |
            | Researcher reviews (Checkpoint 1)
            v
+---------------------------+
| ResearcherReview          |
|  - Entity confirmed       |
|  - False positives removed|
|  - Context added          |
+---------------------------+
            |
            | python copilot.py draft-profiles --input working/
            v
+---------------------------+
| DossierDraft              |
|  - Claude Sonnet writes   |
|  - Uses approved data only|
|  - Markdown output        |
+---------------------------+
            |
            | Researcher reviews (Checkpoint 2 + 3)
            v
+---------------------------+
| FinalReview               |
|  - Citations audited      |
|  - Approval recorded      |
|  - Audit log updated      |
+---------------------------+
            |
            v
+---------------------------+
| OutputFolder              |
|  output/<donor_id>/       |
|    dossier.md             |
|    signals.json           |
|    audit.json             |
+---------------------------+
```

---

## Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| Language | Python 3.12 | Standard; researcher-installable |
| Database | SQLite (single file) | One researcher, one machine; no server needed |
| Claude integration | Anthropic Python SDK (claude-sonnet-4-6) | Copilot tasks are short, interactive; batch not needed |
| Output format | Markdown files in structured folder | Human-readable; no special tooling to view |
| Dependency management | `uv` or `pip` with `requirements.txt` | Simple; installable without Docker |
| External APIs | Requests library against CH, CC REST endpoints | Standard; no SDK required for these APIs |
| 360Giving | Pre-downloaded CSV (updated weekly) | GrantNav has no stable programmatic API; local copy is faster and more reliable |

No web framework, no Docker, no message queue, no cloud infrastructure required for v1.

---

## Copilot CLI Interface

### Command: `enrich`

Runs all configured signal lookups for a single donor record and returns structured JSON plus a human-readable summary.

```bash
python copilot.py enrich \
  --donor "John Smith" \
  --postcode "EC1A 1AA" \
  --dob-year 1968 \
  --output working/john_smith_20260505/
```

**What it does:**
1. Calls `signal.companies_house.officer_search` with the donor name; disambiguates results using postcode and DOB year.
2. For each confirmed officer match, calls `signal.companies_house.officer_appointments` to get full directorship history.
3. Calls `signal.companies_house.persons_with_significant_control` for companies where the officer appears as a PSC.
4. Calls `signal.charity_commission_ew.trustee_data` (`GetCharityTrustees` + `GetTrusteeAndRelatedCharities`) for all CC charities where the individual appears as trustee.
5. Searches local 360Giving CSV for grant records matching any charity number found in step 4.
6. Queries UK Sanctions List CSV for name match.
7. Calls Claude Sonnet with all raw API responses to produce a structured JSON summary and a brief narrative summary document.
8. Writes to `--output` directory: `signals.json`, `summary.md`.

**Output: `signals.json`** — conforms to the data contract schemas below.

**Output: `summary.md`** — a researcher-readable document structured as:
- Entity match confirmation (name, DOB range, address match)
- Corporate roles (list with dates)
- PSC interests
- Charity trusteeships and related charity network
- Grant-giving context (via 360Giving, where entity is funder or connected trustee)
- Sanctions: CLEAR / FLAGGED
- Open questions (name ambiguity, gaps to investigate)

### Command: `draft-profiles`

Given the researcher's annotated working document, drafts structured candidate profiles for review.

```bash
python copilot.py draft-profiles \
  --input working/john_smith_20260505/ \
  --candidates candidates.json \
  --output working/john_smith_20260505/profiles/
```

### Command: `draft-dossier`

Drafts the final lead dossier from researcher-approved candidate data.

```bash
python copilot.py draft-dossier \
  --input working/john_smith_20260505/ \
  --output output/john_smith_20260505/dossier.md
```

Claude writes only from data in `--input`. It does not add inferences or fill gaps. Any field with no approved source is written as "Not identified in available sources."

### Command: `audit-log`

Records researcher approval at each checkpoint.

```bash
python copilot.py audit-log \
  --donor-id john_smith_20260505 \
  --checkpoint 1 \
  --researcher "Alice Brown" \
  --note "Entity confirmed; removed 2 false positives from CH results"
```

---

## Data Contracts

All signals and outputs conform to the same 7 JSON schemas used across all strategies. Consistent schemas allow Strategy 5 outputs to feed into a Strategy 3/4 pipeline if the programme scales.

### Schema 1: `donor_record`
```json
{
  "donor_id": "string (uuid)",
  "full_name": "string",
  "postcode": "string | null",
  "dob_year": "integer | null",
  "consent_metadata": {
    "basis": "legitimate_interest | consent",
    "lia_ref": "string",
    "privacy_notice_version": "string",
    "collected_at": "ISO-8601 date"
  },
  "created_at": "ISO-8601 datetime",
  "source": "string"
}
```

### Schema 2: `ch_officer_record`
```json
{
  "donor_id": "string",
  "officer_id": "string",
  "name": "string",
  "dob_month_year": "string | null",
  "appointments": [
    {
      "company_number": "string",
      "company_name": "string",
      "role": "string",
      "appointed_on": "ISO-8601 date | null",
      "resigned_on": "ISO-8601 date | null",
      "company_status": "string"
    }
  ],
  "psc_interests": [
    {
      "company_number": "string",
      "nature_of_control": ["string"],
      "notified_on": "ISO-8601 date | null"
    }
  ],
  "source_url": "string",
  "retrieved_at": "ISO-8601 datetime"
}
```

### Schema 3: `cc_trustee_record`
```json
{
  "donor_id": "string",
  "charity_number": "string",
  "charity_name": "string",
  "trustee_name": "string",
  "appointed_on": "ISO-8601 date | null",
  "resigned_on": "ISO-8601 date | null",
  "related_charities": [
    {
      "charity_number": "string",
      "charity_name": "string",
      "shared_trustee_count": "integer"
    }
  ],
  "income_band": "string | null",
  "source_url": "string",
  "retrieved_at": "ISO-8601 datetime"
}
```

### Schema 4: `grant_record`
```json
{
  "donor_id": "string",
  "funder_name": "string",
  "funder_charity_number": "string | null",
  "recipient_name": "string",
  "recipient_charity_number": "string | null",
  "amount_gbp": "number",
  "award_date": "ISO-8601 date",
  "description": "string | null",
  "threesixtygiving_id": "string",
  "connection_type": "funder_trustee | recipient_trustee | named_donor",
  "retrieved_at": "ISO-8601 datetime"
}
```

### Schema 5: `network_candidate`
```json
{
  "candidate_id": "string (uuid)",
  "source_donor_id": "string",
  "full_name": "string",
  "connection_type": "co_trustee | co_director | co_psc | philanthropic_peer | other",
  "connection_evidence": ["string (source URL or description)"],
  "connection_strength": "confirmed | probable | possible",
  "researcher_score": "integer 1-5 | null",
  "researcher_notes": "string | null",
  "approved_for_dossier": "boolean",
  "approved_by": "string | null",
  "approved_at": "ISO-8601 datetime | null"
}
```

### Schema 6: `wealth_indicator`
```json
{
  "donor_id": "string",
  "indicator_type": "psc_stake | property_address | honours | known_gift | sector_role | other",
  "description": "string",
  "estimated_value_gbp": "number | null",
  "confidence": "confirmed | probable | proxy",
  "source_url": "string",
  "researcher_note": "string | null",
  "ceiling_caveat": true
}
```

`ceiling_caveat: true` is non-negotiable on all wealth indicator records — from 03_reliability_ceiling.md, £5M+ confirmation is always an estimate.

### Schema 7: `audit_event`
```json
{
  "event_id": "string (uuid)",
  "donor_id": "string",
  "checkpoint": "1 | 2 | 3",
  "researcher": "string",
  "timestamp": "ISO-8601 datetime",
  "action": "string",
  "note": "string | null",
  "dossier_approved": "boolean | null"
}
```

---

## Folder Structure

```
workspace/strategies/05_human_led/
├── copilot.py              # Main CLI entrypoint
├── requirements.txt
├── config.yaml             # API keys, output paths, schema paths
├── schemas/                # 7 JSON schemas (canonical)
├── data/
│   └── 360giving_latest.csv  # Updated weekly by researcher
├── working/
│   └── <donor_id>/         # Per-donor working files
│       ├── signals.json
│       ├── summary.md
│       ├── candidates.json
│       └── profiles/
├── output/
│   └── <donor_id>/         # Approved, final outputs
│       ├── dossier.md
│       ├── signals.json
│       └── audit.json
└── audit.db                # SQLite: all audit_event records
```

---

## Kill List for v1

The following are explicitly out of scope for the first version and should not be built:

- No automated pipeline or job queue
- No web UI or dashboard
- No CRM integration
- No automated scheduling or batch runs
- No multi-user support (SQLite, single machine)
- No automated OSCR or CCNI lookups (researcher queries manually for flagged Scottish/NI connections)
- No HMLR per-title searches (researcher initiates manually for high-priority leads; costs £3/title)
- No Factary Phi API integration (no documented API; researcher uses Phi directly via browser)
- No automated Article 14 notice generation (handled by fundraising team separately)
- No connection graph visualisation
