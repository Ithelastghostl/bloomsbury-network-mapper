# 03 — Signal Reliability Ceilings for the Bloomsbury Network Mapper

**Phase R3 output** | Accessed: 2026-05-05 | Covers: open-source, commercial, and specialist recall for the seven signals used in Jobs A, B, and C

---

## Signal Recall Table

| Signal | Source(s) | Open-source recall | Commercial recall | Specialist recall | Notes |
|---|---|---|---|---|---|
| 1. Shared charity trusteeships | Charity Commission register (free API / bulk download); Companies House (for CIO trustees) | **High — ~90–95%** [my estimate] | Marginal uplift only; same underlying register | Marginal uplift; Factary NTU adds newly registered trusts before CC bulk data refreshes | Structurally the highest-recall open signal. See §1 below. |
| 2. Named individual donation history | No comprehensive open source in UK. Charity accounts (CC register) disclose aggregate income, not donor names below trustee level. Factary Phi is the main commercial compilation. | **Very low — ~5–10%** [my estimate] | **Moderate — ~30–40%** [my estimate] with Factary Phi or DonorSearch | **Moderate — ~40–50%** [my estimate]; specialist researchers add media, alumni records, event programmes | Post-GDPR structural ceiling. See §2 below. |
| 3. Corporate roles (PSC, director, officer) | Companies House free API: director history, officer roles, PSC register (≥25% ownership threshold) | **Moderate-high — ~70–80%** [my estimate] for formal roles; drops sharply for beneficial ownership below threshold | Adds some private-equity / partnership structures via commercial databases; marginal | Specialist adds context but same deterministic ceiling on beneficial ownership | PSC regime has a hard structural gap. See §3 below. |
| 4. Property ownership via Land Registry | HMLR Price Paid Data (free download, England & Wales): address, price, date of transfer — but **no buyer/seller name** in the public bulk file. Title register owner name requires a paid per-title search (£3/title). Overseas Entities Register (2022+) names beneficial owners of foreign-held UK property. | **Very low — ~5%** [my estimate] for individual identification without per-title searches | **Moderate — ~50–60%** [my estimate] if commercial vendor holds pre-compiled title-to-owner linkage | Specialist firms (e.g. Zoopla-linked tools, LandInsight) improve coverage; still incomplete for nominee ownership | High-value residential property is nominally open but only at per-title cost; nominee/trust/company ownership is a further gap. |
| 5. £5M+ net worth confirmation | No UK equivalent of a mandatory wealth register. Sunday Times Rich List covers top ~1,000 (threshold: ~£350m in 2024). No public source covers the £5m–£350m band systematically. | **Very low — <5%** of the £5m+ population | **Low-moderate — ~20–30%** [my estimate]: DonorSearch, Wealth-X / Altrata, iWave compile from public filings, property, and proprietary signals, but coverage of the £5m–£30m band is thin | Factary Phi + Factary Screening add UK-specific philanthropic wealth signals; Prospecting for Gold's Wealth Intelligence Database covers ~270,000 HNW/connected individuals (source: prospectingforgold.co.uk, accessed 2026-05-05) — still a fraction of the estimated 200,000–300,000 UK individuals with £1m+ investable assets | The structural ceiling is fundamental, not architectural. See §4 below. |
| 6. Philanthropic event co-attendance / advisory board membership | Scattered; event programmes, annual reports, press releases, LinkedIn. No aggregated open source. | **Very low — ~5–10%** [my estimate]; manual media review only | Limited; commercial databases do not systematically track event attendance | Specialist researchers manually compile from annual reports, event programmes, institutional honour rolls. Coverage is patchy and retrospective. | Signal value is high when found (strong proximity indicator) but recall is structurally low and no systematic source exists. |
| 7. Adverse media / sanctions / PEP status | UK Sanctions List (gov.uk/government/publications/the-uk-sanctions-list, accessed 2026-05-05): fully open, machine-readable. OFSI Consolidated List closed 28 Jan 2026 — now merged into UK Sanctions List. PEP status: no open consolidated list; inferred from roles. Adverse media: open web search only. | **High for sanctions — ~95%** [my estimate]; sanctions are deterministic public records. PEP: ~60–70% [my estimate] from Wikipedia/public role data. Adverse media: incomplete, no recall estimate possible | Dedicated AML/KYC vendors (Refinitiv World-Check, Dow Jones Risk & Compliance, LexisNexis) add PEP databases, global adverse media, and continuous monitoring | Specialist researchers augment with courts records, Insolvency Register; no uplift over commercial for formal sanctions | Sanctions recall from open source is near-complete. PEP and adverse media are more uncertain. |

---

## Explanatory Prose

### 1. Why shared-trusteeship is structurally high-recall from open sources

