# Backlog — Strategy 5: Human-Led + Claude Copilot

All stories follow the format: As a [role] / I want [capability] / So that [outcome] / Acceptance criteria / Size / Depends on.

Size key: S = half-day or less; M = 1–3 days; L = 3–5 days. Target: ≥80% M or smaller.

---

## E1 — Ingest and Store a Donor Record with Consent Metadata

### Story 1.1 — Fundraiser submits a donor record
**As a** fundraiser
**I want** to add a donor record to the system with name, postcode, and any known identifiers
**So that** the researcher has a structured starting point for enrichment
**Acceptance criteria:**
- CLI command `copilot.py ingest --name "..." --postcode "..." --basis legitimate_interest --lia-ref "LIA-001"` creates a `donor_record` JSON conforming to Schema 1
- Record is assigned a UUID `donor_id` and written to `working/<donor_id>/`
- Missing optional fields (DOB year) are stored as null, not omitted
- CLI rejects input if `--basis` or `--lia-ref` is absent
**Size:** S
**Depends on:** —

### Story 1.2 — Researcher views the unprocessed donor queue
**As a** researcher
**I want** to list all donor records that have not yet been enriched
**So that** I can prioritise my work and confirm records before beginning research
**Acceptance criteria:**
- `copilot.py queue` lists all `donor_id`s in `working/` with no `signals.json` yet, showing name, postcode, and date added
- Output sortable by date added (default) or name
- Empty queue prints a clear message rather than an error
**Size:** S
**Depends on:** Story 1.1

### Story 1.3 — Fundraiser flags a donor record as high priority
**As a** fundraiser
**I want** to mark specific donor records as high priority
**So that** the researcher addresses them first within their weekly queue
**Acceptance criteria:**
- `copilot.py set-priority --donor-id <id> --priority high|normal|low` updates the donor record
- `copilot.py queue` sorts high-priority records to the top
- Priority field is stored in the donor_record JSON, not in a separate system
**Size:** S
**Depends on:** Story 1.1

---

## E2 — Copilot CLI Runs Enrichment Lookups

### Story 2.1 — Researcher runs the copilot enrichment command for a donor
**As a** researcher
**I want** to run a single CLI command that queries Companies House, Charity Commission, and 360Giving for a named donor
**So that** I receive structured, formatted output to review rather than performing each API call manually
**Acceptance criteria:**
- `copilot.py enrich --donor-id <id>` runs all four signal lookups: CH officer search, CH officer appointments, CC trustee query, 360Giving local CSV search
- All raw API responses are saved to `working/<donor_id>/signals.json` conforming to Schemas 2, 3, 4
- A `summary.md` is written with sections: Entity Match, Corporate Roles, PSC Interests, Charity Trusteeships, Grant Context, Sanctions Check, Open Questions
- Command completes in under 60 seconds for standard records [my estimate — based on CH and CC API response times at low concurrency]
- If CH or CC API returns an error, the command reports the failure clearly and saves a partial `signals.json` with an `error` field; it does not silently produce an empty file
**Size:** M
**Depends on:** Story 1.1

### Story 2.2 — Copilot handles name ambiguity and prompts researcher
**As a** researcher
**I want** the copilot to flag when it finds multiple Companies House officer records matching the donor name
**So that** I can confirm the correct entity before research continues
**Acceptance criteria:**
- When CH officer search returns ≥2 plausible matches, copilot outputs a disambiguation table (name, DOB range, address, appointment count) and pauses with: "Multiple matches found. Use `--officer-id <id>` to select the correct record."
- When `--officer-id` is provided, the lookup proceeds with that specific record and records the officer_id in `signals.json`
- When only one plausible match is found, the lookup proceeds automatically, noting the match confidence in `summary.md`
- When no match is found, the command outputs "No CH officer record found for this name" and writes an empty but valid `signals.json`
**Size:** M
**Depends on:** Story 2.1

