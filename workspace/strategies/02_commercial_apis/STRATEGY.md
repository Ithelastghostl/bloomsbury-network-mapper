# Strategy 2 — Commercial API Stack + Claude Synthesis

## Mechanism of Reliability

This strategy layers structured commercial data over the free UK public registers, then uses Claude to resolve entities across schemas and compose coherent dossiers. DonorSearch contributes philanthropic capacity scores derived from SEC filings, real estate records, and charitable databases; Wealth-X (Altrata) contributes estimated net worth and associate networks for UHNWI (>$30m) individuals; Factary Phi contributes the only UK-native searchable database of verified donation history. Free UK APIs (Companies House, Charity Commission, 360Giving) underpin all records regardless of commercial coverage. Claude Sonnet synthesises gathered signals into dossiers; Claude Opus handles ambiguous entity resolution and complex Job C lead qualification. The central weakness — documented and not solvable by architecture — is that DonorSearch and Wealth-X are US-origin platforms whose UK individual coverage is materially thinner than their US coverage: a UK donor who has never given publicly to a US charity and whose wealth is in a private UK company below the PSC 25% threshold will produce sparse commercial results. This gap is documented at the signal level (see §Coverage) and must be surfaced in every dossier.

---

## Architecture Diagram

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  INPUT                                                               │
 │  Fundraiser submits donor CSV/JSON → DonorIngestionService           │
 │  (consent metadata attached; audit log written)                      │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  ENTITY RESOLUTION                                                   │
 │  EntityResolver (Claude Haiku) — name normalisation, DOB/address     │
 │  disambiguation, confidence score per candidate match                │
 │  Confidence < 0.85 → HumanReviewQueue (Checkpoint 1)                │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  API FAN-OUT (APIOrchestrator, parallel)                             │
 │                                                                      │
 │  Free UK sources:                                                    │
 │  ├── Companies House officer search / appointments / PSC             │
 │  ├── Charity Commission EW trustee + related charities               │
 │  └── 360Giving GrantNav (grant recipient/funder history)             │
 │                                                                      │
 │  Commercial sources:                                                 │
 │  ├── DonorSearch  — philanthropic capacity + giving history          │
 │  └── Wealth-X (Altrata) — UHNWI profile + estimated net worth       │
 │                                                                      │
 │  Factary Phi (UK-native, accessed via web UI or managed API):        │
 │  └── UK donation history, trusteeships, patronages                  │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  SYNTHESIS (SynthesisAgent — Claude Sonnet)                          │
 │  Merges API responses; each claim must cite its source signal.       │
 │  Produces structured Job A dossier (wealth tier, philanthropic       │
 │  history, corporate affiliations, flags).                            │
 │  Gaps labelled explicitly — no inference from absence.               │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  SHORTLISTING                                                        │
 │  WealthScorer applies scoring rubric to SynthesisAgent output:       │
 │  wealth tier confidence, philanthropic indicator count, network      │
 │  density score. Records below threshold → archive; above → Job C.   │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  CHECKPOINT 2: Uncertainty Review (HumanReviewQueue)                 │
 │  Wealth confidence < 0.70 OR relationship score < 0.60 escalates.   │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  JOB C ENRICHMENT (SynthesisAgent — Claude Opus, batch API)          │
 │  Full lead dossier: £5M+ capacity narrative, sanctions check         │
 │  (UK Sanctions List), PEP indicators, adverse media synthesis,       │
 │  relationship pathway to Bloomsbury trustees.                        │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  CHECKPOINT 3: Final Sign-off (HumanReviewQueue)                     │
 │  Fundraiser or Director of Fundraising reviews full dossier.         │
 │  Approves, edits, or rejects before dossier is released.             │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  OUTPUT                                                              │
 │  DossierFormatter → signed-off markdown dossier in reviews/          │
 │  AuditLogger records every API call, model invocation, human         │
 │  decision, timestamp, and operator identity.                         │
 └──────────────────────────────────────────────────────────────────────┘
