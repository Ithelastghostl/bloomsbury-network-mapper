# Test Plan — Strategy 5: Human-Led + Claude Copilot

## Gold Set Design

### Size and composition

16 test donor records, selected to exercise the full range of researcher challenges:

| Category | Count | Rationale |
|---|---|---|
| Known Bloomsbury-adjacent individuals (public trustees/donors with verifiable footprint) | 4 | Ground-truth available from open registers; tests baseline accuracy |
| Common-name donors (e.g. "David Jones", "Sarah Williams") | 3 | Tests disambiguation workflow (Story 2.2); highest entity resolution risk |
| Individuals with thin public footprints (no directorships, no known philanthropy) | 3 | Tests honest reporting of sparse dossiers; ensures the researcher does not fabricate connections |
| HNW individuals from finance/legal sectors with complex CH histories | 3 | Tests wealth indicator identification and PSC chain tracing |
| Scottish or NI-connected individuals requiring OSCR/CCNI lookup | 2 | Tests completeness of researcher's source coverage beyond CH/CC |
| Individuals with known adverse media or regulatory action | 1 | Tests sanctions/adverse media workflow; ensures FLAGGED status propagates correctly |

### Ground truth

For the 4 Bloomsbury-adjacent records, ground truth is established from the Charity Commission register, Companies House, and 360Giving data directly, before the prototype begins. These records have documented expected outputs (list of trustee roles, directorship history, grant connections) against which researcher output is compared.

For the remaining 12 records, ground truth is established by a second independent researcher or a senior fundraiser reviewing the dossier post-production. This reviewer has not seen the copilot output before forming their own assessment.

---

## Metrics

### 1. Donor dossier accuracy ≥ 95%

**Definition:** Of all factual claims in approved dossiers, at least 95% can be verified against a named source at the time of review.

**Measurement:** Independent reviewer spot-checks 4 of the 16 dossiers (25% sample). For each dossier, every factual claim in the narrative is cross-checked against the cited source. A claim is "accurate" if: (a) the source exists and is accessible, and (b) the source supports the claim as written.

**Why this threshold:** Human review of every dossier before release means that unverified claims should be caught at Checkpoint 3. A 95% accuracy floor is achievable [my estimate]; anything lower indicates the researcher is approving dossiers without adequately checking Claude's drafts.

**Failure mode this detects:** Researcher rubber-stamping Claude drafts without thorough review.

---

### 2. Connection precision ≥ 95%

**Definition:** Of all network connections listed in approved dossiers, at least 95% are genuine connections (not false positives from name collisions or misidentified entities).

**Measurement:** Independent reviewer assesses all connections in the 4 spot-checked dossiers. A connection is a false positive if the reviewer, using the same sources, cannot confirm the two individuals are the same person or that the described relationship exists.

**Why this is higher than automated strategies:** Human checkpoint 1 explicitly requires entity confirmation before research proceeds. Human checkpoint 2 requires the researcher to review and approve each candidate connection. False positives should be removed before dossier drafting. A 95% precision floor is the minimum acceptable given these controls [my estimate].

---

### 3. Connection recall ≥ 75%

**Definition:** Of all co-trustee and co-director connections that exist in the public register for the 4 gold-truth records, at least 75% are present in the delivered dossier.

**Measurement:** For the 4 Bloomsbury-adjacent records with pre-established ground truth, count connections in the dossier against known connections from the register. Recall = (found in dossier) ÷ (known to exist).

**Why recall is lower than precision:** Automated graph traversal (Strategies 3 and 4) can systematically enumerate all co-trustees across the entire CC register. A researcher working to a time budget will prioritise depth on the most relevant connections over exhaustive enumeration. A 75% recall target reflects realistic researcher throughput constraints [my estimate — from STRATEGY.md §Coverage and Accuracy].

**Note:** Recall below 75% on the gold set records should prompt investigation of whether the researcher is skipping the CC `GetTrusteeAndRelatedCharities` query, or whether the copilot CLI is not surfacing the full trustee network in the summary.

