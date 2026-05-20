# Cost Model — Strategy 5: Human-Led + Claude Copilot

**Source:** Reproduced and extended from 06_cost_models.md §Strategy 5.
**Currency:** GBP. USD/GBP conversion: £1 = $1.27 [assumption].
**Confidence labels:** [verified] = cited source; [vendor estimate] = range + basis in signal inventory; [my estimate] = reasoning shown.

---

## Fixed Monthly Costs

| Item | Basis | Monthly (0.5 FTE) | Monthly (1.0 FTE) |
|---|---|---|---|
| Prospect researcher salary | £40k/yr midpoint; 0.5 FTE = £1,667/month; 1.0 FTE = £3,333/month [my estimate — UK charity sector and tech market norms, May 2026; range £35–45k/yr] | £1,667 | £3,333 |
| Factary Phi subscription | £500–2,000/yr POA; midpoint £1,250/yr [vendor estimate — factary.com; no public price; contact willw@factary.com] | £104 | £104 |
| Claude API (Sonnet, ad hoc copilot use; ~50 tasks/month × 15k tokens each) | 50 × (15k × $3/MTok input + 3k × $15/MTok output) = 50 × ($0.045 + $0.045) = $4.50/month ÷ 1.27 [my estimate — light copilot usage pattern, not batch pipeline] | £4 | £4 |
| **Fixed total** | | **£1,775/month** | **£3,441/month** |

No automated LLM pipeline; researcher uses Claude interactively for specific lookups and draft synthesis. No job queue, no batch processing, no orchestration infrastructure.

---

## Variable Monthly Costs

There is no meaningful per-record API cost. The variable element is researcher throughput capacity, not per-record API spend.

**Throughput estimates** [my estimate — UK fundraising sector norms; see CASE Europe guidance and sector forums]:

| Headcount | Records per week | Records per month |
|---|---|---|
| 0.5 FTE | ~8–12 | ~35–52; use 40/month |
| 1.0 FTE | ~15–25 | ~65–108; use 80/month |

Above ~80 records/month, this strategy requires additional headcount. Cost scales linearly with headcount; there are no economies of scale from higher volume.

---

## One-Off Costs