```

---

## Data Sources with Signal Stable IDs

| Signal ID | Source | Job fit | Notes |
|---|---|---|---|
| `signal.companies_house.officer_search` | Companies House API | B: high, A: med | CH 600 req/5 min |
| `signal.companies_house.officer_appointments` | Companies House API | B: high | Full appointment history |
| `signal.companies_house.persons_with_significant_control` | Companies House API | A: med, B: high, C: med | 25% threshold gap |
| `signal.charity_commission_ew.trustee_data` | Charity Commission EW API/bulk | B: high, A: med | Beta API; bulk download preferred |
| `signal.threesixtygiving.grantnav` | 360Giving GrantNav | A: high, B: med | Bulk CSV; no stable API |
| `signal.hmlr.price_paid` | HMLR Price Paid | A: med | No buyer names; proxy only |
| `signal.hmlr.overseas_companies_property` | HMLR OCOD | C: high | Overseas entity beneficial owners |
| `signal.ofsi.uk_sanctions_list` | UK Sanctions List (FCDO/OFSI) | C: high | Replaces OFSI list from 28 Jan 2026 |
| `signal.govuk.honours_lists` | GOV.UK Honours | A: high, B: med | Scrape required; no API |
| `signal.factary.phi_donations_db` | Factary Phi | A: high | UK-native; primary commercial source |
| `signal.donorsearch.wealth_screening` | DonorSearch | A: med | US bias; verify UK depth at procurement |
| `signal.altrata.wealth_x` | Wealth-X (Altrata) | A: high (UHNWI), B: med | Weak below £30m; £15–50k+/yr POA |
| `signal.anthropic.claude_api` | Anthropic Claude API | A/B/C: high | Synthesis and entity resolution |

---

## Coverage and Accuracy by Job

### Job A — Donor Enrichment (individual wealth and philanthropic profile)

- **Expected substantially-complete dossier rate:** ~40–55% [my estimate]
- Wealth-X covers the UHNWI tier (>$30m) well — relevant for Bloomsbury's Goldman Sachs / CVC / Rothschild-tier prospects.
- DonorSearch UK data depth is unverified at procurement; US philanthropy footprint only where donor has given to US organisations.
- Factary Phi provides the primary UK donation signal (~30–40% recall on UK giving history [my estimate]).
- UK-only individuals with no US philanthropy footprint and wealth below £30m will produce thin dossiers. This is a documented structural gap, not a pipeline defect.

### Job B — Network Mapping (board, trustee, corporate affiliations)

- **Co-trusteeship recall:** ~90–95% [my estimate] — structurally near-complete from Charity Commission bulk register.
- **Corporate connection recall:** ~70–80% [my estimate] for formal CH director/PSC roles; rises to ~75–85% if BoardEx is added (not in base stack).
- Wealth-X associates data adds relationship paths for UHNWI individuals modestly.
- No improvement over free open-source for co-trusteeship — the CC register is already the ceiling.

### Job C — Lead Qualification (£5M+ net worth; sanctions, PEP, adverse media)

- **Wealth confirmation rate on shortlisted leads:** ~25–35% [my estimate]
- Wealth-X provides well-evidenced UHNWI profiles; structural ceiling applies below $30m.
- UK Sanctions List provides near-complete sanctions coverage (~95% [my estimate]).
- PEP identification ~60–70% [my estimate] from public role data; commercial AML vendors (Refinitiv, LexisNexis) required for systematic PEP coverage — not in base stack.
- **All wealth estimates must be labelled [estimate] in dossiers; no claim of confirmed £5M+ net worth is permissible without a sourced basis.**

---

## Failure Modes

1. **US vendor UK coverage gap.** DonorSearch and Wealth-X are documented as US-biased (see `signal.donorsearch.wealth_screening`, `signal.altrata.wealth_x` in 04_signal_inventory.md). A UK prospect with no US philanthropy footprint and private wealth below the PSC 25% threshold may return zero commercial results. Mitigation: Factary Phi as primary UK enrichment; flag zero-commercial-match records explicitly rather than suppressing them.

2. **Entity resolution collision on common names.** "David Smith" or "James Bennett" appearing across multiple Companies House and Charity Commission records will generate multiple candidate matches. A wrong merge creates a composite dossier attributed to the wrong individual. Mitigation: EntityResolver (Claude Haiku) requires DOB month/year + at least one address fragment for a high-confidence match (≥0.85); records below threshold trigger Checkpoint 1 human review before any commercial API call is made on that identity.

3. **Claude hallucination on synthesis step.** If the SynthesisAgent prompt permits inference from gaps or narrative interpolation, fabricated claims will appear in dossiers. They will be plausible and hard to catch without source-checking. Mitigation: strict prompt instruction — every claim must include a source signal ID; any absent field is explicitly labelled "Not found in available sources" rather than inferred. Hallucination rate target is 0% (see TEST_PLAN.md).

4. **IDTA compliance gap for US vendor transfers.** Routing UK donor personal data to DonorSearch, Wealth-X, and iWave/Kindsight — all US-origin platforms — constitutes a restricted transfer under UK GDPR Chapter V. Without a valid transfer mechanism (UK IDTA or SCC equivalent), the transfer is unlawful. Mitigation: IDTA or SCCs executed with each US vendor before first data transfer; documented in COMPLIANCE.md.

5. **Wealth-X over-specification for Bloomsbury's prospect band.** The primary prospect segment (£1m–£10m gift potential) is largely below Wealth-X's UHNWI threshold of $30m. The product's strength is above the threshold; spending £15–50k+/year for thin results below it is a cost risk. Mitigation: validate coverage in a paid pilot before signing an annual contract; consider scoping to known UHNWI candidates only; iWave/Kindsight at £3,300–4,250/year verified as a lower-cost fallback (UK coverage must also be verified before purchase).

---

## When to Choose This Strategy

Choose Strategy 2 when:
- The prospect set includes a material proportion of UHNWI individuals (>$30m) where Wealth-X coverage is confirmed — e.g., a capital campaign targeting City principals, family office owners, or international sports executives.
- Engineering capacity of 4–6 weeks is available and vendor procurement lead time (~4 weeks per vendor) can run in parallel with build.
- The charity can justify £20,000–55,000/year in vendor fees against expected major-gift revenue.
- An existing CRM integration with DonorSearch or Altrata is in place or intended.

Do not choose Strategy 2 as a first step when:
- The prospect pool is primarily UK-based HNW individuals below £30m with no US philanthropy footprint — Strategy 4 (Hybrid) achieves comparable output at lower cost using Factary Phi.
- Engineering capacity is not available — Strategy 1 (Factary outsourced) produces defensible UK dossiers immediately.
- The primary need is co-trusteeship network mapping — the free CC/CH pipeline (Strategy 3) delivers that at the same recall for zero data cost.

---

## Effectiveness Ranking (from 07_ranking_and_recommendation.md)

| Dimension | Score (1=worst, 5=best) | Notes |
|---|---|---|
| Effectiveness | 3 / 5 | US vendor UK gap limits completeness in Bloomsbury's £1m–£10m prospect band |
| Technical feasibility (4–6 wk) | 2 / 5 | Multiple API integrations, entity resolution, multiple DPAs — 8–16 wk to production quality |
| Complexity (lower = more complex) | 2 / 5 | Highest operational complexity of all five strategies |
| Efficiency (cost per reliable dossier) | 2 / 5 | High vendor fees (£25–80k+/yr) spread over modest record count |
| Impact (£5M+ lead identification) | 3 / 5 | Wealth-X strong for UHNWI; overspecified for sub-£30m range |

Overall ranking: **3rd of 5** strategies. The preferred build path per 07_ranking_and_recommendation.md is Strategy 3 → Strategy 4. Strategy 2 is appropriate as a specialised UHNWI enrichment layer or when vendor relationships are pre-existing.