---

### 4. Wealth-tier accuracy ≥ 85%

**Definition:** For donors where the dossier includes a wealth capacity estimate, at least 85% of estimates are within one wealth band of the independently assessed capacity (bands: sub-£1m; £1m–£5m; £5m–£30m; £30m+).

**Measurement:** For the 3 HNW finance/legal records in the gold set, the independent reviewer assesses the same public sources and produces a capacity estimate. Agreement within one band = pass.

**Why this threshold is achievable:** An experienced UK prospect researcher, integrating PSC data, property proxies, honours signals, and philanthropic giving history, achieves better contextual synthesis than an automated pipeline. An 85% accuracy rate is consistent with sector expectations for experienced researchers [my estimate — from STRATEGY.md §Coverage and Accuracy]. Note that all capacity estimates must carry the ceiling caveat from 03_reliability_ceiling.md regardless of accuracy rating.

---

### 5. Hallucination rate = 0%

**Definition:** Zero factual claims in approved dossiers that are fabricated by Claude and not caught before approval. A hallucination is a claim that (a) has a source citation, but (b) the cited source does not support the claim as written, because Claude invented or misrepresented the source content.

**Measurement:** The independent reviewer checks every cited source for the 4 spot-checked dossiers. A claim where the source does not support the assertion is recorded as a hallucination.

**Why 0% is the correct target:** Claude hallucinations that reach an approved dossier represent a failure of the human checkpoint design, not just a model error. Checkpoint 3 specifically includes a citation audit. If any hallucination reaches an approved output, the checkpoint process is not functioning as designed.

**Remediation path:** If a hallucination is found, identify at which checkpoint it should have been caught, diagnose whether the researcher's review was too shallow or the citation format was too opaque to review efficiently, and update the dossier template or checkpoint protocol accordingly.

---

### 6. Throughput ≥ 20 records per week at 0.5 FTE