### Story 2.3 — Copilot runs sanctions check automatically
**As a** researcher
**I want** every enrichment run to include an automatic check against the UK Sanctions List
**So that** sanctions hits are never missed through a manual step being skipped
**Acceptance criteria:**
- Enrichment command always checks the local UK Sanctions List CSV (signal.ofsi.uk_sanctions_list) as a mandatory step
- A CLEAR or FLAGGED result is written to `signals.json` and shown prominently in `summary.md`
- A FLAGGED result generates a warning in the CLI output and writes a `sanctions_flag.json` to the working folder
- Local CSV is checked for staleness; if older than 7 days, the command prints a warning to update the file
**Size:** S
**Depends on:** Story 2.1

### Story 2.4 — Researcher downloads and refreshes the 360Giving CSV
**As a** researcher
**I want** a CLI command to download the latest 360Giving bulk data file
**So that** grant lookups are always run against current data without manual file management
**Acceptance criteria:**
- `copilot.py refresh-data --source 360giving` downloads the latest GrantNav full dataset CSV to `data/360giving_latest.csv`
- Command prints the download size, record count, and date of the dataset
- Existing file is overwritten; no backup is created (CSV can always be re-downloaded)
- If the download fails, the existing file is preserved and an error is printed
**Size:** S
**Depends on:** —

---

## E3 — Researcher Reviews Structured Output (Checkpoint 1)

### Story 3.1 — Researcher records entity confirmation in the audit log
**As a** researcher
**I want** to record a Checkpoint 1 audit entry confirming I have reviewed the enrichment output and confirmed the correct entity
**So that** there is a documented record that entity confirmation was performed before research proceeded
**Acceptance criteria:**
- `copilot.py audit-log --donor-id <id> --checkpoint 1 --researcher "Name" --note "..."` writes an `audit_event` record (Schema 7) to `audit.db`
- Command refuses to write a Checkpoint 1 entry if no `signals.json` exists for the donor
- Running `copilot.py status --donor-id <id>` shows Checkpoint 1 as complete once the entry is logged
**Size:** S
**Depends on:** Story 2.1

### Story 3.2 — Researcher annotates the signals file with false-positive removals
**As a** researcher
**I want** to mark specific CH or CC records in the signals file as false positives
**So that** these records are excluded from subsequent dossier drafting
**Acceptance criteria:**
- Each item in `signals.json` has an `excluded` boolean field, defaulting to false
- `copilot.py exclude --donor-id <id> --signal-type ch_appointment --signal-ref <company_number> --reason "wrong person"` sets `excluded: true` on the specified record
- Subsequent `draft-profiles` and `draft-dossier` commands skip excluded records
- Excluded records remain in the file (not deleted) so the exclusion decision is auditable
**Size:** S
**Depends on:** Story 3.1

---

## E4 — Researcher Identifies and Reviews Network Candidates

### Story 4.1 — Copilot drafts candidate profiles from confirmed signals
**As a** researcher
**I want** Claude to produce a structured profile for each co-trustee and co-director found in the confirmed signals
**So that** I have a ready-made starting document for each candidate rather than writing them from scratch
**Acceptance criteria:**
- `copilot.py draft-profiles --donor-id <id>` produces one Markdown profile per candidate in `working/<donor_id>/profiles/`
- Each profile contains: name, known roles, shared connection with the source donor, any available wealth indicators from the same signals data, and a Sources section listing the API endpoints or files used
- Claude does not add inferences not present in the signals data — any field with no source is written as "Not identified in available sources"
- Each candidate is written to `candidates.json` conforming to Schema 5 with `connection_strength: confirmed` (for register-verified connections) or `probable`/`possible` for inferred connections
**Size:** M
**Depends on:** Story 3.1

### Story 4.2 — Researcher scores and approves candidates for dossier inclusion
**As a** researcher
**I want** to assign a score and approve or reject each candidate for inclusion in the lead dossier
**So that** the final dossier contains only candidates the researcher has evaluated and approved
**Acceptance criteria:**
- `copilot.py score-candidate --donor-id <id> --candidate-id <id> --score 1-5 --approved true|false --note "..."` updates `candidates.json`
- `copilot.py draft-dossier` uses only candidates with `approved_for_dossier: true`
- Rejected candidates remain in `candidates.json` for audit purposes
- Running `copilot.py status --donor-id <id>` shows how many candidates are pending scoring
**Size:** S
**Depends on:** Story 4.1

