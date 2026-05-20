# Cost Model: Strategy 3 — Open-Source Agentic Pipeline

**Version:** 1.0 | **Date:** 2026-05-05
**Source:** Reproduced and extended from `/workspaces/bloomsbury-network-mapper/workspace/decision_layer/06_cost_models.md` — Strategy 3 section
**Currency:** GBP throughout. USD figures converted at £1 = $1.27 [assumption].
**Confidence labels:** [verified] = cited source; [vendor estimate] = range + basis; [my estimate] = reasoning shown.

---

## Strategy 3 Description

Companies House API + Charity Commission API + 360Giving GrantNav + HMLR OCOD + UK Sanctions List, orchestrated by Claude Code. No commercial vendor data licences. Claude Haiku for entity resolution (Job B), Claude Sonnet for Job A synthesis and wealth scoring, Claude Opus (batch) for Job C lead dossiers. Web search (Serper.dev) fills gaps. Build cost ~6–8 engineer-weeks.

---

## Fixed Monthly Costs

| Item | Basis | Monthly |
|---|---|---|
| All public APIs (CH, CC, 360Giving, HMLR OCOD, UK Sanctions List) | Free — OGL v3.0 [verified] | £0 |
| 0.25 FTE engineer (pipeline maintenance, monitoring, occasional re-runs) | 0.25 × £5,833/month [my estimate — £70k/yr midpoint; R6 global assumptions] | £1,458 |
| Web search API (Serper.dev or equivalent) | ~$50/month for ~5,000 queries; $50 ÷ 1.27 [my estimate — standard search API pricing] | £39 |
| **Fixed total** | | **£1,497/month** |

---

## Variable Monthly Costs (per record)

LLM costs using prompt-caching benefit (same rubric reused; ~20k of 30k input tokens cached for Job A Sonnet):

| Job | Formula | Cost/record |
|---|---|---|
| Job A — Sonnet batch with cache reads (20k cached, 10k uncached) | (20k × $1.50 × 0.1 + 10k × $1.50)/MTok = ($0.003 + $0.015) input + (5k × $7.50/MTok) output = $0.018 + $0.0375 = $0.0555; 20% Opus standard on ambiguous = 0.20 × $0.275 = $0.055; weighted = 0.80 × $0.0555 + 0.20 × $0.275 = $0.044 + $0.055 = $0.099 ÷ 1.27 | £0.078 |
| Job B — Haiku batch (10 candidates) | 10 × (5k × $0.50/MTok + 1k × $2.50/MTok) = 10 × ($0.0025 + $0.0025) = $0.050 ÷ 1.27 | £0.039 |
| Job C — Opus batch (10% qualify rate, 1 lead per donor) | 1 × (60k × $2.50/MTok + 10k × $12.50/MTok) = 1 × ($0.150 + $0.125) = $0.275 ÷ 1.27 | £0.217 |
| **LLM total/record** | | **£0.334** |

No commercial API per-record cost (all data sources are free).

Total variable: **£0.334/record**

### LLM pricing basis [verified — platform.claude.com/docs, accessed 2026-05-05]

| Model | Input ($/MTok) | Output ($/MTok) | Batch Input | Batch Output | Cache Read |
|---|---|---|---|---|---|
| claude-opus-4-7 | $5.00 | $25.00 | $2.50 | $12.50 | $0.50 |
| claude-sonnet-4-6 | $3.00 | $15.00 | $1.50 | $7.50 | $0.30 |
| claude-haiku-4-5-20251001 | $1.00 | $5.00 | $0.50 | $2.50 | $0.10 |

Cache write costs: 5-min write = 1.25x base input; 1-hour write = 2x base input. Cache read = 0.1x base input (90% discount vs. standard).
Batch API: 50% discount on both input and output vs. standard rates.

---

## One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| Build: 6–8 engineer-weeks | Midpoint 7 weeks = 35 days × £318/day [my estimate — £70k/yr ÷ 220 working days; R6 global assumptions] | £11,130 |
| DPIA + LIA preparation | £1,500–3,000 for legal/DPO time [my estimate]; midpoint | £2,250 |
| API key registration (CH, CC, OSCR) + test data validation | 1 day engineer time [my estimate] | £318 |
| **One-off total** | | **£13,698** |

### Engineer-week breakdown (6–8 weeks)

