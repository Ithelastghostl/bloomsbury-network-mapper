# Backlog: Strategy 3 — Open-Source Agentic Pipeline

**Version:** 1.0 | **Date:** 2026-05-05
**Size key:** XS = hours | S = 1 day | M = 2–3 days | L = 1 week | XL = 2+ weeks
**Target: ≥80% of stories sized M or smaller.**

---

## E1 — Ingest and store a donor record with consent metadata

### Story 1.1 — Fundraiser submits a donor record
**As a** fundraiser
**I want** to submit a donor record (CSV or JSON) and receive an acknowledgement with a tracking ID
**So that** I can later retrieve the enriched dossier
**AC1:** input accepts `{name, email, postcode, donation_history, consent_metadata}`
**AC2:** consent_metadata is validated against a documented schema; missing required fields reject with a 4xx-style error message naming the missing field
**AC3:** record is persisted with an immutable `submitted_at` timestamp; field is never updated after initial write
**AC4:** caller receives a `tracking_id` (UUID v4) within 2 seconds
**Size:** S
**Depends on:** —

### Story 1.2 — Consent metadata schema is documented and enforced
**As a** data protection officer
**I want** the consent metadata schema to be version-controlled and machine-enforceable
**So that** we can demonstrate to ICO that consent capture was structurally validated at intake
**AC1:** schema is defined in `pydantic` model with field-level docstrings explaining legal basis for each field
**AC2:** schema includes: `consent_version`, `lawful_basis` (enum: legitimate_interest | consent), `privacy_notice_url`, `opt_out_direct_marketing` (boolean), `recorded_at` (ISO 8601)
**AC3:** schema version is stored alongside each record; schema changes are additive (no field removal in v1)
**AC4:** invalid consent_metadata returns a structured error listing every failing field and the rule violated
**Size:** S
**Depends on:** 1.1

### Story 1.3 — Duplicate donor detection before insert
**As a** pipeline operator
**I want** the system to detect likely duplicate donor records before inserting
**So that** we do not run redundant enrichment jobs or create conflicting dossiers for the same person
**AC1:** on submission, the system checks for existing records with matching normalised name + postcode
**AC2:** exact match (same name, same postcode) rejects with a 409-style error returning the existing `tracking_id`
**AC3:** fuzzy match (name similarity ≥ 0.85, same postcode) returns a warning with the candidate `tracking_id` but allows insert after explicit `--force` flag
**AC4:** duplicate check adds no more than 200ms to submission time
**Size:** S
**Depends on:** 1.1

### Story 1.4 — Operator can retrieve submission status
**As a** fundraiser
**I want** to query the status of a submitted donor record by tracking ID
**So that** I know whether enrichment is in progress, awaiting human review, or complete
**AC1:** `GET /status/{tracking_id}` returns: `{tracking_id, submitted_at, status: enum(queued|processing|awaiting_review|complete|failed), dossier_ready: boolean}`
**AC2:** status reflects current pipeline stage updated in real time
**AC3:** unknown `tracking_id` returns a 404-style error
**Size:** S
**Depends on:** 1.1

---

## E2 — Entity resolution across CH and CC registers

### Story 2.1 — EntityResolutionAgent disambiguates a named individual against CH register
**As a** pipeline operator
**I want** the system to find a candidate's Companies House officer record automatically
**So that** subsequent CH API calls use the correct `officer_id` without manual lookup
**AC1:** given `{name, postcode}`, agent queries `signal.companies_house.officer_search` and returns top-5 candidates with match scores
**AC2:** match score incorporates: name similarity (normalised Levenshtein), postcode proximity, and date-of-birth alignment where available
**AC3:** if a single candidate scores ≥ 0.85, it is auto-selected; `confidence` and `confidence_basis` recorded
**AC4:** if no candidate scores ≥ 0.85, record is written to `human_review_queue` with all candidates and scores; pipeline proceeds to CC lookup in parallel
**AC5:** all CH API calls use exponential backoff; no silent failures
**Size:** M
**Depends on:** 1.1

