# Cost Model: Strategy 2 — Commercial API Stack + Claude Synthesis

**Source:** Reproduced from `/workspaces/bloomsbury-network-mapper/workspace/decision_layer/06_cost_models.md`, Strategy 2 section. Supplemented with procurement timeline and licence model notes.
**Currency:** GBP throughout. USD figures converted at £1 = $1.27 [assumption].
**Confidence labels:** [verified] = cited source; [vendor estimate] = range + basis in signal inventory; [my estimate] = reasoning shown.

---

## Global Assumptions

**Headcount rates** [my estimate — UK charity sector and tech market norms, May 2026]:
- Engineer: £60–80k/yr → midpoint £70k/yr = £5,833/month; day rate = £70,000 ÷ 220 days = £318/day

**DPIA + LIA preparation:** £1,500–3,000 for legal/DPO time [my estimate]; midpoint £2,250 used in totals.

**LLM job definitions and token costs (all USD before conversion):**

*Job A — donor enrichment (30k input / 5k output per record):*
- Sonnet standard: (30k × $3/MTok) + (5k × $15/MTok) = $0.090 + $0.075 = **$0.165/record**
- Opus standard (ambiguous cases): (30k × $5/MTok) + (5k × $25/MTok) = $0.150 + $0.125 = **$0.275/record**
- Weighted A (80% Sonnet std + 20% Opus std): (0.80 × $0.165) + (0.20 × $0.275) = **$0.187/record** = **£0.147/record**

*Job B — network discovery (5k input / 1k output per candidate, Haiku):*
- Per candidate: (5k × $1/MTok) + (1k × $5/MTok) = **$0.010/candidate**
- Per donor (10 candidates base): 10 × $0.010 = **$0.100/donor** = **£0.079/donor**

*Job C — lead dossier (60k input / 10k output per qualifying lead, Opus batch):*
- Batch: (60k × $2.50/MTok) + (10k × $12.50/MTok) = **$0.275/lead** = **£0.217/lead**
- 10% qualify rate: 1 lead per donor = £0.217/donor

*Per-record LLM total (base case — 10 candidates, 10% qualify, batch Opus Job C):*
- A (£0.147) + B (£0.079) + C (£0.217) = **£0.443/record**

LLM pricing source: platform.claude.com/docs, accessed 2026-05-05 [verified].

---

## Strategy 2 — Fixed Monthly Costs

| Item | Basis | Monthly |
|---|---|---|
| DonorSearch licence | £3,000–8,000/yr POA; midpoint £5,500/yr [vendor estimate] | £458 |
| Wealth-X (Altrata) licence | £15,000–50,000/yr POA; lower-tier £20,000/yr for sub-1,000-record/month pipeline [vendor estimate] | £1,667 |
| 0.25 FTE engineer (maintenance + monitoring) | 0.25 × £5,833 [my estimate] | £1,458 |
| **Fixed total** | | **£3,583/month** |

Note: iWave/Kindsight listed as alternative to Wealth-X at £3,300–4,250/yr [verified — kindsight.io/pricing, accessed 2026-05-05]. However, iWave's UK coverage is documented as not confirmed in 04_signal_inventory.md — excluded from base case. May substitute if Wealth-X POA exceeds estimate and iWave UK coverage is verified at procurement.

---

## Strategy 2 — Variable Monthly Costs (per record)

LLM costs (base case, batch where 24h latency acceptable):

| Job | Formula | Cost/record |
|---|---|---|
| Job A (Sonnet 80% + Opus 20%, standard) | (0.80 × $0.165) + (0.20 × $0.275) = $0.187 ÷ 1.27 | £0.147 |
| Job B (Haiku, 10 candidates) | 10 × $0.010 = $0.100 ÷ 1.27 | £0.079 |
| Job C (Opus batch, 10% qualify) | 1 lead × $0.275 ÷ 1.27 | £0.217 |
| **LLM total/record** | | **£0.443** |

Commercial API per-record cost: DonorSearch and Wealth-X are typically seat/annual licences. Per-record API calls may incur additional fees at high volume; assumed included in licence up to ~500 records/month [vendor estimate — standard SaaS licence; confirm at procurement].

DonorSearch per-record API contingency (if applicable above licence cap): ~$0.10–0.50/record [vendor estimate]; use £0.15 as contingency line.

**Total variable per record:** £0.443 (LLM) + £0.15 (API contingency) = **£0.593/record** base case.

---

## Strategy 2 — One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| Build: 4–6 engineer-weeks | Midpoint 5 weeks = 25 days × £318/day [my estimate] | £7,950 |
| DPIA + LIA | £1,500–3,000 [my estimate] | £2,250 |
| Vendor integration / onboarding | API key provisioning, test data, DPA with each vendor; 2 days engineer + 1 day legal [my estimate] | £1,136 |
| **One-off total** | | **£11,336** |

---

## Strategy 2 — Totals at Volume

| Volume | Fixed | Variable | Monthly total | Cost/dossier |
|---|---|---|---|---|
| 100 records/month | £3,583 | 100 × £0.593 = £59 | **£3,642** | **£36.42** |
| 400 records/month | £3,583 | 400 × £0.593 = £237 | **£3,820** | **£9.55** |

---

## Strategy 2 — Sensitivity Table

| Scenario | 100 records/month | 400 records/month |
|---|---|---|
| Base (10% qualify, LLM + licence midpoint) | £3,642 / £36.42 each | £3,820 / £9.55 each |
| Qualify rate 30% (3 Job C leads/donor) | +£0.433/record LLM → £4,075 / £40.75 | £4,990 / £12.48 |
| Vendor fees +50% (Wealth-X to £2,500/month, DonorSearch to £687) | +£1,146 fixed → £4,788 / £47.88 | £4,966 / £12.42 |
| Both worst cases combined | £5,221 / £52.21 | £6,136 / £15.34 |

