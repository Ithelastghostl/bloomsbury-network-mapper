# Test Plan — Strategy 4 Hybrid Tiered Pipeline

---

## Gold Set Design

**Purpose:** Provide ground truth for recall, precision, and accuracy measurement. Must be assembled before prototype evaluation begins (Story 9.1).

**Composition:**

| Subset | Size | Source | Used for |
|---|---|---|---|
| Known co-trusteeship pairs | 20 pairs (40 individuals) | Bloomsbury existing trustees and named donors cross-referenced against CC register manually | Tier 1 co-trusteeship recall |
| Known PSC/director connections | 10 pairs | Bloomsbury corporate partner contacts cross-referenced against CH register manually | Corporate connection recall |
| Known negative pairs | 10 pairs | Individuals from the existing network confirmed to share no trusteeship or directorship | Precision (false positive rate) |
| Known wealth indicators (Tier 2) | 15 individuals | Individuals with publicly documented major-gift capacity (e.g. published philanthropy, Rich List appearances, Sunday Times profiles) | Wealth-tier accuracy |
| Adversarial edge cases | 5 cases | See Edge Cases below | Robustness |

**Total gold set size:** ~70 records across all subsets.

**Assembly method:** Manual research by fundraising team and DPO; all ground truth facts sourced and documented before pipeline runs. Gold set stored in Postgres gold_set table; not accessible to pipeline agents during evaluation to prevent data leakage.

---

## Metrics and Targets

### Donor Dossier Accuracy

**Definition:** Fraction of factual claims in a delivered dossier that are correct and sourced, as verified by manual review against gold set ground truth.

**Target: ≥ 95%** [my estimate — consistent with high-stakes fundraising use case; allows for occasional data staleness in source registers]

**Measurement:** Random sample of 10 delivered dossiers; each factual claim checked against source URL. Incorrect or unsourceable claims counted as errors. Result: correct_claims / total_claims.

---

### Connection Precision

**Definition:** Fraction of reported trustee/director connections that are genuinely correct (not false positives from name collision or stale data).

**Target: ≥ 90%** [my estimate]

**Measurement:** All connections in the 20-pair gold set checked against manual research. false_positives / (true_positives + false_positives) must be ≤ 10%.

---

### Connection Recall — Tier 1

**Definition:** Fraction of known co-trusteeship pairs from the gold set that Tier 1 correctly identifies.

**Target: ≥ 85%** [my estimate — consistent with ~90–95% structural ceiling from `03_reliability_ceiling.md` minus operational factors: name resolution misses, CC data delay, alias handling]

**Measurement:** (gold set pairs found by TrusteeGraphAgent) / (total gold set pairs). Measured in Story 9.1.

---

### Connection Recall — End-to-End

**Definition:** Fraction of known co-trusteeship pairs that survive to a delivered dossier, accounting for ShortlistGate filtering.

**Target: ≥ 80%** [my estimate — acknowledges that some genuine qualified leads will be filtered at the ShortlistGate by human reviewers or by a conservative composite score threshold]

**Measurement:** (gold set pairs in delivered dossiers) / (total gold set pairs). Difference from Tier 1 recall reveals ShortlistGate attrition.

---

### Wealth-Tier Accuracy

**Definition:** Fraction of shortlisted leads where the confirmed wealth-band estimate (after Tier 2 Factary Phi enrichment) correctly categorises the individual's wealth band, as assessed against the gold set wealth indicators.

**Target: ≥ 85% for confirmed-band leads reaching Tier 2** [my estimate — applies only to leads where Factary returns a result; not a recall metric]

**Measurement:** For gold set wealth indicator subset (15 individuals): (correct band assignment) / (individuals with Factary result). Wealth band is correct if the estimate falls within one band of ground truth (e.g., "£5m–£10m" estimated when true band is "£3m–£7m" counts as correct given structural ceiling from `03_reliability_ceiling.md`).

---

### Hallucination Rate

**Definition:** Fraction of LLM-generated factual claims in dossiers that are not traceable to a source signal and are not present in any input data.

**Target: 0%** — no hallucinated facts permitted in any dossier.

**Measurement:** Manual review of 10 dossiers; any claim without a source_signal reference or that contradicts source data is a hallucination. One hallucination = test failure; investigate prompt and retest.

**Enforcement:** Job C SynthesisAgent system prompt must include explicit instruction: "Every factual claim must cite a signal ID from signals_used[]. If a claim cannot be sourced, write 'not found' — never infer or extrapolate." Sonnet and Haiku prompts in Tier 1 have the same constraint.

---

### ShortlistGate False Negative Rate

**Definition:** Fraction of gold set pairs that are genuine qualified leads but are rejected or scored below threshold at the ShortlistGate, causing them to be excluded from Tier 2 enrichment.

**Target: < 10%** — critical metric. Missing genuine qualified leads at the gate is the primary failure mode of the hybrid architecture.

**Measurement:** After each prototype run, compare the full gold set against the approved shortlist. (gold set pairs not in approved shortlist) / (total gold set pairs) must be < 10%.

**Remediation trigger:** If ShortlistGate false negative rate ≥ 10% in consecutive runs, lower composite_score threshold by 0.05 and retest. If pattern persists, investigate whether gold set profiles have systematically low Tier 1 signal (e.g., no charity footprint, no PSC role) and consider whether Strategy 3 alone or Strategy 5 is more appropriate.

---

### Time-to-Dossier

**Target (Tier 1 only):** ≤ 45 minutes from ingestion to ShortlistGate delivery for a batch of 100 records [my estimate — CH API rate limit of ~2 req/s × 3 endpoints × 100 records = ~9 minutes API time; processing headroom included]

