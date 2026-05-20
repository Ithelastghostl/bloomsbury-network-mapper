# 06 — Cost Models: Five Candidate Strategies

**Phase R6 output** | Date: 2026-05-05
**Currency:** GBP throughout. USD figures converted at £1 = $1.27 [assumption].
**LLM pricing source:** Anthropic platform.claude.com/docs, accessed 2026-05-05 [verified]; see signal inventory §LLM/AI Infrastructure.
**Confidence labels:** [verified] = cited source; [vendor estimate] = range + basis in signal inventory; [my estimate] = reasoning shown below.

---

## Global Assumptions

**Headcount rates** [my estimate — UK charity sector and tech market norms, May 2026]:
- Prospect researcher: £35–45k/yr → midpoint £40k/yr = £3,333/month
- Engineer: £60–80k/yr → midpoint £70k/yr = £5,833/month; day rate = £70,000 ÷ 220 days = £318/day

**DPIA + LIA preparation:** £1,500–3,000 for legal/DPO time [my estimate]; midpoint £2,250 used in totals.

**LLM job definitions and token costs (all USD before conversion):**

*Job A — donor enrichment (30k input / 5k output per record):*
- Sonnet standard: (30k × $3/MTok) + (5k × $15/MTok) = $0.090 + $0.075 = **$0.165/record**
- Sonnet batch: (30k × $1.50/MTok) + (5k × $7.50/MTok) = $0.045 + $0.0375 = **$0.0825/record**
- Opus standard (ambiguous cases, same token counts): (30k × $5/MTok) + (5k × $25/MTok) = $0.150 + $0.125 = **$0.275/record**
- Weighted A (80% Sonnet std + 20% Opus std): (0.80 × $0.165) + (0.20 × $0.275) = $0.132 + $0.055 = **$0.187/record** = **£0.147/record**
- Prompt-caching note: where the same rubric/system prompt is reused across all records (~20k of 30k tokens eligible), cache-read cost = $0.030 × 0.1 = $0.003 vs $0.030 uncached — saving ~20% on input. Applied selectively in Strategy 3 (full batch pipeline) below.

*Job B — network discovery (5k input / 1k output per candidate, Haiku):*
- Per candidate: (5k × $1/MTok) + (1k × $5/MTok) = $0.005 + $0.005 = **$0.010/candidate**
- Per donor processed (base: 10 candidates): 10 × $0.010 = **$0.100/donor** = **£0.079/donor**
- Per donor processed (high: 15 candidates): 15 × $0.010 = **$0.150/donor** = **£0.118/donor**

*Job C — lead dossier (60k input / 10k output per qualifying lead, Opus batch):*
- Batch: (60k × $2.50/MTok) + (10k × $12.50/MTok) = $0.150 + $0.125 = **$0.275/lead** = **£0.217/lead**
- Standard (no batch): (60k × $5/MTok) + (10k × $25/MTok) = $0.300 + $0.250 = **$0.550/lead** = **£0.433/lead**

*Qualifying leads per donor (10 candidates/donor base case):*
- 10% qualify rate: 10 × 10% = 1.0 lead → Job C = $0.275 = £0.217/donor
- 30% qualify rate: 10 × 30% = 3.0 leads → Job C = $0.825 = £0.650/donor

*Per-record LLM total (base case: 10 candidates, 10% qualify rate, batch Opus for Job C):*
- A (£0.147) + B (£0.079) + C (£0.217) = **£0.443/record**

---

## Strategy 1 — Factary (or Equivalent UK Specialist) Outsourced

**Description:** Bloomsbury provides donor list; Factary or Prospecting for Gold returns dossiers. No internal pipeline. No LLM infrastructure.

### Fixed Monthly Costs