The Charity Commission for England and Wales publishes a fully open register of all registered charities, including a complete list of current and former trustees with appointment/removal dates. This data is available via the Charity Commission API and as a bulk download. As of early 2026, approximately 170,000 charities are registered in England and Wales, with an estimated total trustee population of 800,000–900,000 individuals (the Charity Commission's "Taken on Trust" research series has cited figures in this range).

Because every registered charity in E&W must file trustee details as a condition of registration — and non-compliance triggers regulatory action — completeness is structurally enforced by statute (Charities Act 2011, s.30). The only gaps are: (a) charities below the £5,000 income threshold that are exempt from registration; (b) exempt charities (e.g. universities, Academy schools) that fall under a different regulator; and (c) delays between appointment and filing, typically under 30 days.

This means that for any named individual, a co-trusteeship query against the Charity Commission bulk data retrieves essentially all current UK registered charities where that person is or has been a trustee. Cross-matching two individuals' trustee histories to find shared charities is a near-deterministic open-data join with very high recall. No commercial tool adds meaningfully to what the free register already provides.

The Factary New Trust Update Archive Database adds recently incorporated trusts (often before they appear in CC bulk data) and subject-matter classification, but for co-trusteeship network discovery the open register is the primary and near-complete source. (Source: factary.com/2025/03/factary-launches-new-and-improved-new-trust-archive-database, accessed 2026-05-05)

### 2. Why named individual donation history is poorly captured in open data

UK charity law does not require charities to publish the names of individual donors in their accounts. The Statement of Financial Activities (SoFA) discloses total income by category (donations, grants, trading) but not individual gift amounts or donor identities. Where a donor is also a trustee, their trusteeship is disclosed — but not the size of any personal gift.

The only routes to named donation data in the UK open domain are: (a) press releases, gala programmes, and honour rolls that charities publish voluntarily; (b) company accounts where a corporate donation is disclosed as a related-party transaction; and (c) US-equivalent public filings (Form 990), which have no UK counterpart — a named UK donor's gift to a US charity via a donor-advised fund or direct gift appears in US public records, but their UK gifts typically do not.

Post-GDPR, this gap has deepened. The ICO's 2017–2018 guidance and enforcement history (including the British Heart Foundation and RSPCA fines) caused many charities to remove donor names from public-facing materials. Factary deleted their proprietary database of wealthy individuals in 2019 specifically because they could not justify retaining it under legitimate interest without issuing privacy notices to every individual — and instead rebuilt their screening methodology on demographic and occupational signals rather than known-donor matching. (Source: factary.com/2019/06/the-factary-screening-revolution, accessed 2026-05-05)

Factary Phi (factary.com) is the main commercial UK compilation of philanthropic donation history, built from publicly available sources including charity accounts, press releases, and media. It does not have systematic coverage — it is a curated database, not a complete record. No vendor publishes a recall rate for this dataset.

The consequence for Job A (donor enrichment): open-source recall of donation history for a known individual is very low unless they are exceptionally prominent. Commercial tools raise recall modestly. Even specialist research cannot recover gifts that were never publicly disclosed.

### 3. The PSC filing regime: what it captures and what it misses

The People with Significant Control (PSC) register was introduced in April 2016 under the Companies Act 2006 as amended. A person must be registered as a PSC if they hold more than 25% of shares or voting rights in a company, or can appoint or remove a majority of directors, or otherwise exercise significant influence or control. (Source: gov.uk/guidance/people-with-significant-control-pscs, accessed 2026-05-05)

The **25% threshold** is the regime's primary structural gap for wealth identification purposes:

- An individual with a 24% stake in a £200m private company — and therefore notional wealth of ~£48m — does not appear on the PSC register for that company.
- Holdings routed through multiple holding vehicles (each below 25%) can be structured to avoid PSC disclosure in each entity.
- Beneficial ownership through trusts, nominee shareholders, or overseas entities may not trigger PSC registration depending on how the structure is analysed.
- Partnerships and LLPs have their own register but with equivalent threshold-based gaps.
- Sole traders and partnerships without corporate structure generate no Companies House record at all.

What the PSC register deterministically captures: controlling shareholders in limited companies (typically founder-owned businesses, family companies, and investment vehicles), director/officer roles for all registered companies regardless of ownership, and majority-stake beneficial ownership. These are useful for identifying corporate wealth indicators but are not a complete map of wealthy individuals.

The Overseas Entities Register (mandatory from 2022 under the Economic Crime (Transparency and Enforcement) Act 2022) improved disclosure of foreign beneficial ownership of UK property, but the same structural gap applies: sub-25% overseas beneficial owners are not captured.

### 4. Why £5M+ net worth confirmation is a genuine ceiling problem in the UK regardless of architecture

The UK has approximately 30,014 individuals with net worth exceeding $30m (UHNW, defined as >$30m), as of 2025. (Source: Knight Frank Wealth Report 2025, cited in Wikipedia, "High-net-worth individual", en.wikipedia.org, accessed 2026-05-05.) The broader population with net worth exceeding £5m (approximately $6.3m at current rates) is substantially larger — possibly 100,000–200,000 individuals — but no authoritative open UK count exists for this band.

The Sunday Times Rich List documents only the top ~1,000 wealthiest UK individuals and families, with a 2024 entry threshold of approximately £350m. Its methodology explicitly excludes bank accounts and non-identifiable assets: "We measure identifiable wealth, whether land, property, racehorses, art or significant shares in publicly quoted companies. We exclude bank accounts — to which we have no access." (Source: Wikipedia, "Sunday Times Rich List", en.wikipedia.org, accessed 2026-05-05, citing the Rich List's own stated methodology.) The Rich List therefore covers only the top 0.001% of the £5m+ population by entry threshold.

The structural reasons why no architecture solves this:

**No wealth tax returns are public.** Unlike the US, where Form 990 disclosures and EDGAR filings create a partial public record of large holdings, the UK has no equivalent. HMRC tax returns are private; Trust Registration Service records (introduced post-2022 for UK trusts) are not publicly searchable. Self-invested Personal Pensions (SIPPs) and ISAs are not disclosed at all.

**Private company valuations are imputed, not published.** The majority of £5m–£30m UK wealth is held in private businesses, residential property, and liquid assets. Private companies file abbreviated accounts; Sole traders file nothing. Valuing a private business from its abbreviated accounts is a modelling exercise with wide error bands — this is exactly what Factary's post-GDPR screening does: demographic and occupational proxies, not confirmed wealth.

**Property is the most accessible proxy** but is incomplete. HMLR Price Paid Data records transaction prices for E&W residential sales since 1995, but the bulk download does not include buyer names — these require paid per-title searches. High-value properties are frequently held in corporate or trust structures. The Prospecting for Gold Wealth Intelligence Database cross-references "million pound properties" as a wealth band indicator (source: prospectingforgold.co.uk, accessed 2026-05-05), but this is a proxy for capacity, not confirmed net worth.

**The practical implication for Job C** (£5M+ qualification in lead dossiers): any claim to "confirm" £5m+ net worth should be labelled as an *estimate* derived from identified indicators (property holdings, corporate stakes, trust assets, philanthropic activity scale), not as a fact. The ceiling on confirmation — even with specialist researcher input — is structural, not a failure of methodology.

---

## Source Notes

- Factary methodology (post-GDPR screening): factary.com/2019/06/the-factary-screening-revolution, accessed 2026-05-05
- Factary New Trust Update Archive: factary.com/2025/03/factary-launches-new-and-improved-new-trust-archive-database, accessed 2026-05-05
- Prospecting for Gold (Wealth Intelligence Database, 270,000 HNW individuals; wealth screening methodology): prospectingforgold.co.uk, multiple pages, accessed 2026-05-05
- UK PSC guidance: gov.uk/guidance/people-with-significant-control-pscs, accessed 2026-05-05
- UK Sanctions List: gov.uk/government/publications/the-uk-sanctions-list, accessed 2026-05-05
- HMLR Price Paid Data methodology: gov.uk/guidance/about-the-price-paid-data, accessed 2026-05-05
- 360Giving GrantNav coverage: grantnav.threesixtygiving.org (341 funders, 1.46m grants, 183,026 individual recipients), accessed 2026-05-05
- UK UHNWI population (30,014 with >$30m, 2025): Wikipedia, "High-net-worth individual" citing Knight Frank Wealth Report 2025, en.wikipedia.org, accessed 2026-05-05
- Capgemini World Wealth Report 2025 (global HNWI wealth +4.2%, population +2.6% in 2024): capgemini.com/insights/research-library/world-wealth-report, accessed 2026-05-05
- Sunday Times Rich List methodology (excludes bank accounts, identifiable assets only): Wikipedia, "Sunday Times Rich List", en.wikipedia.org, accessed 2026-05-05
- Altrata World Ultra Wealth Report 2024 (global UHNW = 426,330 individuals in 2023): altrata.com/reports/world-ultra-wealth-report-2024, accessed 2026-05-05

**Recall percentages not attributed to a published source are labelled [my estimate] and are derived from the structural reasoning described in the prose sections above, not from vendor-published identification rate claims. No vendor whose products are mentioned in this document publishes a recall rate for the UK £5m+ segment; where Factary has published a figure (~17% of initially screened prospects cannot be confirmed in the public domain), this applies to their post-screening drop-out rate, not to recall over the total UK £5m+ population.**
