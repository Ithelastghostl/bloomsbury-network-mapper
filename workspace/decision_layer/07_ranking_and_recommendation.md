# 07 — Strategy Ranking and Recommendation

**Phase R5 output** | 2026-05-05 | Covers: five candidate strategies ranked against user priorities

---

## Preamble: What R3 Established

Before ranking, two structural facts from R3 constrain every strategy equally:

1. **Shared-trusteeship signal is near-deterministic from free open data** (~90–95% recall, Charity Commission bulk register). No strategy has an advantage here — the data is already free and complete.

2. **£5M+ net worth confirmation has a hard structural ceiling** regardless of architecture. No UK public source covers the £5m–£350m band systematically. Any "confirmation" is an estimate derived from identified indicators. This ceiling applies to all five strategies and must be labelled as such in every dossier.

---

## Strategy Profiles

---

### Strategy 1 — Factary (or equivalent UK specialist, outsourced)

**Mechanism of reliability**

Factary's post-GDPR screening methodology (rebuilt in 2019, factary.com/2019/06/the-factary-screening-revolution) uses demographic and occupational proxies rather than a pre-compiled HNW database, precisely because the latter could not be maintained lawfully. Their reliability comes from 25+ years of calibrated judgement about which open-source signals (Companies House, CC register, press, honour lists, property proxies) co-occur with major gift capacity, combined with human analyst review of each screened record. The Article 28 DPA, LIA, and GDPR-compliant process are pre-packaged. Reliability is vendor-verified rather than self-built — the charity is buying a tested pipeline, not assembling one.

**Coverage and accuracy by deliverable**