| Item | Basis | Monthly |
|---|---|---|
| Factary Phi licence | £500–2,000/yr POA; use midpoint £1,250/yr [vendor estimate] | £104 |
| Specialist retainer (Prospecting for Gold or Factary screening) | POA; estimate £1,500–4,000/month for an active managed-service retainer covering 100–400 records/month [vendor estimate — PfG and Factary both offer retainer-style screening; no public rate; basis: typical UK prospect research agency day rate £350–500 × ~5–8 days/month] | £2,750 (midpoint) |
| Internal staff time (0.25 FTE fundraising coordinator to brief/receive supplier) | 0.25 × £3,333 [my estimate] | £833 |
| **Fixed total** | | **£3,687/month** |

### Variable Monthly Costs (per record)

No API calls or LLM tokens — outsourced. Variable element is per-dossier fee above the retainer minimum.

At 100 records/month: retainer likely covers this; £0 marginal per-record variable [my estimate — retainer typically includes a record cap; assume 100 records covered].

At 400 records/month: additional records above retainer cap estimated at £15–40/dossier [vendor estimate — PfG individual profile cost £50–300; bulk/retainer rate lower]; use £25/record above 100-record base.

- 100 records: £0 variable → total = £3,687 → **£36.87/dossier**
- 400 records: (300 × £25) = £7,500 variable → total = £11,187 → **£27.97/dossier**

### One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| DPIA + LIA (data sharing with third-party processor) | £1,500–3,000 legal/DPO time [my estimate] | £2,250 |
| Vendor onboarding and data-sharing agreement | Internal legal review + contract negotiation [my estimate] | £500 |
| **One-off total** | | **£2,750** |

No build cost. No engineer time.

### Sensitivity Table

| Scenario | 100 records/month | 400 records/month |
|---|---|---|
| Base (retainer midpoint, 10% qualify) | £3,687 total / £36.87 each | £11,187 / £27.97 each |
| Vendor fees +50% (retainer to £4,125 + per-record to £37.50) | £4,125 / £41.25 each | £15,375 / £38.44 each |
| High qualify rate (30%) — no direct cost impact (outsourced dossier price does not vary by depth at this tier) | Same as base | Same as base |
| Volume 100→400 with no retainer uplift (supplier unable to absorb) | n/a | £18,687 / £46.72 each if full per-record pricing at £40 for all 400 |

**Notes:** Retainer pricing is the most sensitive variable — POA, negotiated annually. A mid-size UK charity's retainer could be lower (£1,000–2,000/month) if volume is modest. Quality ceiling: ~40–50% recall on donation history, strong UK trustee network data [from 03_reliability_ceiling.md].

---

## Strategy 2 — Commercial API Stack + Claude Synthesis

**Description:** DonorSearch + Wealth-X/iWave for data. Claude Sonnet for synthesis; Claude Opus for complex cases (~20%). Build cost ~4–6 engineer-weeks.

### Fixed Monthly Costs

| Item | Basis | Monthly |
|---|---|---|
| DonorSearch licence | £3,000–8,000/yr POA; use midpoint £5,500/yr [vendor estimate] | £458 |
| Wealth-X (Altrata) licence | £15,000–50,000/yr POA; use lower-tier £20,000/yr for a sub-1,000-record/month pipeline [vendor estimate] | £1,667 |
| 0.25 FTE engineer (maintenance + monitoring) | 0.25 × £5,833 [my estimate] | £1,458 |
| **Fixed total** | | **£3,583/month** |

Note: iWave/Kindsight listed as alt to Wealth-X at £3,300–4,250/yr [verified], but 04_signal_inventory.md rates it low for UK-only donors — excluded from base case; noted as risk mitigation if Wealth-X POA exceeds estimate.

### Variable Monthly Costs (per record)

LLM costs (base case, batch where 24h latency acceptable):

| Job | Formula | Cost/record |
|---|---|---|
| Job A (Sonnet 80% + Opus 20%, standard) | (0.80 × $0.165) + (0.20 × $0.275) = $0.187 ÷ 1.27 | £0.147 |
| Job B (Haiku, 10 candidates) | 10 × $0.010 = $0.100 ÷ 1.27 | £0.079 |
| Job C (Opus batch, 10% qualify) | 1 lead × $0.275 ÷ 1.27 | £0.217 |
| **LLM total/record** | | **£0.443** |