---

## Procurement Timeline Notes

### DonorSearch
- **Procurement timeline:** ~4 weeks [my estimate — enterprise SaaS; standard procurement with API key provisioning, contract negotiation, DPA execution]
- **RFQ status:** Open — not yet issued
- **Licence model:** Annual licence (typically seat-based or record-volume-based); per-record API fees may apply above a monthly cap. Confirm at RFQ whether per-record fees are included in the quoted rate or billed separately.
- **UK coverage verification:** Must be completed during procurement — request sample UK records for 5–10 known individuals before signing contract. If UK return rate < 30%, the licence is not justified for this pipeline [my estimate threshold].
- **IDTA/SCC execution:** Required before first live data transfer; allow 1–2 weeks for legal review in addition to the 4-week procurement timeline.

### Wealth-X (Altrata)
- **Procurement timeline:** ~4–6 weeks [my estimate — enterprise contract; Altrata's sales process is described as complex on review sites; allow for extended negotiation]
- **RFQ status:** Open — not yet issued
- **Licence model:** Annual enterprise licence; typically includes a record query allowance. Tiered pricing by query volume and feature set. The £15,000–50,000/yr range cited in 04_signal_inventory.md spans Altrata's entry and full enterprise tiers. A lower-volume tier (sub-1,000 records/month) should be negotiable at the lower end.
- **Coverage note:** Wealth-X's primary coverage is UHNWI (>$30m). For Bloomsbury's prospect band (£1m–£10m), expect limited coverage. Request coverage statistics for UK individuals in the £5m–£30m band before contract.
- **IDTA/SCC execution:** Same requirement as DonorSearch.

### Factary Phi
- **Procurement timeline:** ~2 weeks [my estimate — smaller vendor; straightforward ToB; contact willw@factary.com]
- **RFQ status:** Open — not yet issued
- **Licence model:** Annual subscription; "low-cost, flexible" per vendor positioning [vendor estimate — 04_signal_inventory.md]. Likely £500–2,000/year. Unlimited web UI searches and CSV exports. No documented API; v1 integration is manual CSV import (Story 4.3).
- **GDPR note:** Factary Phi is UK-native and explicitly designed for UK charity fundraising compliance. GDPR-aware by design. Article 28 DPA still required; Factary's ToB likely includes standard DPA provisions.
- **No IDTA required:** UK-based vendor; no restricted transfer obligation.

### Anthropic (Claude API)
- **Procurement timeline:** ~1 week [verified — self-serve API key signup; DPA via Anthropic platform]
- **RFQ status:** Open — sign-up via platform.claude.com
- **Licence model:** Usage-based (token pricing, see LLM cost table above). No minimum spend. Tier-based rate limits; upgrade to higher tier as volume increases.
- **IDTA/SCC execution:** Anthropic is US-based; UK IDTA or SCCs required before processing personal data in prompts. Anthropic's DPA available via platform terms; confirm UK GDPR coverage.

### Summary: Procurement Critical Path

| Vendor | Start procurement | Estimated ready | Build dependency |
|---|---|---|---|
| Anthropic Claude API | Day 1 | ~Week 1 | All synthesis stories |
| Factary Phi | Day 1 | ~Week 2 | Story 4.3 (manual import only; can mock) |
| DonorSearch | Day 1 | ~Week 4–5 | Stories 2.5, 4.1 |
| Wealth-X (Altrata) | Day 1 | ~Week 4–6 | Story 2.6, 4.2 |

All four procurements must start on day 1. Use mock API responses for DonorSearch and Wealth-X during the build phase; switch to live calls once IDTA/SCC are signed and API keys are issued.

---

## Comparative Context

From 06_cost_models.md comparative summary:

| Strategy | One-off cost | Monthly fixed | Cost/dossier @ 100 | Cost/dossier @ 400 | Scales without headcount? |
|---|---|---|---|---|---|
| 1 — Factary outsourced | £2,750 | £3,687 | £36.87 | £27.97 | No |
| **2 — Commercial API + Claude** | **£11,336** | **£3,583** | **£36.42** | **£9.55** | **Yes** |
| 3 — Open-source agentic | £13,698 | £1,497 | £15.30 | £4.08 | Yes |
| 4 — Hybrid tiered | £17,696 | £3,205 | £32.16 | £8.12 | Yes |
| 5 — Human-led + copilot | £2,250 | £1,775–3,441 | £44.38 (0.5 FTE cap) | £43.01 (5 FTE) | No |

**Key observations for Strategy 2:**
- At 100 records/month, cost/dossier (£36.42) is comparable to Strategy 1 (£36.87) but with a £11,336 build cost that Strategy 1 does not have.
- At 400 records/month, cost/dossier (£9.55) shows the commercial stack's economies of scale — fixed licence costs amortise across higher volume.
- Strategy 3 is cheaper per dossier at all volumes (£15.30 and £4.08) but produces thinner dossiers due to structural UK data gaps — the premium for Strategy 2 is the (uncertain) uplift from commercial vendor data.
- Strategy 2 is justified if and only if the vendor coverage verification (see procurement notes) confirms the commercial data returns meaningful results for Bloomsbury's prospect band. If it does not, the recommendation is Strategy 4 (Hybrid) using Factary Phi as the sole commercial enrichment layer.
