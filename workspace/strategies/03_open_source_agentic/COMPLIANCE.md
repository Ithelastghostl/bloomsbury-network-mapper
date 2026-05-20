# Compliance: Strategy 3 — Open-Source Agentic Pipeline

**Version:** 1.0 | **Date:** 2026-05-05
**Governing law:** UK GDPR (retained in DPA 2018); PECR 2003 as amended by DUA Act 2025; Fundraising Regulator Code 2025
**Source:** All requirements derived from R2 (02_regulatory_frame.md)

---

## 1. Legitimate Interest Assessment (LIA) — Three-Step Test

Strategy 3 processes only UK public-domain data (OGL v3.0 licensed sources: Companies House, Charity Commission, 360Giving, HMLR OCOD, UK Sanctions List) plus targeted web search of publicly available content. This is the strongest LIA position of all five strategies: no personal data is shared with a third-party commercial screener; no international data transfer occurs; no proprietary database is built or purchased.

### Step 1 — Purpose Test

**Interest:** Bloomsbury Football Foundation (charity 1178842) seeks to identify individuals with the capacity and inclination to make major gifts (≥ £5,000, with some prospects at £5M+), in order to advance its charitable objects (youth football access, inclusion, deprivation).

**Who benefits:** Primarily the charity and its beneficiaries (6,500+ young people weekly). Secondarily the prospects themselves, who may wish to support causes aligned with their established philanthropic interests.

**Is the interest legitimate?** Yes. Direct marketing and fundraising by charities is recognised as a legitimate interest in principle by the ICO [R2 §1]. Prospect research using public-domain data to identify major donors is standard charity sector practice and is not contrary to law or public policy.

**Conclusion — Step 1:** Purpose test passed.

### Step 2 — Necessity Test

**Is public-domain open-source processing necessary?** Yes. The alternative (not identifying prospects with giving capacity) would prevent the charity from meeting its 20,000-young-people-by-2028 target, which requires significant major gift income.

**Is this the minimum data needed?** Yes. Strategy 3 uses only publicly available registers (CC, CH, 360Giving, HMLR OCOD) and publicly accessible web content. No data is sought that is not already published under OGL or equivalent open licences by the relevant public authority.

**Could a less intrusive method achieve the same result?** A broader fundraising campaign (no prospect research) would be less intrusive but materially less effective for major gift cultivation, which requires personalised relationship-building informed by capacity assessment.

**Conclusion — Step 2:** Necessity test passed.

### Step 3 — Balancing Test

**Factors weighing for the charity:**
- All data processed is from publicly available, government-mandated registers (OGL v3.0)
- No sensitive categories of data (health, religion, sexual orientation) are processed
- Processing has no automated decision with legal or significant effect on prospects
- Clear privacy notice covers the practice (see §5 below)
- Easy opt-out available at any time
- No data is shared with third-party commercial processors (no Article 28 DPA required — see §6)

**Factors weighing against the charity:**
- Prospects who are charity trustees or company directors have not consented to having their public register data used for donor targeting
- Probabilistic wealth inference, even from public data, involves sensitive inferences about financial capacity
- Web search may retrieve biographical detail the individual would not expect to be used in this context

**Balancing conclusion:** The factors in favour outweigh those against. The processing uses only data subjects themselves have made public (by accepting trustee or director roles requiring statutory disclosure), or data in publicly licensed registers (HMLR OCOD). The ICO's own guidance states that using publicly available information reduces the weight of the privacy interest against the charity [R2 §2 — "Factors that weigh for the charity"]. The charity takes on extra responsibility to ensure opt-outs are honoured promptly and privacy notices are clear.

**Conclusion — Step 3:** Balancing test passed.

**LIA must be documented and retained.** Use ICO template (ico.org.uk/media2/for-organisations/forms/2258435/gdpr-guidance-legitimate-interests-sample-lia-template.docx) [R2 §2].

---

## 2. DPIA Hot-Spots

A DPIA is required before processing begins if two or more EDPB/ICO criteria (WP248rev01) are met [R2 §3]. Strategy 3 engages:

