# Strategy 4 — Hybrid Tiered Pipeline

**Status: RECOMMENDED** — highest overall ranking per `07_ranking_and_recommendation.md`

---

## Mechanism of Reliability

Strategy 4 is a two-tier pipeline that combines near-complete open-source signal coverage with targeted commercial enrichment, concentrating spend precisely where it produces the most return. Tier 1 processes every incoming record (100–400/month) using the same open-source stack as Strategy 3: Companies House director and PSC data (`signal.companies_house.officer_search`, `signal.companies_house.officer_appointments`, `signal.companies_house.persons_with_significant_control`), Charity Commission England and Wales trustee data (`signal.charity_commission_ew.trustee_data`), 360Giving GrantNav (`signal.threesixtygiving.grantnav`), and HMLR Overseas Companies (`signal.hmlr.overseas_companies_property`). Because shared-trusteeship recall from the CC register is structurally ~90–95% [my estimate], Tier 1 catches the large majority of genuine qualified network leads before any commercial spend is committed. A Claude Sonnet scoring pass converts the raw graph into a ranked shortlist. A human ShortlistGate checkpoint then approves which records advance. Tier 2 runs commercial enrichment — Factary Phi (`signal.factary.phi_donations_db`) with optional targeted Wealth-X (`signal.altrata.wealth_x`) or DonorSearch (`signal.donorsearch.wealth_screening`) lookups — exclusively on the approved shortlist (~10–30% of total volume). This architecture produces two separable quality outcomes: broad network discovery at near-maximum recall for free, and confirmed wealth-banding on shortlisted leads at commercial accuracy. The result dominates every single-tier approach: it is cheaper than running commercial enrichment on all records (Strategy 2), more complete than open-source alone (Strategy 3), and more scalable than outsourcing (Strategy 1).

---

## Architecture Diagram

```
 ┌─────────────────────────────────────────────────────────────┐
 │  TIER 1 — OPEN-SOURCE ENRICHMENT  (all 100–400 records)     │
 │                                                             │
 │  DonorIngestionCLI                                          │
 │       │                                                     │
 │       ▼                                                     │
 │  Tier1Orchestrator (Prefect)                                │
 │       │                                                     │
 │       ├──► CompaniesHouseAgent                              │
 │       │      signal.companies_house.officer_search          │
 │       │      signal.companies_house.officer_appointments    │
 │       │      signal.companies_house.persons_with_significant_control
 │       │                                                     │
 │       ├──► TrusteeGraphAgent                                │
 │       │      signal.charity_commission_ew.trustee_data      │
 │       │                                                     │
 │       ├──► GrantNavAgent                                    │
 │       │      signal.threesixtygiving.grantnav               │
 │       │                                                     │
 │       ├──► PropertyAgent                                    │
 │       │      signal.hmlr.overseas_companies_property        │
 │       │      signal.hmlr.price_paid                         │
 │       │                                                     │
 │       └──► WebSearchAgent                                   │
 │              signal.govuk.honours_lists + media             │
 │                                                             │
 │       ▼                                                     │
 │  ShortlistScorer (Claude Sonnet)                            │
 │    — scores on: co-trusteeship density, PSC wealth          │
 │      signals, grant history, honours indicators             │
 │                                                             │
 └──────────────────────────┬──────────────────────────────────┘
                            │
                     ┌──────▼──────┐
                     │ ShortlistGate│  ◄─── HUMAN CHECKPOINT
                     │ (human review│        approve / reject /
                     │ + approval) │        modify shortlist
                     └──────┬──────┘
                            │ approved shortlist only (~10–30%)
 ┌──────────────────────────▼──────────────────────────────────┐
 │  TIER 2 — COMMERCIAL ENRICHMENT  (shortlist only)           │
 │                                                             │
 │  Tier2Orchestrator (Prefect)                                │
 │       │                                                     │
 │       ├──► FactaryPhiClient                                 │
 │       │      signal.factary.phi_donations_db                │
 │       │                                                     │
 │       ├──► WealthXClient (optional, UHNWI-flagged only)     │
 │       │      signal.altrata.wealth_x                        │
 │       │                                                     │
 │       └──► DonorSearchClient (optional, UK-connected)       │
 │              signal.donorsearch.wealth_screening            │
 │                                                             │
 │       ▼                                                     │
 │  WealthConfirmer (Claude Sonnet)                            │
 │    — reconciles Tier 1 probabilistic signals                │
 │      with Tier 2 confirmed data; flags conflicts            │
 │                                                             │
 │       ▼                                                     │
 │  Job C SynthesisAgent (Claude Opus)                         │
 │    — produces full lead dossier with sourced                │
 │      wealth-band estimate and network summary               │
 │                                                             │
 │       ▼                                                     │
 │  HumanReviewQueue ──► Final dossier sign-off                │
 │                                                             │
 │  AuditLogger (all tiers)                                    │
 └─────────────────────────────────────────────────────────────┘
```