Commercial API per-record cost: DonorSearch and Wealth-X are typically seat/annual licences — per-record API calls may incur additional fees at high volume; assume included in licence up to ~500 records/month [vendor estimate — standard SaaS licence; confirm with vendors at procurement].

DonorSearch per-record API (if applicable above licence): ~$0.10–0.50/record [vendor estimate — typical wealth screening per-record fees; no published rate]; use £0.15 as contingency line.

Total variable: £0.443 (LLM) + £0.15 (API contingency) = **£0.593/record** base case.

### One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| Build: 4–6 engineer-weeks | Midpoint 5 weeks = 25 days × £318/day [my estimate] | £7,950 |
| DPIA + LIA | £1,500–3,000 [my estimate] | £2,250 |
| Vendor integration / onboarding | API key provisioning, test data, DPA with each vendor; 2 days engineer + 1 day legal [my estimate] | £1,136 |
| **One-off total** | | **£11,336** |

### Totals at Volume

| Volume | Fixed | Variable | Monthly total | Cost/dossier |
|---|---|---|---|---|
| 100 records/month | £3,583 | 100 × £0.593 = £59 | **£3,642** | **£36.42** |
| 400 records/month | £3,583 | 400 × £0.593 = £237 | **£3,820** | **£9.55** |

### Sensitivity Table

| Scenario | 100 records/month | 400 records/month |
|---|---|---|
| Base (10% qualify, LLM + licence midpoint) | £3,642 / £36.42 each | £3,820 / £9.55 each |
| Qualify rate 30% (3 Job C leads/donor) | +£0.433/record LLM → £4,075 / £40.75 | £4,990 / £12.48 |
| Vendor fees +50% (Wealth-X to £2,500/month, DonorSearch to £687) | +£1,146 fixed → £4,788 / £47.88 | £4,966 / £12.42 |
| Both worst cases combined | £5,221 / £52.21 | £6,136 / £15.34 |

---

## Strategy 3 — Open-Source Agentic Pipeline

**Description:** Companies House + Charity Commission + 360Giving + web search, orchestrated by Claude. No commercial vendor data licences. Build cost ~6–8 engineer-weeks.

### Fixed Monthly Costs

| Item | Basis | Monthly |
|---|---|---|
| All public APIs | Free — OGL v3.0 [verified] | £0 |
| 0.25 FTE engineer (pipeline maintenance, monitoring, occasional re-runs) | 0.25 × £5,833 [my estimate] | £1,458 |
| Web search API (for media/honours/signal enrichment) | e.g. Serper.dev or equivalent: ~$50/month for ~5,000 queries; $50 ÷ 1.27 [my estimate — standard search API pricing] | £39 |
| **Fixed total** | | **£1,497/month** |

### Variable Monthly Costs (per record)

LLM costs using prompt-caching benefit (same rubric reused; ~20k of 30k input tokens cached for Job A Sonnet):

| Job | Formula | Cost/record |
|---|---|---|
| Job A — Sonnet batch with cache reads (20k cached, 10k uncached) | (20k × $1.50 × 0.1 + 10k × $1.50)/MTok = ($0.003 + $0.015) input + (5k × $7.50/MTok) output = $0.018 + $0.0375 = $0.0555; 20% Opus standard on ambiguous = 0.20 × $0.275 = $0.055; weighted = 0.80 × $0.0555 + 0.20 × $0.275 = $0.044 + $0.055 = $0.099 ÷ 1.27 | £0.078 |
| Job B — Haiku batch (10 candidates) | 10 × (5k × $0.50/MTok + 1k × $2.50/MTok) = 10 × ($0.0025 + $0.0025) = $0.050 ÷ 1.27 | £0.039 |
| Job C — Opus batch (10% qualify, 1 lead) | 1 × $0.275 ÷ 1.27 | £0.217 |
| **LLM total/record** | | **£0.334** |

No commercial API per-record cost (all free sources).

Total variable: **£0.334/record**