| Item | Basis | Cost |
|---|---|---|
| DPIA + LIA (researcher's data handling procedures) | £1,500–3,000 for legal/DPO time [my estimate] | £2,250 |
| Researcher onboarding and tool training | 1 week researcher time (within salary); Factary Phi training included in subscription; Claude SDK copilot setup ~2 days engineer time [my estimate] | £636 (2 days × £318/day engineer) |
| Engineer build for copilot CLI (E1–E7 stories) | 10 days × £318/day; midpoint of 2-week estimate from PROTOTYPE_SCOPE.md [my estimate] | £3,180 |
| **One-off total** | | **£6,066** |

Lowest infrastructure build cost of all five strategies. No commercial API contracts or vendor DPAs required beyond Anthropic.

---

## Totals at Volume

| Volume | Headcount | Monthly total | Cost/dossier | Feasible? |
|---|---|---|---|---|
| 40 records/month | 0.5 FTE | £1,775 | **£44.38** | Yes (near capacity) |
| 80 records/month | 1.0 FTE | £3,441 | **£43.01** | Yes (near capacity) |
| 100 records/month | 1.25 FTE* | £4,301 | **£43.01** | Needs 0.25 FTE over |
| 400 records/month | 5.0 FTE* | £17,205 | **£43.01** | Linear scaling only — requires dedicated team |

*100 records requires ~1.25 FTE; 400 records requires ~5 FTE. Cost per dossier is approximately constant at ~£43 regardless of volume — no economies of scale [my estimate].

---

## Sensitivity Table

| Scenario | 80 records/month (1 FTE) | 400 records/month (5 FTE) |
|---|---|---|
| Base case | £3,441 / £43.01 each | £17,205 / £43.01 each |
| Researcher salary upper bound (£45k/yr) | £3,750 + £108 licences = £3,858 / **£48.23** | £19,290 / £48.23 |
| Researcher salary lower bound (£35k/yr) | £3,025 + £108 = £3,133 / **£39.16** | £15,665 / £39.16 |
| Factary Phi at upper bound (£2k/yr) | +£60/month → £3,501 / **£43.76** | Negligible at scale |
| Factary Phi dropped entirely (public sources only) | -£104/month → £3,337 / **£41.71** | £16,685 / £41.71 |
| Researcher adds Prospecting for Gold screen for top 5 leads | +£250–1,500 one-off for 5 profiles [vendor estimate — PfG individual profile cost] | One-off; not in monthly total |
| Qualify rate sensitivity | Not applicable — researcher applies judgement, no fixed rate | — |

---

## Hiring Timeline

Recruiting a UK prospect researcher typically takes **4–8 weeks** from job posting to start date [my estimate — based on UK charity sector recruitment norms; IoF job board and CharityJob both show active markets]. Key factors:

- Part-time (0.5 FTE) roles may attract a broader pool including portfolio freelancers and returning parents but may also require a longer search because fewer candidates are actively seeking fractional roles
- A full-time (1.0 FTE) role at £35–45k is competitive in the London market; expect 6–8 weeks to hire a candidate with 2+ years UK prospect research experience
- Specialist recruiters (Prospecting for Gold, IoF, Ciof) can reduce time-to-hire; consider a fixed-fee recruiter rather than a percentage-of-salary fee given the salary range

**Allow at least 6 weeks from budget approval to researcher start date.** Engineering the copilot CLI (2-week sprint) can begin in parallel with recruitment.

---

## Professional Development

The following memberships and training are recommended for the researcher role:

| Item | Annual cost | Rationale |
|---|---|---|
| Chartered Institute of Fundraising (CIoF) individual membership | £115–£185/yr [verified — ciof.org.uk/membership, 2026 rates] | Professional development, sector networking, access to GDPR briefings |
| Institute of Fundraising Prospect Research Group membership | Included in CIoF or standalone £30–50/yr [my estimate] | UK prospect research peer group; best practice updates |
| CASE Europe conference or workshop | £300–600 one-off/yr [my estimate] | Prospect research methodology training |

Total professional development budget: approximately **£500–800/yr** per researcher.

---

## Comparative Position

From 06_cost_models.md §Comparative Summary:

| Strategy | One-off cost | Monthly fixed | Cost/dossier @ 100 | Cost/dossier @ 400 | Scales without headcount? |
|---|---|---|---|---|---|
| 1 — Factary outsourced | £2,750 | £3,687 | £36.87 | £27.97 | No |
| 2 — Commercial API + Claude | £11,336 | £3,583 | £36.42 | £9.55 | Yes |
| 3 — Open-source agentic | £13,698 | £1,497 | £15.30 | £4.08 | Yes |
| 4 — Hybrid tiered | £17,696 | £3,205 | £32.16 | £8.12 | Yes |
| **5 — Human-led + copilot** | **£6,066*** | **£1,775–3,441** | **£44.38 (0.5 FTE cap)** | **£43.01 (5 FTE)** | **No** |

*£6,066 includes the copilot CLI build cost (£3,180 engineer). The 06_cost_models.md figure of £2,250 covers DPIA/LIA only and excludes build cost. Both figures are correct for different scopes: £2,250 for infrastructure-only one-off; £6,066 for total first-deployment cost.

**Key cost insight:** Strategy 5 has the lowest fixed monthly cost at 0.5 FTE (£1,775/month) and the lowest one-off cost, but the highest cost per dossier at scale. It is cost-competitive with Strategy 1 (Factary outsourced) at low volume (<40 records/month) and superior on quality. It is never cost-competitive with Strategies 3 or 4 at high volume.

The correct framing is not "which is cheapest?" but "what is the right tool for the volume and quality requirement?" Strategy 5 is the right tool for fewer than 80 records/month or for the top 20–50 highest-priority leads regardless of pipeline. See 07_ranking_and_recommendation.md §Consider Strategy 5 as a parallel track.
