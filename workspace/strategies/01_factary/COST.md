# Cost Model — Strategy 1: Factary (or Equivalent UK Specialist) Outsourced

_Reproduced from 06_cost_models.md §Strategy 1, with strategy-specific additions._

**Currency:** GBP throughout. USD figures converted at £1 = $1.27 [assumption].
**Confidence labels:** [verified] = cited source; [vendor estimate] = range + basis in signal inventory; [my estimate] = reasoning shown.

---

## Description

Bloomsbury submits donor lists to Factary or Prospecting for Gold, who perform prospect research using their proprietary UK databases and methodology and return completed dossiers. No internal data pipeline. No LLM infrastructure beyond dossier structuring (Claude Haiku, negligible cost). Spend is directly proportional to throughput.

---

## Fixed Monthly Costs

| Item | Basis | Monthly |
|---|---|---|
| Factary Phi licence | £500–2,000/yr POA; use midpoint £1,250/yr [vendor estimate — contact willw@factary.com; no public price] | £104 |
| Specialist retainer (Prospecting for Gold or Factary screening) | POA; estimate £1,500–4,000/month for an active managed-service retainer covering 100–400 records/month [vendor estimate — PfG and Factary both offer retainer-style screening; no public rate; basis: typical UK prospect research agency day rate £350–500 × ~5–8 days/month] | £2,750 (midpoint) |
| Internal staff time (0.25 FTE fundraising coordinator to brief/receive supplier) | 0.25 × £3,333/month [my estimate — UK charity sector prospect researcher salary midpoint £40k/yr] | £833 |
| **Fixed total** | | **£3,687/month** |

---

## Variable Monthly Costs (per record)

No API calls or LLM tokens — outsourced. Variable element is per-dossier fee above the retainer minimum.

At 100 records/month: retainer likely covers this; £0 marginal per-record variable [my estimate — retainer typically includes a record cap; assume 100 records covered].

At 400 records/month: additional records above retainer cap estimated at £15–40/dossier [vendor estimate — PfG individual profile cost £50–300; bulk/retainer rate lower]; use £25/record above 100-record base.

- 100 records: £0 variable → total = £3,687 → **£36.87/dossier**
- 400 records: (300 × £25) = £7,500 variable → total = £11,187 → **£27.97/dossier**

---

## One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| DPIA + LIA (data sharing with third-party processor) | £1,500–3,000 legal/DPO time [my estimate] | £2,250 |
| Vendor onboarding and DPA negotiation | Internal legal review + contract negotiation [my estimate] | £500 |
| **One-off total (original model — no internal tooling)** | | **£2,750** |

**Revised one-off total with v1 workflow tooling (Strategy 1 prototype as specified in PROTOTYPE_SCOPE.md):**

| Item | Basis | Cost |
|---|---|---|
| DPIA + LIA | As above [my estimate] | £2,250 |
| Vendor onboarding and DPA | As above [my estimate] | £500 |
| Engineer build: 3 weeks intake/transfer/review tooling | 15 days × £318/day [my estimate — UK engineering day rate midpoint] | £4,770 |
| **Revised one-off total** | | **£7,520** |

_Note: the 06_cost_models.md baseline assumes no build cost because it models the pure outsourced engagement without the internal tooling layer. The PROTOTYPE_SCOPE.md adds a 3-week engineer build for intake, secure transfer, dossier ingestion, and human review CLI. This is additional to the vendor cost; it is not included in the 06_cost_models.md sensitivity table._

---

## Sensitivity Table (from 06_cost_models.md)

| Scenario | 100 records/month | 400 records/month |
|---|---|---|
| Base (retainer midpoint, 10% qualify) | £3,687 total / £36.87 each | £11,187 / £27.97 each |
| Vendor fees +50% (retainer to £4,125 + per-record to £37.50) | £4,125 / £41.25 each | £15,375 / £38.44 each |
| High qualify rate (30%) — no direct cost impact (outsourced dossier price does not vary by depth at this tier) | Same as base | Same as base |
| Volume 100→400 with no retainer uplift (supplier unable to absorb) | n/a | £18,687 / £46.72 each if full per-record pricing at £40 for all 400 |

---

## Strategy-Specific Notes

### Factary Procurement Timeline

