# Prototype Scope — Strategy 1: Factary Outsourced (v1)

## Goal

Deliver a working intake-to-dossier workflow for Strategy 1: a fundraiser can submit a batch of donor records with consent metadata, export an encrypted package to Factary, receive returned dossiers, and produce signed-off LeadDossier files — with three human checkpoints and a full audit trail — within 3 engineer-weeks of build time.

---

## In Scope

The following stories from BACKLOG.md are included in the v1 prototype:

| Story ID | Description | Size |
|---|---|---|
| 1.1 | Submit a donor record via CLI | S |
| 1.2 | Consent metadata validation at intake | S |
| 1.3 | Batch CSV upload | M |
| 2.1 | Prepare and export encrypted batch package | M |
| 2.2 | Record outbound transfer event in audit log | S |
| 2.3 | Ingest and parse returned Factary dossier ZIP | L |
| 2.4 | Handle unmatched dossiers | S |
| 3.1 | Extract network candidates from enriched dossiers | M |
| 3.3 | Promote a network candidate to a lead | S |
| 4.1 | Parse wealth indicators into structured bands | S |
| 4.2 | Apply £5M+ qualification filter | S |
| 4.3 | Store structural ceiling caveat on every capacity estimate | XS |
| 5.1 | Generate a LeadDossier from a QualifiedLead | M |
| 5.2 | Claude-drafted summary narrative | M |
| 5.3 | Attach all citations to the dossier | S |
| 6.1 | Checkpoint 1: batch accept / reject | M |
| 6.2 | Checkpoint 2: uncertainty-flagged record review | M |
| 6.3 | Checkpoint 3: final dossier sign-off | M |
| 7.1 | Export approved dossier as Markdown | S |
| 7.2 | Export qualified leads summary CSV | S |
| 8.1 | Immutable audit log for every state-changing event | M |
| 8.2 | Print audit trail for a single donor record | S |
| 8.3 | Batch-level summary report | S |
| 9.1 | Enforce Article 28 DPA prerequisite before export | S |
| 9.2 | Store and serve LIA document reference | XS |
| 9.3 | Generate Article 14 notice checklist | M |

**Included story count:** 26 of 29 total backlog stories.

---

## Out of Scope (Deferred to v2)

| Story ID | Description | Deferral reason |
|---|---|---|
| 3.2 | Flag candidates already in Bloomsbury's donor list | Requires a populated donor base to be useful; run after first full batch |
| 7.3 | Redact a dossier on opt-out / DSAR deletion | Compliance obligation exists but can be handled manually in v1; automate before processing >100 records |
| 9.4 | Sanctions re-screen reminder on aged dossiers | No aged dossiers exist at v1; add before 12-month anniversary of first batch |

