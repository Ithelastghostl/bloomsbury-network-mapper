# Backlog — Strategy 4 Hybrid Tiered Pipeline

Sizes: XS < 1 day | S = 1–2 days | M = 3–5 days | L = 6–10 days

---

## E1 — Ingest and store a donor record with consent metadata

### Story 1.1 — Fundraiser submits a donor record via CLI

**As a** fundraiser  
**I want to** submit a donor name, address, known roles, and consent flag via a command-line tool  
**So that** the pipeline has a validated starting record with full provenance before any processing begins

**Acceptance criteria:**
- CLI accepts CSV or JSON input; validates required fields (name_full, consent_flag)
- Missing required fields cause a descriptive error with no partial write
- Record assigned a UUID donor_id and written to Postgres donors table
- ingested_at and ingested_by fields populated automatically
- Duplicate name + address combination warns operator; does not auto-reject

**Size:** S  
**Depends on:** —

---

### Story 1.2 — Consent flag enforced before any data processing

**As a** data protection officer  
**I want** the pipeline to refuse to process any record with consent_flag = false  
**So that** no personal data enrichment occurs without a documented lawful basis

**Acceptance criteria:**
- Tier1Orchestrator checks consent_flag before dispatching agents
- Records with consent_flag = false are quarantined in a separate Postgres table with reason logged
- Quarantined records do not appear in ShortlistQueue or Tier 2 flows
- Operator can update consent_flag via a separate CLI command with reason string; creates audit log entry

**Size:** S  
**Depends on:** 1.1

---

### Story 1.3 — Bulk ingestion from CSV with validation report

**As a** fundraiser  
**I want to** submit a CSV of 100–400 donor records in a single command  
**So that** I can run a monthly batch without manual per-record entry

**Acceptance criteria:**
- CLI accepts multi-record CSV with header row
- Validation report produced: count of valid / invalid / duplicate records
- Invalid records written to errors CSV with column-level error messages; do not block valid records
- Valid records committed to Postgres in a single transaction
- CLI exits non-zero if more than 10% of records are invalid

**Size:** M  
**Depends on:** 1.1, 1.2

---

## E2 — Tier 1: Open-source data retrieval

### Story 2.1 — Companies House agent retrieves officer and PSC data

**As a** pipeline  
**I want** to query Companies House for a donor's director history and PSC roles  
**So that** Tier 1 has corporate wealth indicators without commercial data spend

**Acceptance criteria:**
- CompaniesHouseAgent calls officer_search, officer_appointments, and persons_with_significant_control endpoints for each donor_id
- Results normalised to director_roles[] and psc_roles[] arrays per ARCHITECTURE.md Data Contract §2
- Each result includes company_number, role, dates, and source_url pointing to the CH API response URL
- API rate limit respected: ≤2 req/s sustained; exponential backoff on 429 responses
- Partial failures (company dissolved, officer not found) logged to audit_log; do not fail the full record

**Size:** M  
**Depends on:** 1.1

---

### Story 2.2 — Trustee Graph agent retrieves co-trusteeship connections

**As a** pipeline  
**I want** to query the Charity Commission register for all charities where a donor is or was a trustee  
**So that** the co-trusteeship network is populated with near-complete recall

**Acceptance criteria:**
- TrusteeGraphAgent uses CC bulk download (daily ZIP) as primary source; CC API as fallback for individual lookups
- For each donor, returns all current and historical trustee roles with charity_number, charity_name, role, start_date, end_date
- Name matching uses normalised form (lowercase, no punctuation, middle initial handling); ambiguous matches flagged with confidence score
- Result written to trustee_connections[] per Data Contract §2 with source_url
- Coverage: all ~170,000 E&W registered charities included in each batch run

**Size:** M  
**Depends on:** 1.1

---

### Story 2.3 — GrantNav and honours agents retrieve grant history and prominence signals

**As a** pipeline  
**I want** to cross-reference a donor against 360Giving GrantNav and GOV.UK honours lists  
**So that** philanthropic grant history and public prominence are captured at zero variable cost

**Acceptance criteria:**
- GrantNavAgent joins bulk GrantNav CSV on charity_number and known_recipient_name_variants
- Results include funder, amount_gbp, award_date, recipient_name, source_url
- WebSearchAgent scrapes GOV.UK honours lists and returns honours[] with award name and year
- Web search queries limited to ≤10 per donor to stay within monthly budget
- All results written to Tier1EnrichmentResult per Data Contract §2

**Size:** M  
**Depends on:** 1.1

---

### Story 2.4 — ShortlistScorer scores all Tier 1 results and populates ShortlistQueue