---

## Data Sources

| Signal ID | Source | Tier | Used for |
|---|---|---|---|
| `signal.companies_house.officer_search` | Companies House API | 1 | Director search by name |
| `signal.companies_house.officer_appointments` | Companies House API | 1 | Full appointment history |
| `signal.companies_house.persons_with_significant_control` | Companies House API | 1 | PSC wealth indicators |
| `signal.charity_commission_ew.trustee_data` | Charity Commission E&W API + bulk download | 1 | Co-trusteeship graph (primary signal) |
| `signal.threesixtygiving.grantnav` | 360Giving GrantNav bulk CSV | 1 | Grant history and funder network |
| `signal.hmlr.overseas_companies_property` | HMLR OCOD + CH Register of Overseas Entities | 1 | Offshore property ownership |
| `signal.hmlr.price_paid` | HMLR Price Paid Data | 1 | Property value proxies (address enrichment) |
| `signal.govuk.honours_lists` | GOV.UK honours archive | 1 | Philanthropic prominence signal |
| `signal.ofsi.uk_sanctions_list` | FCDO/OFSI UK Sanctions List | 1 | Sanctions screening (mandatory all records) |
| `signal.factary.phi_donations_db` | Factary Phi | 2 | UK philanthropic giving history |
| `signal.altrata.wealth_x` | Wealth-X / Altrata | 2 | UHNWI confirmed wealth (>$30m flagged leads only) |
| `signal.donorsearch.wealth_screening` | DonorSearch | 2 | US-connected donor giving history (optional) |
| `signal.anthropic.claude_api` | Anthropic Claude API | 1 + 2 | Scoring, extraction, synthesis |

---

## Coverage and Accuracy by Job

### Job B — Network Discovery (Tier 1)

- Co-trusteeship recall: **~90–95%** [my estimate] — structurally enforced by CC register mandatory filing; same ceiling as Strategy 3
- Corporate connection recall: **~70–80%** [my estimate] for formal CH roles (PSC ≥25%, director, officer); hard structural gap below 25% threshold
- Shortlist precision: a ShortlistScorer scoring ≥0.7 on co-philanthropy signal strength and ≥1 PSC wealth indicator yields an estimated false-positive rate of ~15–20% [my estimate]; calibration against known Bloomsbury positives (Lubner, Roden profiles) required before production
- Tier 2 commercial enrichment adds biographical depth and UK donation records for shortlisted leads; does not materially change recall (the CC register has already captured it)

### Job C — Wealth Confirmation (Tier 2 — shortlisted leads)

- Confirmed wealth-band accuracy: **~60–70%** [my estimate] for UK-specific records enriched with Factary Phi — Factary's post-GDPR methodology uses demographic/occupational proxies rather than a pre-compiled database, and their published ~17% post-screening drop-out rate implies ~83% of screened records yield some wealth signal
- For UHNWI-flagged leads (Wealth-X added): **~70–80%** [my estimate] for individuals with net worth >$30m, consistent with Wealth-X product positioning
- The structural ceiling from `03_reliability_ceiling.md` §4 applies: no architecture can "confirm" £5M+ net worth for the £5m–£30m band from public data; all wealth bands are estimates derived from identified indicators, not facts. Label accordingly in every dossier.

### Job A — Donor Enrichment (full pipeline)

- Tier 1 pass (all records): **~30–40%** substantially complete dossiers [my estimate from `07_ranking_and_recommendation.md`]; strong on trustee/director skeleton, weak on donation history and wealth
- Tier 2 pass (shortlisted leads): **~55–65%** substantially complete dossiers [my estimate] — commercial enrichment adds donation history and wealth proxies where open-source is structurally thin

