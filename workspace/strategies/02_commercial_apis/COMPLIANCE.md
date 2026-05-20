# Compliance: Strategy 2 — Commercial API Stack + Claude Synthesis

**Applicable law:** UK GDPR (as retained in DPA 2018), PECR 2003 (as amended by DUA Act 2025), Fundraising Regulator Code of Practice 2025.
**Last reviewed:** 2026-05-05
**Owner:** Data Protection Officer / Director of Fundraising (shared)

---

## 1. LIA Three-Step Test

### Context
The pipeline processes personal data of individual donors and prospects under legitimate interest (Article 6(1)(f) UK GDPR). Two distinct processing activities require separate LIA justifications:

- **Activity A — Existing donor enrichment:** Enriching data on individuals who are already known to the charity as donors or supporters.
- **Activity B — Third-party lead research:** Identifying and profiling individuals who have no existing relationship with Bloomsbury Football Foundation, using commercial API data.

Per 02_regulatory_frame.md §1: third-party lead research requires separate justification from donor research because the reasonable expectation of processing is lower for individuals with no prior relationship.

---

### LIA for Activity A — Existing Donor Enrichment

#### Step 1 — Purpose Test
**Interest pursued:** Bloomsbury Football Foundation has a legitimate interest in deepening its understanding of existing supporters to enable targeted, appropriate major gift cultivation. This supports the Foundation's charitable objects (advancing youth football access across London) by identifying individuals who may be able to make gifts that fund programme expansion. This interest is lawful, genuine, and of clear benefit to the charitable cause.

**Who benefits:** The Foundation (fundraising effectiveness), the cause (more young people served), and ultimately existing supporters who have already demonstrated alignment with the mission.

**Would a reasonable person recognise this as legitimate?** Yes — UK charity sector standards, CASE guidelines, and the Fundraising Regulator's GDPR briefings all recognise prospect research as a legitimate use of data by charities. [Industry guidance suggests this — Fundraising Regulator GDPR briefings, fundraisingregulator.org.uk]

#### Step 2 — Necessity Test
**Is wealth screening via commercial APIs the minimum necessary processing?**

Alternative considered: manual researcher review. Conclusion: a commercial API pipeline is more efficient at scale, enabling consistent application of wealth and philanthropic signals across hundreds of records; it does not process more data than manual research would. The same data sources (CH, CC, Factary Phi) would be consulted manually.

**Minimum data principle:** Only data directly relevant to major gift capacity and philanthropic history is processed. Financial data that is not publicly available (bank accounts, private assets below PSC threshold) is not sought. The pipeline does not create special category data.

**Third-party vendor use:** Passing donor records to DonorSearch, Wealth-X, and Factary Phi is necessary because these vendors hold compiled structured datasets not available from public APIs in raw form. The Article 28 DPA requirement (see §4) ensures processing is limited to the charity's instructions.

#### Step 3 — Balancing Test
**Factors weighing for the charity:**
- Existing donor relationship establishes a reasonable expectation of continued contact and data use
- Processing uses publicly available information only (CH, CC, HMLR, press, honour lists); no data obtained without the individual's knowledge beyond what they have publicly disclosed
- Privacy notice clearly describes prospect research and wealth screening (see §5)
- No automated decision with legal or significant effect; all dossiers are reviewed by humans before use
- Easy opt-out is offered; opt-out flag immediately halts processing (Story 1.2)

**Factors weighing against:**
- Processing involves sensitive inferences (financial capacity estimates)
- Some individuals may not expect wealth profiling even within an existing donor relationship
- Commercial vendor data (DonorSearch, Wealth-X) may include data obtained by those vendors from third parties

**Conclusion:** The balancing test is satisfied for existing donors given the reasonable expectation of contact, the charity's use of disclosed public information, the privacy notice, and the human review gate. The weight of evidence is that processing is proportionate to the charitable purpose.

---

### LIA for Activity B — Third-Party Lead Research

#### Step 1 — Purpose Test
**Interest pursued:** Identifying individuals not currently known to Bloomsbury who may have the capacity and affinity for a major gift. This is a standard prospect research activity recognised in the sector.