| Criterion | Applies? | Basis |
|---|---|---|
| 1. Evaluation or scoring (financial capacity scoring) | **Yes** — WealthScoringAgent assigns wealth tiers | Probabilistic scoring of individuals' financial capacity |
| 4. Sensitive data or data of a highly personal nature | **Borderline** — financial capacity is highly personal but not a special category under Art. 9 | Treat as engaged given sensitivity of wealth inference |
| 6. Datasets matched or combined from multiple sources | **Yes** — CC + CH + 360Giving + HMLR + web search combined per individual | Cross-register data linking |

**Three or more criteria engaged → DPIA is required** [R2 §3].

### DPIA must be completed before any live (non-test) data is processed.

### Hot-spot 1: Web search storing results about non-consenting third parties

Web search retrieves publicly available content about individuals who have not consented to being included in a donor enrichment pipeline. Mitigations:
- Results are stored only if a source_url can be provided; unsourced content is not stored
- Storage is limited to the structured `WebSearchResult` schema; raw HTML is not retained
- Data is held only for as long as needed (see §3 Retention below)
- All stored web search results are deleted when a DSAR erasure request is received (Story 8.2)

### Hot-spot 2: Probabilistic wealth inference

WealthScoringAgent infers wealth tiers from proxy signals (role seniority, property holdings, grant scale). The individual has no control over this inference and may not be aware it is happening. Mitigations:
- Probabilistic scores are always labelled as estimates; never presented as facts
- `£5M+ confirmed` requires deterministic evidence (PSC or HMLR source); `£5M+ probable` explicitly signals uncertainty
- Scores are not used for automated decisions with legal or significant effects — a human (Checkpoint 1, 2, 3) approves every step before outreach
- Privacy notice discloses the practice (§5)

---

## 3. Data Retention

