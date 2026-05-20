# Backlog — Strategy 1: Factary Outsourced

Story sizes: XS (<2h), S (half-day), M (1–2 days), L (3–5 days), XL (>5 days).
≥80% of stories are M or smaller.

---

## E1 — Ingest and store a donor record with consent metadata

### Story 1.1 — Fundraiser submits a donor record
**As a** fundraiser
**I want** to submit a donor record (CSV or JSON) and receive an acknowledgement with a tracking ID
**So that** I can later retrieve the enriched dossier
**AC1:** input accepts {name, email, postcode, donation_history, consent_metadata}
**AC2:** consent_metadata is validated against a documented schema; missing fields reject with a 4xx-style error
**AC3:** record is persisted with an immutable `submitted_at` timestamp
**AC4:** caller receives a tracking_id within 2 seconds
**Size:** S
**Depends on:** —

### Story 1.2 — Consent metadata is validated at intake
**As a** data protection officer
**I want** every submitted donor record to be rejected if consent metadata is incomplete or refers to an unknown privacy notice version
**So that** no data is forwarded to Factary without a documented lawful basis
**AC1:** submission fails with a 422 error if `lia_ref` is empty
**AC2:** submission fails with a 422 error if `privacy_notice_version` does not match a known entry in `config/privacy_notices.json`
**AC3:** submission is blocked with a 403 error if `opt_out_date` is set on the record
**AC4:** validation errors include the field name and reason in the response body
**Size:** S
**Depends on:** 1.1

### Story 1.3 — Fundraiser uploads a batch CSV of donor records
**As a** fundraiser
**I want** to submit a CSV file of up to 500 donor records in a single command
**So that** I can prepare a full batch for Factary without entering records one by one
**AC1:** `submit.py --batch donors.csv` processes each row, validates individually, and reports a summary: N accepted, M rejected with reasons
**AC2:** rejected rows are written to a separate `rejected_YYYYMMDD.csv` with error column
**AC3:** accepted rows are all assigned tracking IDs and stored
**AC4:** batch produces a single batch_id for downstream reference
**Size:** M
**Depends on:** 1.1, 1.2

---

## E2 — Donor enrichment: submit to Factary and receive dossiers

### Story 2.1 — Prepare and export a batch submission package for Factary
**As a** fundraising coordinator
**I want** to generate an encrypted batch package from a set of accepted donor records
**So that** I can transfer it to Factary via SFTP or their portal without handling unencrypted data
**AC1:** `export.py --batch-id <id>` selects all accepted records in the batch
**AC2:** output is a GPG-encrypted ZIP containing donor CSV + consent manifest (confirming lawful basis for each record)
**AC3:** the manifest lists: tracking_id, lia_ref, privacy_notice_version, submitted_at for each record
**AC4:** export event is written to audit_log with batch_id, exported_at, file_hash
**Size:** M
**Depends on:** 1.3

### Story 2.2 — Record the outbound transfer event
**As a** data protection officer
**I want** every outbound transfer to Factary to be logged immutably
**So that** we have an auditable record of what data was shared, when, and with which vendor
**AC1:** audit_log entry records: batch_id, vendor ('factary' or 'prospecting_for_gold'), transfer_timestamp, file_hash, operator username
**AC2:** log entries cannot be deleted or updated via the CLI
**AC3:** `audit.py --batch-id <id>` prints the transfer log entry in human-readable form
**Size:** S
**Depends on:** 2.1

### Story 2.3 — Ingest and parse a returned Factary dossier ZIP
**As a** fundraising coordinator
**I want** to import a returned dossier ZIP from Factary and have each dossier parsed into the EnrichedDonor schema
**So that** dossier data is available for structured review without manual reformatting
**AC1:** `ingest.py --file factary_return_YYYYMMDD.zip` decrypts and unpacks the ZIP
**AC2:** each dossier is matched to a DonorRecord by tracking_id or name+postcode fallback
**AC3:** Claude Haiku is invoked to extract structured fields into EnrichedDonor JSON; prompt instructs extraction only — no inference
**AC4:** fields where no source is present in the Factary output are set to null (not inferred)
**AC5:** ingested records are stored in enriched_donors table with `ingested_at` timestamp
**Size:** L
**Depends on:** 2.1, 2.2

### Story 2.4 — Handle unmatched dossiers in ingest
**As a** fundraising coordinator
**I want** dossiers that cannot be matched to a submitted donor record to be flagged clearly
**So that** no data is silently lost or mis-attributed
**AC1:** unmatched dossiers are written to `unmatched_YYYYMMDD/` folder with their original file
**AC2:** `ingest.py` prints a count of matched and unmatched dossiers on completion
**AC3:** unmatched dossiers generate an audit_log entry with `event_type = 'ingest_unmatched'`
**Size:** S
**Depends on:** 2.3