### Story 2.2 — EntityResolutionAgent disambiguates a named individual against CC register
**As a** pipeline operator
**I want** the system to find a candidate's Charity Commission trustee record automatically
**So that** TrusteeGraphAgent can use a validated trustee ID rather than an unverified name string
**AC1:** agent queries CC API `GetCharityTrustees` by name; returns candidate trustee records with charity context
**AC2:** match scoring as per Story 2.1 criteria
**AC3:** confidence ≥ 0.85 → auto-selected; < 0.85 → human review queue
**AC4:** CC API 5xx triggers fallback to bulk download query
**AC5:** results written to `EntityResolutionResult` schema (see ARCHITECTURE.md Contract 1)
**Size:** M
**Depends on:** 2.1

### Story 2.3 — Human reviewer resolves ambiguous entity matches
**As a** fundraiser
**I want** to be presented with a clear shortlist of candidate matches when the system cannot auto-resolve an entity
**So that** I can make the final determination without having to re-run the search manually
**AC1:** ambiguous records produce a markdown review file at `reviews/entity_YYYYMMDD_DONORNAME.md`
**AC2:** review file lists all candidates with: name, date of birth (month/year), known companies/charities, confidence score, and source URL
**AC3:** reviewer selects a candidate by adding `resolution: officer_id=<id>` or `resolution: no_match` to the review file
**AC4:** pipeline resumes automatically within 60 seconds of the review file being saved
**AC5:** human resolution decision is logged with operator_id and timestamp
**Size:** M
**Depends on:** 2.1, 2.2

### Story 2.4 — Common-name collision detection (e.g. "John Smith")
**As a** pipeline operator
**I want** the system to explicitly flag donors whose names match more than 20 active CH/CC records
**So that** these high-collision cases are always sent to human review rather than auto-resolved with false confidence
**AC1:** if name query returns > 20 candidates in either CH or CC, `resolution_status` is set to `ambiguous` regardless of individual scores
**AC2:** review file generated with all > 20 candidates truncated at top 10 by score, with count of additional records noted
**AC3:** auto-resolution is blocked for common-name records; human review is mandatory
**AC4:** `common_name_collision: true` flag written to audit log for downstream reporting
**Size:** S
**Depends on:** 2.1, 2.2

---

## E3 — Data acquisition agents

### Story 3.1 — TrusteeGraphAgent builds co-trustee network from CC API
**As a** pipeline operator
**I want** the TrusteeGraphAgent to retrieve all charities where the donor is or has been a trustee, and all co-trustees at those charities
**So that** the network map captures the ~90–95% co-trusteeship signal available from the Charity Commission register
**AC1:** agent calls `GetTrusteeAndRelatedCharities` for the resolved canonical_id
**AC2:** result includes: all charities (current and former trustee roles), all co-trustee names per charity, appointment and resignation dates
**AC3:** co-trustee adjacency list is built: for each co-trustee, a list of shared charities and a `connection_strength` score (number of shared charities normalised to 0–1)
**AC4:** API 5xx triggers fallback to CC bulk download; fallback is logged
**AC5:** result written to `TrusteeGraphResult` schema (ARCHITECTURE.md Contract 2)
**AC6:** agent handles CC beta rate limit gracefully — 0.5 req/s with exponential backoff
**Size:** M
**Depends on:** 2.1, 2.2

### Story 3.2 — CompaniesHouseAgent retrieves officer appointments and PSC records
**As a** pipeline operator
**I want** the CompaniesHouseAgent to retrieve the full directorship history and PSC records for a resolved CH officer
**So that** the dossier includes corporate network connections and deterministic wealth indicators (PSC ≥ 25% stake)
**AC1:** agent calls `/officers/{officer_id}/appointments` — returns full appointment history (current + resigned)
**AC2:** for each company in the appointment history, agent calls `/company/{company_number}/persons-with-significant-control` if company type suggests private limited structure
**AC3:** PSC records with `status: active` are explicitly flagged as deterministic wealth indicators in the result; `nature_of_control` preserved verbatim
**AC4:** CH rate limit enforced: hard cap at 100 req/min; exponential backoff on 429; dead-letter queue after 5 retries
**AC5:** result written to `CompaniesHouseResult` schema (ARCHITECTURE.md Contract 3)
**Size:** M
**Depends on:** 2.1