**Key difference from Activity A:** The individual has no relationship with the charity and therefore lower reasonable expectation of data use.

**Would a reasonable person recognise this as legitimate?** With appropriate disclosure — yes. Without disclosure — this is precisely the conduct the ICO fined charities for in 2016–2017 (see 02_regulatory_frame.md §6). The legitimacy depends entirely on the charity having a visible, accessible privacy notice.

#### Step 2 — Necessity Test
Same analysis as Activity A. Commercial API data is necessary to efficiently identify prospects with relevant indicators.

**Additional requirement:** Where data is obtained from third parties (Wealth-X, DonorSearch) about individuals who have not submitted data to Bloomsbury, Article 14 UK GDPR requires a privacy notice to be provided to those individuals within one month of obtaining their data.

**Practical implementation:** An Article 14 notice must be sent to every new prospect identified via the pipeline within 30 days. This notice must describe: the source of data, the purpose of processing (prospect research), the lawful basis (LI), and the right to object. This is an operational obligation on the fundraising team — not just a privacy policy clause.

#### Step 3 — Balancing Test
**Factors weighing against (heavier than Activity A):**
- No existing relationship; individual has not interacted with the charity
- Data obtained from third-party vendors without the individual's knowledge
- Wealth profiling creates financial inferences that some individuals would consider intrusive
- Individuals from the Bloomsbury prospect pool (City professionals, sports executives) may have higher privacy expectations given their public profile

**Factors weighing for:**
- Processing uses publicly available information only (same as Activity A)
- Privacy notice is visible and accessible; right to object is easy to exercise
- No automated decision with legal effect
- Charitable purpose is genuine and socially valuable

**Conclusion:** The balancing test can be satisfied IF: (1) the privacy notice explicitly covers prospect research and wealth screening; (2) the Article 14 notice is sent within 30 days; (3) opt-out requests are honoured immediately. Without all three, the processing is not proportionate and the LIA is not satisfied.

**The LIA for Activity B must be completed and signed before any new-prospect data is processed. It cannot be combined with the Activity A LIA.**

---

## 2. DPIA Hot-Spot: International Data Transfers to US Vendors

### Why this is a DPIA hot-spot

The pipeline transmits UK personal data to three US-origin vendors: DonorSearch, Wealth-X (Altrata), and iWave/Kindsight. The United States does not have a UK adequacy decision under UK GDPR as of 2026-05-05 [verified — the UK-US Data Bridge (adequacy regulations under the DPA 2018) was announced in 2023 but applies only to participating US organisations certified under the UK Extension to the EU-US Data Privacy Framework; verify certification status for each vendor before relying on this mechanism].

Under UK GDPR Chapter V, transferring personal data to a country without adequacy is a "restricted transfer" and requires a valid transfer mechanism.

Additionally, Anthropic (Claude API provider) is a US company. Any personal data included in prompts is a restricted transfer.

### Applicable Transfer Mechanisms

**Option 1: UK IDTA (International Data Transfer Agreement)**
The ICO published the UK IDTA in March 2022 as the UK equivalent of EU Standard Contractual Clauses. It is the primary transfer mechanism for restricted UK-to-US transfers. [ICO, "International data transfer agreement", ico.org.uk, accessed 2026-05-05]
- The IDTA must be executed with each US vendor before any data transfer.
- The IDTA requires a Transfer Risk Assessment (TRA) to accompany it, assessing the risk that US law (FISA, CLOUD Act) undermines the protections afforded by the IDTA.
- The TRA must document the likelihood of US government access to the transferred data and whether supplementary safeguards (encryption, pseudonymisation) are warranted.

**Option 2: UK Addendum to EU SCCs**
If a vendor already has EU SCCs in place (e.g., for EU data transfers), a UK Addendum to those SCCs is the faster route. The UK Addendum was published by ICO in March 2022. [ICO, "Addendum to the EU standard contractual clauses", ico.org.uk, accessed 2026-05-05]

