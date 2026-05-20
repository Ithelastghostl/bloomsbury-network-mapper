# Strategy 1 — Factary (or Prospecting for Gold) Outsourced Screening

## Mechanism of Reliability

Factary's post-GDPR screening methodology (rebuilt 2019; factary.com/2019/06/the-factary-screening-revolution) operates on demographic and occupational proxies — Companies House officer roles, Charity Commission trustee history, property indicators, honour lists, and philanthropy press — rather than a pre-compiled HNW database. Each dossier is produced by a human analyst calibrated against 25+ years of UK prospect research, with every claim linked to a public source. The Article 28 Data Processing Agreement, Legitimate Interest Assessment, and GDPR-compliant data transfer process are pre-packaged into the vendor engagement: Bloomsbury buys a tested, auditable pipeline rather than assembling one. Reliability is vendor-verified and sourced at the record level — the charity's internal build is limited to intake, secure transfer, and dossier storage.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BLOOMSBURY INTERNAL                                            │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │  Intake form │───▶│  Secure transfer │───▶│ Dossier      │  │
│  │  (CLI / CSV) │    │  (SFTP / portal) │    │ store        │  │
│  │              │    │                  │    │ (SQLite)     │  │
│  │  DonorRecord │    │  Encrypted ZIP   │    │              │  │
│  │  + consent   │    │  + manifest      │    │ EnrichedDonor│  │
│  └──────────────┘    └──────────────────┘    └──────┬───────┘  │
│                                                     │          │
│  ┌──────────────────────────────────────────────────▼───────┐  │
│  │  Human review workflow (Claude-assisted structuring)     │  │
│  │                                                          │  │
│  │  Checkpoint 1: Accept / reject Factary output            │  │
│  │  Checkpoint 2: Flag uncertainty-threshold records        │  │
│  │  Checkpoint 3: Final dossier sign-off                    │  │
│  └──────────────────────────────────────────────────┬───────┘  │
│                                                     │          │
│  ┌──────────────────────────────────────────────────▼───────┐  │
│  │  Output: LeadDossier (Markdown + JSON)                   │  │
│  │  Qualified leads (£5M+ filter) → fundraiser CRM         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           │ submit batch (CSV + consent manifest)
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  FACTARY / PROSPECTING FOR GOLD (external processor)           │
│                                                                 │
│  Sources used internally by vendor:                            │
│  signal.factary.phi_donations_db (Factary Phi)                 │
│  signal.charity_commission_ew.trustee_data                     │
│  signal.companies_house.officer_appointments                   │
│  signal.companies_house.persons_with_significant_control       │
│  signal.hmlr.price_paid (property proxies)                     │
│  signal.govuk.honours_lists                                    │
│  signal.ofsi.uk_sanctions_list                                 │
│  Proprietary press / philanthropy archive                      │
│                                                                 │
│  Returns: PDF/CSV dossiers + confidence flags                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Sources (stable IDs from 04_signal_inventory.md)

All data is consumed by the vendor. Bloomsbury does not access these APIs directly under this strategy.

| Signal ID | Purpose |
|---|---|
| `signal.factary.phi_donations_db` | UK philanthropic donation history (primary differentiator) |
| `signal.charity_commission_ew.trustee_data` | Trustee network mapping, co-trusteeship discovery |
| `signal.companies_house.officer_appointments` | Director / officer history, corporate affiliations |
| `signal.companies_house.persons_with_significant_control` | Beneficial ownership indicators for wealth scoring |
| `signal.hmlr.price_paid` | Property price proxy for capacity estimation |
| `signal.govuk.honours_lists` | Prominence and philanthropy indicators |
| `signal.ofsi.uk_sanctions_list` | Mandatory sanctions screening |

---

## Coverage and Accuracy by Job

| Job | Description | Coverage | Accuracy notes |
|---|---|---|---|
| **Job A — Donor enrichment** | Full dossier: wealth proxies, giving history, reputational profile | ~60–70% records return a substantially complete dossier [my estimate, based on Factary's stated ~17% post-screening drop-out rate and 03_reliability_ceiling.md signal density analysis] | Records with sparse public footprint (no listed company, no honour, no philanthropy history) return thin profiles regardless of vendor |
| **Job B — Network discovery** | Co-trusteeship and corporate connections | Co-trusteeship recall ~90% (CC register, structurally enforced) [my estimate]; corporate connection recall ~70–80% for formal CH roles [my estimate] | Specialist researchers add biographical connections not in structured registers; precision high because Factary sources all claims |
| **Job C — £5M+ qualification** | Capacity estimate for major gift leads | ~30–40% of leads accompanied by a well-evidenced capacity estimate [my estimate, grounded in 03_reliability_ceiling.md: commercial tools reach ~20–30% coverage of £5M+ population; specialist research adds modest uplift] | All estimates carry the structural ceiling caveat: no UK public source covers £5m–£350m band systematically; any "confirmation" is a labelled estimate |

---

## Failure Modes

1. **Black-box methodology.** Bloomsbury receives dossiers without full visibility into how signals were weighted or combined. _Mitigation: require sourced outputs with URL citation for every factual claim. Factary's post-GDPR rebuild was explicitly toward source-linked entries._

2. **Thin coverage for non-philanthropy-footprint sectors.** Individuals from tech, property, or media (identified as prospecting gaps in 01_context.md §6) may not appear in Factary Phi's philanthropy-led dataset. _Mitigation: supplement with targeted web research for newly identified sectors; flag thin profiles at Checkpoint 1._

3. **Turnaround latency for large batches.** Managed screening is not real-time; typical turnaround is 5–10 business days [my estimate — sector norm for UK managed prospect research; no published Factary SLA found]. _Mitigation: submit batches in advance of campaign deadlines; maintain a standing priority queue._

4. **Vendor dependency and pricing opacity.** Factary costs are POA; the service cannot be replicated if the relationship ends. _Mitigation: contractually require data export rights and source citations so dossiers retain value after contract termination. Negotiate a data portability clause before first transfer._

5. **Accountability remains with Bloomsbury despite outsourcing.** Bloomsbury is the data controller; Factary is the processor. A data breach at Factary triggers Bloomsbury's breach notification obligations. _Mitigation: execute Article 28 DPA before first data transfer; verify Factary's sub-processor list and ISO 27001 or equivalent certification; confirm their incident notification timeframes._

---

## When to Choose This Strategy

Choose Strategy 1 when Bloomsbury has an immediate fundraising deadline within 8 weeks, no engineering capacity to build a pipeline, and budget for a modest managed-service fee — the vendor delivers defensible, sourced dossiers with zero build time, and its outputs can serve as a quality benchmark once any internal pipeline is live.

---

## Effectiveness Ranking Row

_From 07_ranking_and_recommendation.md, §Effectiveness Ranking Table. Scoring: 1 = worst, 5 = best. Complexity: lower score = more complex (worse)._

| Strategy | Effectiveness | Technical feasibility (4–6 wk) | Complexity | Efficiency (cost/reliable dossier) | Impact (£5M+ lead ID) |
|---|---|---|---|---|---|
| **S1 — Factary outsourced** | **4** | **5** | **5** | **2** | **3** |

**Footnote on efficiency score:** Efficiency is rated 2 because the per-dossier cost at 100 records/month is £36.87 [06_cost_models.md, verified against vendor estimate midpoints], which is the highest recurring run cost per record among automated strategies. The score reflects run cost, not quality. At low volume (<50 records/month) Strategy 1 may be the most cost-efficient option because there is no build cost and no minimum engineering overhead.