---

## E3 — Network discovery via Factary output

### Story 3.1 — Extract network candidates from enriched dossiers
**As a** fundraiser
**I want** to extract all named connections from an enriched dossier as NetworkCandidate records
**So that** I can review who in the dossier may be a warm introduction route
**AC1:** `network.py --donor-id <tracking_id>` reads the enriched dossier and extracts co-trustees, co-directors, and shared philanthropy contacts
**AC2:** each candidate is stored as a NetworkCandidate record with connection_type, shared_entity, and citations from the dossier
**AC3:** candidates with no citation are not created; a warning is logged
**Size:** M
**Depends on:** 2.3

### Story 3.2 — Flag candidates already in Bloomsbury's donor list
**As a** fundraiser
**I want** to know which network candidates are already known to Bloomsbury
**So that** I can prioritise genuinely new introduction routes
**AC1:** `network.py --donor-id <tracking_id> --dedup` cross-references candidates against existing donors in donors.db by name + postcode
**AC2:** matches are flagged `existing_relationship = true` on the NetworkCandidate record
**AC3:** output report separates known contacts from novel candidates
**Size:** S
**Depends on:** 3.1

### Story 3.3 — Promote a network candidate to a lead
**As a** fundraiser
**I want** to mark a network candidate as a potential major gift prospect
**So that** they enter the qualified lead and dossier workflow
**AC1:** `review.py --promote-candidate <candidate_id>` creates a QualifiedLead record
**AC2:** promotion requires a human note explaining the basis (free text, required)
**AC3:** promotion event is written to audit_log
**Size:** S
**Depends on:** 3.1

---

## E4 — Wealth scoring from Factary data

### Story 4.1 — Parse wealth indicators from enriched dossier into structured bands
**As a** fundraiser
**I want** each enriched dossier to display wealth indicators in a consistent band format
**So that** I can quickly assess capacity without reading raw dossier text
**AC1:** `wealth_indicators` array is populated during ingest (Story 2.3) with `indicator_type`, `value_band`, and `confidence` for each identified signal
**AC2:** records where no wealth indicator is present are marked `dossier_quality = 'thin'`
**AC3:** every wealth indicator carries a citation to its Factary source reference
**Size:** S
**Depends on:** 2.3

### Story 4.2 — Apply £5M+ qualification filter to enriched donors
**As a** fundraiser
**I want** to identify which enriched donors have at least one wealth indicator in the £5M+ band
**So that** these records can be promoted to the LeadDossier workflow
**AC1:** `qualify.py --batch-id <id>` reads all EnrichedDonor records in a batch and returns those with at least one `value_band` in {'5m-30m', '>30m'} with `confidence` in {'confirmed', 'estimated'}
**AC2:** each qualifying record is created as a QualifiedLead with `capacity_ceiling_note` set to the mandatory structural caveat
**AC3:** `qualify.py` prints a count and lists tracking_ids of qualified leads
**Size:** S
**Depends on:** 4.1

### Story 4.3 — Store the structural ceiling caveat on every capacity estimate
**As a** data protection officer / fundraiser
**I want** every capacity estimate to carry a mandatory caveat that it is an estimate, not a confirmed figure
**So that** gift officers do not cite AI-derived wealth figures as facts
**AC1:** `QualifiedLead.capacity_ceiling_note` is a mandatory non-null field set at creation time
**AC2:** the caveat text is read from `config/capacity_caveat.txt` (a single, version-controlled string)
**AC3:** any attempt to create a QualifiedLead without this field raises a validation error
**Size:** XS
**Depends on:** 4.2

---

## E5 — Lead dossier enrichment

### Story 5.1 — Generate a LeadDossier from a QualifiedLead
**As a** fundraiser
**I want** a complete, structured dossier file for each qualified lead
**So that** the gift officer has a single document to review before making contact
**AC1:** `dossier.py --lead-id <id>` assembles a LeadDossier JSON and a companion Markdown file from the QualifiedLead, EnrichedDonor, and associated NetworkCandidates
**AC2:** the Markdown file follows a fixed template: summary, wealth indicators, philanthropy history, network connections, adverse flags, citations
**AC3:** Markdown and JSON are written to `dossiers/<lead_id>/` folder
**Size:** M
**Depends on:** 4.2, 3.1

### Story 5.2 — Generate a Claude-drafted summary narrative for the dossier
**As a** fundraiser
**I want** a one-paragraph summary narrative drafted from structured dossier data
**So that** I have a starting point for the gift officer brief without writing it from scratch
**AC1:** `dossier.py --lead-id <id> --summarise` calls Claude Haiku with a strict extraction-only prompt
**AC2:** the prompt instructs Claude to cite a source for every claim and to label any field as absent rather than inferred
**AC3:** the draft narrative is stored as `LeadDossier.summary_narrative` with status `draft`
**AC4:** status remains `draft` until a human reviewer edits and approves it at Checkpoint 3
**Size:** M
**Depends on:** 5.1