| Phase | Weeks | Stories |
|---|---|---|
| Week 1 | 1 | Gold set design (TEST_PLAN.md priority); DonorIngestionCLI (E1); AuditLogger scaffold (E8); API key setup |
| Weeks 2–3 | 2 | EntityResolutionAgent (E2); TrusteeGraphAgent (3.1); CompaniesHouseAgent (3.2) |
| Week 4 | 1 | GrantNavAgent (3.3); SanctionsAgent (3.6); PropertyAgent (3.5); SanctionsAgent |
| Week 5 | 1 | WebSearchAgent (3.4); WealthScoringAgent (E4); unit tests |
| Week 6 | 1 | SynthesisAgent Job A (5.1); HumanReviewQueue (E6); integration tests |
| Weeks 7–8 (contingency) | 1–2 | SynthesisAgent Job C (7.1); connection path (7.2); gold-set evaluation; hardening |

**Note:** Companies House API key (free — register at developer.company-information.service.gov.uk) and Charity Commission API key (free — register at api-portal.charitycommission.gov.uk) require no commercial licence. Anthropic Claude API billing account setup is pay-as-you-go; no minimum commitment.

---

## Totals at Volume

| Volume | Fixed | Variable | Monthly total | Cost/dossier |
|---|---|---|---|---|
| 100 records/month | £1,497 | 100 × £0.334 = £33 | **£1,530** | **£15.30** |
| 400 records/month | £1,497 | 400 × £0.334 = £134 | **£1,631** | **£4.08** |

---

## Sensitivity Table

| Scenario | 100 records/month | 400 records/month |
|---|---|---|
| Base (10% qualify, batch + cache) | £1,530 / £15.30 each | £1,631 / £4.08 each |
| Qualify rate 30% (3 Job C leads/donor) | +£0.433/record → £1,573 / £15.73 | £1,804 / £4.51 |
| LLM no-batch no-cache (worst case) | +£0.109/record → £1,641 / £16.41 | £1,674 / £4.19 |
| Both worst cases combined | £1,684 / £16.84 | £1,848 / £4.62 |
| Vendor fees +50% | N/A (no commercial vendor) | N/A |

---

## Comparative Position

| Strategy | One-off cost | Monthly fixed | Cost/dossier @ 100 | Cost/dossier @ 400 |
|---|---|---|---|---|
| 1 — Factary outsourced | £2,750 | £3,687 | £36.87 | £27.97 |
| 2 — Commercial API + Claude | £11,336 | £3,583 | £36.42 | £9.55 |
| **3 — Open-source agentic** | **£13,698** | **£1,497** | **£15.30** | **£4.08** |
| 4 — Hybrid tiered | £17,696 | £3,205 | £32.16 | £8.12 |
| 5 — Human-led + copilot | £2,250 | £1,775–3,441 | £44.38 | £43.01 |

Strategy 3 has the **lowest monthly fixed cost** (£1,497) and **lowest cost per dossier at scale** (£4.08 at 400 records) of all five strategies. The higher one-off build cost (£13,698 vs. £11,336 for Strategy 2) reflects a longer build estimate (7 weeks vs. 5 weeks midpoint) due to the orchestration complexity of building all data acquisition agents from scratch.

---

## Break-Even Analysis

**vs. Strategy 2 (Commercial API + Claude):**
- Strategy 3 saves ~£21/dossier at 100 records/month
- Strategy 2's additional £2,086/month fixed cost (£3,583 − £1,497) amortises to £0/dossier only if volume exceeds ~10,000 records/month — unrealistic at Bloomsbury's scale
- Strategy 3 is cheaper at every realistic volume; the trade-off is lower recall on donation history and wealth confirmation [R3]

**vs. Strategy 1 (Factary outsourced):**
- Strategy 3's build cost of £13,698 is recovered after ~5 months at 100 records/month (saving ~£2,190/month in fixed costs)
- At 400 records/month, payback in ~2.5 months

---

## Setup Checklist (No Commercial Licences Required)

| Item | Cost | Action |
|---|---|---|
| Companies House API key | Free [verified — OGL v3.0; developer.company-information.service.gov.uk] | Register; HTTP Basic Auth with API key as username |
| Charity Commission API key | Free [verified — OGL v3.0; api-portal.charitycommission.gov.uk] | Register; beta programme |
| HMLR OCOD account | Free [verified — use-land-property-data.service.gov.uk; account registration required] | Register |
| 360Giving GrantNav bulk download | Free [verified — CC BY 4.0; grantnav.threesixtygiving.org] | No auth; direct download |
| UK Sanctions List download | Free [verified — OGL v3.0; gov.uk/government/publications/the-uk-sanctions-list] | No auth; direct download |
| Anthropic Claude API billing account | Pay-as-you-go; no minimum [verified — platform.claude.com] | Create account; add payment method; set monthly spend alert |
| Web search API (Serper.dev) | ~£39/month [my estimate] | Register; API key |
| Anthropic DPA | Required before live personal data processed | Request from Anthropic; execute before go-live |
| Web search API DPA | Required before live personal data processed | Request from provider; execute before go-live |
