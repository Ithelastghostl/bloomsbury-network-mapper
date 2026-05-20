# 09 — Risks and Open Questions

**Phase R8 output** | Date: 2026-05-05 | Owner: Director of Fundraising / DPO

This register collects every unresolved question flagged during the research phases (R1–R7). Items are ordered by priority within each theme. None of these questions blocks a Strategy 3 prototype on synthetic or gold-set data — but items marked **High** must be resolved before the pipeline processes live donor records.

---

## Legal and Compliance

---

### OQ-01 — Donor consent language

**Status:** Open — user action required
**Question:** Does Bloomsbury's current donor consent language, as it appears in the live donation form, email sign-up, and any gift agreements, expressly cover third-party network research and wealth screening? Specifically: does it disclose that donor data may be passed to specialist prospect research firms, and that publicly available data about donors and prospects may be compiled into financial capacity assessments?
**Why it matters:** The 2016–2017 ICO enforcement actions (fining RSPCA £25,000 and British Heart Foundation £18,000) arose precisely because charities conducted wealth screening without disclosing it to donors. Under UK GDPR Articles 13 and 14, the same conduct today would trigger a binding requirement to update the privacy notice before any data is processed. If the current consent language does not cover this, every batch run before the notice is updated is unlawful — regardless of how technically sound the pipeline is.
**Who answers it:** User (Director of Fundraising or DPO reviews the live privacy notice and donation form; no external party can answer this)
**Priority:** High — resolve before first live pipeline run

---

### OQ-02 — DPO requirement

