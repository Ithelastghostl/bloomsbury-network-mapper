# Signal Inventory: UK Charity Donor Enrichment Pipeline

**Access date:** 2026-05-05  
**Scope:** Free UK public APIs, commercial vendors, LLM/AI infrastructure  
**Job definitions used throughout:**  
- **Job A:** Identify and profile major individual donors (wealth, philanthropy, reputational)  
- **Job B:** Map board/trustee networks and corporate affiliations  
- **Job C:** Sanctions, PEP, and reputational due diligence screening  

---

## FREE UK PUBLIC APIs

---

### signal.companies_house.officer_search
**Source:** Companies House Public Data API  
**URL:** https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference  
**What it provides:** Full-text search across all registered company officers by name, returning officer_id, name, date of birth (month/year only), address, and appointment summary.  
**UK coverage:** All ~8 million active and dissolved company officers on the CH register (England, Wales, Scotland, NI companies registered at CH). Does not cover unincorporated entities or sole traders.  
**Cost:** Free [verified — Open Government Licence v3.0; no charge for API key]  
**Rate limits:** 600 requests per 5-minute window (~2 req/s sustained). Higher limits available on request via the developer forum.  
**Auth:** HTTP Basic Auth — API key as username, blank password. OAuth 2.0 also available for user-delegated flows.  
**ToS constraints:** OGL v3.0 — free to use, adapt, and redistribute for any purpose including commercial. Must acknowledge source. ECCTA 2023 note: structure unchanged; `identity_verification_status` field added to officer/PSC records from late 2025 onward; no data suppressed.  
**Fit for Job A / B / C:** A: med — confirms company affiliations and addresses but no wealth data; B: high — core source for directorship mapping; C: low — not a sanctions source, but disqualification endpoints available.

---

### signal.companies_house.officer_appointments
**Source:** Companies House Public Data API  
**URL:** https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference  
**What it provides:** Full appointment history for a given `officer_id` — all directorships, secretaryships, and other roles across all companies, including resigned positions with start/end dates and company type.  
**UK coverage:** Complete CH register; cross-references all ~4.5 million active companies. Does not capture positions at charities not registered as companies (CIOs, unincorporated associations).  
**Cost:** Free [verified]  
**Rate limits:** Same 600/5-min pool as all CH endpoints.  
**Auth:** As above.  
**ToS constraints:** OGL v3.0. Appointment history is fully public; ECCTA 2023 did not restrict this endpoint.  
**Fit for Job A / B / C:** A: low; B: high — primary source for cross-company board mapping; C: low.

---

### signal.companies_house.persons_with_significant_control
**Source:** Companies House Public Data API  
**URL:** https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference  
**What it provides:** PSC register for a given company — individual or corporate entity with >25% shares/voting rights or significant influence. Fields include name, date of birth (month/year), nationality, country of residence, and nature of control.  
**UK coverage:** All UK companies required to maintain a PSC register (most limited companies). Certain exemptions apply (listed entities, some LLPs). The UK has not restricted beneficial-ownership data to AML-obliged entities — register remains fully public as of May 2026.  
**Cost:** Free [verified]  
**Rate limits:** Shared 600/5-min pool.  
**Auth:** As above.  
**ToS constraints:** OGL v3.0. `identity_verification_status` field now present; data structure otherwise unchanged post-ECCTA 2023.  
**Fit for Job A / B / C:** A: med — confirms significant ownership stakes; B: high — reveals hidden connections between companies and individuals; C: med — useful for beneficial ownership checks in due diligence.

---

### signal.charity_commission_ew.trustee_data
**Source:** Charity Commission for England and Wales API (beta)  
**URL:** https://api-portal.charitycommission.gov.uk  
**What it provides:** Charity register data including trustee names and roles (`GetCharityTrustees`), related charities sharing trustees (`GetTrusteeAndRelatedCharities`), annual returns, financial summaries, and charitable purposes. API reflects real-time register; bulk download also available as daily ZIP extracts (JSON + TSV, 14 files).  
**UK coverage:** ~170,000 registered charities in England and Wales. Does not cover Scotland (OSCR) or Northern Ireland (CCNI).  
**Cost:** Free [verified — OGL v3.0]  
**Rate limits:** Rate limiting applied "to ensure a stable and reliable service" but no specific threshold published. Beta status — treat as subject to change.  
**Auth:** API key required; register at api-portal.charitycommission.gov.uk.  
**ToS constraints:** OGL v3.0. API is in beta; Charity Commission requests feedback. Bulk download is the more stable integration route for batch pipelines.  
**Fit for Job A / B / C:** A: med — financial scale, trustee names useful for donor identification; B: high — `GetTrusteeAndRelatedCharities` directly maps shared trustee networks; C: low.