**Additional items deferred** (from ARCHITECTURE.md kill list):
- Web portal / browser UI
- CRM integration (Raiser's Edge / Salesforce)
- Automated Article 14 notice dispatch
- Network graph visualisation
- Multi-user access controls (Postgres migration)
- Email notifications on batch completion

---

## Definition of Done

The prototype is done when all of the following are true, measured against the thresholds in TEST_PLAN.md:

1. **Intake pipeline:** A batch CSV of 20 gold-set records can be submitted, validated, and stored with tracking IDs in under 60 seconds total. All consent metadata validation rules (Stories 1.1–1.2) are exercised with no false passes.

2. **Export:** `export.py` produces an encrypted ZIP that can be decrypted with the test GPG key and contains the correct donor CSV and consent manifest. Export event appears in audit_log.

3. **Ingest:** The 20 returned gold-set dossiers are ingested, matched to their source records, and stored as EnrichedDonor JSON with no unmatched records. Claude Haiku extracts structured fields with hallucination rate = 0% (no fields populated that were absent from the Factary source text).

4. **Network extraction:** NetworkCandidate records are created for all named connections in the 20 dossiers. No candidate is created without a citation.

5. **Qualification:** `qualify.py` correctly identifies all gold-set records with a £5M+ wealth indicator. Capacity ceiling caveat is present on every QualifiedLead.

6. **Dossier generation:** LeadDossier Markdown and JSON are produced for all qualified leads. `has_uncited_claims` is false for at least 95% of dossiers.

7. **Human checkpoints:** All three checkpoints execute without error for a test batch. HumanReview records are written correctly with immutable timestamps.

8. **Audit log:** `audit.py --tracking-id` returns the complete event history for every test record. No state-changing operation has occurred without an audit entry.

9. **Compliance:** `config/vendors.json` blocks export when `approved = false`. Article 14 checklist is generated for all network candidates who are not in the original donor list.

10. **TEST_PLAN.md thresholds met:** See TEST_PLAN.md §Metrics. Minimum pass for prototype: donor dossier accuracy ≥ 95%, hallucination rate = 0%, time-to-dossier within Factary's stated turnaround.

---

## Resourcing Assumption

| Resource | v1 estimate | Basis |
|---|---|---|
| Engineer build time | 3 weeks (15 working days) | CLI Python pipeline with SQLite; no web framework; no external API integrations (Factary is file-based) [my estimate] |
| Researcher / fundraiser time (gold set assembly) | 3–4 hours in Week 1 | Assembling 20 gold-set records with known outcomes; see TEST_PLAN.md §Gold Set Design |
| DPO / legal time | 4–6 hours | LIA completion, DPA review with Factary, privacy notice update; see COMPLIANCE.md |
| Factary vendor engagement | 2–4 weeks (parallel with build) | Procurement, DPA negotiation, onboarding; see COST.md §Procurement Timeline |
| Director of Fundraising (Checkpoints 2–3) | ~30 min per batch in steady state | Reviewing flagged records and signing off dossiers |

**Total one-off cost at v1:** £2,750 [06_cost_models.md, Strategy 1 one-off total]. No engineer build cost is included in that figure because this strategy has no pipeline to build; the 3 engineer-weeks above covers the intake/transfer/review tooling only, not data pipeline development.

_Correction: the 06_cost_models.md Strategy 1 figure assumes no build cost ("No build cost. No engineer time."). The tooling described in this prototype represents a deliberate choice to build a minimal workflow layer — approximately 3 weeks engineer time at £318/day [my estimate] = ~£4,770 incremental. Total one-off including workflow tooling: ~£7,520._

---

## Decision Gate: What Evidence Warrants v2 Investment

The following evidence, collected during a pilot batch of 50–100 records, must be evaluated before committing to v2 (which would likely mean adopting Strategy 4 — hybrid tiered):

| Gate criterion | Pass threshold | Fail action |
|---|---|---|
| Dossier completeness rate | ≥60% of records return a dossier with ≥3 sourced signals | If <40%: the prospect pool lacks sufficient public footprint — reconsider whether automated pipeline adds value vs. Strategy 5 |
| Donor dossier accuracy | ≥95% of verifiable fields correct against gold set | If <90%: raise with Factary; identify systematic gaps before expanding |
| Time-to-dossier | ≤10 business days from export to received return | If >15 days: renegotiate SLA or add Prospecting for Gold as alternative vendor |
| Cost per dossier | Within ±20% of £36.87 (100 records/month base case from 06_cost_models.md) | If >£45/dossier: review retainer structure; consider whether hybrid approach (Strategy 4) offers better unit economics at target volume |
| Network candidate quality | ≥3 novel NetworkCandidates per substantially complete dossier | If <2 on average: the value of the network-mapping job may not justify the overhead; reassess Job B scope |
| Qualified lead rate | ≥5% of submitted records qualify as £5M+ leads | If <3%: either the prospect list is under-targeted or the wealth indicators are insufficient — review list sourcing before v2 |

v2 investment is warranted when: completeness ≥60%, accuracy ≥95%, lead rate ≥5%, and at least one qualified lead from the pilot batch proceeds to a cultivation meeting.
