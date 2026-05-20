# Compliance — Strategy 4 Hybrid Tiered Pipeline

All requirements derive from UK GDPR (as retained in DPA 2018), PECR 2003 (as amended by DUA Act 2025), and ICO enforcement precedents. Full regulatory frame in `/workspace/decision_layer/02_regulatory_frame.md`.

---

## Lawful Basis

**Relied on: Legitimate Interest (Article 6(1)(f) UK GDPR)** for all processing in both tiers.

A three-step Legitimate Interest Assessment (LIA) is mandatory and must be completed and documented before the first pipeline run. A template for the ICO LIA is available at ico.org.uk/media2/for-organisations/forms/2258435/gdpr-guidance-legitimate-interests-sample-lia-template.docx.

### LIA — Tier 1 (public UK data only)

**Position: Strong.**

- **Purpose test:** Identifying major gift prospects for Bloomsbury Football Foundation, a registered charity (1178842) pursuing legitimate charitable objects. The interest is genuine and lawful.
- **Necessity test:** Open-source UK government registers (Charity Commission, Companies House) are the most privacy-minimal route to the network discovery job. Contacting prospects to ask them to self-declare their philanthropic connections would be impractical and more intrusive.
- **Balancing test:** Tier 1 uses only publicly available information from statutory registers (CC, CH) and government publications (HMLR, 360Giving, Honours lists). Individuals who appear as trustees, directors, or PSCs in these registers have disclosed this data in a public official context. The privacy impact is low. Factors for: existing donor relationships for some records; processing uses only public information; clear privacy notice with opt-out. Factors against: individuals may not expect their trustee history to be used for fundraising profiling; financial capacity inferences are sensitive.
- **Conclusion:** Tier 1 LIA is supportable provided the privacy notice is clear and the Article 14 notice obligation is met within one month of first processing a new prospect.

### LIA — Tier 2 (commercial data processors)

**Position: Weaker; requires more careful documentation and Article 28 DPAs.**

- **Purpose test:** Same charitable purpose as Tier 1; the interest in confirming major gift capacity is legitimate.
- **Necessity test:** Factary Phi and Wealth-X are the only practical UK-focused sources for confirmed philanthropic giving history and UHNWI wealth data, respectively. The necessity case is arguable: open-source data alone is structurally insufficient for Job C (wealth confirmation), as documented in `03_reliability_ceiling.md` §4.
- **Balancing test:** Tier 2 combines data from commercial processors with Tier 1 open-source data to generate a wealth profile. This engages EDPB criteria 1 (scoring/evaluation), 5 (large-scale), and 6 (data matching) — three criteria; a DPIA is required (see below). Individuals processed in Tier 2 receive commercial-grade profiling without their knowledge. The privacy impact is higher than Tier 1. Factors for: still relies substantially on publicly available information (Factary Phi sources from charity accounts, press releases, public records); processing is internal to a charity, not for commercial sale. Factors against: third-party processors add non-public data signals; individuals are not told at the point of data collection; Wealth-X data originates from US sources.
- **Conclusion:** Tier 2 LIA is supportable but the balancing test is less clear-cut. Must be documented carefully. Article 28 DPAs with each Tier 2 vendor are a non-negotiable prerequisite. Privacy notice must explicitly name Tier 2 processors before any Tier 2 processing begins.

---

## DPIA Hot-Spots

A Data Protection Impact Assessment (DPIA) is required before Tier 2 processing begins. Processing engages at minimum EDPB criteria 1 (financial capacity scoring), 5 (large-scale), and 6 (data matching from multiple sources). Two criteria alone suffice; three criteria make the DPIA mandatory.

### Hot-Spot 1 — Tier 2 International Transfers (Wealth-X, US-origin data)

Wealth-X is operated by Altrata, a US-based entity. Any transfer of UK donor personal data to Altrata's US servers constitutes an international data transfer under UK GDPR Chapter V.

**Requirements before first Wealth-X call:**
- Execute a UK International Data Transfer Agreement (IDTA) with Altrata, or confirm that Altrata has an approved Transfer Impact Assessment covering UK-to-US transfers
- Conduct a Transfer Impact Assessment documenting the legal framework in the US and the risks to UK data subjects
- Document the IDTA or TIA reference in the AuditLogEntry for each Wealth-X lookup (per Story 3b.2 acceptance criteria)
- If Altrata cannot provide adequate IDTA terms, Wealth-X must not be used; Factary Phi (UK-based) is the fallback commercial enrichment source

**Note:** DonorSearch (optional Tier 2 component) also originates from the US. Same IDTA requirement applies if DonorSearch is activated.

### Hot-Spot 2 — Factary Phi: Processor or Controller?

