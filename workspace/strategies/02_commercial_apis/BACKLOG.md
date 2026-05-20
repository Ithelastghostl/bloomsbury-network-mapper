# Backlog: Strategy 2 — Commercial API Stack + Claude Synthesis

Story sizing: S = ≤0.5 day, M = 0.5–2 days, L = 2–5 days, XL = >5 days.

---

## E1 — Ingest and store a donor record with consent metadata

### Story 1.1 — Fundraiser submits a donor record
**As a** fundraiser
**I want** to submit a donor record (CSV or JSON) and receive an acknowledgement with a tracking ID
**So that** I can later retrieve the enriched dossier
**AC1:** POST /donors accepts JSON body or multipart CSV; returns 201 with `job_id` (UUID)
**AC2:** Required fields: `name`. Optional: `dob_year`, `dob_month`, `address`, `email`
**AC3:** Missing required fields return 422 with field-level error messages
**Size:** S
**Depends on:** —

### Story 1.2 — Consent metadata is captured and stored
**As a** data protection officer
**I want** every donor record to carry a lawful basis and timestamp
**So that** we can demonstrate compliance with UK GDPR Article 6
**AC1:** `consent.lawful_basis` must be one of: `legitimate_interest`, `consent`
**AC2:** `consent.recorded_at` defaults to submission timestamp if not provided
**AC3:** `consent.opt_out = true` causes record to be archived immediately without enrichment; audit log entry written
**Size:** S
**Depends on:** 1.1

### Story 1.3 — US vendor transfer mechanism gate
**As a** data protection officer
**I want** the pipeline to refuse fan-out to US vendors if no transfer mechanism is on record
**So that** we never make a restricted transfer without a valid IDTA or SCCs in place
**AC1:** DonorRecord has `transfer_mechanism` field; valid values: `idta`, `scc`, `none`
**AC2:** `transfer_mechanism = none` causes APIOrchestrator to skip all US-vendor endpoints and log a `TransferMechanismMissingError` event
**AC3:** Dossier produced without US vendor data is labelled "UK sources only" in the output
**Size:** M
**Depends on:** 1.2

### Story 1.4 — Bulk CSV ingest
**As a** fundraiser
**I want** to upload a CSV of up to 500 donor records in one request
**So that** I don't have to submit records individually for batch runs
**AC1:** CSV columns map to DonorRecord fields (name required; others optional with documented defaults)
**AC2:** Rows with validation errors are rejected individually; valid rows proceed; summary returned (N accepted, M rejected, error details)
**AC3:** Each accepted row receives its own `job_id`
**Size:** M
**Depends on:** 1.2

---

## E2 — API fan-out, entity resolution, and Claude synthesis

### Story 2.1 — Entity resolution with confidence scoring (Claude Haiku)
**As a** pipeline operator
**I want** the system to match a submitted donor name against Companies House and Charity Commission records and produce a confidence-scored resolved entity
**So that** we do not query commercial APIs on a wrongly-matched identity
**AC1:** EntityResolver queries CH `officer_search` and CC `trustee_data` by submitted name
**AC2:** Each candidate match is scored on: exact name match (40%), DOB match if available (30%), address match if available (30%)
**AC3:** Highest-confidence candidate is selected if score ≥ 0.85; record is escalated to HumanReviewQueue (type=ENTITY) if score < 0.85
**AC4:** Claude Haiku used for name normalisation and scoring; all candidates and scores written to ResolvedEntity record in Postgres
**Size:** M
**Depends on:** 1.2

### Story 2.2 — Companies House API fan-out
**As a** pipeline operator
**I want** the system to retrieve all Companies House officer appointments and PSC records for a resolved entity
**So that** we have a complete picture of corporate affiliations for Job A and B
**AC1:** CH `officer_appointments` called with resolved `officer_id`; full appointment history stored as RawSignal
**AC2:** CH PSC register queried for each company where individual is an officer; PSC results stored as RawSignal
**AC3:** Rate limit enforced: Redis token bucket at 600 req/5-min; exponential back-off on 429 (max 3 retries)
**AC4:** API errors (non-429) stored in RawSignal.error field; pipeline continues without that signal
**Size:** M
**Depends on:** 2.1