**Option 3: UK Extension to the EU-US Data Privacy Framework (UK-US Data Bridge)**
Only available if the specific US vendor is certified under the Data Privacy Framework (DPF). Each vendor must be checked against the DPF list (privacyshield.gov or equivalent successor list) before this mechanism is relied on.
- **DonorSearch:** Certification status — not verified at access date; must confirm at procurement.
- **Wealth-X (Altrata):** Certification status — not verified at access date; must confirm at procurement.
- **iWave/Kindsight:** Certification status — not verified at access date; must confirm at procurement.
- **Anthropic:** Certification status — not verified at access date; must confirm at procurement.

### Pipeline Implementation (cross-reference ARCHITECTURE.md)

The transfer mechanism gate (Story 1.3) implements this requirement:
- `DonorRecord.consent.transfer_mechanism` must be populated before any US vendor API call
- Valid values: `idta`, `scc`, `none`
- `none` blocks all US vendor calls; produces UK-sources-only dossier
- This field records which mechanism is in place at time of processing; it does not substitute for executing the actual IDTA/SCC documents

### DPIA Requirement

The following EDPB/ICO criteria are engaged by this pipeline (from 02_regulatory_frame.md §3):
1. Criterion 1: Evaluation or scoring (financial capacity scoring) — **engaged**
5. Criterion 5: Data processed on a large scale — **engaged at scale** (not engaged for 20-record prototype)
6. Criterion 6: Datasets matched or combined from multiple sources — **engaged** (CH + CC + commercial vendors)
7. Criterion 7: Data concerning potentially vulnerable data subjects — **not engaged** (adult HNW individuals)
8. Criterion 8: Innovative use of technology — **possibly engaged** (LLM synthesis is a novel application)

Two or more criteria are met (criteria 1, 6, and 8 at minimum). **A DPIA is required before processing begins on live donor data.** The international transfer element (US vendors, no adequacy decision) is a specific hot-spot within the DPIA that must be addressed with a Transfer Risk Assessment per IDTA/UK Addendum requirements.

**DPIA must be completed and signed before any live donor data is submitted to the pipeline.** The prototype using a 20-record gold set of public figures or synthetic test data may be treated as lower risk, but if gold set records are real individuals, the DPIA obligation applies from the first record.

---

## 3. Data Retention Policy

| Data category | Retention period | Trigger | Deletion method |
|---|---|---|---|
| DonorRecord (raw submission) | 3 years from last interaction with Bloomsbury | Last donation, event attendance, or direct contact | Logical deletion from Postgres; physical deletion confirmed by DPO |
| RawSignals (API responses) | 1 year from processing date | API retrieval date | Postgres deletion; audit log entry retained |
| DossierDraft | 3 years from creation | Creation date | Logical deletion |
| LeadDossier (approved) | 5 years from approval | Approval date (cultivation period) | Logical deletion; output markdown file deleted from reviews/ and output/ |
| AuditEvents | 6 years from event | Event date | Retained in full (legal / accountability obligation) |
| HumanReview files (reviews/) | Same as associated LeadDossier | LeadDossier deletion trigger | File deletion from reviews/ directory |
| Rejected dossiers | 1 year from rejection | Rejection date | Logical deletion |

**Retention review:** DPO conducts annual review of records approaching retention limits. Actual deletion requires DPO sign-off (Story 7.3).

**Note on RawSignal retention:** Vendor API responses are held for 1 year to enable DSAR responses (see §4). After 1 year, the DossierDraft is the primary record of the derived data; vendor raw responses need not be retained.

---

## 4. DSAR Procedure (Data Subject Access Request)

**Statutory deadline:** 30 days from receipt of valid request (extendable by 2 months for complex cases with notice within 30 days) [verified — UK GDPR Article 12(3)].

The DSAR procedure must work across all vendor data sources, because the data subject is entitled to know what data the charity holds, including data obtained from commercial vendors.

### Step-by-step procedure