### Story 3.3 — GrantNavAgent retrieves grant history from 360Giving
**As a** pipeline operator
**I want** the GrantNavAgent to identify all grants received by organisations connected to the donor
**So that** the dossier reflects the donor's philanthropic footprint via organisations they lead or support
**AC1:** agent queries the locally cached GrantNav CSV by: recipient_charity_number (from TrusteeGraphResult) and recipient_name (fuzzy match ≥ 0.85)
**AC2:** GrantNav CSV is downloaded at pipeline start and cached for 24h before re-fetch; download failure is logged and pipeline continues without grant data (not a blocking error)
**AC3:** result includes: all matched grants, funder name, amount (GBP), date, description, GrantNav permalink as source_url
**AC4:** result written to `GrantNavResult` schema (ARCHITECTURE.md Contract 4)
**AC5:** zero grants found → `grant_count: 0` returned, not an error condition
**Size:** M
**Depends on:** 3.1

### Story 3.4 — WebSearchAgent enriches with advisory boards, honours, and adverse media
**As a** pipeline operator
**I want** the WebSearchAgent to retrieve targeted web evidence for signals not available in structured registers
**So that** the dossier includes advisory board memberships, event co-attendance, honours, and adverse media that registers cannot provide
**AC1:** agent runs the following targeted query templates per donor: `"{name} advisory board"`, `"{name} trustee chair"`, `"{name} OBE CBE knighthood"`, `"{name} philanthropy donation"`, `"{name} [scandal OR fraud OR investigation]"`
**AC2:** for each result, agent extracts: signal_type (enum), description, source_url, source_date (if parseable), and confidence (high/medium/low)
**AC3:** source_url is mandatory for every extracted claim; unsourced inferences are suppressed, not recorded
**AC4:** search API errors are non-blocking; agent records `queries_run` and continues
**AC5:** result written to `WebSearchResult` schema (ARCHITECTURE.md Contract 7)
**AC6:** adverse_media signals are always flagged separately and surfaced in the human review checkpoint regardless of confidence level
**Size:** M
**Depends on:** 2.1

### Story 3.5 — PropertyAgent queries HMLR OCOD for overseas property
**As a** pipeline operator
**I want** the PropertyAgent to identify UK property held by overseas entities associated with the donor
**So that** the dossier includes offshore property holdings as a wealth indicator and due diligence signal
**AC1:** agent queries locally cached HMLR OCOD CSV by `proprietor_name` using the donor's associated company names (from CompaniesHouseResult)
**AC2:** OCOD full CSV is downloaded monthly at pipeline start; delta file downloaded weekly; cache freshness checked on every run
**AC3:** result includes: title number, tenure, proprietor name, country of incorporation, ROE number (if present)
**AC4:** result written to `PropertyResult` schema (ARCHITECTURE.md Contract 5)
**AC5:** zero matches → empty list returned, not an error
**Size:** S
**Depends on:** 3.2

### Story 3.6 — SanctionsAgent screens against UK Sanctions List
**As a** pipeline operator
**I want** the SanctionsAgent to screen every donor against the UK Sanctions List before any dossier is produced
**So that** the pipeline never produces an approach dossier for a sanctioned individual
**AC1:** UK Sanctions List is downloaded at pipeline start; cache is invalidated if list is more than 24h old (list updates multiple times per week [verified — signal.ofsi.uk_sanctions_list])
**AC2:** name matching uses fuzzy match; threshold for positive flag is ≥ 0.90 similarity to any name or alias in the list
**AC3:** any positive match (confidence ≥ 0.90) blocks all downstream processing and generates a `sanctions_blocked` status with full match details
**AC4:** result written to `SanctionsResult` schema (ARCHITECTURE.md Contract 6)
**AC5:** PEP flag is set if the donor's web search or role data indicates a politically exposed role (minister, senior public official, judge); basis recorded
**Size:** S
**Depends on:** 2.1, 3.4

---

## E4 — Wealth scoring