**As a** pipeline  
**I want** Claude Sonnet to score each Tier 1 result on co-trusteeship density, PSC wealth signal, grant history, and honours  
**So that** only records with sufficient open-source signal advance to the human gate

**Acceptance criteria:**
- ShortlistScorer sends Tier1EnrichmentResult to claude-sonnet-4-6 with cached scoring rubric prompt
- Returns ShortlistScore per Data Contract §3 with composite_score 0.0–1.0
- Records with composite_score ≥ 0.65 (configurable threshold) written to ShortlistQueue in Postgres
- Records with adverse_flag = true bypassed from ShortlistQueue regardless of score; routed to separate review
- Prompt cache used for system prompt (1-hour TTL); cache hit rate logged to audit_log
- No LLM output accepted without source justification for each dimension score

**Size:** M  
**Depends on:** 2.1, 2.2, 2.3

---

## E3a — Tier 1: ShortlistGate (human checkpoint)

### Story 3a.1 — Reviewer sees ranked shortlist before any Tier 2 spend

**As a** head of fundraising  
**I want to** review the Tier 1 shortlist in a single view showing each candidate's top signals and score  
**So that** I can approve, reject, or modify the list before commercial enrichment costs are committed

**Acceptance criteria:**
- Shortlist rendered as a markdown file in reviews/shortlist_YYYYMMDD.md with: rank, name, composite_score, top 3 signals with source URLs, estimated Tier 2 cost if approved
- File updated automatically when ShortlistQueue is populated; Prefect notifies reviewer via email/Slack webhook
- Reviewer marks each candidate as approved / rejected / modified directly in the markdown (or via CLI command); decision written to shortlist_approvals table
- Tier 2 Prefect flow does NOT start for a candidate until a ShortlistApproval record exists for that donor_id
- Reviewer can add a candidate not in the automated shortlist (manual override); override reason required
- SLA: reviewer target ≤ 2 business days; Prefect sends reminder at 48 hours if approval is pending

**Size:** M  
**Depends on:** 2.4

---

### Story 3a.2 — ShortlistGate audit trail records every human decision

**As a** data protection officer  
**I want** every approve/reject/modify decision at the ShortlistGate to be immutably logged  
**So that** we can demonstrate that Tier 2 commercial enrichment was always human-authorised

**Acceptance criteria:**
- Each ShortlistApproval record written with reviewer_id, reviewed_at, decision, and notes
- Decisions cannot be overwritten; if a reviewer changes their mind, a new ShortlistApproval record supersedes the previous one (original preserved in audit_log)
- Report available showing: total candidates shortlisted by Tier 1, number approved / rejected / modified by humans, Tier 2 cost committed
- Prefect pauses the batch and raises an alert if ShortlistApproval is missing for any candidate after 5 business days

**Size:** S  
**Depends on:** 3a.1

---

## E3b — Tier 2: Commercial enrichment

### Story 3b.1 — Factary Phi lookup submitted and results ingested for approved shortlist

**As a** pipeline  
**I want** approved shortlist records submitted to Factary Phi for UK philanthropic history lookup  
**So that** Tier 2 enrichment adds the donation history signal that open-source cannot provide

**Acceptance criteria:**
- Tier2Orchestrator generates a Factary submission CSV for all approved candidates and places it in a shared folder (or emails to designated Factary contact)
- No personal data is transmitted to Factary without a ShortlistApproval record for that donor_id
- Results returned by Factary (CSV export) ingested by a Prefect task on webhook notification or scheduled poll
- Results normalised to factary_donations[] and factary_wealth_proxies[] arrays per Data Contract §5
- Each result retains Factary source URL
- If Factary returns no record for a candidate, factary_donations = [] and a factary_no_record flag is set; processing continues

**Size:** M  
**Depends on:** 3a.1

---

### Story 3b.2 — Optional Wealth-X lookup for UHNWI-flagged leads

**As a** pipeline  
**I want** Wealth-X profiles requested only for leads flagged as likely UHNWI  
**So that** the most expensive commercial enrichment is used only where the open-source signal already suggests >$30m net worth

**Acceptance criteria:**
- uhnwi_flag = true is set by ShortlistScorer when psc_estimated_band = "UHNWI" or honours_signal = true + psc_wealth_indicator = true
- WealthXClient sends lookup only for uhnwi_flag = true candidates
- Results normalised to wealth_x_profile per Data Contract §5
- IDTA or Transfer Impact Assessment reference stored per donor_id before any data is sent to Wealth-X
- Wealth-X lookup can be disabled globally by feature flag without pipeline disruption

**Size:** M  
**Depends on:** 3a.1

---

### Story 3b.3 — WealthConfirmer reconciles Tier 1 and Tier 2 signals