### One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| Build: 6–8 engineer-weeks | Midpoint 7 weeks = 35 days × £318/day [my estimate] | £11,130 |
| DPIA + LIA | £1,500–3,000 [my estimate] | £2,250 |
| API key registration (CH, CC, OSCR) + test data validation | 1 day engineer [my estimate] | £318 |
| **One-off total** | | **£13,698** |

### Totals at Volume

| Volume | Fixed | Variable | Monthly total | Cost/dossier |
|---|---|---|---|---|
| 100 records/month | £1,497 | 100 × £0.334 = £33 | **£1,530** | **£15.30** |
| 400 records/month | £1,497 | 400 × £0.334 = £134 | **£1,631** | **£4.08** |

### Sensitivity Table

| Scenario | 100 records/month | 400 records/month |
|---|---|---|
| Base (10% qualify, batch + cache) | £1,530 / £15.30 each | £1,631 / £4.08 each |
| Qualify rate 30% (3 Job C leads/donor) | +£0.433/record → £1,573 / £15.73 | £1,804 / £4.51 |
| LLM no-batch no-cache (worst case) | +£0.109/record → £1,641 / £16.41 | £1,674 / £4.19 |
| Both worst cases | £1,684 / £16.84 | £1,848 / £4.62 |
| Vendor fees +50% | N/A (no commercial vendor) | N/A |

**Note on reliability:** Open-source pipeline achieves ~90–95% recall on trusteeship networks and ~70–80% on corporate roles, but ~5–10% on donation history and <5% on wealth confirmation [from 03_reliability_ceiling.md]. Suitable where network mapping is the primary goal; weaker for major-gift wealth qualification.

---

## Strategy 4 — Hybrid Tiered

**Description:** Strategy 3 mechanics on all records to produce shortlist; Strategy 2 commercial data only on shortlisted leads (~10–30% qualify). Build cost ~8–10 engineer-weeks (Strategy 3 pipeline + commercial API integration layer).

### Fixed Monthly Costs

| Item | Basis | Monthly |
|---|---|---|
| Public APIs | Free [verified] | £0 |
| DonorSearch licence (applied only to qualifying leads) | £3,000–8,000/yr; midpoint £5,500/yr [vendor estimate] | £458 |
| Wealth-X licence (scoped to qualifying leads only; smaller tier negotiable) | £10,000–20,000/yr for lower-volume qualified-lead tier [vendor estimate — hybrid use case may justify entry-tier contract] | £1,250 |
| 0.25 FTE engineer (both pipelines) | 0.25 × £5,833 [my estimate] | £1,458 |
| Web search API | Same as Strategy 3 [my estimate] | £39 |
| **Fixed total** | | **£3,205/month** |

### Variable Monthly Costs (per record)

All records go through Tier 1 (Strategy 3 mechanics):

| Job | Formula | Cost/record |
|---|---|---|
| Job B — open-source network pass (Haiku batch) | Same as Strategy 3: £0.039 | £0.039 |
| Job A — Sonnet batch + cache for initial triage | Abbreviated Job A (15k input / 3k output, triage only): (15k × $1.50 × 0.1 + 0k uncached + 3k × $7.50)/MTok = ($0.00225 + $0.0225) = $0.02475 ÷ 1.27 [my estimate — triage pass is shorter than full dossier] | £0.019 |

Qualifying leads only (~10% base = 10 records per 100) go through Tier 2 (Strategy 2 mechanics):

| Job | Formula | Cost per qualifying lead | Allocated per all-records basis (÷10 at 10%) |
|---|---|---|---|
| Job A — full Sonnet + Opus (Strategy 2 rate) | £0.147 | £0.147 | £0.015 |
| Job C — Opus batch dossier | £0.217 | £0.217 | £0.022 |
| Commercial API contingency | £0.15 | £0.15 | £0.015 |

**Total variable/record (10% qualify rate):** £0.039 + £0.019 + £0.015 + £0.022 + £0.015 = **£0.110/record**