**Status:** Open — legal advice required
**Question:** Does Bloomsbury Football Foundation have a designated Data Protection Officer (DPO), and if not, is it required to appoint one? A charity of Bloomsbury's size and processing type (prospect research involving financial capacity profiling, data matching across multiple registers, potential use of commercial screeners) may trigger the mandatory DPO requirement under UK GDPR Article 37(1)(b) ("large scale systematic monitoring") or (c) ("large scale processing of special category data"), or may require one as a matter of best practice under the accountability principle.
**Why it matters:** Without a DPO or an identified data protection lead, the LIA, DPIA, and DSAR procedures documented in every strategy's COMPLIANCE.md have no named owner. The ICO's accountability framework requires a named responsible person. Several compliance steps in this research plan refer to "DPO sign-off" — if that role is unfilled, those gates cannot close.
**Who answers it:** Legal (confirm with charity's solicitors or an ICO-registered DPO consultant)
**Priority:** High — resolve before DPIA is completed

---

### OQ-03 — Factary controller vs processor status

**Status:** Open — vendor verification required
**Question:** When Bloomsbury submits donor records to Factary for screening, does Factary act as a data processor (Article 28 DPA required) or as a joint controller (Article 26 Joint Controller Agreement required)? This turns on whether Factary uses submitted records to enrich its own Factary Phi database or retains profiles for future screening for other clients. Factary's post-2019 GDPR rebuild deleted their pre-compiled HNW database and moved to demographic/occupational proxies, which suggests they do not retain submitted records — but this has not been contractually confirmed.
**Why it matters:** The wrong legal instrument (DPA when a JCA is needed, or no agreement at all) makes the data transfer unlawful under Article 28 UK GDPR. If Factary is a co-controller, Bloomsbury has additional obligations including a public-facing Article 26 transparency notice.
**Who answers it:** Vendor — ask Factary directly: "Do you retain any personal data submitted by clients for your own purposes after the engagement? Do you enrich your Phi database using submitted records?" Confirm in writing before first data transfer.
**Priority:** High — blocks any Strategy 1, 4, or 5 use of Factary managed screening

---

### OQ-04 — Anthropic data processing agreement

**Status:** Open — contractual step required
**Question:** Has Bloomsbury executed an Article 28 Data Processing Agreement (DPA) with Anthropic PBC covering use of the Claude API for processing personal data? Anthropic offers a standard DPA via its platform terms; it must be reviewed to confirm it meets UK GDPR Article 28 requirements, that API inputs are not used for model training (stated as default but must be confirmed in writing), and that Anthropic's sub-processor list and hosting jurisdictions are covered by appropriate UK transfer mechanisms (IDTA or equivalent if US servers are used).
**Why it matters:** Every strategy that uses the Claude API (Strategies 2, 3, 4, and 5) involves personal data — donor names, role histories, network connections — being sent to Anthropic's servers. Without an executed DPA, this transfer is unlawful under Article 28 UK GDPR regardless of Anthropic's default data handling practices.
**Who answers it:** User + Anthropic (review and execute Anthropic's standard DPA at platform.anthropic.com)
**Priority:** High — blocks any live Claude API use on real donor data

---

### OQ-05 — US vendor transfer mechanisms (Strategies 2 and 4)

**Status:** Open — vendor verification required
**Question:** For each US-origin vendor considered under Strategies 2 and 4 (DonorSearch, Wealth-X/Altrata, iWave/Kindsight), what transfer mechanism is available for UK-to-US personal data transfers? Options are: UK IDTA, UK Addendum to EU SCCs, or certification under the UK-US Data Bridge (Data Privacy Framework). None of these vendors' certifications have been confirmed at the research date. A Transfer Risk Assessment (TRA) is also required alongside the IDTA.
**Why it matters:** The United States has no UK adequacy decision. Without a valid transfer mechanism, any transfer of UK personal data to a US vendor is a restricted transfer and unlawful under UK GDPR Chapter V. This applies to DonorSearch, Wealth-X, iWave/Kindsight, and Anthropic (see OQ-04 above).
**Who answers it:** Vendor (each vendor must provide their IDTA, UK Addendum, or DPF certification before contract signature)
**Priority:** High for any Strategy 2 or 4 deployment; Medium for Strategy 3/5 (Claude API only, covered by OQ-04)

---

### OQ-06 — Reputational risk and gift acceptance policy

**Status:** Open — user action required
**Question:** Does Bloomsbury Football Foundation have a published or internal gift acceptance policy that identifies categories of donor or sources of wealth it will not accept? Given the corporate partner mix (Goldman Sachs, CVC, BGC, Rothschild & Co) and Bloomsbury's positioning as a charity serving deprived communities, this is particularly relevant for: sports betting and gambling interests, fossil fuel companies, businesses with contested labour practices, and politically exposed persons. The pipeline's Job C due diligence step produces sanctions and adverse media signals — but it cannot apply a gift acceptance policy that does not yet exist.
**Why it matters:** Without a gift acceptance policy, the fundraising team has no documented basis for declining a gift from a wealthy prospect who passes financial capacity screening but carries reputational risk. This is both a governance question (Charity Commission expects major charities to have one) and a pipeline design question (the due diligence output must be evaluated against stated criteria, not ad hoc).
**Who answers it:** User (Director of Fundraising + Board of Trustees; legal input may be needed for contested categories)
**Priority:** Medium — not a pipeline blocker, but should be resolved before the first lead dossier is used for outreach

---

## Technical and Build

---

### OQ-07 — Gold set assembly

**Status:** Open — user action required (week-1 blocker)
**Question:** Who at Bloomsbury will assemble the 10–20 known-good donor records for pipeline testing, and by what date? The gold set must contain: full name, postcode, approximate donation history, and any known trustee or corporate roles. These records are the accuracy calibration baseline — without them, there is no objective measure of whether the pipeline's dossiers are correct.
**Why it matters:** No pipeline can be validated without ground-truth test data. The gold set is also required to calibrate the ShortlistGate threshold in Strategy 4 (using known high-value donors like the Stuart Roden or Gary Lubner profile tier as positive examples). A pipeline launched without a gold set has no quality gate before it touches the live donor database.
**Who answers it:** User (Anthony Hayman, Director of Fundraising, or CEO Charlie Hyman authorises disclosure of these records for internal testing purposes)
**Priority:** High — week-1 blocker for any prototype build

---

### OQ-08 — CRM system and v2 integration constraints

**Status:** Open — user action required
**Question:** Does Bloomsbury currently use a CRM (e.g., Salesforce, Raiser's Edge, Donorfy, Blackbaud), and if so, what is its API or data export capability? This matters for Strategy 4 v2, where enriched dossiers would ideally be written back to the CRM rather than stored in a separate pipeline database. CRM vendor choice also constrains which commercial vendors integrate natively (iWave/Kindsight and BoardEx both have Salesforce and Raiser's Edge connectors; a CRM on a different platform may require custom integration).
**Why it matters:** Building a pipeline that does not connect to the CRM creates a parallel data silo that fundraisers will not use. Understanding the CRM constraint before v2 architecture is finalised avoids rework. If there is no CRM, the pipeline database is the system of record — a different but simpler architecture.
**Who answers it:** User (Richard Basteed, Head of Digital, or Anthony Hayman)
**Priority:** Medium — not a v1 blocker; relevant for v2 planning

---

## Vendor and Data Source

---

### OQ-09 — OSCR trustee name availability via API

**Status:** Open — vendor verification required
**Question:** As of 9 March 2026, the Office of the Scottish Charity Regulator (OSCR) began publishing trustee names on the register. The OSCR web UI shows trustee names, but it is not confirmed whether the API (`GET /api/all_charities` or similar) returns trustee names in its response payload, or whether trustee names are only available via the web UI at the access date (2026-05-05). The signal inventory notes this uncertainty explicitly.
**Why it matters:** If the OSCR API does not yet return trustee names, the pipeline must either scrape the OSCR web UI (fragile, not recommended for production) or rely on bulk CSV export (slower, less automatable). Trustee names from OSCR are material for Job B (network discovery) for prospects with Scottish charitable connections — a non-trivial segment given the Foundation's national funders.
**Who answers it:** Vendor — test the OSCR API directly with a registered key against a known Scottish charity with published trustees; confirm whether trustee name fields are populated in the API response
**Priority:** Medium — affects Job B recall for Scottish charities; workaround (bulk CSV) exists

---

### OQ-10 — iWave/Kindsight rebranding and UK data coverage

**Status:** Open — vendor verification required
**Question:** iWave has rebranded to Kindsight. The platform's primary data sources (VeriGift, Elections Canada, FEC, CRA) are North American. UK data coverage is not confirmed in vendor documentation. Before any contract is signed or DPA executed, UK data depth must be verified: specifically, what percentage of UK-only donors (no US giving history, no US company affiliations) return a populated profile from Kindsight's screening?
**Why it matters:** Paying £3,300–4,250+/year for a platform that returns "not found" for the majority of Bloomsbury's prospect pool is wasted spend. This is documented as a known risk in the signal inventory. If UK coverage is inadequate, Kindsight should not be included in the production pipeline and no DPA or data transfer should occur.
**Who answers it:** Vendor — request a UK-specific data coverage demo or trial using a sample of anonymised UK records before signing
**Priority:** Medium — relevant only if Kindsight is being evaluated as a component of Strategy 2 or 4

---

### OQ-11 — Factary Phi and Prospecting for Gold pricing

**Status:** Open — RFQ required
**Question:** Both Factary Phi and Prospecting for Gold are listed as POA (price on application) in the signal inventory. The cost models use vendor estimates based on sector norms (Factary Phi: ~£500–2,000/year; Prospecting for Gold retainer: ~£1,500–4,000/month). These estimates are unconfirmed and have a wide range. Actual pricing depends on volume, contract length, and negotiation.
**Why it matters:** The monthly cost difference between a £500/year Factary Phi subscription and a £4,000/month Prospecting for Gold managed retainer is approximately £3,500/month — material at Bloomsbury's scale. The Strategy 4 cost model uses midpoints that could be significantly wrong. An RFQ to both vendors before committing to a strategy is a £2–3 hour investment that changes the cost model with real numbers.
**Who answers it:** User — email willw@factary.com (Factary) and info@prospectingforgold.co.uk (Prospecting for Gold) with a brief: "We are a £4m-income London youth charity. We are evaluating prospect research tools for a database of approximately [X] donors. Can you provide pricing for your standard service?" Do this before any v2 budget is approved.
**Priority:** Medium — cost model sensitivity; not a build blocker

---

### OQ-12 — Wealth-X / Altrata pricing for entry tier

**Status:** Open — RFQ required
**Question:** The signal inventory estimates Wealth-X at £15,000–50,000+/year, which may be over-specified for a charity running fewer than 500 qualifying leads through Tier 2 per year. Altrata may offer an entry or charity tier at lower cost. The cost model for Strategy 4 uses a lower bound of £10,000–20,000/year for a reduced-volume hybrid use case — this is an estimate, not a confirmed price.
**Why it matters:** If the Wealth-X entry tier is closer to £20,000/year, it represents 83% of Strategy 4's entire fixed monthly cost budget. If a charity-sector discount exists (Altrata lists "nonprofits" as a target segment), the cost case for including Wealth-X in Strategy 4 improves significantly. If no reduced tier exists, Factary Screening alone (without Wealth-X) may be the more proportionate commercial enrichment source.
**Who answers it:** Vendor — contact Altrata sales; disclose charity status; ask specifically about entry-tier pricing for a sub-500-lead/year use case
**Priority:** Low — affects Strategy 4 commercial component selection, not the S3 MVP build

---

## Data Quality and Methodology

---

### OQ-13 — Bloomsbury income trajectory (Charity Commission accounts)

**Status:** Open — data retrieval required
**Question:** The Charity Commission register returned server errors when annual accounts for years ending June 2020–2024 were requested during R1 research. Only the latest income figure of £4,045,655 (year ending June 2025, from 360Giving data) and the grant data subset (£1,227,753 from 36 grants) are confirmed. The full year-on-year income trajectory is unknown.
**Why it matters:** Understanding whether Bloomsbury has grown at 30%, 50%, or 100% year-on-year between 2018 and 2025 changes the fundraising ambition context and may influence how urgently a major-gift pipeline is needed versus other income diversification strategies.
**Who answers it:** User — retrieve annual accounts directly from the Charity Commission register (register.charitycommission.gov.uk) or request them from the finance director
**Priority:** Low — contextual; does not affect pipeline design

---

### OQ-14 — Bloomsbury income mix (earned vs voluntary vs statutory)

**Status:** Open — data retrieval required
**Question:** The specific split between earned income (programme fees), voluntary/individual donor income, grant income, and statutory funding is not published on Bloomsbury's public pages and was not accessible in the accounts during R1 research. The proportion of income from individual major donors (as distinct from corporate and trust funders) determines how large a prize the pipeline is pursuing.
**Why it matters:** If individual major gifts represent less than 5% of current income, the pipeline's revenue uplift potential is bounded differently than if they represent 20%. This affects the business case for capital investment in the pipeline.
**Who answers it:** User — review management accounts with finance director; or obtain from annual accounts once accessible (see OQ-13)
**Priority:** Low — contextual framing; does not affect pipeline architecture