**Definition:** In weeks 5–6 of the prototype (after the researcher's initial learning curve), the researcher completes at least 20 approved dossiers (Checkpoint 3 sign-off) per week.

**Measurement:** `audit.db` records all Checkpoint 3 completions with timestamps. Weekly count is read from `copilot.py report --period week`.

**Why 20 records/week:** From 06_cost_models.md, a 0.5 FTE researcher is expected to produce approximately 35–52 dossiers per month (~8–12 per week). A threshold of 20/week applies in weeks 5–6 after the learning curve; this is higher than the monthly average because the prototype's shorter records require less biographical research than a full major-gift dossier. If the researcher consistently falls below 20/week, the cost model (~£44/dossier at 40 records/month) breaks down.

**Key sustainability test:** The throughput metric is assessed in weeks 5–6 specifically. If throughput in weeks 3–4 is 25/week but drops to 15/week in weeks 5–6, the decision gate fails — this indicates the researcher cannot sustain the workload and the cost model is not valid.

---

### 7. Time-to-dossier: 2–3 business days average

**Definition:** Median elapsed time from donor record ingest (Story 1.1) to Checkpoint 3 sign-off (Story 6.2) is between 2 and 3 business days.

**Measurement:** Calculated from `audit.db` timestamps. Both the ingest timestamp and the Checkpoint 3 timestamp are recorded; elapsed business days are calculated excluding weekends.

**Why 2–3 days:** This is the target stated in the prototype goal. Faster than 2 days may indicate the researcher is not doing sufficient depth research. Slower than 3 days indicates a process bottleneck (likely at Checkpoint 2 — candidate review — for complex records).

---

### 8. Cost per dossier: within ±20% of COST.md model

**Definition:** Actual cost per approved dossier is within ±20% of the £44.38 base case (0.5 FTE model) from 06_cost_models.md.

**Measurement:** Researcher time logged per week (from `audit.db` throughput data) × researcher cost rate. Claude API costs from Anthropic usage dashboard. Factary Phi monthly cost divided by records produced.

**Acceptable range:** £35.50 – £53.25 per dossier [my estimate — ±20% of £44.38].

**If above range:** Investigate whether throughput target is being met. If throughput falls below 35/month, cost/dossier rises above the model. The COST.md model is valid only when the throughput assumption holds.

---

## Test Methodology

**Week 2 (end of engineer sprint):**
- Run copilot.py check-config on the researcher's machine — all API connections pass
- Researcher completes onboarding run with test_donor_alice_example (Story 9.2)
- Engineer and researcher jointly verify that signals.json, summary.md, and dossier.md are produced correctly for the onboarding record

**Weeks 3–4:**
- Researcher processes 10 gold-set records; all three checkpoints completed for each
- Researcher records any workflow friction in a running notes document
- No metric assessment; observation only
- Engineer reviews notes at end of week 4 and addresses top 3 friction points before week 5

**Weeks 5–6:**
- Researcher processes remaining 6 gold-set records plus 10–15 additional records
- Weekly throughput logged automatically via `copilot.py report`
- At end of week 6: independent reviewer assesses 4 dossiers (1 from each category except common-name and thin-footprint)

**Post-prototype:**
- All metrics tabulated against thresholds
- Decision gate assessment (PROTOTYPE_SCOPE.md §Decision Gate)
- Written debrief with researcher: what worked, what was slow, what Claude got wrong

---

## Edge Cases

### Researcher time pressure leading to citation shortcuts

Under deadline pressure a researcher may approve a dossier with incomplete citations — particularly in the Sources section. The Checkpoint 3 protocol (HUMAN_CHECKPOINTS.md §Checkpoint 3) explicitly requires reviewing every source link before signing off. To mitigate: the dossier template includes a Sources audit checklist; `copilot.py audit-log --checkpoint 3` prompts the researcher to confirm "All citations verified: y/n" before logging approval.

**Test:** For the 4 spot-checked dossiers, record whether the Sources section is complete (every claim has a source). If ≥1 dossier has an uncited claim, flag as a checkpoint protocol failure.

### Common-name donors requiring extra disambiguation time

The 3 common-name records in the gold set are likely to require significantly more researcher time than standard records — potentially 2–3× longer due to the disambiguation workflow (Story 2.2). This could skew the weekly throughput metric.

**Test:** Record time spent on the disambiguation step separately. If common-name records consistently take >5 hours, evaluate whether the disambiguation workflow (copilot producing a comparison table, researcher selecting) can be improved without increasing hallucination risk.

### Researcher unfamiliar with CC register structure

A researcher new to the Charity Commission register may not be aware of the `GetTrusteeAndRelatedCharities` endpoint — the most important endpoint for network discovery. If this is not queried, co-trusteeship recall drops significantly.

**Test:** For the 4 Bloomsbury-adjacent gold-set records, check whether the co-trusteeship network in the dossier matches the ground-truth network. If recall is below 75%, check whether CC related-charity queries were run. If not, this is a researcher training gap, not a tooling failure — address in onboarding.

---

## Exit Criteria

The prototype passes if **all** of the following are met at week 6:

| Metric | Threshold | Source |
|---|---|---|
| Dossier accuracy | ≥ 95% | Independent review of 4 dossiers |
| Connection precision | ≥ 95% | Independent review of 4 dossiers |
| Connection recall | ≥ 75% | Comparison against 4 gold-truth records |
| Wealth-tier accuracy | ≥ 85% | Comparison against 3 HNW gold-truth records |
| Hallucination rate | = 0% | Independent review of 4 dossiers |
| Throughput (weeks 5–6) | ≥ 20 records/week | `copilot.py report` |
| Time-to-dossier | 2–3 business days median | `audit.db` timestamps |
| Cost per dossier | £35.50–£53.25 | Calculated from throughput + costs |

The prototype fails if any single metric misses its threshold. Partial passes are not accepted — a missed hallucination rate or precision metric requires remediation before the researcher's workload is expanded.