---

### signal.threesixtygiving.grantnav
**Source:** 360Giving GrantNav  
**URL:** https://grantnav.threesixtygiving.org  
**What it provides:** Searchable, downloadable database of grants awarded by UK funders published in the 360Giving Data Standard. Fields: funder, recipient name and charity number, grant amount, date, description, programme, location. Updated daily.  
**UK coverage:** As of early 2026: >1 million grants, total value >£265 billion, from ~275 publishers. Covers major lottery distributors, government bodies, corporate foundations, and large charitable trusts. Does not capture unpublished grants or funders that have not adopted the standard.  
**Cost:** Free [verified — CC BY 4.0 licence]  
**Rate limits:** No formal API rate limit published; GrantNav does not expose a stable programmatic API — primary access mode is bulk CSV/Excel/ODS download (per-publisher or full dataset). A `threesixtygiving.org` data registry API exists for publisher metadata.  
**Auth:** None required for downloads.  
**ToS constraints:** Creative Commons Attribution 4.0 International. Commercial and charity use permitted. Attribution required. Source code is AGPL-3.  
**Fit for Job A / B / C:** A: high — reveals grant recipients and amounts, useful for identifying philanthropic capacity; B: med — funder board members not included, but funder-recipient relationships are; C: low.

---

### signal.hmlr.price_paid
**Source:** HM Land Registry Price Paid Data  
**URL:** https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads  
**What it provides:** All residential and commercial property sales registered in England and Wales since 1995. Fields: price paid, date of transfer, address, property type, new build flag, tenure. Individual purchaser names are not included for residential; company names included where applicable.  
**UK coverage:** All registered sales in England and Wales; ~27 million records total, updated monthly (20th working day). Scotland and Northern Ireland not included.  
**Cost:** Free [verified — OGL v3.0]  
**Rate limits:** Bulk CSV download; no API rate limit.  
**Auth:** None.  
**ToS constraints:** OGL v3.0. Note: individual names excluded for privacy; property address only. Utility for donor profiling is indirect (confirms property at address, not named ownership).  
**Fit for Job A / B / C:** A: med — property address enrichment for wealth indicators (no direct name match for individuals); B: low; C: low.

---

### signal.hmlr.overseas_companies_property
**Source:** HM Land Registry — Overseas Companies that Own Property in England and Wales (OCOD)  
**URL:** https://use-land-property-data.service.gov.uk/datasets/ocod  
**What it provides:** Every registered title owned by a non-UK corporate entity. Fields: title number, tenure, proprietor name (company name), country of incorporation, correspondence address, date of registration. Cross-references Companies House Register of Overseas Entities (ROE) via ROE number. Monthly full CSV + change-only delta file (from 2nd working day of month).  
**UK coverage:** All overseas-entity property titles in England and Wales; the ROE (maintained by Companies House under ECCTA 2023) provides beneficial owner details. Scotland not covered.  
**Cost:** Free [verified — requires account registration at use-land-property-data.service.gov.uk; OGL v3.0]  
**Rate limits:** Bulk CSV download; no API rate limit. JSON API also available for registered users.  
**Auth:** Account registration required.  
**ToS constraints:** OGL v3.0. Designed for due diligence and transparency use cases; no restrictions on charity use.  
**Fit for Job A / B / C:** A: med — confirms offshore property ownership when entity name matches; B: low; C: high — key for identifying overseas-entity beneficial owners in due diligence.

---