Typical onboarding timeline for a new Factary or Prospecting for Gold engagement: **2–4 weeks** [my estimate — based on UK specialist agency norms; no published SLA found]. This covers:

- Initial scoping call and quote (1 week)
- DPA negotiation and signature (1–2 weeks; this is the critical path item — do not send data before DPA is signed)
- Factary account setup and test batch (1 week)

**Implication:** If Bloomsbury has a campaign deadline, the Factary engagement must be initiated at least 4–6 weeks before the first dossiers are needed. The 07_ranking_and_recommendation.md near-tie caveat notes that "if Bloomsbury has an immediate fundraising deadline within 8 weeks, Strategy 1 should be run in parallel with any pipeline build" — this timeline makes it clear that 8 weeks is the minimum safe lead time.

---

### RFQ Status

**Open — user must request quote.**

No public pricing exists for Factary screening retainers or Prospecting for Gold managed services. Both are priced on a per-engagement basis.

**Contact points:**
- Factary: willw@factary.com (Will Weaver, listed on factary.com as contact for Factary Phi) [vendor estimate source; factary.com, accessed 2026-05-05]
- Prospecting for Gold: info@prospectingforgold.co.uk [vendor estimate source; prospectingforgold.co.uk, accessed 2026-05-05]

**What to request in the RFQ:**
1. Retainer price for 100 records/month and 400 records/month
2. Per-record fee above retainer minimum
3. Price for deep individual prospect research (single profiles)
4. DPA template or confirmation they will sign Bloomsbury's DPA
5. Sub-processor list
6. ISO 27001 certificate or equivalent security assurance
7. Typical turnaround SLA (working days from receipt of batch to return of dossiers)
8. Data deletion procedure at contract end

---

### Licence Model

Factary and Prospecting for Gold do not publish a standard pricing tier. Based on sector norms, three licence model structures are common for UK prospect research agencies:

| Model | Description | Typical fit |
|---|---|---|
| **Per-record** | Fixed fee per dossier returned, regardless of monthly volume. No retainer. | Appropriate for low-volume, occasional screening (fewer than 50 records/year). Highest unit cost. |
| **Retainer + overage** | Monthly retainer covers a defined number of records; additional records at a per-record rate above the cap. This is the base case modelled in 06_cost_models.md. | Appropriate for regular screening with predictable monthly volume. Mid-range unit cost. |
| **Annual licence / seat** | Annual fee for unlimited screening access to Factary Phi (the database product, not the managed service). Used where internal researchers run their own queries. Relevant only if Bloomsbury hires an in-house researcher (Strategy 5 overlap). | Appropriate for charities with dedicated prospect research staff. Lowest unit cost at high volume. |

**Recommendation for Strategy 1 (no in-house researcher):** Negotiate a retainer + overage model covering 100 records/month as the base. Agree the per-record overage rate in advance — this is the variable that most affects cost at high volume (see sensitivity table above).

---

## Comparative Context (from 06_cost_models.md)

| Strategy | One-off cost | Monthly fixed | Cost/dossier @ 100 | Cost/dossier @ 400 | Scales without headcount? |
|---|---|---|---|---|---|
| **1 — Factary outsourced** | **£2,750** (or £7,520 with tooling) | **£3,687** | **£36.87** | **£27.97** | No (retainer + per-record) |
| 2 — Commercial API + Claude | £11,336 | £3,583 | £36.42 | £9.55 | Yes |
| 3 — Open-source agentic | £13,698 | £1,497 | £15.30 | £4.08 | Yes |
| 4 — Hybrid tiered | £17,696 | £3,205 | £32.16 | £8.12 | Yes |
| 5 — Human-led + copilot | £2,250 | £1,775–3,441 | £44.38 (0.5 FTE cap) | £43.01 (5 FTE) | No |

**Strategy 1 cost position:** Highest ongoing run cost per dossier at volume compared to pipeline-based strategies. Zero build cost advantage vs. Strategies 2–4. Competitive with Strategy 5 at 100 records/month. The premium buys: zero internal engineering dependency, pre-packaged GDPR compliance, Factary's 25+ years of calibrated UK prospect research methodology, and immediate operability (4–6 week procurement vs. 4–8 week build).