### Story 2.3 — Charity Commission fan-out
**As a** pipeline operator
**I want** the system to retrieve all Charity Commission trustee and related-charity records for a resolved entity
**So that** co-trusteeship networks can be mapped at ~90–95% recall
**AC1:** CC `GetCharityTrustees` and `GetTrusteeAndRelatedCharities` called for each charity where individual is a trustee
**AC2:** Conservative 1 req/s rate limit applied; monitored for 429 responses
**AC3:** Results stored as RawSignal with `source_signal_id = signal.charity_commission_ew.trustee_data`
**Size:** M
**Depends on:** 2.1

### Story 2.4 — 360Giving and supplementary free source fan-out
**As a** pipeline operator
**I want** grant history and HMLR overseas property data to be included in the fan-out
**So that** philanthropic and property signals are available for Job A synthesis
**AC1:** 360Giving GrantNav bulk CSV is pre-loaded at pipeline start; lookup by recipient name/charity number from resolved entity; no per-record API call
**AC2:** HMLR OCOD bulk CSV pre-loaded; lookup by individual or associated company name; results stored as RawSignal
**AC3:** UK Sanctions List (pre-downloaded XML/CSV at batch start) checked for name match; match or no-match stored as RawSignal
**Size:** M
**Depends on:** 2.1

### Story 2.5 — DonorSearch commercial API fan-out
**As a** pipeline operator
**I want** the system to query DonorSearch for philanthropic capacity scores and giving history
**So that** US-connected philanthropy signals supplement the UK open-source data
**AC1:** DonorSearch API called only if `transfer_mechanism != none` (Story 1.3 gate enforced)
**AC2:** Per-contract rate limit configured in environment variable `DONORSEARCH_RATE_LIMIT`
**AC3:** Response stored as RawSignal with `source_signal_id = signal.donorsearch.wealth_screening`
**AC4:** If no DonorSearch record found for this individual, RawSignal stored with `payload = {"result": "not_found"}` and `us_bias_warning = true` set on DossierDraft
**Size:** M
**Depends on:** 1.3, 2.1

### Story 2.6 — Wealth-X (Altrata) commercial API fan-out
**As a** pipeline operator
**I want** the system to query Wealth-X for UHNWI profile, estimated net worth, and associates data
**So that** individuals above the $30m threshold receive the richest available wealth profile
**AC1:** Wealth-X API called only if `transfer_mechanism != none`
**AC2:** Response stored as RawSignal with `source_signal_id = signal.altrata.wealth_x`
**AC3:** If Wealth-X returns a profile, wealth_tier band set from their net worth estimate with label `vendor_estimate`
**AC4:** If no profile found, `us_bias_warning = true` set on DossierDraft; explicit label "Below Wealth-X coverage threshold or not found" written to dossier
**Size:** M
**Depends on:** 1.3, 2.1

### Story 2.7 — Job A synthesis (Claude Sonnet)
**As a** prospect researcher
**I want** all raw signals for a donor to be synthesised into a structured Job A dossier
**So that** I receive a coherent, sourced profile rather than raw API payloads
**AC1:** SynthesisAgent loads all RawSignals for job_id; system prompt + scoring rubric sent as cached context
**AC2:** Every claim in the output dossier includes `source_signal_id` from 04_signal_inventory.md; absent fields explicitly labelled "Not found in available sources"
**AC3:** Claude Sonnet used for standard records (80%); records with conflicting signals across sources (e.g., different DOB from CH vs DonorSearch) escalated to Claude Opus
**AC4:** DossierDraft written to Postgres; `synthesised_by` field records which model was used
**AC5:** Prompt caching applied: system prompt + rubric sent as cached context at batch start; cache hit verified in response headers
**Size:** L
**Depends on:** 2.2, 2.3, 2.4, 2.5, 2.6

---

## E3 — Wealth scoring and shortlisting

### Story 3.1 — Apply wealth scoring rubric
**As a** prospect researcher
**I want** each dossier draft to receive a numerical wealth and relationship score
**So that** the pipeline can automatically route high-potential leads to Job C enrichment
**AC1:** WealthScorer reads DossierDraft; produces WealthScore with: `wealth_confidence`, `relationship_score`, `philanthropic_count`, `adverse_flag_count`
**AC2:** Scoring rubric documented and version-controlled in `config/scoring_rubric.yaml`
**AC3:** WealthScore written to Postgres and linked to DossierDraft via job_id
**Size:** M
**Depends on:** 2.7