**Total variable/record (30% qualify rate):** £0.039 + £0.019 + (3 × (£0.147 + £0.217 + £0.15) / 10 candidates) — recalculate:
- Tier 2 cost per all-records at 30%: (£0.147 + £0.217 + £0.15) × 30% = £0.514 × 0.30 = **£0.154/record**
- Total 30%: £0.039 + £0.019 + £0.154 = **£0.212/record**

### One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| Build: 8–10 engineer-weeks | Midpoint 9 weeks = 45 days × £318/day [my estimate] | £14,310 |
| DPIA + LIA | £1,500–3,000 [my estimate] | £2,250 |
| Vendor integration | As Strategy 2 [my estimate] | £1,136 |
| **One-off total** | | **£17,696** |

### Totals at Volume

| Volume | Qualify rate | Fixed | Variable | Monthly total | Cost/dossier |
|---|---|---|---|---|---|
| 100 records/month | 10% | £3,205 | 100 × £0.110 = £11 | **£3,216** | **£32.16** |
| 400 records/month | 10% | £3,205 | 400 × £0.110 = £44 | **£3,249** | **£8.12** |
| 100 records/month | 30% | £3,205 | 100 × £0.212 = £21 | **£3,226** | **£32.26** |
| 400 records/month | 30% | £3,205 | 400 × £0.212 = £85 | **£3,290** | **£8.23** |

Note: at this volume range variable LLM costs are negligible compared to licence fixed costs — the qualify rate sensitivity is very low in £/dossier terms.

### Sensitivity Table

| Scenario | 100 records/month | 400 records/month |
|---|---|---|
| Base (10% qualify) | £3,216 / £32.16 each | £3,249 / £8.12 each |
| Qualify rate 30% | £3,226 / £32.26 each | £3,290 / £8.23 each |
| Vendor fees +50% (Wealth-X + DonorSearch +50%) | +£854/month fixed → £4,070 / £40.70 | £4,103 / £10.26 |
| Vendor fees +50% + 30% qualify | £4,080 / £40.80 | £4,144 / £10.36 |

---

## Strategy 5 — Human-Led + Claude Copilot

**Description:** Part-time or full-time prospect researcher; Claude is per-task copilot tool. No automated pipeline. Scaling linear with headcount.

### Fixed Monthly Costs