### signal.ofsi.uk_sanctions_list
**Source:** UK Sanctions List (FCDO/OFSI — consolidated from 28 Jan 2026)  
**URL:** https://www.gov.uk/government/publications/the-uk-sanctions-list  
**What it provides:** All UK sanctions designations across all regimes (Russia, Iran, Syria, DPRK, global anti-corruption, etc.). Fields: unique ID, full name, aliases, date of birth, nationality, address, regime, designation type (asset freeze, travel ban, arms embargo), and 70+ structured fields. Replaces the former OFSI Consolidated List which closed 28 January 2026.  
**UK coverage:** Complete UK sanctions universe. Updated multiple times per week.  
**Cost:** Free [verified — OGL v3.0]  
**Rate limits:** No API; 7 download formats: CSV, XML, ODS, ODT, HTML, TXT, PDF. Search UI also available at search-uk-sanctions-list.service.gov.uk.  
**Auth:** None.  
**ToS constraints:** OGL v3.0. Designed for compliance use.  
**Fit for Job A / B / C:** A: low; B: low; C: high — definitive UK sanctions screening source.

---

### signal.govuk.honours_lists
**Source:** GOV.UK Honours Lists archive  
**URL:** https://www.gov.uk/honours/honours-lists  
**What it provides:** Semi-structured HTML/PDF publications of New Year and King's Birthday Honours Lists, listing recipients by award type and sector (arts, business, charity, etc.). Published twice yearly. Archive of prior years available as individual publications. No API or bulk download.  
**UK coverage:** All UK national honours; archive extends to at least 2013 in structured form, earlier in PDF.  
**Cost:** Free [verified — OGL v3.0]  
**Rate limits:** Web scraping only; no API.  
**Auth:** None.  
**ToS constraints:** OGL v3.0. Scraping permitted for personal/research use; commercial redistribution of extracted data requires attribution.  
**Fit for Job A / B / C:** A: high — OBE, CBE, knighthood signals significant public prominence and often philanthropy; B: med — cross-referencing honours with trustee data enriches profiles; C: low.

---

### signal.oscr.scottish_charities
**Source:** Office of the Scottish Charity Regulator (OSCR)  
**URL:** https://www.oscr.org.uk/about-charities/search-the-register/  
**What it provides:** Full Scottish Charity Register via bulk download (CSV) and a public REST API (`GET /api/all_charities`, `GET /api/annualreturns`). Fields: charity name, number, status, registered purposes, income/expenditure (up to 5 years), trustee count. As of 9 March 2026, trustee names are now published on the register, but the API documentation does not yet confirm whether names appear in the API response (the OSCR web UI shows them; API update status unclear at access date).  
**UK coverage:** ~24,000 Scottish charities.  
**Cost:** Free [verified — API key required via access request form]  
**Rate limits:** Not published.  
**Auth:** `x-functions-key` header with assigned key.  
**ToS constraints:** Open data; licence terms not explicitly stated in API docs — confirm with OSCR before bulk commercial redistribution.  
**Fit for Job A / B / C:** A: med — financial data useful for organisational profiling; B: high — trustee names now published (verify API availability); C: low.

---

### signal.ccni.northern_ireland_charities
**Source:** Charity Commission for Northern Ireland (CCNI)  
**URL:** https://www.charitycommissionni.org.uk/charity-search/  
**What it provides:** Public register of ~7,000 NI charities. Web search interface with CSV export available per search. Trustee data included in register records. No documented public API as of access date.  
**UK coverage:** Northern Ireland charities only.  
**Cost:** Free [verified]  
**Rate limits:** No API — CSV export from web search UI only.  
**Auth:** None.  
**ToS constraints:** OGL v3.0 presumed (Crown copyright); confirm before bulk redistribution.  
**Fit for Job A / B / C:** A: low — small coverage; B: med — trustee data available via download; C: low.

---

## COMMERCIAL VENDORS

---

### signal.factary.phi_donations_db
**Source:** Factary Phi  
**URL:** https://factary.com / https://www.factaryphi.com  
**What it provides:** UK's only comprehensive searchable database of donations and donors to the non-profit sector, compiled from verifiable public domain sources (charity websites, Charity Commission filings). Covers individual gifts, corporate donations, trustee roles, patronages, and ambassadorships. Source links provided for each entry. Unlimited searches and spreadsheet exports.  
**UK coverage:** UK-focused. Described as "comprehensive" for UK philanthropy — the most complete single source of verifiable UK giving records. Exact record count not published.  
**Cost:** POA [vendor estimate: ~£500–£2,000/year based on "low-cost, flexible" positioning and sector norms for small specialist databases; no corroborating public price found — contact willw@factary.com]  
**Rate limits:** Web UI access; no API documented.  
**ToS constraints:** Charity/non-profit sector product by design. Terms of Business on website; explicitly built for UK fundraising compliance context.  
**Fit for Job A / B / C:** A: high — direct UK philanthropic giving records; B: med — trusteeships and patronages mapped; C: low.