1. **Receipt (Day 0):** Request received by DPO or fundraising director. Log in incident tracker with receipt date.
2. **Verify identity (Day 0–5):** Confirm identity of requestor to prevent disclosure to wrong person. Request reasonable proof of identity.
3. **Pipeline query (Day 5–10):** Run GET /dsar endpoint (Story 7.2) with name and email. Retrieve all DonorRecords, RawSignals, DossierDrafts, LeadDossiers, and AuditEvents.
4. **Vendor data reconciliation (Day 10–20):** For each commercial vendor that returned a RawSignal, confirm what data the vendor holds separately. Procedure per vendor:
   - **DonorSearch:** Contact DonorSearch support with individual's name and date of birth; request confirmation of data held. This is required because DonorSearch may hold data beyond what was returned in the API response.
   - **Wealth-X (Altrata):** Contact Altrata DPO; request confirmation of UHNWI profile data held on the individual.
   - **Factary Phi:** Contact Factary; request confirmation of records in Phi database for this individual.
   - **Anthropic (Claude API):** Confirm with Anthropic that API request data is not retained for training; confirm what audit logs Anthropic holds.
5. **Response preparation (Day 20–28):** Compile all data into a structured response. Format: JSON and PDF (Story 7.2 output). Include: all fields collected, sources of data, lawful basis, retention period, right to object, right to erasure.
6. **DPO review and despatch (Day 28–30):** DPO reviews response before sending. Confirm no third-party personal data inadvertently disclosed.

### Right to Erasure (Article 17)
Where a data subject exercises the right to erasure (and no statutory retention obligation overrides it):
1. Delete DonorRecord, RawSignals, DossierDraft, LeadDossier.
2. Notify each commercial vendor to delete any data held about this individual: DonorSearch, Wealth-X, Factary Phi.
3. Retain AuditEvents (legitimate interest in maintaining accurate records for 6 years — see retention table).
4. Record erasure in AuditEvents as `event_type = erasure_completed`.

### Right to Object
An individual may object to processing at any time (Article 21). For prospect research (LI basis):
- Object to direct marketing → absolute right; must be honoured immediately; opt-out flag set; record archived; no further processing.
- Object to other processing (e.g., wealth profiling) → must be honoured unless compelling legitimate grounds override; for a charity of this size, compelling grounds will rarely apply; default to honouring the objection.

---

## 5. Privacy Notice Clause Additions

The following clauses must be added to Bloomsbury Football Foundation's existing privacy notice before the pipeline goes live. These supplement, not replace, existing notice content.

### Clause: Prospect Research and Wealth Screening

> **How we identify and research major gift prospects**
>
> To sustain and grow our programmes, we identify individuals who may be in a position to make a significant financial gift to Bloomsbury Football Foundation. We call this prospect research.
>
> As part of this activity, we may:
> - Search publicly available records including the Companies House register, the Charity Commission register of charities and trustees, Land Registry data, and published honours lists
> - Use commercial wealth screening and prospect research services to identify likely financial capacity, philanthropic history, and organisational connections
> - Use artificial intelligence tools to combine and analyse information from these sources
>
> The commercial services we currently use for this purpose include: DonorSearch, Wealth-X (Altrata), and Factary Phi. Each service acts as a data processor on our behalf under a signed data processing agreement.
>
> **Lawful basis:** We rely on legitimate interest (Article 6(1)(f) UK GDPR) for this activity. We have assessed that our interest in identifying donors who share our mission is proportionate and that it does not override your rights, provided this notice is accessible and you can easily opt out.
>
> **International transfers:** DonorSearch, Wealth-X, and the AI tool we use are based in the United States. We transfer your data to these services under appropriate safeguards (UK International Data Transfer Agreement or Standard Contractual Clauses). The United States does not have a UK adequacy decision.
>
> **Your rights:** You have the right to object to this processing at any time. To opt out of prospect research and wealth screening, contact us at [privacy@bloomsburyfootball.com]. Your objection will be honoured and your record will no longer be processed for this purpose.
>
> **If you are a new prospect (not yet a donor):** If we have obtained information about you from a third-party source, we will send you this notice within 30 days of doing so, as required by UK GDPR Article 14.

### Clause: Right to Object to Direct Marketing (standalone, elevated visibility)

