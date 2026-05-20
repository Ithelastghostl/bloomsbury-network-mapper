# Cost Model — Strategy 4 Hybrid Tiered Pipeline

Source: `/workspace/decision_layer/06_cost_models.md` Strategy 4 section, reproduced and extended.

**Currency:** GBP throughout. USD figures converted at £1 = $1.27 [assumption].  
**Confidence labels:** [verified] = cited source; [vendor estimate] = range + basis in signal inventory; [my estimate] = reasoning shown.

---

## Global Assumptions

- Engineer rate: £70k/year midpoint → £318/day [my estimate — UK tech market, May 2026]
- DPIA + LIA preparation: £2,250 midpoint [my estimate — legal/DPO time]
- LLM pricing: Anthropic platform.claude.com/docs, accessed 2026-05-05 [verified]

---

## Fixed Monthly Costs

| Item | Basis | Monthly |
|---|---|---|
| Public APIs (CH, CC, 360Giving, HMLR, GOV.UK, UK Sanctions List) | Free — OGL v3.0 [verified] | £0 |
| Factary Phi licence | £500–2,000/yr POA; midpoint £1,250/yr [vendor estimate] | £104 |
| Wealth-X licence (entry tier, scoped to qualifying leads; smaller tier negotiable for hybrid use case) | £10,000–20,000/yr for lower-volume qualified-lead tier [vendor estimate — hybrid use case may justify entry-tier contract vs Strategy 2 full-volume] | £1,250 |
| 0.25 FTE engineer (both pipelines, monitoring, maintenance) | 0.25 × £5,833 [my estimate] | £1,458 |
| Web search API (Serper.dev or equivalent) | ~$50/month for ~5,000 queries; $50 ÷ 1.27 [my estimate] | £39 |
| DonorSearch (optional — include only if US-connected donors appear in shortlist) | Not included in base case; add £458/month if activated [vendor estimate] | £0 (base) |
| **Fixed total (base case)** | | **£2,851/month** |

Note: `06_cost_models.md` uses £3,205/month as the fixed total, which includes DonorSearch at £458/month. The base case above excludes DonorSearch as optional. Range: £2,851 (no DonorSearch) to £3,309 (DonorSearch active).

---

## Variable Monthly Costs

All records go through Tier 1 (Strategy 3 mechanics):

| Job | Formula | Cost/record |
|---|---|---|
| Job B — open-source network pass (Claude Haiku batch) | 10 candidates × (5k × $0.50/MTok + 1k × $2.50/MTok) = 10 × ($0.0025 + $0.0025) = $0.050 ÷ 1.27 | £0.039 |
| Job A (triage only) — Sonnet batch with prompt cache | Abbreviated 15k input / 3k output triage pass: (15k × $1.50 × 0.1 + 0k uncached + 3k × $7.50)/MTok = ($0.00225 + $0.0225) = $0.02475 ÷ 1.27 [my estimate] | £0.019 |

Qualifying leads only go through Tier 2 (allocated per all-records basis):

**At 10% qualifying rate** (10 qualifying leads per 100 records):

| Job | Cost per qualifying lead | Allocated per all-records (÷10) |
|---|---|---|
| Job A — full Sonnet + Opus synthesis | £0.147 | £0.015 |
| Job C — Opus batch dossier | £0.217 | £0.022 |
| Commercial API contingency | £0.15 | £0.015 |
| **Total Tier 2 allocated/record at 10%** | | **£0.052** |

**Total variable/record at 10% qualifying rate:** £0.039 + £0.019 + £0.052 = **£0.110/record**

**At 30% qualifying rate** (30 qualifying leads per 100 records):

| Item | Calculation |
|---|---|
| Tier 2 cost per qualifying lead | £0.147 + £0.217 + £0.15 = £0.514 |
| Allocated per all-records at 30% | £0.514 × 0.30 = £0.154 |
| Total variable/record | £0.039 + £0.019 + £0.154 = **£0.212/record** |

---

## One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| Build: 8–10 engineer-weeks | Midpoint 9 weeks = 45 days × £318/day [my estimate] | £14,310 |
| DPIA + LIA (two tiers; vendor DPAs) | £1,500–3,000 [my estimate] | £2,250 |
| Vendor integration / onboarding (Factary DPA, Altrata IDTA + DPA, API keys) | 2 days engineer + 1 day legal [my estimate — from `06_cost_models.md` Strategy 2 estimate, same vendor set] | £1,136 |
| **One-off total** | | **£17,696** |

---

## Totals at Volume

| Volume | Qualify rate | Fixed | Variable | Monthly total | Cost/dossier |
|---|---|---|---|---|---|
| 100 records/month | 10% | £2,851 | 100 × £0.110 = £11 | **£2,862** | **£28.62** |
| 400 records/month | 10% | £2,851 | 400 × £0.110 = £44 | **£2,895** | **£7.24** |
| 100 records/month | 30% | £2,851 | 100 × £0.212 = £21 | **£2,872** | **£28.72** |
| 400 records/month | 30% | £2,851 | 400 × £0.212 = £85 | **£2,936** | **£7.34** |

Note: At this volume range, variable LLM costs are negligible compared to licence fixed costs. The qualifying-rate sensitivity is very low in £/dossier terms (< £1/dossier difference between 10% and 30% qualify rates at 100 records/month).