---

## E5 — Claude Drafts Lead Dossier from Researcher-Curated Data

### Story 5.1 — Copilot drafts the lead dossier narrative
**As a** researcher
**I want** Claude to draft a narrative dossier using only the approved signals and candidate data
**So that** I have a well-structured draft to review and edit rather than writing the full dossier from scratch
**Acceptance criteria:**
- `copilot.py draft-dossier --donor-id <id>` produces `output/<donor_id>/dossier.md`
- Dossier sections: Executive Summary, Identity and Background, Network Connections, Wealth Indicators, Philanthropic Activity, Recommended Next Steps, Sources
- Every factual claim in the narrative has a corresponding source entry in the Sources section; source is the API endpoint URL or the local file name and row reference
- Wealth indicator section includes the `ceiling_caveat` note: "All capacity estimates are derived from identified public indicators and should be treated as estimates, not confirmed figures."
- Claude does not produce a dossier if Checkpoint 1 audit entry is absent from `audit.db` — the command prints an error and exits
**Size:** M
**Depends on:** Story 4.2

### Story 5.2 — Researcher can re-run dossier draft after making corrections
**As a** researcher
**I want** to edit the approved signals and candidates and re-run the dossier draft
**So that** minor corrections do not require starting the whole workflow from scratch
**Acceptance criteria:**
- Running `copilot.py draft-dossier --donor-id <id>` again overwrites the previous `dossier.md` and records a new draft version number in `audit.db`
- The audit log records each draft generation event with a timestamp and the researcher's name if `--researcher` is provided
- Previous draft is moved to `output/<donor_id>/archive/dossier_v<n>.md` before overwrite
**Size:** S
**Depends on:** Story 5.1

---

## E6 — Human Checkpoints as Workflow Steps

Note: in Strategy 5 the checkpoints ARE the workflow — they are researcher process steps, not system automations. E6 stories describe tooling that supports and records the checkpoint, not tooling that replaces human judgement.

### Story 6.1 — Checkpoint 2: researcher reviews and scores all candidates
**As a** researcher
**I want** a structured review screen that shows each candidate profile and prompts me to score and approve each one
**So that** the checkpoint is completed consistently and the approval is recorded
**Acceptance criteria:**
- `copilot.py review-candidates --donor-id <id>` prints each candidate profile in turn and prompts for score (1–5) and approve/reject
- Entering scores at the prompt writes directly to `candidates.json` (same as Story 4.2)
- After completing all candidates, a summary is printed: N approved, M rejected
- Running `copilot.py status --donor-id <id>` shows Checkpoint 2 as complete once all candidates have been scored
**Size:** M
**Depends on:** Story 4.1, Story 3.1

### Story 6.2 — Checkpoint 3: researcher records final dossier sign-off
**As a** researcher
**I want** to formally record my approval of the final dossier before it is released to the fundraising team
**So that** there is an unambiguous record of which researcher approved which version of which dossier
**Acceptance criteria:**
- `copilot.py audit-log --donor-id <id> --checkpoint 3 --researcher "Name" --dossier-approved true --note "..."` writes an `audit_event` record with `dossier_approved: true`
- Command refuses to write a Checkpoint 3 entry if no dossier draft exists in `output/<donor_id>/`
- `copilot.py export --donor-id <id>` is blocked unless a Checkpoint 3 entry exists
- `copilot.py status --donor-id <id>` shows workflow as "Complete: approved for release" once Checkpoint 3 is logged
**Size:** S
**Depends on:** Story 5.1

### Story 6.3 — Fundraising team exports an approved dossier
**As a** fundraiser
**I want** to retrieve the approved dossier for a donor
**So that** I can use it for gift conversation preparation
**Acceptance criteria:**
- `copilot.py export --donor-id <id> --to fundraising/dossiers/` copies `dossier.md` and `audit.json` to the specified folder
- Export is blocked if Checkpoint 3 is not complete
- The copied `dossier.md` includes a header showing the researcher name, approval date, and dossier version number
**Size:** S
**Depends on:** Story 6.2