### Story 5.3 — Attach all citations to the dossier
**As a** data protection officer
**I want** every dossier to include a complete citations list with source_name, URL where available, and confidence rating
**So that** the basis for every claim can be verified by a reviewer or auditor
**AC1:** `dossier.py` aggregates all Citation objects from the EnrichedDonor and NetworkCandidates into `LeadDossier.citations_all`
**AC2:** dossiers where any factual field has no citation are flagged `has_uncited_claims = true`
**AC3:** uncited claims block sign-off at Checkpoint 3 unless the reviewer explicitly overrides with a note
**Size:** S
**Depends on:** 5.1

---

## E6 — Human checkpoints (3 stacked)

### Story 6.1 — Checkpoint 1: Batch accept or reject a returned Factary package
**As a** fundraising coordinator
**I want** to formally accept or reject the quality of a returned Factary batch before it enters the workflow
**So that** low-quality or misdirected returns are caught before gift officers receive them
**AC1:** `review.py --checkpoint 1 --batch-id <id>` opens a Markdown review file in `reviews/cp1_<batch_id>.md` listing dossier count, thin-profile count, and unmatched count
**AC2:** reviewer records decision ('proceed' / 'send_back' / 'reject') and notes in the file
**AC3:** `review.py --submit 1 --batch-id <id>` reads the decision, writes a HumanReview record to the database, and routes accordingly
**AC4:** 'send_back' routes back to Story 2.1 (re-export with notes to Factary); 'reject' archives the batch
**Size:** M
**Depends on:** 2.3

### Story 6.2 — Checkpoint 2: Review uncertainty-flagged records
**As a** fundraising coordinator
**I want** to review all records where Factary's confidence score is below threshold or where Claude's ingest flagged low-confidence fields
**So that** uncertain data does not reach gift officers without explicit human review
**AC1:** after Checkpoint 1 proceeds, `review.py --checkpoint 2 --batch-id <id>` generates `reviews/cp2_<batch_id>.md` listing all records where `vendor_confidence_score < 60` or `dossier_quality = 'thin'`
**AC2:** reviewer can mark each flagged record as: 'proceed_with_caveat' / 'suppress' / 'escalate'
**AC3:** 'suppress' marks the EnrichedDonor `review_status = 'suppressed'` and excludes it from LeadDossier generation
**AC4:** all decisions are written as HumanReview records
**Size:** M
**Depends on:** 6.1

### Story 6.3 — Checkpoint 3: Final dossier sign-off
**As a** Director of Fundraising
**I want** to formally sign off each LeadDossier before it is released to a gift officer
**So that** no enriched prospect dossier reaches the major gifts programme without senior review
**AC1:** `review.py --checkpoint 3 --lead-id <id>` opens `reviews/cp3_<lead_id>.md` with the full LeadDossier content
**AC2:** reviewer can approve, reject, or request amendment; decision and notes are required
**AC3:** approved dossiers have `signed_off_by` and `signed_off_at` set; these fields are immutable after sign-off
**AC4:** dossiers with `has_uncited_claims = true` cannot be approved without an explicit override note from the reviewer
**Size:** M
**Depends on:** 5.1, 5.2, 5.3

---

## E7 — Output formatting

### Story 7.1 — Export an approved dossier as a formatted Markdown file
**As a** gift officer
**I want** to receive a clean, printable Markdown dossier for each approved lead
**So that** I can prepare for a donor meeting without opening multiple files
**AC1:** `export_dossier.py --lead-id <id>` writes `dossiers/<lead_id>/dossier.md` using a fixed Markdown template
**AC2:** template sections: header (name, tracking_id, sign-off date), summary, wealth indicators table, philanthropy history, network connections, adverse flags, citations, reviewer notes
**AC3:** the file includes the capacity ceiling caveat in a clearly labelled warning block
**Size:** S
**Depends on:** 6.3

### Story 7.2 — Export a qualified leads summary CSV for the fundraising team
**As a** Director of Fundraising
**I want** a one-row-per-lead CSV of all approved leads from a batch
**So that** the team has a prioritised list for campaign planning without reading individual dossiers
**AC1:** `export_leads.py --batch-id <id>` writes `output/leads_<batch_id>.csv`
**AC2:** columns: tracking_id, name, capacity_band, capacity_confidence, top_connection_type, sign_off_date
**AC3:** leads are ordered by capacity_band descending, then alphabetically by name
**Size:** S
**Depends on:** 6.3