---

## Tier 2 Qualifying-Rate Sensitivity Analysis

The key insight: **Tier 2 cost scales directly with qualifying-lead rate, but the impact on blended cost/dossier is modest because Tier 2 variable costs are small relative to fixed licence costs at this volume.**

However, if the qualifying rate unexpectedly rises to 30% (3× the 10% base case), Tier 2 commercial spend on enrichment triples in absolute terms. The sensitivity table below makes this explicit.

### Qualifying-Rate Sensitivity: Tier 2 Commercial Spend Only

At 100 records/month:

| Qualifying rate | Qualifying leads | Tier 2 LLM + API per lead | Total Tier 2 variable spend | % increase vs 10% base |
|---|---|---|---|---|
| 10% (base) | 10 leads | £0.364/lead | £3.64/month | — |
| 15% | 15 leads | £0.364/lead | £5.46/month | +50% |
| 20% | 20 leads | £0.364/lead | £7.28/month | +100% |
| 30% | 30 leads | £0.364/lead | £10.92/month | +200% |

At 400 records/month:

| Qualifying rate | Qualifying leads | Tier 2 LLM + API per lead | Total Tier 2 variable spend | % increase vs 10% base |
|---|---|---|---|---|
| 10% (base) | 40 leads | £0.364/lead | £14.56/month | — |
| 15% | 60 leads | £0.364/lead | £21.84/month | +50% |
| 20% | 80 leads | £0.364/lead | £29.12/month | +100% |
| 30% | 120 leads | £0.364/lead | £43.68/month | +200% |

**Conclusion:** Even at 30% qualifying rate, Tier 2 variable spend at 400 records/month is only £43.68/month — negligible against the £2,851 fixed cost base. The Tier 2 variable spend is not a meaningful cost driver at this volume.

**The cost driver that matters** is the Wealth-X licence (£1,250/month) and engineer time (£1,458/month). These are independent of qualifying rate. If qualifying rate drops to <5% (very few shortlisted leads per batch), the cost/dossier for confirmed leads rises sharply because fixed costs are spread across fewer Tier 2 outputs.

### Cost/Confirmed-Lead Sensitivity (at 100 records/month)

| Qualifying rate | Qualifying leads | Monthly total | Cost per confirmed-lead dossier |
|---|---|---|---|
| 5% | 5 | £2,857 | £571 |
| 10% (base) | 10 | £2,862 | £286 |
| 20% | 20 | £2,866 | £143 |
| 30% | 30 | £2,872 | £96 |

**Implication:** The hybrid pipeline is cost-efficient on a per-record basis but expensive on a per-confirmed-lead basis at low qualifying rates. If the prospect pool is poor quality (few genuine qualified leads), Strategy 1 (Factary outsourced) or Strategy 5 (human-led) may be more cost-effective per confirmed lead, despite higher per-record costs.

**The qualifying rate should be measured and reviewed monthly.** If the rolling 3-month qualifying rate falls below 8%, recalibrate the ShortlistScorer threshold or reassess the prospect pool before continuing Tier 2 commercial spend.

---

## Sensitivity Table (Blended Cost/Dossier)

| Scenario | 100 records/month | 400 records/month |
|---|---|---|
| Base (10% qualify, no DonorSearch) | £2,862 / **£28.62 each** | £2,895 / **£7.24 each** |
| Qualify rate 30% | £2,872 / £28.72 each | £2,936 / £7.34 each |
| Vendor fees +50% (Wealth-X to £1,875/month, Factary to £156/month) | +£781/month → £3,643 / £36.43 each | £3,676 / £9.19 each |
| Vendor fees +50% + 30% qualify | £3,653 / £36.53 each | £3,717 / £9.29 each |
| DonorSearch activated (+£458/month) | +£458 → £3,320 / £33.20 each | £3,353 / £8.38 each |
| No Wealth-X (Factary only) | −£1,250 → £1,612 / £16.12 each | £1,645 / £4.11 each |

**Note on "No Wealth-X" row:** If Wealth-X is removed (Factary Phi only as Tier 2 source), the cost profile closely resembles Strategy 3 costs, confirming that the Factary-only hybrid is a natural step-up from the pure open-source pipeline. This is consistent with the `07_ranking_and_recommendation.md` recommendation to start with Factary Phi before adding Wealth-X.

---

## Comparative Context

From `06_cost_models.md` comparative summary:

| Strategy | One-off | Monthly fixed | £/dossier @ 100 | £/dossier @ 400 |
|---|---|---|---|---|
| 1 — Factary outsourced | £2,750 | £3,687 | £36.87 | £27.97 |
| 2 — Commercial API + Claude | £11,336 | £3,583 | £36.42 | £9.55 |
| 3 — Open-source agentic | £13,698 | £1,497 | £15.30 | £4.08 |
| **4 — Hybrid tiered (this)** | **£17,696** | **£2,851–3,309** | **£28.62–33.20** | **£7.24–8.38** |
| 5 — Human-led + copilot | £2,250 | £1,775–3,441 | £44.38 (0.5 FTE cap) | £43.01 (5 FTE) |

Strategy 4's competitive advantage is best cost-per-qualified-lead: it pays commercial rates only on pre-filtered leads, while achieving near-Strategy-2 effectiveness on those leads and near-Strategy-3 cost on the full record population.