Factary operates as a **data processor on behalf of the charity** when it uses the charity's donor list to conduct lookups. This is the standard Article 28 relationship. However, Factary Phi is also a standalone database product that Factary operates independently. If Factary uses submitted donor records to enhance its own Phi database, it is acting as a **co-controller** and a Joint Controller Agreement under Article 26 is required instead.

**Required due diligence before first Factary submission:**
- Confirm in writing with Factary whether they act as a data processor (Article 28 DPA required) or co-controller (Article 26 JCA required) for records submitted for screening
- Confirm whether Factary will use submitted personal data for any purpose other than returning results to Bloomsbury
- Confirm Factary's sub-processor list (any third-party databases they query using submitted data)
- Factary has published GDPR-compliant screening guidance (factary.com/2019/06/the-factary-screening-revolution) indicating awareness; verify their DPA template covers Article 28 requirements from `02_regulatory_frame.md` §7

### Hot-Spot 3 — ShortlistGate Creates a De-Facto Profiling Decision

The ShortlistGate is not an automated decision with legal effect (Article 22 UK GDPR does not apply — no legal or similarly significant decision is made solely by automated means, because a human reviewer approves each shortlist). However, the scoring step produces a profile that influences whether a donor receives commercial enrichment, which constitutes **profiling** under Article 4(4) UK GDPR.

**Implications:**
- The DPIA must address the profiling step explicitly, even though it is not fully automated
- Privacy notice must disclose that profiling is conducted for prospect research purposes
- Right to object to profiling (Article 21(1)) must be clearly communicated; object means stop profiling for that individual — not just stop contacting
- The scoring rubric and criteria used by ShortlistScorer must be documented (not hidden in a black-box LLM prompt) so that the basis for inclusion/exclusion can be explained to a data subject on request

### Hot-Spot 4 — Anthropic Claude API Data Transfer

All LLM calls transmit donor personal data (name, role history, connections) to Anthropic's API. This constitutes a transfer to a data processor.

**Requirements:**
- Execute an Article 28 DPA with Anthropic before any donor personal data is processed via the Claude API
- Confirm Anthropic's data retention policy for API inputs (standard policy: API inputs not used for training by default; confirm in DPA)
- Confirm Anthropic's sub-processor list
- If Anthropic's servers are outside the UK: confirm IDTA or adequacy decision coverage

---

## Data Retention

Two-tier pipeline warrants differentiated retention: Tier 2 records carry higher risk (commercial profiling, international transfers) and should be held for a shorter period.

| Data tier | Contents | Retention period | Basis |
|---|---|---|---|
| Tier 1 enrichment results | CC, CH, 360Giving, HMLR signals; ShortlistScore | 24 months from date of last active use | Fundraising cycle; relationship cultivation may span 2 years |
| Tier 2 commercial enrichment results | Factary, Wealth-X, DonorSearch outputs; ReconciledLeadRecord | 12 months from date of last active use | Higher-risk processing; shorter retention reduces balancing test risk; Factary recommends data not retained beyond active use |
| Lead dossiers (approved) | LeadDossier in output/ | 24 months from date of last active use | Same as Tier 1; dossier is the primary fundraising document |
| Audit log | AuditLogEntry records | 36 months | Accountability; DSAR evidence; ICO investigation readiness |
| ShortlistApprovals + human decisions | All Checkpoint records | 36 months | Same accountability basis |
| DonorRecord (ingestion) | Name, address, consent_flag | Duration of relationship + 12 months | Standard charity donor record retention |

"Last active use" is defined as: the most recent fundraising team action (dossier review, cultivation contact attempt, or pipeline re-run) involving that donor_id.

The retention sweeper (Story 5.2) implements these periods with human-approved deletion.

**Factary data:** Factary-returned data should not be retained beyond the retention period above. If Factary holds any submitted personal data on their side, the Article 28 DPA must require deletion of that data at contract end and within the above retention period.

---

## DSAR Procedure

Any data subject may request access to all personal data held about them. The one-month response deadline under Article 12 UK GDPR applies.

**Scope of DSAR response for this pipeline:**
- All DonorRecord fields in Postgres
- All Tier1EnrichmentResult fields
- All ShortlistScore fields
- All ShortlistApproval decisions
- All Tier2 vendor outputs (Factary, Wealth-X, DonorSearch) held in Postgres
- All LeadDossier fields
- All AuditLogEntry records for that donor_id
- All human review decisions (Checkpoints 1–4)

**Critical DSAR limitation — Factary-held data:**
The DSAR CLI (Story 7.1) generates the above from Postgres. However, Factary may hold a copy of submitted personal data on their own systems. The Article 28 DPA with Factary must include an obligation for Factary to:
- Assist the charity in responding to DSARs concerning data submitted to Factary (Article 28(3)(e) requirement)
- Confirm within 5 working days whether they hold the subject's data and in what form
- Provide a copy of that data to the charity for inclusion in the DSAR response