### Story 3.2 — Route records to Job C or archive
**As a** pipeline operator
**I want** the scoring output to automatically route qualifying records to Job C and archive non-qualifying records
**So that** commercial enrichment spend is concentrated on high-potential leads
**AC1:** Records with `wealth_confidence ≥ 0.70` AND `relationship_score ≥ 0.60` published to Redis queue "job_c"
**AC2:** Records below either threshold: if `wealth_confidence < 0.70` OR `relationship_score < 0.60`, written to HumanReviewQueue (type=UNCERTAINTY) for Checkpoint 2 review
**AC3:** Records that fail scoring and are not escalated are archived with `status = archived`; audit log entry written
**Size:** S
**Depends on:** 3.1

### Story 3.3 — Fundraiser views shortlist summary
**As a** fundraiser
**I want** to see a summary of how many records are in each routing bucket after scoring
**So that** I know the pipeline is running and can estimate review workload
**AC1:** GET /jobs/{batch_id}/summary returns: total submitted, resolved, synthesis_complete, qualified_for_job_c, pending_human_review, archived
**AC2:** Response updates in real time as jobs complete
**Size:** S
**Depends on:** 3.2

---

## E4 — Commercial wealth scoring integration

### Story 4.1 — DonorSearch score normalisation
**As a** pipeline engineer
**I want** DonorSearch wealth ratings to be normalised to the pipeline's internal wealth band schema
**So that** DonorSearch output integrates cleanly with the WealthScorer and DossierDraft schema
**AC1:** Mapping table defined in `config/donorsearch_band_map.yaml`: DonorSearch score ranges → internal bands (`<1m`, `1m-5m`, `5m-30m`, `30m+`)
**AC2:** Mapped band written to DossierDraft.wealth_tier with `label = vendor_estimate`
**AC3:** If DonorSearch returns a "not found" result, internal band set to `unknown` and `us_bias_warning = true`
**Size:** S
**Depends on:** 2.5

### Story 4.2 — Wealth-X net worth estimate integration
**As a** pipeline engineer
**I want** Wealth-X estimated net worth figures to populate the DossierDraft wealth tier
**So that** UHNWI profiles are surfaced accurately in the output dossier
**AC1:** Wealth-X `estimated_net_worth` field mapped to internal wealth band; `label = vendor_estimate`
**AC2:** Where Wealth-X provides an associate list, associates written to `network_connections` with `source_id = signal.altrata.wealth_x`
**AC3:** Wealth-X profiles below $30m (where coverage is thin) are flagged with a note: "Wealth-X coverage is strongest above $30m; this estimate may be unreliable" [my estimate — documented weakness from 03_reliability_ceiling.md]
**Size:** M
**Depends on:** 2.6

### Story 4.3 — Factary Phi integration (manual / semi-automated)
**As a** prospect researcher
**I want** Factary Phi results to be incorporated into the dossier
**So that** UK donation history supplements the US-biased commercial data
**AC1:** v1 integration: Factary Phi results exported as CSV from web UI and imported via ingest endpoint with `source_signal_id = signal.factary.phi_donations_db`
**AC2:** Imported Factary records linked to DonorRecord by job_id and written to RawSignal table
**AC3:** SynthesisAgent includes Factary signal in Job A synthesis pass
**Note:** Factary does not publish an API; automation deferred to v2 if batch export is supported. v1 is manual CSV import.
**Size:** M
**Depends on:** 2.7

### Story 4.4 — Vendor coverage audit report
**As a** fundraising director
**I want** to see what percentage of submitted records returned results from each commercial vendor
**So that** I can assess whether the vendor contract is producing value
**AC1:** GET /reports/vendor_coverage returns, per vendor: total records queried, records with result found, records with not_found, records skipped (no transfer mechanism)
**AC2:** Report exportable as CSV
**AC3:** `us_bias_warning` count shown separately — records where all US vendors returned not_found
**Size:** M
**Depends on:** 2.5, 2.6, 4.3

---

## E5 — Human review checkpoints