| Item | Basis | Monthly (0.5 FTE) | Monthly (1.0 FTE) |
|---|---|---|---|
| Prospect researcher (0.5 or 1.0 FTE) | £40k/yr midpoint; 0.5 FTE = £1,667/month; 1.0 FTE = £3,333/month [my estimate] | £1,667 | £3,333 |
| Factary Phi (researcher's primary UK tool) | £500–2,000/yr; midpoint £1,250/yr [vendor estimate] | £104 | £104 |
| Claude API (Sonnet for ad-hoc copilot use; ~50 tasks/month × 15k tokens each) | 50 × (15k × $3/MTok + 3k × $15/MTok) = 50 × ($0.045 + $0.045) = $4.50/month ÷ 1.27 [my estimate — light copilot usage pattern, not batch pipeline] | £4 | £4 |
| **Fixed total** | | **£1,775/month** | **£3,441/month** |

No separate LLM pipeline; researcher uses Claude interactively for specific lookups, draft synthesis, and document review.

### Variable Monthly Costs (per record)

Researcher-produced dossiers: the variable element is researcher throughput capacity, not per-record API spend.

Throughput estimate [my estimate — based on UK fundraising sector norms; a full-time experienced prospect researcher produces 15–25 major-gift profiles/week; see CASE Europe guidance and sector forums]:
- 0.5 FTE: ~8–12 profiles/week = ~35–52/month; use 40/month
- 1.0 FTE: ~15–25 profiles/week = ~65–108/month; use 80/month

Note: above ~80 records/month, this strategy requires additional headcount. Cost scales linearly.

No meaningful per-record API cost (Claude copilot use is ad hoc, not per-record systematic).

### One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| DPIA + LIA (researcher's data handling procedures) | £1,500–3,000 [my estimate] | £2,250 |
| Researcher onboarding + tool training | 1 week researcher time (already in salary); Factary training included in licence [my estimate] | £0 incremental |
| **One-off total** | | **£2,250** |

No build cost. Lowest one-off spend of all five strategies.

### Totals at Volume

| Volume | Headcount | Monthly total | Cost/dossier | Feasible? |
|---|---|---|---|---|
| 40 records/month | 0.5 FTE | £1,775 | **£44.38** | Yes (near capacity) |
| 80 records/month | 1.0 FTE | £3,441 | **£43.01** | Yes (near capacity) |
| 100 records/month | 1.25 FTE* | £4,301 | **£43.01** | Needs 0.25 FTE over |
| 400 records/month | 5.0 FTE* | £17,205 | **£43.01** | Linear scaling only |

*100 records requires ~1.25 FTE; 400 records requires ~5 FTE. Cost/dossier approximately constant at ~£43 regardless of volume — no economies of scale.

### Sensitivity Table

| Scenario | 80 records/month (1 FTE) | 400 records/month (5 FTE) |
|---|---|---|
| Base | £3,441 / £43.01 each | £17,205 / £43.01 each |
| Researcher salary upper bound (£45k/yr) | £3,750 + £108 licences = £3,858 / £48.23 | £19,290 / £48.23 |
| Researcher salary lower bound (£35k/yr) | £3,025 / £37.81 | £15,125 / £37.81 |
| Vendor fees +50% (Factary to £156/month) | +£52 → £3,493 / £43.66 | Negligible at scale |
| Qualify rate: not applicable — researcher applies judgment, no fixed rate | — | — |

**Notes:** Scaling to 400 records/month requires 5 full-time researchers — effectively a dedicated prospect research team. Cost/dossier is volume-independent. Quality ceiling is highest of all five strategies for complex cases where researcher judgment is required, but throughput is the binding constraint.

---

## Comparative Summary

**USD → GBP conversion assumption: £1 = $1.27 applied throughout.**

| Strategy | One-off cost | Monthly fixed | Cost/dossier @ 100 | Cost/dossier @ 400 | Scales without headcount? |
|---|---|---|---|---|---|
| 1 — Factary outsourced | £2,750 | £3,687 | £36.87 | £27.97 | No (retainer + per-record) |
| 2 — Commercial API + Claude | £11,336 | £3,583 | £36.42 | £9.55 | Yes |
| 3 — Open-source agentic | £13,698 | £1,497 | £15.30 | £4.08 | Yes |
| 4 — Hybrid tiered | £17,696 | £3,205 | £32.16 | £8.12 | Yes |
| 5 — Human-led + copilot | £2,250 | £1,775–3,441 | £44.38 (0.5 FTE cap) | £43.01 (5 FTE) | No |

**Break-even points vs. Strategy 3 (lowest unit cost above 100 records):**
- Strategy 2 vs. Strategy 3: Strategy 3 saves ~£21/dossier at 100 records, ~£5.47/dossier at 400 records; Strategy 2's commercial data adds recall on wealth/donation history where Strategy 3 is weak.
- Strategy 4 vs. Strategy 2: at 400 records, Strategy 4 is ~£1.43/dossier cheaper while concentrating commercial spend on confirmed leads — favourable if qualify rate is stable.
- Strategy 1 vs. Strategy 4: Strategy 1 costs ~£20/dossier more at 400 records; carries no build cost and no internal technical dependency.
- Strategy 5: cost per dossier flat at ~£43 regardless of volume; only viable below ~80 records/month or where quality ceiling is paramount.

**Key cost driver at low volume (<100 records/month):** fixed monthly costs dominate. Strategy 3 and Strategy 5 (0.5 FTE) are lowest.
**Key cost driver at high volume (400+ records/month):** Strategy 3 and Strategy 4 LLM variable costs are negligible; commercial licence fees in Strategies 1/2/4 do not scale with volume, giving them economies of scale.