This retrieval from Factary may extend the response time. Flag this risk to the DPO; consider including a standard caveat in DSAR responses: "We have also contacted our data enrichment processor Factary Phi regarding any data they hold relating to your records; their response will be provided as a supplement within [X] days."

**Wealth-X data:** Same limitation applies. Altrata's IDTA and Article 28 DPA must include DSAR assistance obligations.

**DSAR CLI command:** `dsar generate --donor-id <UUID>` — see Story 7.1.

---

## Privacy Notice Clauses

The following clauses must be present in Bloomsbury Football Foundation's privacy notice before any pipeline processing begins. These are in addition to the standard privacy notice requirements for supporter communications.

**Required additions:**

1. **Prospect research and wealth screening disclosure:**
   "We may research the public philanthropic, business, and financial background of individuals we believe may be interested in supporting our mission as major donors. This research draws on publicly available information including the Charity Commission register, Companies House, and published grant records. We also use specialist UK databases compiled from public sources to assess philanthropic capacity."

2. **Third-party data processors:**
   "We may share your details with the following data processors for the purpose of prospect research: [Factary Ltd — UK philanthropic database]; [Altrata/Wealth-X — if used]; [Anthropic PBC — AI processing infrastructure]. Each processor operates under a written data processing agreement. Data may be transferred to the United States under appropriate safeguards [if Wealth-X or Anthropic US servers used]."

3. **Profiling disclosure:**
   "As part of our major donor programme, we use automated and manual tools to assess indicators of philanthropic capacity, including trusteeship history, corporate roles, and giving records. This assessment influences which individuals we approach for major gift cultivation. It does not constitute an automated decision with legal effect."

4. **Right to object:**
   "You have the absolute right to object to us using your personal data for direct marketing purposes. You also have the right to object to us processing your data for prospect research and wealth screening on grounds relating to your particular situation. To object, contact [DPO email]."

5. **Article 14 notice (new prospects not collected directly):**
   The above notice, or a tailored version of it, must be sent to newly identified prospects (not existing Bloomsbury supporters) within one month of first processing their data. Record the date of notice in the DonorRecord.

---

## Article 28 DPA Requirements

A written DPA compliant with Article 28 UK GDPR is required with each of the following processors before any data transfer:

| Processor | Use | Key Article 28 provisions to verify |
|---|---|---|
| **Factary Ltd** (Factary Phi) | Tier 2 UK philanthropic lookup | Processor role vs controller role (see Hot-Spot 2); sub-processor list; deletion at contract end; DSAR assistance; UK-based (no IDTA needed unless they use overseas sub-processors) |
| **Altrata / Wealth-X** | Tier 2 UHNWI profiling (optional) | IDTA required (US transfer); sub-processor list; deletion at contract end; DSAR assistance; confirm Altrata entity that signs as processor |
| **DonorSearch** | Tier 2 US-connected donors (optional) | IDTA required (US transfer); confirm UK data coverage and lawful basis for holding UK personal data; sub-processor list |
| **Anthropic PBC** | LLM processing (all tiers) | Confirm API data not used for training; IDTA if US servers; sub-processor list; deletion/return at end |
| **Prefect / Redis provider** (if cloud-hosted) | Orchestration and queue | Confirm UK/EU hosting or IDTA; processing only on documented instructions |

**DPA checklist (per `02_regulatory_frame.md` §7):**
- [ ] Process data only on documented controller instructions
- [ ] Staff confidentiality obligations
- [ ] Appropriate technical and organisational security (Article 32)
- [ ] Sub-processor restrictions and notification
- [ ] Assist with data subject rights requests
- [ ] Assist with security, breach notification, DPIA obligations
- [ ] Delete or return all data at contract end; certify deletion
- [ ] Audit rights

---

## PECR — Outreach Channel Rules

The pipeline produces dossiers for human fundraisers; it does not send outreach directly. PECR compliance is the responsibility of the fundraising team when using dossiers to initiate contact.

**Key rules for fundraising team use of pipeline outputs:**

| Channel | Rule | Notes |
|---|---|---|
| Email to individuals | Consent required (PECR Reg. 22) unless charitable soft opt-in (DUA Act 2025 Reg. 22(3A)) applies | Cold email to new prospects: consent required. Existing Bloomsbury supporters: charitable soft opt-in may apply if contact details obtained via charitable activity |
| Email to corporate subscribers | LI permissible for work-role communications | Applies to trust staff, company representatives; not personal email addresses |
| Live telephone | LI permissible if not TPS-registered; check TPS/CTPS before calling | |
| Post | LI permissible (no PECR rule); check MPS if bought list data used | Pipeline does not use bought lists; this is post-enrichment outreach |

No pipeline output should be used to send automated direct marketing. All outreach decisions are human.