**Target (Tier 2 addition):** Factary Phi adds 1–5 business days for lookup turnaround; Wealth-X adds 1–3 business days. End-to-end from ShortlistGate approval to delivered dossier: target ≤ 10 business days.

**Measurement:** Prefect task timestamps recorded; Tier 1 wall-clock time logged per batch; Tier 2 latency measured from ShortlistApproval to LeadDossier delivery.

---

### Cost per Dossier

**Target:** Within ±20% of COST.md figures — i.e., within £25.73–£38.59 at 100 records/month (base: £32.16)

**Measurement:** Monthly actuals tracked: Factary Phi licence pro-rata, Wealth-X pro-rata, Claude API token spend (from audit_log), web search API spend. Total divided by dossiers delivered.

---

## Test Methodology

**Unit tests:** Each agent (CompaniesHouseAgent, TrusteeGraphAgent, GrantNavAgent, PropertyAgent, WebSearchAgent) has unit tests using recorded API responses (pytest fixtures). Tests cover: normal response, rate limit 429, empty result, name collision, malformed JSON.

**Integration tests:** Tier1Orchestrator run against a 5-record test fixture with known outputs; compare Tier1EnrichmentResult against expected values.

**ShortlistScorer tests:** 10 synthetic Tier1EnrichmentResults with known expected scores (including edge cases: high co-trusteeship density but adverse flag; low score but manual override). Verify composite_score and shortlisted flag.

**End-to-end prototype evaluation:** Run gold set through full pipeline; measure all six metrics above. Results documented in a one-page evaluation report per Story 9.1 and 9.2.

**Regression suite:** After each code change, run the 5-record integration fixture and verify no metric degrades more than 5% from baseline.

---

## Edge Cases

### 1. Leads filtered at ShortlistGate that should have passed

**Scenario:** A genuine Bloomsbury-aligned prospect has no charity trusteeships (they donate but do not serve as trustees), no PSC role (they are an LP in a private equity fund, below the 25% threshold), and no honours. Their composite_score is 0.40, below the 0.65 threshold. They are a mid-tier HNW individual (£3m–£5m) who would be a strong cultivation target but never reaches Tier 2.

**Test:** Include 2–3 such profiles in the gold set. Measure ShortlistGate false negative rate. If these profiles are systematically missed, consider: lowering threshold for specific sectors (finance, property), adding a manual override pathway in the ShortlistGate for fundraiser-nominated candidates (covered in Story 3a.1).

### 2. Factary returns no record

**Scenario:** A shortlisted lead has no verifiable public giving history. Factary Phi returns an empty result. The WealthConfirmer receives no Tier 2 donation data.

**Test:** Include 2 known low-profile leads in the Tier 2 prototype run. Verify: pipeline does not stall; factary_no_record flag is set; WealthConfirmer proceeds with Tier 1 data only; Job C dossier states "no UK philanthropic giving record found in Factary Phi"; wealth_confirmation_confidence is low (< 0.5), triggering uncertainty review if wealth proxies are also absent.

### 3. Double-counting when donor appears in their own network

**Scenario:** A Bloomsbury trustee (e.g., a board member who is themselves a donor) is included in the pipeline as a record. They have extensive co-trusteeship connections with themselves (they are in the Bloomsbury CC register entry) and their own corporate roles are returned as "connections."

**Test:** Include 2 Bloomsbury trustees in the gold set. Verify: self-connections (donor appearing in their own trustee list for Bloomsbury) are excluded from trustee_connections[]; own-company roles are excluded from cross-company network; ShortlistScorer does not artificially inflate co_trusteeship_density from self-references. Assert no circular reference in the Tier1EnrichmentResult for these records.

### 4. Entity resolution failure — common name

**Scenario:** A donor named "James Bennett" matches 47 Companies House officer records. The correct individual is a director of a specific company but the name match returns multiple plausible candidates.

**Test:** Include 2 common-name donors in the gold set. Verify: WealthConfirmer's entity_resolution_confidence < 0.85 for these records; records routed to uncertainty_queue; human reviewer can select the correct record; resolved record has entity_resolution_confidence recalculated at ≥ 0.85 after resolution.

### 5. Adverse flag from Sanctions List on shortlisted lead

**Scenario:** A candidate is shortlisted by Tier 1 (high co-trusteeship density, PSC wealth indicator) but also appears on the UK Sanctions List.

**Test:** Include 1 synthetic record with a sanctions flag in the test fixture. Verify: adverse_flag = true is set by WebSearchAgent (or dedicated sanctions check); record does not advance to ShortlistQueue regardless of composite_score; AuditLogEntry records the adverse flag with source_url pointing to UK Sanctions List entry.

---

## Exit Criteria

The prototype is declared successful and ready for production if all of the following are met after Phase 2 evaluation:

| Criterion | Target | Measured by |
|---|---|---|
| Co-trusteeship recall (Tier 1) | ≥ 85% | Story 9.1 |
| End-to-end recall | ≥ 80% | Story 9.2 comparison |
| Connection precision | ≥ 90% | Manual review |
| Dossier accuracy | ≥ 95% | Manual review |
| Hallucination rate | 0% | Manual review |
| ShortlistGate false negative rate | < 10% | Story 9.2 |
| Wealth-tier accuracy (confirmed-band leads) | ≥ 85% | Story 9.2 |
| Time-to-dossier Tier 1 | ≤ 45 minutes / 100 records | Prefect timestamps |
| Blended cost/dossier | ≤ £35 | Story 9.2 actuals |
| Zero sanctions-flagged records advancing | Pass/fail | Adverse edge case test |

If any criterion fails, the failure is documented, root cause identified, and a single remediation cycle attempted. If a second failure occurs on the same criterion, the strategy is escalated to the decision gate in PROTOTYPE_SCOPE.md.