| Data category | Retention period | Basis |
|---|---|---|
| Donor intake record (name, email, postcode, donation history, consent metadata) | Duration of relationship + 3 years | Fundraising relationship management; consistent with charity sector norms [my estimate — no statutory minimum for this data; 3 years balances legitimate interest against the subject's reasonable expectation] |
| Enrichment data (agent results, dossiers, audit log) | 2 years from date of enrichment run | Sufficient for any DSAR or regulatory inquiry; after 2 years the data is likely stale and retention no longer necessary |
| Deletion receipts (Story 8.2) | 7 years | Evidence of compliance with erasure requests; consistent with legal proceeding limitation periods |
| Human review decisions (all three checkpoints) | Same as enrichment data (2 years) | Part of the audit trail for the enrichment activity |

**Review schedule:** Retention periods are reviewed annually. Data older than the retention period is deleted via the same deletion script (Story 8.2) used for DSARs.

**No data is retained beyond the retention period for any purpose, including model training.** Claude API terms confirm that data sent to the API is not used for training by default; this must be confirmed in the current API ToS before go-live.

---

## 4. DSAR Procedure

All personal data for Strategy 3 is held locally in SQLite (v1) or Postgres (v2). Full deletion is runnable from a single script (Story 8.2).

### Subject Access Request (SAR) — response within 1 month (UK GDPR Art. 15)

1. Identify the subject's `tracking_id` by searching the donor intake table by name + email
2. Run: `python cli.py export-subject --tracking_id <id>` — exports all records to a structured JSON file covering:
   - Intake record
   - EntityResolutionResult
   - All agent results (TrusteeGraphResult, CompaniesHouseResult, GrantNavResult, PropertyResult, SanctionsResult, WebSearchResult)
   - WealthScoringResult
   - All dossier versions
   - All human review decisions
   - Full audit log entries for the tracking_id
3. Review exported data for any third-party personal data that should be redacted before disclosure (co-trustee names are third-party data — redact from SAR response unless separately justified)
4. Provide exported data to subject within 30 days of receipt of request

### Erasure Request (Art. 17) — response within 1 month

1. Verify request: confirm subject identity; check whether erasure is required or whether a legitimate ground to retain exists (e.g., legal claim)
2. Run: `python cli.py delete-subject --tracking_id <id>` (Story 8.2)
3. Script deletes all data except the deletion receipt (which is retained per §3)
4. Confirm erasure to subject in writing within 30 days

### Right to Object (Art. 21) — to be honoured without delay

If a prospect objects to processing under legitimate interest:
1. Mark the tracking_id as `opt_out: true` in the donor intake table
2. Immediately halt any in-progress enrichment for that record
3. Delete all enrichment data (run Story 8.2 script)
4. Ensure no further processing occurs; add to internal suppression list

**Note:** The right to object to direct marketing (Art. 21(2)) is absolute and must be honoured without delay. All other LI objections must be considered; the charity can only override with compelling legitimate grounds. When in doubt, honour the objection.

---

## 5. Privacy Notice Clauses

The charity's privacy notice must include the following clauses before the pipeline processes any live data. These are in addition to standard privacy notice requirements [R2 §4].

### Prospect research clause (Article 13/14 — at or within one month of data acquisition)

> **Prospect research and wealth assessment**
>
> We may use publicly available information about you — including records from the Charity Commission register, Companies House, HM Land Registry, and 360Giving GrantNav — to assess whether you might be interested in supporting Bloomsbury Football Foundation through a major gift. We may also search publicly available web content to identify your professional roles, advisory positions, and philanthropic interests.
>
> This processing is based on our legitimate interests in identifying supporters capable of helping us achieve our mission of transforming lives through football. We have assessed that this processing is necessary, proportionate, and does not override your fundamental rights.
>
> We use automated tools (including AI-assisted synthesis) to compile an initial profile, which is always reviewed by a member of our fundraising team before any contact is made. We do not make any automated decisions with significant effects based solely on this profiling.
>
> **Your rights:** You have the right to object to this processing at any time. Contact [DPO email]. We will stop processing your data without delay and will not use this objection as grounds to suppress your other interactions with us.
>
> **What we hold:** If you wish to see what data we hold about you (Subject Access Request) or request deletion, contact [DPO email].

### Article 14 notice timing

For prospects identified via research (not direct submission): notice must be provided within one month of data acquisition [R2 §4, citing UK GDPR Art. 14(3)(a)]. The pipeline's AuditLogger records the date of first data acquisition per tracking_id; this date triggers the 30-day Article 14 notice deadline.

---

## 6. Third-Party DPA Status

**No Article 28 DPA is required for public API sources.** Companies House, Charity Commission, 360Giving, HMLR OCOD, and the UK Sanctions List are public sector data publishers under OGL v3.0. They are not data processors acting on Bloomsbury's behalf; they are independent public bodies publishing statutory data.

**The Claude API does require a DPA with Anthropic.** Personal data (donor names, company names, trustee details) is sent to the Claude API for processing. Anthropic acts as a data processor on Bloomsbury's behalf. Before processing any live personal data:
- Execute Anthropic's Data Processing Agreement (available at anthropic.com)
- Confirm data is not used for model training (verify in current ToS)
- Confirm Anthropic's sub-processor list and that sub-processors are located in UK-adequate jurisdictions or covered by appropriate transfer mechanisms

**The web search API (Serper.dev or equivalent) requires a DPA.** Donor names are passed as query strings to the search API. Execute a DPA before first use; confirm the provider's sub-processor chain.

**This strategy uses no other commercial processors.** No Factary, DonorSearch, Wealth-X, or similar screener. This eliminates the primary compliance complexity of Strategies 1, 2, and 4 (multiple Article 28 DPAs, sub-processor audits, vendor due diligence).

### Summary

| Processor | DPA required? | Status |
|---|---|---|
| Companies House API | No — public body, OGL | N/A |
| Charity Commission API | No — public body, OGL | N/A |
| 360Giving GrantNav | No — open data, CC BY 4.0 | N/A |
| HMLR OCOD | No — public body, OGL | N/A |
| UK Sanctions List | No — public body, OGL | N/A |
| Anthropic Claude API | **Yes — required before live data** | Must execute before go-live |
| Web search API (Serper.dev) | **Yes — required before live data** | Must execute before go-live |

No international data transfers occur beyond what Anthropic's and the search API provider's DPAs cover (confirm that both providers' DPAs include appropriate UK transfer mechanisms).