### Story 4.1 — PSC-based deterministic wealth scoring
**As a** pipeline operator
**I want** the WealthScoringAgent to identify and record PSC filings as deterministic wealth indicators
**So that** any donor who is a registered controlling shareholder (>25% equity in a substantive company) has that fact captured with explicit sourcing, not inferred
**AC1:** for every active PSC record in CompaniesHouseResult, agent checks: `nature_of_control` includes "ownership-of-shares-25-to-50-percent" or higher
**AC2:** controlling stake in any company with net assets > £1m (inferred from latest accounts where available in CH filing) is tagged `psc_wealth_indicator: true` with source company_number and filing URL
**AC3:** `confirmed_5m` wealth tier is only assigned when PSC + HMLR property evidence together establish indicators above that threshold; source citations required for each component
**AC4:** PSC below 25% threshold → absence of PSC record is logged as "PSC gap — wealth below or structured around threshold" in the dossier; not logged as "no significant wealth"
**Size:** M
**Depends on:** 3.2

### Story 4.2 — Web-signal probabilistic wealth scoring
**As a** pipeline operator
**I want** the WealthScoringAgent to assign a probabilistic wealth tier based on non-PSC signals when deterministic signals are absent
**So that** the dossier conveys meaningful capacity information even when the PSC register is silent, while clearly distinguishing estimates from facts
**AC1:** probabilistic signals and their weights: senior finance role (partner/MD at major bank or PE firm) → high; senior corporate director (FTSE 350) → high; multiple luxury property proxies via OCOD → medium; significant grant-giving scale (>£100k/year via GrantNav) → medium; honours (CBE/knighthood in business/philanthropy category) → low-medium
**AC2:** WealthScoringAgent runs on Claude Sonnet with a cached scoring rubric
**AC3:** output wealth_tier is one of: `confirmed_5m` | `probable_5m` | `insufficient_signal`
**AC4:** every probabilistic score records: signal_list (which signals contributed), scoring_basis (rubric reference), and explicit label "estimated — not confirmed"
**AC5:** `probable_5m` and `confirmed_5m` are never conflated in any output; the distinction is enforced at the schema level
**Size:** M
**Depends on:** 3.2, 3.4, 3.5, 4.1

### Story 4.3 — Human override of wealth tier
**As a** fundraiser
**I want** to override the system's wealth tier assignment when I have information the pipeline cannot access
**So that** off-system knowledge (e.g., a personal conversation, private information shared by a mutual contact) can be recorded with a documented basis and not silently overwritten on re-run
**AC1:** fundraiser can set `wealth_tier_override: {tier, basis, operator_id, timestamp}` in the review file
**AC2:** override is propagated to the dossier with explicit label "human override — basis: [stated basis]"
**AC3:** pipeline re-run does not overwrite a recorded human override without explicit `--clear-override` flag
**AC4:** all overrides are logged in the audit trail with operator_id and timestamp
**Size:** S
**Depends on:** 4.2

---

## E5 — Job A synthesis (donor enrichment dossier)

### Story 5.1 — SynthesisAgent produces a structured Job A dossier
**As a** fundraiser
**I want** the pipeline to produce a structured enrichment dossier for each processed donor
**So that** I have a sourced, readable summary of the donor's connections, roles, and capacity before deciding whether to escalate to Job C
**AC1:** dossier sections: executive summary (3 sentences max), corporate roles, charity trusteeships, grant connections, overseas property, wealth tier with basis, adverse signals, and recommended next step
**AC2:** every factual claim includes a `source_url` or is explicitly labelled "not found in public data"
**AC3:** `£5M+ confirmed` and `£5M+ probable` are always presented as distinct sections; never merged
**AC4:** dossier is output as structured JSON and rendered to markdown for human review
**AC5:** hallucination guard: if Claude cannot source a claim, it must write "not found" — not fabricate. Enforced in prompt; spot-checked in TEST_PLAN.md
**Size:** M
**Depends on:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2