**As a** pipeline  
**I want** Claude Sonnet to reconcile Tier 1 probabilistic signals with Tier 2 confirmed data  
**So that** the final ReconciledLeadRecord reflects the best available evidence with conflicts flagged

**Acceptance criteria:**
- WealthConfirmer sends combined Tier1EnrichmentResult + Tier 2 vendor outputs to claude-sonnet-4-6
- Output is a ReconciledLeadRecord per Data Contract §5 with entity_resolution_confidence and wealth_confirmation_confidence
- entity_resolution_confidence < 0.85 routes to uncertainty review queue (see E6)
- wealth_confirmation_confidence < 0.7 routes to uncertainty review queue
- Every reconciled claim has a source_signal attribute pointing to the originating signal ID
- Batch API used where 24-hour latency is acceptable

**Size:** M  
**Depends on:** 3b.1, 3b.2

---

## E4 — Job C: Lead dossier synthesis

### Story 4.1 — Job C SynthesisAgent produces a full lead dossier using Claude Opus

**As a** fundraiser  
**I want** a complete narrative dossier for each shortlisted lead including wealth estimate, network summary, giving history, and approach recommendation  
**So that** I have a usable briefing document before any donor contact

**Acceptance criteria:**
- SynthesisAgent sends ReconciledLeadRecord to claude-opus-4-7 via Batch API
- Output is a LeadDossier per Data Contract §6 with all fields populated or explicitly marked "not found"
- Wealth band estimate labelled "[my estimate]" in both the structured field and any narrative reference; never presented as confirmed fact
- Every factual claim in the narrative traceable to a signal ID in signals_used[]
- Zero tolerance for hallucinated facts: if a claim cannot be sourced, it must not appear; SynthesisAgent instructed accordingly in system prompt
- Dossier word count: 600–1,200 words (narrative sections); structured fields additionally

**Size:** M  
**Depends on:** 3b.3

---

### Story 4.2 — Dossiers delivered to HumanReviewQueue as markdown files

**As a** head of fundraising  
**I want** completed dossiers delivered to a reviews/ folder as formatted markdown files  
**So that** I can read and annotate them without needing a separate application

**Acceptance criteria:**
- Each dossier written to reviews/dossier_{donor_id}.md with standard sections: Executive Summary, Wealth Indicators, Network Connections, Giving History, Recommended Approach, Source List
- Prefect notifies fundraising team via email/Slack webhook when new dossiers are available
- Reviewer marks status in Postgres (pending → approved / rejected / revision_requested) via CLI or direct table update
- Approved dossiers copied to output/ folder; rejected dossiers move to reviews/rejected/

**Size:** S  
**Depends on:** 4.1

---

## E5 — Audit logging and data lineage

### Story 5.1 — Every API call and LLM prompt/response logged to audit_log

**As a** data protection officer  
**I want** every data retrieval action and LLM invocation recorded with a timestamp, source, and operator  
**So that** we can demonstrate data lineage and respond to DSARs

**Acceptance criteria:**
- AuditLogger writes an AuditLogEntry (Data Contract §7) for every: external API call, LLM request/response pair, human decision, and data write to Postgres
- PII is not written to audit_log body; log references donor_id only
- Audit log entries are append-only; no update or delete operations on audit_log table
- audit_log queryable by donor_id, tier, action, and timestamp range

**Size:** M  
**Depends on:** 1.1

---

### Story 5.2 — Data retention policy enforced by scheduled job

**As a** data protection officer  
**I want** Tier 1 and Tier 2 records automatically flagged for deletion after their respective retention periods  
**So that** data is not held longer than justified by the LIA

**Acceptance criteria:**
- Nightly scheduled Prefect task scans for records exceeding retention period (Tier 1: 24 months; Tier 2: 12 months — see COMPLIANCE.md)
- Expired records flagged with deletion_due = true and added to a deletion_queue table; not automatically deleted
- Deletion must be human-approved via CLI command; approval logged to audit_log
- After human approval, records deleted from all Postgres tables except audit_log (which retains donor_id and deletion_timestamp only)

**Size:** M  
**Depends on:** 5.1

---

## E6 — Uncertainty and human escalation

### Story 6.1 — Records failing entity resolution threshold routed to review

**As a** pipeline operator  
**I want** any lead where entity_resolution_confidence < 0.85 to pause and wait for human review  
**So that** we do not generate or deliver dossiers for misidentified individuals

**Acceptance criteria:**
- WealthConfirmer sets a resolution_review_required flag when entity_resolution_confidence < 0.85
- Flagged records written to Postgres uncertainty_queue with conflict description
- Prefect pauses Job C SynthesisAgent for that donor_id until uncertainty_queue entry is resolved
- Human reviewer sees the conflict (e.g., two "James Bennett" matches in CC register) and selects the correct identity or marks as "cannot resolve"
- Resolved records resume normal pipeline; "cannot resolve" records moved to unresolvable_queue and excluded from output