### Story 5.1 — Checkpoint 1: entity resolution review interface
**As a** prospect researcher
**I want** to review flagged entity resolution cases (confidence < 0.85) and select the correct match
**So that** no commercial API call is made on a wrongly-matched identity
**AC1:** Checkpoint 1 review file written to `reviews/checkpoint1/{job_id}.md` with: submitted name, all candidates with scores, CH and CC profile links
**AC2:** Reviewer selects correct candidate (or "none — create new record") by editing the review file
**AC3:** Pipeline resumes fan-out once reviewer decision is written; audit log records reviewer ID and decision
**AC4:** Time budget: ≤15 minutes per record; records unreviewed after 24h are escalated to fundraising director
**Size:** M
**Depends on:** 2.1

### Story 5.2 — Checkpoint 2: uncertainty threshold review
**As a** prospect researcher
**I want** to review records where wealth confidence < 0.70 or relationship score < 0.60
**So that** borderline records receive a human judgement before being archived or escalated to Job C
**AC1:** Checkpoint 2 review file written to `reviews/checkpoint2/{job_id}.md` with: DossierDraft summary, WealthScore detail, signal source list, specific uncertainty flags
**AC2:** Reviewer options: approve_for_job_c, archive, request_additional_research
**AC3:** `request_additional_research` pauses the job and notifies the fundraiser via audit log entry
**AC4:** Time budget: ≤30 minutes per record
**Size:** M
**Depends on:** 3.2

### Story 5.3 — Checkpoint 3: final dossier sign-off
**As a** Director of Fundraising
**I want** to review and approve or reject the final lead dossier before it is released
**So that** no unsourced or inaccurate claim reaches the cultivation team
**AC1:** Checkpoint 3 review file written to `reviews/checkpoint3/{job_id}.md` with the full LeadDossier
**AC2:** Reviewer can approve, reject, or mark as "edited" (editing the markdown file directly)
**AC3:** Approved dossiers are copied to `output/{job_id}.md`; rejected dossiers are archived with reason
**AC4:** Time budget: ≤60 minutes per dossier
**AC5:** Dossier released without sign-off is a pipeline error; AuditLogger must not record a release without a `reviewer_sign_off` record
**Size:** M
**Depends on:** E6 (Job C dossier)

---

## E6 — Job C lead dossier generation

### Story 6.1 — Job C Opus synthesis via Batch API
**As a** prospect researcher
**I want** qualifying leads to receive a full lead dossier including capacity narrative, sanctions status, and relationship path
**So that** the cultivation team receives actionable intelligence on high-potential prospects
**AC1:** SynthesisAgent (Claude Opus) invoked via Batch API for all Job C records in queue
**AC2:** Capacity narrative includes: wealth band with confidence label (`[verified]`, `[vendor_estimate]`, or `[my_estimate]`); specific indicators (PSC stakes, property, philanthropy scale); explicit caveat if estimate derived from proxies
**AC3:** Sanctions check: UK Sanctions List result included; "clear" or "match — review required"
**AC4:** PEP indicators sourced from public role data (Wikipedia, GOV.UK); label "incomplete — no systematic PEP database" if not covered by commercial AML vendor
**AC5:** Relationship path to Bloomsbury trustees: minimum 1 hop shown if found; "No path found in available sources" if not
**AC6:** Prompt caching applied to Opus Job C batch (shared evaluation framework cached)
**Size:** L
**Depends on:** 3.2, 2.7

### Story 6.2 — Adverse media synthesis
**As a** Director of Fundraising
**I want** the dossier to include a summary of any adverse media found
**So that** reputational risks are surfaced before a gift approach is made
**AC1:** Adverse media signals (if any) from Wealth-X or DonorSearch included in synthesis
**AC2:** If no adverse media signals found in commercial data, Claude Opus notes "No adverse media found in available commercial sources; manual web search recommended for high-value prospects"
**AC3:** Any adverse media summary is sourced (URL or signal ID); Claude must not fabricate reputational claims
**Size:** M
**Depends on:** 6.1

---

## E7 — Audit logging and compliance