### Story 5.2 — Batch Job A runs against a list of donors
**As a** fundraiser
**I want** to submit a batch of up to 500 donor records and receive all dossiers within 24 hours
**So that** I can process a full supporter list without running records individually
**AC1:** batch input: CSV with one donor per row; same schema as Story 1.1
**AC2:** each record processed independently via RQ job queue; failures do not block other records
**AC3:** batch status endpoint shows per-record progress: `{tracking_id, status, dossier_ready}`
**AC4:** batch completion notification written to log when all records are complete or failed
**AC5:** batch API used for all Sonnet/Haiku/Opus calls within the batch (50% cost saving)
**Size:** M
**Depends on:** 5.1

---

## E6 — Human review checkpoints

### Story 6.1 — Checkpoint 1: fundraiser reviews shortlist before Job C runs
**As a** fundraiser
**I want** to review and approve or reject each shortlisted candidate before the expensive Job C Opus dossier runs
**So that** Opus batch API costs are not incurred for candidates I can already exclude based on the Job A summary
**AC1:** all candidates with `wealth_tier: probable_5m | confirmed_5m` are written to `reviews/short_YYYYMMDD_DONORNAME.md`
**AC2:** review file contains: Job A executive summary, wealth tier and basis, connection count, top 3 co-trustee connections
**AC3:** reviewer approves by adding `decision: approve` or `decision: reject` with optional notes to the review file
**AC4:** pipeline waits for review decision before launching Job C; timeout at 72 hours generates a reminder log entry
**AC5:** all decisions logged with operator_id and timestamp
**Size:** M
**Depends on:** 5.1

### Story 6.2 — Uncertainty-threshold auto-escalation to human review
**As a** pipeline operator
**I want** the system to automatically route records to human review when key confidence thresholds are not met
**So that** uncertain outputs never reach fundraisers as if they were high-confidence results
**AC1:** the following conditions trigger automatic human review escalation:
  - Entity resolution confidence < 0.85 (Story 2.1)
  - Wealth tier is `insufficient_signal` but GrantNav shows >£50k connected grants (possible false negative)
  - Relationship connection_strength < 0.6 for the lead co-trustee connection
  - Any adverse_media signal present (regardless of confidence level)
**AC2:** escalation record states: which threshold was breached and why
**AC3:** escalated records cannot proceed to Job C without explicit human approval
**Size:** S
**Depends on:** 5.1

### Story 6.3 — Checkpoint 2: final sign-off before dossier is released for outreach
**As a** fundraiser
**I want** to review and formally sign off each completed Job C dossier before it enters the outreach pipeline
**So that** no prospect is approached without a human having read and approved their dossier
**AC1:** completed Job C dossiers are written to `reviews/dossier_YYYYMMDD_DONORNAME.md` with a sign-off block
**AC2:** sign-off block records: reviewer name, operator_id, date, decision (approve/reject/hold), and any notes
**AC3:** dossier status transitions to `approved_for_outreach` only after sign-off is written and validated
**AC4:** approved dossiers are moved to `output/approved/` directory; rejected to `output/rejected/` with reason
**Size:** S
**Depends on:** 6.1, E7

---

## E7 — Job C synthesis (lead dossier)

### Story 7.1 — SynthesisAgent (Opus) produces a full Job C lead dossier
**As a** fundraiser
**I want** a comprehensive, sourced lead dossier for each approved Job C candidate produced by Claude Opus
**So that** I have a defensible, major-gift-quality profile for every lead I take to relationship conversations
**AC1:** dossier sections: identity and background, corporate and charity network map, grant and philanthropy history, capacity assessment (confirmed vs. probable £5M+), connection path to Bloomsbury network, reputational and risk summary, recommended approach strategy
**AC2:** `£5M+ confirmed` requires: at least one PSC or HMLR OCOD record with sourced value indicator AND supporting web evidence
**AC3:** `£5M+ probable` requires: at least two probabilistic signals from the Story 4.2 rubric, each sourced
**AC4:** every section cites source_url; unsourced claims are written as "not identified in public data — manual research recommended"
**AC5:** Opus batch API used; 24h latency acceptable; standard API available for urgent cases at double cost
**Size:** L
**Depends on:** 6.1