**Size:** M  
**Depends on:** 3b.3

---

### Story 6.2 — Records failing wealth confidence threshold routed to mid-Tier 2 review

**As a** head of fundraising  
**I want** leads where wealth_confirmation_confidence < 0.7 to be reviewed before a dossier is written  
**So that** weak or contradictory wealth signals are not presented as confident estimates

**Acceptance criteria:**
- WealthConfirmer sets wealth_review_required flag when wealth_confirmation_confidence < 0.7
- Flagged records written to uncertainty_queue with reconciliation_flags[] populated
- Human reviewer sees Tier 1 wealth proxies alongside Tier 2 vendor output and can: accept lower confidence, request additional Factary lookup, or mark as "wealth unconfirmed"
- Reviewer decision written to uncertainty_queue with reviewer_id and timestamp
- "Wealth unconfirmed" records proceed to Job C but dossier must state "wealth indicators insufficient to estimate capacity band"

**Size:** S  
**Depends on:** 3b.3

---

## E7 — Compliance documentation and DSAR support

### Story 7.1 — DSAR response pack generated on demand for any donor_id

**As a** data protection officer  
**I want** to generate a complete DSAR response pack for any donor_id in one CLI command  
**So that** we can meet the one-month DSAR deadline without manual data archaeology

**Acceptance criteria:**
- CLI command `dsar generate --donor-id <UUID>` outputs a structured markdown file with: all personal data held (across all Postgres tables), all audit_log entries for that donor_id, sources of data (signal IDs and URLs), human decisions made, and data shared with third parties (Factary, Wealth-X, DonorSearch)
- Output explicitly notes which data may be held by Factary and cannot be retrieved programmatically (see COMPLIANCE.md §DSAR)
- Generation completes in < 60 seconds for any single donor_id
- DSAR output does not itself create a new audit_log entry (to avoid infinite recursion)

**Size:** M  
**Depends on:** 5.1

---

## E8 — Monitoring, alerting, and pipeline observability

### Story 8.1 — Pipeline health dashboard via Prefect UI

**As a** pipeline operator  
**I want** a real-time view of pipeline status, queue depths, and failure counts  
**So that** I can identify and resolve issues without manual log inspection

**Acceptance criteria:**
- Prefect deployments named consistently: tier1_pipeline, tier2_pipeline, shortlist_gate_monitor, retention_sweeper
- Prefect UI shows: records ingested, Tier 1 completion rate, shortlist queue depth, ShortlistGate pending count, Tier 2 in-progress, dossiers delivered
- Failed Prefect tasks send alert to nominated Slack channel within 5 minutes of failure
- Rate limit backoff and retry counts visible in Prefect task logs

**Size:** S  
**Depends on:** 2.1, 3a.1

---

## E9 — Prototype evaluation and evidence gates

### Story 9.1 — Tier 1 prototype produces measurable recall against gold set

**As a** project lead  
**I want** the Tier 1 pipeline run against 20 known-positive co-trusteeship pairs  
**So that** we can confirm ≥ 85% recall before committing to Tier 2 build

**Acceptance criteria:**
- Gold set of 20 known co-trusteeship pairs (from Bloomsbury existing network; see TEST_PLAN.md) loaded as test donors
- Pipeline run produces Tier1EnrichmentResult for each
- Recall measured: (known pairs found) / (known pairs total); target ≥ 85%
- Results documented in a prototype evaluation report with per-record breakdown
- Tier 2 build does not begin unless recall ≥ 85% and ShortlistGate usability is confirmed

**Size:** M  
**Depends on:** 2.1, 2.2, 2.3, 2.4

---

### Story 9.2 — Tier 2 prototype measures confirmed wealth rate against ShortlistGate outputs

**As a** project lead  
**I want** Factary Phi run on the first approved shortlist of 20–30 candidates  
**So that** we can confirm ≥ 60% confirmed wealth-band rate on shortlisted leads

**Acceptance criteria:**
- First approved shortlist from real pipeline run (not gold set) submitted to Factary Phi
- Results compared against Tier 1 wealth proxy indicators; confirmed-band rate calculated
- Blended cost/dossier calculated (total Tier 1 + Tier 2 spend ÷ shortlist count); target ≤ £35
- Results documented; decision to proceed to production made at this gate
- If confirmed-band rate < 60%, investigate: shortlist threshold calibration, Factary coverage gaps, or prospect pool quality

**Size:** M  
**Depends on:** 3b.1, 9.1