---

### signal.prospecting_for_gold.wealth_screening
**Source:** Prospecting for Gold  
**URL:** https://prospectingforgold.co.uk  
**What it provides:** Managed wealth screening service — submits your supporter database, returns matched wealth indicators and major gift potential scores. Also offers individual prospect profiles, due diligence reports, and consultancy. Free initial screen for databases of 2,000+ UK supporters.  
**UK coverage:** UK-focused; Berkshire-based agency. Coverage dependent on underlying data sources used (not disclosed).  
**Cost:** POA [vendor estimate: free for initial screen 2,000+ records; individual profiles likely £50–£300 each; annual retainer POA — no public price; contact info@prospectingforgold.co.uk]  
**Rate limits:** Managed service — not self-serve API.  
**ToS constraints:** "Data protection underpins everything we do" — explicitly GDPR-aware. Designed for UK charity sector. Suitability: high.  
**Fit for Job A / B / C:** A: high — core major gift screening use case; B: low; C: med — offers reputational/due diligence reports.

---

### signal.donorsearch.wealth_screening
**Source:** DonorSearch  
**URL:** https://www.donorsearch.net  
**What it provides:** US-origin wealth and philanthropic screening platform. Combines wealth indicators (real estate, stock holdings, business affiliations) with philanthropic capacity scores derived from giving history. Serves 13,000+ nonprofits. Batch screening and individual lookups.  
**UK coverage:** Primarily US data. UK coverage limited — real estate and company data for UK may be partial. Verify UK data depth before procurement.  
**Cost:** POA [vendor estimate: ~£3,000–£8,000/year for smaller UK charities based on INN member rate of $1,000/year as floor, typical nonprofit pricing at higher tiers per review sites — contact info@donorsearch.net; no UK-specific price published]  
**Rate limits:** API and CRM integrations available.  
**ToS constraints:** US-centric ToS; GDPR compliance for UK use requires due diligence. Check DPA with vendor before use on UK donors.  
**Fit for Job A / B / C:** A: med — strong for US-connected donors, weaker for UK-only; B: low; C: low.

---

### signal.altrata.wealth_x
**Source:** Wealth-X (Altrata)  
**URL:** https://www.altrata.com/products/wealth-x  
**What it provides:** "World's largest collection of records on wealthy individuals" — profiles of ultra-high-net-worth individuals (UHNWI, net worth >$30M), covering estimated net worth, source of wealth, associates, philanthropic interests, and biographic detail. Includes screening and custom analytics.  
**UK coverage:** Global with significant UK/Europe UHNWI coverage. Strong for individuals with public profiles; thinner for private wealth below £30M.  
**Cost:** POA [vendor estimate: £15,000–£50,000+/year based on ≥2 G2/review sources describing it as "on the pricey side" and "steep for smaller orgs"; enterprise tier; contact Altrata sales]  
**Rate limits:** Salesforce integration and API available at enterprise tier.  
**ToS constraints:** POA on Terms; no sector-specific restrictions visible. UK charity use for prospect research is consistent with advertised use cases. Confirm DPA for GDPR.  
**Fit for Job A / B / C:** A: high — best-in-class for UHNWI profiling; B: med — associates data useful; C: med — due diligence use case mentioned.

---