- **Job A (donor enrichment):** ~60–70% of records get a substantially complete dossier [my estimate, based on Factary's stated ~17% post-screening drop-out rate and R3's assessment of UK open-source signal density]. Records with sparse footprints (no listed company, no honour, no philanthropy history) will return thin profiles regardless of vendor.
- **Job B (network discovery):** Co-trusteeship recall ~90% (same CC register as open-source); corporate connection recall ~70–80% for formal CH roles. Specialist researchers add biographical connections (education, clubs, events) not in structured registers — modest but real uplift over pure open-source. Precision high: Factary sources all claims.
- **Job C (£5M+ qualification):** ~30–40% of leads can be accompanied by a well-evidenced capacity estimate [my estimate, grounded in R3's finding that commercial tools reach ~20–30% coverage of the £5M+ population, with specialist research adding modest uplift]. All estimates carry the structural ceiling caveat.

**Failure modes and mitigations**

1. *Black-box methodology* — the charity receives dossiers without full visibility into how signals were weighted. Mitigation: require sourced outputs; Factary's post-GDPR pivot was explicitly toward source-linked entries.
2. *Thin coverage on new prospects with no charity footprint* — individuals from tech, property, or media (identified as gaps in R1 context) may not appear in Factary Phi's philanthropy-led dataset. Mitigation: supplement with targeted web research for sectors not well represented.
3. *Turnaround latency for large batches* — managed screening is not real-time. Mitigation: submit batches in advance; maintain an internal shortlist for high-priority leads.
4. *Vendor dependency and pricing opacity* — Factary costs are POA and the service cannot be replicated if the relationship ends. Mitigation: insist on data export rights and source citations so dossiers retain value after contract termination.
5. *GDPR compliance transfers to vendor but accountability stays with charity* — the charity remains controller. Mitigation: execute Article 28 DPA before first data transfer; verify Factary's sub-processor list.

**Cost shape**

No public price. Screening services at this tier typically run £1,000–£5,000 per batch of 500–1,000 records for a UK specialist, plus optional per-profile deep research at £100–£500 each [my estimate from sector norms; verify with Factary]. Highest per-record cost; lowest build cost. No infrastructure investment. Spend is directly proportional to throughput.

---

### Strategy 2 — Commercial API Stack + Claude synthesis

**Mechanism of reliability**

Reliability comes from combining DonorSearch or Wealth-X/Altrata structured data (aggregated from SEC, HMLR, company filings, and charitable databases) with Claude's extraction and synthesis layer. R3 shows DonorSearch is US-biased and Wealth-X covers UHNWI (>$30m) well but is thin on the £5m–£30m band — which is the primary Bloomsbury prospect segment. Claude adds value by resolving entities across sources and composing coherent dossiers from structured inputs. However, Claude cannot generate facts not present in inputs; reliability is gated by the input data coverage, which for UK-only HNW individuals is mediocre across these vendors.

**Coverage and accuracy by deliverable**

- **Job A:** ~40–55% substantially complete dossiers [my estimate]. Wealth-X is strong for UHNWI (the Rothschild, CVC, Goldman tier visible in Bloomsbury's existing network) but thin below £30m. DonorSearch's UK data depth is unverified. UK-only individuals with no US philanthropy profile will return weak results.
- **Job B:** Co-trusteeship recall same as open-source (~90%, CC register). RelSci or BoardEx add relationship-path data and executive profiles meaningfully — corporate network recall rises to ~75–85% if BoardEx is included. BoardEx is £8–25k+/year.
- **Job C (£5M+):** ~25–35% of leads get a reasonably evidenced capacity estimate [my estimate]. Wealth-X is well evidenced for UHNWI but requires £15–50k+/year. Below $30m, the structural ceiling applies.

**Failure modes and mitigations**

1. *US data bias for UK-only donors* — DonorSearch, iWave/Kindsight, and WealthEngine are all documented as primarily US data. Mitigation: use Factary Phi for UK philanthropic history; use Wealth-X only where UHNWI profile is expected.
2. *Claude hallucination on synthesis step* — if Claude is asked to "fill gaps" rather than synthesise only what sources provide, it will fabricate plausible-sounding claims. Mitigation: strict prompt discipline — Claude must cite source for every claim or label it as absent; never infer from gaps.
3. *GDPR DPA gaps across multiple vendors* — each vendor (DonorSearch, Altrata, Claude API) requires a separate Article 28 DPA. Mitigation: procurement checklist before first data transfer; verify each sub-processor chain.
4. *High annual cost with uncertain UK ROI* — Wealth-X at £15–50k+/year is only justified if the prospect set is substantially UHNWI. For Bloomsbury's likely £1m–£10m gift prospect pool, the product may be over-specified. Mitigation: start with a scoped pilot before annual contract.
5. *Orchestration complexity* — multiple API integrations, entity resolution across schemas, and Claude prompt engineering require ongoing engineering maintenance. Mitigation: define a narrow, tested pipeline before expanding vendors.

**Cost shape**

Minimum viable stack (Factary Phi + Claude API for synthesis): ~£2–5k/year plus Claude API usage (negligible at <£200/month for a 500-record batch run). Full stack (add Wealth-X or BoardEx): £25–80k+/year. High build cost; moderate run cost. Cost scales with vendor tier, not with throughput.

---

### Strategy 3 — Open-source agentic pipeline (Companies House + CC + 360Giving + web search, orchestrated by Claude Code)

**Mechanism of reliability**

Reliability is grounded in deterministic register data. The CC bulk download and Companies House API are structurally near-complete for the signals they cover (trusteeships: ~90–95%; director/PSC roles: ~70–80%). R3 confirms these are not just good but structurally enforced by statute. Claude Code orchestrates joins between registers, resolves name variants, and extracts structured entities from web search results. Every claim can be traced to a URL or API response — sourcing is automatic.

Weakness: for signals not covered by structured registers (donation history, wealth confirmation, biographical colour), recall is very low (~5–10% for donation history, <5% for £5M+ confirmation) and web search introduces noise that Claude must filter. This is the strategy's primary reliability gap.

**Coverage and accuracy by deliverable**

- **Job A:** ~30–45% substantially complete dossiers [my estimate]. Trustee/director skeleton is strong; wealth and giving history will be thin for most individuals. Dossiers will be reliably accurate but sparse.
- **Job B:** Strongest of all five strategies for shared-trusteeship and cross-company network mapping. ~90% co-trusteeship recall; ~70–80% corporate connection recall. This is where Strategy 3 leads the field — the signal is free, structured, and near-complete.
- **Job C (£5M+):** ~10–15% confident confirmation [my estimate]; the deterministic PSC tier identifies controlling shareholders in UK limited companies, which provides a narrow but reliable indicator for company-linked wealth. Outside that tier, the structural ceiling applies without commercial enrichment.

**Failure modes and mitigations**

1. *Sparse dossiers for individuals with limited formal/public footprint* — professionals who hold no directorships, trusteeship, or public profile produce near-empty outputs. Mitigation: flag sparseness explicitly; do not suppress thin dossiers.
2. *Web search noise and Claude extraction errors* — unstructured web content produces false positives (name clashes, outdated roles). Mitigation: require source URL for every claim; Claude should tag confidence level; human review for web-sourced claims.
3. *GDPR compliance self-managed* — unlike Factary, no pre-packaged compliant process. Charity must self-document LIA, DPIA, and Article 14 notices. Mitigation: complete compliance setup before first run; reference R2 checklist.
4. *Build time and maintenance* — a production-grade pipeline requires 4–8 weeks to build and ongoing maintenance as APIs evolve. Mitigation: define minimum viable pipeline first; expand incrementally.
5. *No donation history signal* — 360Giving covers grants to organisations, not gifts from individuals. Individual donation recall remains ~5–10% even with web search. Mitigation: accept this as a structural gap; supplement manually or with Factary Phi for high-priority leads.

**Cost shape**

Marginal ongoing cost: Claude API usage (~£50–150/month for batch runs on 500 records), zero data costs. Build cost: 4–8 weeks engineer/researcher time. Lowest total cost of ownership; lowest per-record cost at scale. Highest build investment as a fraction of a small organisation's capacity.

---

### Strategy 4 — Hybrid tiered (Strategy 3 mechanics for all records; Strategy 2 mechanics for shortlisted leads only)

**Mechanism of reliability**

Strategy 4 concentrates commercial spend where the signal quality justifies it. The open-source pipeline (Strategy 3) produces a shortlist scored by co-trusteeship density, corporate indicators, and available wealth proxies. Only shortlisted leads — say, the top 50–100 — receive commercial enrichment (Factary Phi, targeted Wealth-X or Factary Screening). The reliability of the final shortlist dossiers is therefore close to the commercial tier; the reliability of the broader first-pass is the open-source ceiling. This is the architecture of diminishing marginal cost: each additional commercial lookup is spent on someone already flagged as high-potential.

**Coverage and accuracy by deliverable**

- **Job A:** ~55–65% substantially complete dossiers for shortlisted leads [my estimate]; ~30–40% for the broader first-pass. The key insight is that the 20% of records most likely to be major gift prospects receive disproportionate enrichment resource.
- **Job B:** Equivalent to Strategy 3 for full network (strongest of all strategies); commercial enrichment on shortlist adds biographical depth and relationship paths.
- **Job C (£5M+):** ~35–45% of shortlisted leads get a well-evidenced capacity estimate [my estimate] — the open-source filter pre-qualifies leads before expensive commercial confirmation is attempted.

**Failure modes and mitigations**

1. *Shortlisting bias* — if the open-source filter systematically misses certain wealth profiles (e.g., property-rich individuals with no company or charity footprint), they never reach the commercial enrichment tier. Mitigation: periodically audit a random sample of non-shortlisted records.
2. *Build complexity* — requires building Strategy 3 first, then adding commercial integration layer. Mitigation: phase the build; Strategy 3 alone is useful and MVP-shippable.
3. *Same vendor risks as Strategy 2* for the commercial enrichment component — US bias in DonorSearch, GDPR DPA requirements. Mitigation: use Factary Phi (UK-native, GDPR-designed) as the primary commercial enrichment source.
4. *Shortlist threshold calibration* — too tight a threshold misses borderline prospects; too loose negates the cost efficiency. Mitigation: set threshold based on known positive examples from existing Bloomsbury network (Stuart Roden, Gary Lubner profiles as calibration points).
5. *Compliance complexity scales with vendor count* — each commercial vendor adds an Article 28 DPA and sub-processor audit obligation. Mitigation: start with one commercial add-on (Factary Phi) before expanding.

**Cost shape**

Open-source pipeline costs as per Strategy 3 (build + Claude API). Commercial enrichment costs limited to shortlist: e.g., 100 records × £200 average Factary profile cost = ~£20,000 one-off, plus Factary Phi subscription ~£500–2,000/year. Total year-one cost well below Strategy 2's full commercial stack. Efficiency is the strategy's defining advantage.

---

### Strategy 5 — Human-led prospect researcher + Claude as copilot

**Mechanism of reliability**

A human researcher brings contextual judgement that no automated pipeline replicates: they recognise that two "John Smith" records are different people; they know which alumni databases cover Eton versus St Paul's; they know that a "Director" role at a family office implies more than the title suggests. Claude reduces the researcher's grunt work — drafting, reformatting, summarising filings — without replacing the judgement layer. Reliability is highest here for bespoke, high-stakes dossiers: every dossier is human-reviewed before delivery.

The weakness is throughput. A part-time researcher producing 20–40 dossiers per month creates a bottleneck that open-source automation removes.

**Coverage and accuracy by deliverable**

- **Job A:** ~70–80% substantially complete dossiers for priority records [my estimate]; throughput-constrained to high-priority list. Long tail of lower-priority records gets little or no enrichment.
- **Job B:** Co-trusteeship recall equivalent to any strategy using the CC register. Corporate network recall depends on researcher methodology — well-scoped researchers achieve ~75–85%. The researcher adds contextual connection inference (e.g., recognising that two individuals attended the same investment bank at the same time) that structured data misses.
- **Job C (£5M+):** ~40–55% well-evidenced capacity estimates on priority records [my estimate] — the highest of any strategy, because a researcher can integrate signals across sources more flexibly than a pipeline, and can apply judgement about whether a signal is genuinely indicative.

**Failure modes and mitigations**

1. *Throughput ceiling* — a single researcher cannot process 500+ records in a reasonable timeframe. Mitigation: strictly prioritise the top 50–100 records; use automated pipeline for triage.
2. *Researcher methodology inconsistency* — without structured templates, dossier quality varies. Mitigation: define a standard dossier schema and source-citation protocol before the researcher starts.
3. *Key-person dependency* — if the researcher leaves, methodology and tacit knowledge leave with them. Mitigation: document the methodology; Claude copilot sessions should produce persistent, exportable outputs.
4. *Higher per-record cost at scale* — at £30–60k/year staff cost and 20–40 dossiers/month, per-record cost is £60–250, rising sharply with priority research depth. Mitigation: reserve researcher time for highest-priority leads only.
5. *Compliance still self-managed* — the researcher's access to personal data still requires a documented LIA and DPIA. Mitigation: same R2 compliance checklist applies; researcher role should include compliance documentation.

**Cost shape**

Part-time researcher (0.5 FTE): ~£18–25k/year. Full-time: £35–60k/year. Claude API costs negligible. Highest headcount cost; highest output quality for priority records; does not scale without proportional headcount. Per-record cost for deep dossiers is competitive with Factary managed service but requires managing employment.

---

## Effectiveness Ranking Table

Scoring: 1 = worst, 5 = best. For Complexity, lower score = more complex (worse).

| Dimension | S1 Factary outsourced | S2 Commercial API + Claude | S3 Open-source agentic | S4 Hybrid tiered | S5 Human + Claude |
|---|---|---|---|---|---|
| **Effectiveness** (primary) | 4 | 3 | 2 | 4 | 5 |
| **Technical feasibility** (4–6 wk) | 5 | 2 | 3 | 3 | 4 |
| **Complexity** (lower = better) | 5 | 2 | 4 | 3 | 4 |
| **Efficiency** (cost/reliable dossier) | 2 | 2 | 5 | 4 | 3 |
| **Impact** (£5M+ lead identification) | 3 | 3 | 2 | 4 | 4 |

**Justifications:**

*Effectiveness:*
- S1: Factary's tested methodology with sourced outputs and UK philanthropy focus earns high confidence; slightly below S5 because black-box elements limit auditability.
- S2: Commercial data bias toward US and UHNWI creates systematic gaps in the Bloomsbury prospect band (£1m–£10m gifts); mid-tier rating.
- S3: Near-complete for network discovery but structurally weak for wealth and giving history; the most accurate dossiers are also the most incomplete.
- S4: Concentrates quality where it matters; near-S1 effectiveness on the shortlist, lower on the broad pass.
- S5: Highest on effectiveness — human judgement + Claude copilot produces the most defensible, contextually rich dossiers.

*Technical feasibility (4–6 weeks):*
- S1: Zero build — just procurement and data transfer workflow. Feasible immediately.
- S2: Multiple API integrations, entity resolution, prompt engineering, multiple DPAs — 8–16 weeks minimum for production quality.
- S3: CC + CH API integration with Claude orchestration is buildable in 4–6 weeks for MVP; web search adds noise management complexity.
- S4: Requires S3 as a prerequisite; full system 6–10 weeks but MVP (S3 alone) is 4–6 weeks.
- S5: Researcher hired/onboarded in 2–4 weeks; Claude copilot setup is immediate. Feasible.

*Complexity:*
- S1: Operationally simple — send file, receive dossiers, sign DPA. Lowest operational overhead.
- S2: Multiple vendor contracts, API integrations, prompt maintenance, entity resolution failures to debug — highest complexity.
- S3: Single orchestration pipeline; simpler than S2 but requires engineering ownership.
- S4: S3 plus one commercial integration layer; moderate.
- S5: Simple operationally but introduces HR and management overhead.

*Efficiency (cost per reliable dossier):*
- S1: ~£50–500/record depending on depth and volume; no internal build cost but ongoing spend scales with throughput.
- S2: High vendor fees (£25–80k+/year) spread across a modest record count; per-dossier cost high unless volume is large.
- S3: Near-zero data cost; build cost amortises rapidly at scale; highest efficiency at volume.
- S4: S3 efficiency for bulk pass; S1/S2 costs contained to shortlist. Best cost-per-qualified-lead.
- S5: Competitive per-dossier for deep research; poor per-dossier for long-tail records.

*Impact (£5M+ lead identification):*
- S1: Factary Screening adds UK-specific wealth proxies beyond the open register; moderate-good impact on leads where indicators exist.
- S2: Wealth-X strong for UHNWI but expensive and overspecified for £1m–£10m range.
- S3: PSC-tier deterministic leads are reliable; below that threshold, structural ceiling limits impact.
- S4: Applies commercial enrichment only where open-source has already flagged indicators — highest precision on confirmed leads.
- S5: Researcher can integrate indicators from multiple sources with contextual judgement; best at catching edge cases.

---

## Final Recommendation

### Prototype first: Strategy 3 + Strategy 4 in sequence

Build Strategy 3 (open-source agentic pipeline) as the MVP. Target: 4–6 weeks to a working pipeline that produces sourced dossier skeletons for all records using CC, CH, 360Giving, and Claude synthesis. This is the prerequisite for Strategy 4 and is independently useful — it immediately delivers the network-discovery capability (Job B) at near-maximum recall for free.

Once Strategy 3 is producing dossiers, add one commercial enrichment layer for shortlisted records — specifically Factary Phi (~£500–2,000/year) — to produce Strategy 4. This concentrates the UK-native, GDPR-compliant philanthropic signal exactly where structural open-source data is weakest (donation history, wealth proxies). The build cost of going from S3 to S4 is low because the pipeline already exists; only the enrichment step is added.

**Run these in parallel in the sense that S4 is the target state and S3 is the milestone.** There is no architectural reason to choose one over the other — S3 is S4 without the commercial enrichment step.

### Do not prototype Strategy 2 first

The commercial API stack (Strategy 2 at full specification) requires vendor procurement, multiple DPAs, significant engineering, and £25–80k+/year in vendor fees before the UK coverage gaps are even confirmed. The Bloomsbury prospect band (£1m–£10m gift potential) is systematically underserved by the US-biased commercial tools. Strategy 4 achieves comparable effectiveness at a fraction of the cost by using UK-native Factary Phi as the commercial layer.

### Consider Strategy 1 or 5 as a parallel track for high-priority leads

For the top 20–30 prospects identified by the Strategy 3/4 pipeline — individuals like the Gary Lubner / Stuart Roden tier — a single Factary managed screening run or a part-time researcher providing deep dossiers is worth the incremental cost. This is not an alternative to S3/S4; it is an enhancement for the highest-stakes relationships. Budget ~£5,000–10,000 for this as a discrete exercise once the pipeline has identified the shortlist.

### Evidence gates for v2 investment

After the Strategy 3 prototype, the following evidence should drive the v2 decision:

1. **Dossier completeness rate:** What fraction of records produce a dossier with at least three sourced signals? If below 40%, the prospect pool may not have sufficient public footprint for automation to add much value — shift toward Strategy 5.
2. **Network density of co-trusteeship graph:** How many connections of two or fewer hops exist between Bloomsbury's existing trustees/donors and uninvestigated prospects? High density validates the network-mapping job and justifies building out the pipeline further.
3. **PSC-tier wealth confirmation rate:** What fraction of identified prospects appear in the PSC register as controlling shareholders of substantive companies? This is a proxy for the quality of the prospect pool, not the quality of the pipeline.
4. **Time-to-dossier:** How long does the pipeline take to produce a batch of 100 records end-to-end? If above 4 hours without human review, optimise before adding enrichment layers.

### Near-tie caveat

If the Bloomsbury team has an immediate fundraising deadline (e.g., a campaign launching within 8 weeks) and no engineering capacity, Strategy 1 (Factary outsourced) should be run in parallel with the S3 build. It produces defensible dossiers immediately with no build time, and its outputs can serve as a quality benchmark for the pipeline once it is live. The cost (~£2,000–5,000 for a batch screen) is modest relative to the risk of a delayed pipeline producing nothing in time for the campaign.

---

*All recall and coverage estimates not attributed to a published source are labelled [my estimate] and derived from the structural reasoning in R3. No vendor publishes a recall rate for the UK £5m+ population. Cost estimates for strategies without a 06_cost_models.md are derived from the vendor price ranges in 04_signal_inventory.md and labelled accordingly.*