### Story 7.3 — Redact a dossier on opt-out or DSAR deletion request
**As a** data protection officer
**I want** to redact all personal data from a dossier and its database records when a data subject exercises their right to erasure
**So that** Bloomsbury can comply with a deletion request without losing the audit trail structure
**AC1:** `redact.py --tracking-id <id>` nullifies all personal fields in donors, enriched_donors, and network_candidates for that individual
**AC2:** the audit_log entry for the redaction is written with `event_type = 'erasure_request'`, timestamp, and operator
**AC3:** dossier Markdown and JSON files are deleted from `dossiers/` folder; a placeholder file with only the tracking_id and `redacted_at` remains
**AC4:** redaction cannot be reversed via the CLI
**Size:** M
**Depends on:** 5.1

---

## E8 — Observability and audit log

### Story 8.1 — Write an immutable audit log entry for every state-changing event
**As a** data protection officer
**I want** every action that creates, modifies, or deletes donor data to produce an audit log entry
**So that** we can demonstrate accountability to the ICO if required
**AC1:** audit_log table has columns: event_id (UUID), event_type, entity_type, entity_id, operator, timestamp, detail_json
**AC2:** entries are INSERT-only; no UPDATE or DELETE is permitted by the application code
**AC3:** the following event_types are defined: submit, export_to_vendor, ingest, checkpoint_decision, qualify, promote_candidate, sign_off, erasure_request, ingest_unmatched
**Size:** M
**Depends on:** —

### Story 8.2 — Print an audit trail for a single donor record
**As a** data protection officer
**I want** to retrieve the full audit history for any donor record by tracking_id
**So that** I can respond to a DSAR or ICO enquiry within 72 hours
**AC1:** `audit.py --tracking-id <id>` prints all audit_log entries for that tracking_id in chronological order
**AC2:** output includes: event_type, operator, timestamp, and any detail fields
**AC3:** command completes in under 5 seconds for any single record
**Size:** S
**Depends on:** 8.1

### Story 8.3 — Print a batch-level summary report
**As a** fundraising coordinator
**I want** to see a summary of a batch's lifecycle — submitted, exported, ingested, qualified, signed off
**So that** I can track where each batch is in the workflow without querying the database directly
**AC1:** `status.py --batch-id <id>` prints: N records submitted, N exported to vendor, N ingested, N qualified, N leads signed off, N suppressed, N unmatched
**AC2:** output flags any batch where >20% of records are thin or unmatched
**Size:** S
**Depends on:** 8.1

---

## E9 — Compliance scaffolding

### Story 9.1 — Enforce Article 28 DPA prerequisite before first export
**As a** data protection officer
**I want** the export step to fail unless a DPA reference has been recorded for the target vendor
**So that** no donor data is transferred to Factary before the legal agreement is in place
**AC1:** `config/vendors.json` contains an entry for each approved vendor with fields: name, dpa_reference, dpa_signed_date, sub_processors_reviewed (boolean), approved (boolean)
**AC2:** `export.py` reads `config/vendors.json` and refuses to export if `approved = false` for the target vendor
**AC3:** the block error message names the missing field and the config file location
**Size:** S
**Depends on:** 2.1

### Story 9.2 — Store and serve the LIA document reference
**As a** data protection officer
**I want** the LIA document reference to be stored against every submitted batch
**So that** any audit can trace which LIA authorised a given transfer
**AC1:** `batch_submissions` table includes `lia_ref` column populated from the batch's consent_metadata
**AC2:** `audit.py --batch-id <id>` includes the lia_ref in its output
**AC3:** batches where not all records share the same lia_ref are flagged with a warning (different LIAs covering different records is valid but unusual)
**Size:** XS
**Depends on:** 2.1, 8.1

### Story 9.3 — Generate Article 14 notice checklist for newly identified network candidates
**As a** data protection officer
**I want** a checklist produced for every NetworkCandidate who was not in the original submitted donor list
**So that** the team is reminded to issue Article 14 privacy notices within one month of identifying new data subjects
**AC1:** `compliance.py --batch-id <id>` lists all NetworkCandidates created from that batch who have `existing_relationship = false`
**AC2:** for each, it shows: name, candidate_id, date_first_identified, article_14_due_date (= date_first_identified + 30 days)
**AC3:** candidates past their due date are highlighted in the output
**Size:** M
**Depends on:** 3.1, 3.2

### Story 9.4 — Sanctions re-screen reminder on aged dossiers
**As a** data protection officer
**I want** a reminder flag on any dossier that has not been re-screened against the UK Sanctions List within 12 months
**So that** the fundraising team does not rely on stale due diligence for active relationships
**AC1:** `compliance.py --sanctions-check` lists all signed-off LeadDossiers where `signed_off_at` is more than 12 months ago and no new ingest has occurred
**AC2:** output includes: dossier_id, name, last_screened_date, days_overdue
**AC3:** the command does not perform a live sanctions check; it flags for manual re-submission to Factary or for Story 2.3 re-run
**Size:** S
**Depends on:** 6.3, 8.1