### signal.altrata.iwave_kindsight
**Source:** iWave (now Kindsight)  
**URL:** https://kindsight.io  
**What it provides:** Prospect research and wealth screening platform aggregating 44+ datasets. Proprietary VeriGift database (233M+ charitable gift records), Candid, ZoomInfo, D&B, Dow Jones. Scores include affinity, capacity, and propensity to give. CRM integrations (Salesforce, Raiser's Edge, etc.).  
**UK coverage:** Primarily US and Canada data. UK coverage not confirmed in vendor documentation — data sources (Elections Canada, CRA, FEC) are North American. **Not recommended for UK-only donor pipelines without verifying UK data depth.**  
**Cost:** iWave Starter from $4,150/year (~£3,300); Professional from $5,350/year (~£4,250); Premium: contact for pricing [verified — kindsight.io/pricing, accessed 2026-05-05]  
**Rate limits:** API and CRM integrations included at Premium tier.  
**ToS constraints:** GDPR-compliant (listed). UK charity use: confirm UK data coverage before contract. ToS on site.  
**Fit for Job A / B / C:** A: low for UK-only donors; B: low; C: low — primarily philanthropic screening, not sanctions.

---

### signal.altrata.wealthengine
**Source:** WealthEngine (Altrata)  
**URL:** https://www.wealthengine.com  
**What it provides:** Prospect research platform with WealthEngine Premier. Offers wealth ratings, real estate data, charitable giving history, business affiliations, and predictive models. API and developer access available.  
**UK coverage:** Primarily US-focused; UK coverage limited. Part of Altrata group — some cross-product data sharing possible.  
**Cost:** POA [vendor estimate: ~$5,000–$15,000/year (~£4,000–£12,000) based on TrustRadius/ITQlick corroborated data points: "$5,000/year for 1 user" and "$15,000/year for 10 users"; confirmed as custom pricing]  
**Rate limits:** API access available.  
**ToS constraints:** US-origin platform; GDPR compliance for UK use requires a DPA. Confirm UK data coverage before procurement.  
**Fit for Job A / B / C:** A: med (US donors), low (UK-only); B: low; C: low.

---

### signal.altrata.relsci
**Source:** RelSci (Altrata)  
**URL:** https://www.altrata.com/products/relsci  
**What it provides:** Relationship intelligence platform — 10 million people across 2 million organisations. Path Finder maps relationship routes between individuals. 50+ search filters. Daily alerts on target individuals. Primary focus: business development and fundraising relationship mapping.  
**UK coverage:** Global database; UK coverage present but depth unspecified. Stronger for US corporate/political networks.  
**Cost:** POA [vendor estimate: £10,000–£30,000+/year based on enterprise positioning and Altrata's "pricey" characterisation on review sites; no published tier]  
**Rate limits:** Salesforce AppExchange integration; API available for enterprise.  
**ToS constraints:** Standard enterprise ToS; no sector-specific restrictions. Confirm DPA for GDPR. Fundraising relationship mapping is consistent with advertised use cases.  
**Fit for Job A / B / C:** A: med — wealth not primary output but connections are; B: high — core relationship mapping use case; C: low.

---

### signal.altrata.boardex
**Source:** BoardEx (Altrata)  
**URL:** https://www.altrata.com/products/boardex  
**What it provides:** Detailed profiles of 1.8 million+ executives across 2.2 million organisations (public, private, not-for-profit). Fields: current and past board roles, education, diversity attributes, compensation (where public), relationship paths. 400 global researchers maintain data. CRM integration and API delivery available.  
**UK coverage:** Strong UK and European coverage given London office and research team presence. Not-for-profit organisations included in scope.  
**Cost:** POA [vendor estimate: £8,000–£25,000+/year based on enterprise positioning comparable to RelSci; 350,000+ users cited — volume suggests tiered pricing; contact Altrata sales]  
**Rate limits:** CRM integration and API dataset delivery available.  
**ToS constraints:** Standard enterprise ToS. No sector-specific restrictions; fundraising/charity use consistent with advertised solutions. Confirm DPA for GDPR.  
**Fit for Job A / B / C:** A: med — executive profiles, compensation indicators; B: high — board-level relationship mapping is the product's core purpose; C: low.

---

### signal.lexisnexis.nexis_development_professionals
**Source:** Nexis for Development Professionals (LexisNexis)  
**URL:** https://www.lexisnexis.com/en-us/products/nexis-development-professionals.page (US); https://www.lexisnexis.co.uk for UK enquiries  
**What it provides:** Prospect research platform aggregating news, company, executive, and public records. Three tiers: Essentials (prospect research, donor validation, company/executive bios, US public records), Premium (adds reputational risk screening, ethical gift management, donor values/affiliations), Enterprise (custom data packages, flexible API delivery). News archive from 40,000+ sources worldwide.  
**UK coverage:** Nexis news archive has strong UK coverage. Public records component is US-centric; UK charity-sector use of the public records module requires clarification on UK data depth. UK-specific pricing via LexisNexis UK sales.  
**Cost:** POA [vendor estimate: ~£5,000–£20,000+/year based on "pricing varies from one organisation to the next," enterprise SaaS norms, and LexisNexis's general pricing tier; Essentials likely lower end; Enterprise higher — contact LexisNexis UK directly]  
**Rate limits:** Enterprise tier offers flexible API delivery.  
**ToS constraints:** Designed explicitly for nonprofit development/fundraising use. Premium tier specifically includes ethical giving and reputational risk — well-suited to UK charity due diligence obligations. GDPR compliance: confirm DPA for UK use. Three named tiers make procurement conversation structured.  
**Fit for Job A / B / C:** A: high — news, bios, corporate data for prospect profiling; B: med — executive data available; C: high — Premium tier includes reputational risk and ethical gift screening.

---

## LLM / AI INFRASTRUCTURE

---

### signal.anthropic.claude_api
**Source:** Anthropic Claude API  
**URL:** https://platform.claude.com/docs/en/about-claude/pricing  
**What it provides:** API access to Claude models for structured extraction, entity resolution, relationship synthesis, and batch enrichment of donor profiles from unstructured text. Supports prompt caching, batch processing, and 1M-token context windows on Opus 4.7, Opus 4.6, and Sonnet 4.6.

**Pricing (verified — platform.claude.com/docs, accessed 2026-05-05):**

| Model | Input ($/MTok) | Output ($/MTok) | Batch Input | Batch Output | Cache Read |
|---|---|---|---|---|---|
| claude-opus-4-7 | $5.00 | $25.00 | $2.50 | $12.50 | $0.50 |
| claude-sonnet-4-6 | $3.00 | $15.00 | $1.50 | $7.50 | $0.30 |
| claude-haiku-4-5-20251001 | $1.00 | $5.00 | $0.50 | $2.50 | $0.10 |

Cache write costs: 5-min write = 1.25x base input; 1-hour write = 2x base input. Cache read = 0.1x base input (90% discount vs. standard).  
Batch API: 50% discount on both input and output vs. standard rates.  
Opus 4.7 note: uses a new tokenizer — up to 35% more tokens for the same text compared to earlier models.

**UK coverage:** Global API; no geographic restriction.  
**Rate limits:** Tiered (Tier 1–4 + Enterprise); contact sales for custom limits.  
**ToS constraints:** Standard Anthropic usage policy — no restriction on charity enrichment pipelines. Data sent to the API is not used for training by default (confirm in current API ToS). For UK charity use involving personal data, a DPA with Anthropic is required under UK GDPR.  
**Fit for Job A / B / C:** A: high — entity extraction, profile synthesis from news/documents at scale; B: high — relationship parsing and network summarisation; C: high — reputational text analysis and adverse media synthesis.

---

## COVERAGE SUMMARY

| Signal | Job A (Donor Profile) | Job B (Network Map) | Job C (Due Diligence) | Cost tier |
|---|---|---|---|---|
| Companies House — officer search/appointments/PSC | med / high / med | high | med | Free |
| Charity Commission EW — trustees | med | high | low | Free |
| 360Giving GrantNav | high | med | low | Free |
| HMLR Price Paid | med | low | low | Free |
| HMLR Overseas Companies | med | low | high | Free |
| UK Sanctions List | low | low | high | Free |
| GOV.UK Honours | high | med | low | Free |
| OSCR Scottish charities | med | high | low | Free |
| CCNI NI charities | low | med | low | Free |
| Factary Phi | high | med | low | ~£500–£2k/yr POA |
| Prospecting for Gold | high | low | med | POA |
| DonorSearch | med (US bias) | low | low | POA ~£3–8k/yr |
| Wealth-X (Altrata) | high (UHNWI) | med | med | POA ~£15–50k+/yr |
| iWave/Kindsight | low (UK) | low | low | £3.3–4.3k+/yr verified |
| WealthEngine (Altrata) | med (US bias) | low | low | POA ~£4–12k/yr |
| RelSci (Altrata) | med | high | low | POA ~£10–30k+/yr |
| BoardEx (Altrata) | med | high | low | POA ~£8–25k+/yr |
| Nexis Devel. Professionals | high | med | high | POA ~£5–20k+/yr |
| Claude API | high | high | high | Usage-based |