> **Right to object to direct marketing**
>
> You have an absolute right to object to us using your personal data for direct marketing at any time. To exercise this right, contact [privacy@bloomsburyfootball.com] or use the unsubscribe link in any email we send you. We will stop processing your data for this purpose without delay.

These clauses must be reviewed by the DPO before publication. They must be prominently linked from the donation page, volunteer sign-up form, and any event registration form.

---

## 6. DPA Clauses for Each Vendor

All three US vendors are data processors under Article 4(8) UK GDPR. A written Article 28 DPA is mandatory before any data transfer. The DPA must cover all eight elements listed in 02_regulatory_frame.md §7.

Key additional requirements specific to this pipeline:

### DonorSearch
- **Transfer mechanism:** IDTA or UK Addendum to SCCs required; verify DPF certification status.
- **Sub-processor list:** Obtain and review DonorSearch's sub-processor list; any sub-processor that accesses UK personal data must also be covered by appropriate transfer safeguards.
- **Retention and deletion:** DPA must specify that DonorSearch deletes all Bloomsbury-submitted data at contract end; deletion certification required.
- **UK data scope:** DPA should explicitly address the limited UK data coverage (documented as US-biased in 04_signal_inventory.md); confirm that DonorSearch does not infer or fabricate UK signals.
- **Controller/processor distinction:** Confirm that DonorSearch does not use Bloomsbury-submitted data to enrich its own database (which would make it a co-controller under Article 26, requiring a joint controller agreement rather than a processor DPA).

### Wealth-X (Altrata)
- **Transfer mechanism:** IDTA or UK Addendum required; verify DPF certification for Altrata entity.
- **Sub-processor list:** Altrata is a group of products (Wealth-X, BoardEx, RelSci, WealthEngine); obtain confirmation of which Altrata entities will access the submitted data and ensure all are covered.
- **Pre-compiled database disclosure:** Wealth-X holds pre-compiled profiles. The DPA must confirm whether Wealth-X's pre-existing data on a submitted individual was obtained lawfully; Wealth-X's own Article 13/14 obligations apply to those profiles.
- **Controller/processor distinction:** Same risk as DonorSearch — Wealth-X enriches its own profiles from submitted data. Verify and address in DPA.

### iWave / Kindsight
- **Transfer mechanism:** IDTA or UK Addendum required. iWave/Kindsight states GDPR compliance on their pricing page [verified — kindsight.io/pricing, accessed 2026-05-05] but this must be confirmed in the DPA.
- **UK coverage verification:** iWave's data sources are documented as primarily North American (VeriGift, Elections Canada, FEC, CRA). Before executing a DPA, confirm whether UK donor records will be matched against UK data or only US/Canadian data. If UK-only donors will routinely return "not found", the transfer risk may not be proportionate to the benefit.
- **Kill switch:** If UK coverage is confirmed inadequate, iWave is not included in the production pipeline; do not execute a DPA or transfer any UK data.

### Anthropic (Claude API)
- **Transfer mechanism:** IDTA or UK Addendum required for personal data included in API prompts.
- **Data processing agreement:** Anthropic offers a DPA via its platform terms. Confirm current DPA is executed and covers UK GDPR.
- **Training data exclusion:** Confirm in the DPA (or Anthropic's API ToS) that personal data submitted in API calls is not used to train Anthropic models. This is stated as default behaviour in Anthropic's ToS but must be confirmed in writing.
- **Prompt design:** As a risk mitigation, minimise personally identifying information in Claude prompts. Where possible, use internal job_id rather than the individual's name in the prompt; retrieve name only for output formatting. This reduces the personal data volume transferred to Anthropic and reduces transfer risk.
- **Sub-processors:** Confirm Anthropic's cloud infrastructure providers and whether UK data may be processed in the EU or US.

---

*All regulatory citations sourced from 02_regulatory_frame.md. IDTA and SCCs sourced from ICO (ico.org.uk). Vendor-specific compliance status is based on publicly available documentation accessed 2026-05-05 and must be verified at procurement.*