---

## Failure Modes

1. **Shortlist false negatives (missed qualified leads).** If the open-source filter scores a genuinely qualified prospect below the ShortlistGate threshold — particularly individuals with no charity footprint but significant property or private equity wealth — they never reach Tier 2 enrichment. Mitigation: periodically audit a random 5% sample of non-shortlisted records; set threshold conservatively at prototype stage; review ShortlistGate false negative rate against the <10% target in TEST_PLAN.md.

2. **Factary Phi UK coverage gaps for low-profile HNW.** Factary Phi is curated from publicly available sources and is stronger for individuals with an established philanthropy track record. Newer donors, tech-sector wealth, or property-rich individuals with no public giving history will return thin results. Mitigation: accept this as a structural gap; supplement with web research for tech/property sector leads.

3. **IDTA implications for Wealth-X.** Wealth-X is a US-origin product (Altrata). Any transfer of UK donor personal data to Wealth-X's US servers constitutes an international data transfer under UK GDPR Chapter V. The UK International Data Transfer Agreement (IDTA) or a Transfer Impact Assessment is required before the first transfer. This is a mandatory pre-condition for Wealth-X use in Tier 2. See COMPLIANCE.md.

4. **Entity resolution across two tiers.** The same individual may appear under different name variants, DOB formats, or address conventions in Tier 1 (CC bulk data, CH API) and Tier 2 (Factary Phi, Wealth-X). Name collisions and false merges are more likely at the Tier 1→Tier 2 handoff than within a single pipeline. Mitigation: WealthConfirmer agent applies entity resolution before writing confirmed signals to the lead record; confidence score <0.85 triggers uncertainty review (see HUMAN_CHECKPOINTS.md).

5. **ShortlistGate human bottleneck.** The human checkpoint before Tier 2 spend creates a latency dependency. If reviewers are slow, the Tier 2 queue backs up. Mitigation: target ≤2 business day SLA for ShortlistGate; design the review interface for batch approval (not per-record sign-off); define quorum for approval.

6. **Commercial vendor pricing escalation.** Factary Phi and Wealth-X costs are POA and subject to renegotiation. If Wealth-X entry tier rises above £20k/year, the hybrid blended cost/dossier rises materially. Mitigation: start with Factary Phi only; add Wealth-X only for confirmed UHNWI-flagged leads; right-size contract volume.

---

## When to Choose This Strategy

**Recommended strategy.** Choose Strategy 4 when:

- Volume is 100–400 records/month — the range where fixed commercial licence costs are justified but per-record variable costs remain low
- The primary enrichment signal is shared trusteeships and philanthropic network connections (Job B) — where Tier 1 open-source recall is highest (~90–95%)
- Cost efficiency and confirmed wealth tier both matter — you need more than network skeletons (ruling out Strategy 3 alone) but cannot justify full commercial enrichment on every record (ruling out Strategy 2)
- UK compliance is a hard requirement — Factary Phi is UK-native and GDPR-designed; it is the safest commercial enrichment choice for a UK charity
- You have 8–10 engineer-weeks for the initial build and can gate Tier 2 on Tier 1 success (see PROTOTYPE_SCOPE.md)
- The fundraising team can staff the ShortlistGate review (estimated 2–4 hours/week at 200 records/month, 20% shortlist rate)

Do not choose Strategy 4 if: the team has no engineering capacity (choose Strategy 1), if the volume is below 50 records/month (Strategy 5 is more cost-effective), or if all records require deep wealth confirmation rather than a tiered approach (Strategy 1 or 5).

---

## Effectiveness Ranking

From `07_ranking_and_recommendation.md`:

| Dimension | Score | Notes |
|---|---|---|
| Effectiveness | 4 / 5 | Near-S1 effectiveness on shortlist; lower on broad first pass |
| Technical feasibility | 3 / 5 | Requires S3 as prerequisite; MVP in 8–10 weeks |
| Complexity | 3 / 5 | Moderate — S3 plus one commercial integration layer |
| Efficiency | 4 / 5 | Best cost-per-qualified-lead of all five strategies |
| Impact (£5M+ leads) | 4 / 5 | Commercial enrichment applied precisely where warranted |
| **Overall rank** | **1st** | Highest composite score across all five dimensions |