### Story 7.1 — Append-only audit log
**As a** data protection officer
**I want** every pipeline event logged in an append-only audit table
**So that** we can demonstrate compliance and investigate any incident
**AC1:** AuditLogger writes to Postgres `audit_events` table; no UPDATE or DELETE permitted on this table (enforced by table-level constraint)
**AC2:** Events logged: donor_submitted, entity_resolved, api_call_made, model_invoked, human_decision, dossier_released, transfer_mechanism_missing, opt_out_received
**AC3:** Each event includes: event_id (UUID), event_type, job_id, timestamp, detail (JSONB)
**Size:** M
**Depends on:** 1.1

### Story 7.2 — DSAR response preparation
**As a** data protection officer
**I want** to be able to retrieve all data held on an individual across the pipeline
**So that** we can respond to a Data Subject Access Request within the statutory 30-day window
**AC1:** GET /dsar?name={name}&email={email} returns all DonorRecords, RawSignals, DossierDrafts, LeadDossiers, and AuditEvents linked to that individual
**AC2:** Response includes data from all vendor sources (with vendor identified)
**AC3:** Response exportable as JSON and PDF
**AC4:** DSAR endpoint restricted to DPO role; access logged in audit_events
**Size:** L
**Depends on:** 7.1

### Story 7.3 — Data retention enforcement
**As a** data protection officer
**I want** donor records and dossiers to be automatically flagged for deletion after the defined retention period
**So that** we do not hold personal data longer than necessary
**AC1:** Retention period configurable per data category (default: 3 years from last interaction)
**AC2:** Scheduled job runs daily; flags records past retention date with `status = pending_deletion`
**AC3:** DPO reviews and approves deletion batch; actual deletion requires explicit approval and is logged in audit_events
**Size:** M
**Depends on:** 7.1

---

## E8 — Testing and quality assurance

### Story 8.1 — Gold set test harness
**As a** pipeline engineer
**I want** a suite of known-good donor records with expected outputs
**So that** I can verify accuracy after any change to models, prompts, or API integrations
**AC1:** Gold set of 20 records defined (see TEST_PLAN.md): 5 UHNWI, 5 HNW UK-only, 5 minimal footprint, 5 edge cases
**AC2:** Test harness runs the full pipeline against gold set and compares output to expected values
**AC3:** Hallucination check: every claim in output must have a source_signal_id present in the input RawSignals; any claim without a matching source fails the test
**AC4:** Test run produces a metrics report: dossier accuracy %, connection precision %, wealth-tier accuracy %, hallucination count
**Size:** L
**Depends on:** 2.7, 6.1

### Story 8.2 — Entity resolution collision tests
**As a** pipeline engineer
**I want** the entity resolver to be tested against common-name collision scenarios
**So that** I know it correctly escalates ambiguous matches rather than silently merging wrong records
**AC1:** Test cases include: "James Bennett" (matches multiple CH officers), "David Smith" (high collision rate), single-name individual with no CH record
**AC2:** All common-name cases must produce confidence < 0.85 and trigger escalation
**AC3:** Zero false merges permitted in test suite (a wrong merge is a critical failure)
**Size:** M
**Depends on:** 2.1

---

## E9 — Documentation and handover

### Story 9.1 — Runbook: daily batch operation
**As a** fundraising coordinator
**I want** step-by-step instructions for running a batch enrichment job
**So that** the pipeline can be operated without the engineer present
**AC1:** Runbook covers: CSV preparation, ingest command, monitoring job progress, reviewing checkpoints, retrieving output dossiers
**AC2:** Runbook includes troubleshooting section for common errors (rate limit, entity resolution escalation, vendor API failure)
**Size:** S
**Depends on:** E1–E7 complete

### Story 9.2 — Vendor contract and DPA checklist
**As a** data protection officer
**I want** a documented checklist of required contract clauses and DPA requirements per vendor
**So that** procurement is completed correctly before any data is transferred
**AC1:** Checklist covers: DonorSearch, Wealth-X (Altrata), Factary Phi, Anthropic Claude API
**AC2:** Each vendor entry includes: Article 28 DPA status (signed/pending), IDTA/SCC status, sub-processor list obtained (yes/no), security due diligence completed (yes/no)
**AC3:** Checklist integrated into pipeline startup check: pipeline refuses to start if any mandatory DPA is not marked as signed
**Size:** M
**Depends on:** —