---

## E7 — Data Storage and Audit Trail

### Story 7.1 — Audit database initialised on first run
**As a** developer
**I want** the SQLite audit database to be created automatically on first use
**So that** the researcher does not need to perform a manual setup step
**Acceptance criteria:**
- `copilot.py init` creates `audit.db` with the correct schema for `audit_event` records (Schema 7)
- If `audit.db` already exists, `init` is a no-op (does not overwrite)
- `copilot.py enrich` also calls init if `audit.db` does not yet exist
**Size:** S
**Depends on:** —

### Story 7.2 — Researcher generates a summary report of all completed dossiers
**As a** researcher
**I want** to produce a weekly summary showing how many dossiers were completed, their approval status, and average time from intake to sign-off
**So that** throughput and quality metrics can be tracked against the TEST_PLAN targets
**Acceptance criteria:**
- `copilot.py report --period week` prints: records ingested, records enriched, records at each checkpoint, dossiers approved, median days from ingest to Checkpoint 3, any records with FLAGGED sanctions
- Report is also written to `output/reports/report_<date>.md`
- Report uses only data from `audit.db`; no network calls required
**Size:** M
**Depends on:** Story 7.1, Story 6.2

---

## E8 — Compliance Documentation Support

### Story 8.1 — Researcher generates a DSAR export for a data subject
**As a** researcher
**I want** to export all data held about a named individual in response to a Data Subject Access Request
**So that** DSAR requests can be fulfilled within the statutory 30-day window
**Acceptance criteria:**
- `copilot.py dsar --name "John Smith"` searches `working/`, `output/`, and `audit.db` for all records referencing that name
- Produces a folder `dsar_exports/<date>_<name>/` containing all matching JSON files and a human-readable summary
- Does not delete any data — export only
- Prints a reminder: "Review the export manually before sending; some records may reference this individual without being the data subject."
**Size:** M
**Depends on:** Story 7.1

### Story 8.2 — Researcher generates a data retention report for annual review
**As a** researcher
**I want** to list all donor records and dossiers older than the retention period
**So that** data that should be deleted can be identified and actioned by the DPO
**Acceptance criteria:**
- `copilot.py retention-report --older-than 36` lists all donor_ids whose `created_at` date in the donor record is older than 36 months
- Report includes last-modified date of the working folder and whether a Checkpoint 3 approval exists
- Report is written to `output/reports/retention_<date>.md`
- Command does not delete any data; it only reports
**Size:** S
**Depends on:** Story 7.1

---

## E9 — Deployment and Onboarding

### Story 9.1 — Researcher installs and configures the copilot on a new machine
**As a** researcher
**I want** a documented setup procedure that I can complete in under one hour
**So that** I can start using the tool without engineering support
**Acceptance criteria:**
- `README.md` in the strategy folder lists: Python version requirement, `pip install -r requirements.txt`, API key setup (CH, CC, Anthropic), `copilot.py init`
- `config.yaml.example` documents all required and optional configuration values with comments
- `copilot.py check-config` verifies that all required API keys are present and tests each API connection, reporting pass/fail
- All steps are tested on a clean Python 3.12 environment before prototype launch
**Size:** S
**Depends on:** Story 7.1

### Story 9.2 — Researcher completes onboarding run with a test donor record
**As a** researcher
**I want** to complete a full workflow run with a synthetic test donor
**So that** I am familiar with each step before working on live donor data
**Acceptance criteria:**
- A synthetic test donor record (`test_donor_alice_example`) is included in the repository with pre-populated `signals.json` drawn from public figures
- Running `copilot.py enrich --donor-id test_donor_alice_example` completes without errors
- Researcher completes all three checkpoints with the test record as part of onboarding
- Onboarding is recorded in `audit.db` using `--researcher "Onboarding Test"` to distinguish from live records
**Size:** M
**Depends on:** Story 9.1, Story 2.1