### Story 7.2 — Connection path between lead and Bloomsbury network is surfaced
**As a** fundraiser
**I want** the dossier to show the shortest path between the lead and Bloomsbury's existing trustees, donors, or partners
**So that** I can identify the right introducer and frame the conversation authentically
**AC1:** connection path computed from TrusteeGraphResult co-trustee adjacency list and CompaniesHouseResult shared companies
**AC2:** path of 1 hop (direct co-trustee or co-director) is labelled "direct connection"
**AC3:** path of 2 hops is labelled "second-degree connection" with the intermediate node named
**AC4:** path of 3+ hops is labelled "extended network — further mapping recommended"
**AC5:** if no path is found, dossier states "no identified connection path — cold outreach basis"
**Size:** M
**Depends on:** 7.1

---

## E8 — Audit logging and compliance

### Story 8.1 — AuditLogger records all pipeline events
**As a** data protection officer
**I want** a complete, tamper-evident log of all pipeline events
**So that** I can respond to a DSAR or ICO inquiry by demonstrating exactly what data was accessed, when, and by whom
**AC1:** every API call is logged: endpoint, parameters (no PII in log body — use tracking_id only), response code, timestamp
**AC2:** every entity resolution decision is logged: input, candidates, scores, auto-selected or human-selected result, operator_id if human
**AC3:** every human review decision is logged: review type, decision, operator_id, timestamp
**AC4:** every Claude API call is logged: model, token counts (in/out), job type (A/B/C), batch or standard, tracking_id
**AC5:** log is append-only in the database; no log entry can be updated or deleted via the application layer
**Size:** M
**Depends on:** —

### Story 8.2 — DSAR deletion script
**As a** data protection officer
**I want** a single command to delete all data relating to a specific individual from the system
**So that** we can respond to a Subject Access Request or erasure request within the statutory 30-day window
**AC1:** `python cli.py delete-subject --tracking_id <id>` deletes: donor record, entity resolution results, all agent results, dossiers, review files, and audit log entries relating to the tracking_id
**AC2:** deletion is cascading across all tables; confirmed by a deletion receipt log entry with timestamp and operator_id
**AC3:** deletion receipt itself is retained in an immutable `deletion_receipts` table and is not deleted (demonstrates compliance)
**AC4:** script prints a summary of all records deleted and tables affected
**Size:** M
**Depends on:** 8.1

---

## E9 — Operations and monitoring

### Story 9.1 — Pipeline health monitoring
**As a** pipeline operator
**I want** basic health monitoring for the job queue and API error rates
**So that** I can detect CH/CC API degradation or rate-limit breaches before they cause silent data gaps
**AC1:** health check endpoint reports: RQ queue depth, last successful CH API call timestamp, last successful CC API call timestamp, error rate in last hour
**AC2:** if error rate for any API exceeds 10% in a 1-hour window, a warning is written to the structured log
**AC3:** dead-letter queue items (records that failed after max retries) are reported in health check response
**Size:** S
**Depends on:** E3

### Story 9.2 — Cost tracking per batch run
**As a** pipeline operator
**I want** the system to record Claude API token usage and estimated cost per batch run
**So that** actual costs can be compared against the COST.md estimates and anomalies flagged
**AC1:** after each batch run, a cost summary is written to the log: records processed, total input tokens (by model), total output tokens (by model), estimated cost (GBP) at current pricing
**AC2:** estimated cost uses rates from COST.md; pricing can be updated in a config file without code changes
**AC3:** cost summary is queryable by tracking_id for per-record cost attribution
**Size:** S
**Depends on:** 8.1

### Story 9.3 — Gold-set regression test on every pipeline run
**As a** pipeline operator
**I want** the pipeline to automatically run the gold-set test cases on every batch run and report any regression
**So that** I can detect recall drops (e.g., caused by CC API schema changes) before they affect live dossiers
**AC1:** 10 known-answer gold set records are included in every batch run as a hidden test cohort
**AC2:** post-run, recall and precision are computed against gold-set answers; result written to log
**AC3:** if connection recall drops below 85% or hallucination rate is > 0%, a `regression_alert` flag is written to the health check response
**Size:** M
**Depends on:** 9.1, TEST_PLAN.md gold set (week-1 priority)
