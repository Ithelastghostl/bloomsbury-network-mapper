# Test Plan: Strategy 2 — Commercial API Stack + Claude Synthesis

## Gold Set Design

The gold set comprises 20 records selected to cover the distribution of prospect types likely in Bloomsbury Football Foundation's pipeline. Ground truth for each record is established by a human researcher before testing; pipeline output is compared to ground truth.

### Composition

| Group | N | Characteristics | Purpose |
|---|---|---|---|
| A — Known UHNWI (>$30m) | 5 | Individuals with confirmed Wealth-X profiles; US philanthropy footprint; public corporate roles | Validate Wealth-X integration; test precision on best-case commercial data |
| B — UK HNW, no US footprint | 5 | Individuals with UK wealth indicators (PSC stake, high-value property indicator, Factary Phi record) but no US philanthropy and not in Wealth-X | Validate UK signal stack; confirm US bias warning fires correctly |
| C — Minimal footprint | 5 | Individuals with no CH directorship, no CC trusteeship, no honours, no Factary record | Establish floor: pipeline must produce sparse-but-accurate dossier, not fabricate |
| D — Edge cases | 5 | See below | Stress-test entity resolution and specific failure modes |

### Group D Edge Cases

| Record | Scenario | What is being tested |
|---|---|---|
| D1 | Common name: "James Bennett" (same as Bloomsbury's Director of Marketing) | Entity resolution collision; must escalate, not merge |
| D2 | Individual with a Bloomsbury trustee as a co-trustee on an unrelated charity | Network connection detection; path to Bloomsbury |
| D3 | Donor with no US philanthropy footprint AND net worth below $30m (£5m–£10m estimated) | Both DonorSearch and Wealth-X return not_found; `us_bias_warning = true`; Factary Phi is sole commercial signal |
| D4 | PEP: individual with a formal public role (e.g., former elected official) | PEP indicator detection from public role data |
| D5 | Individual with an adverse media item (sourced from commercial data) | Adverse media synthesis; zero fabrication |

### Ground Truth Establishment

For each gold set record, a human researcher establishes:
- All known corporate roles (from CH, confirmed by researcher)
- All known trusteeships (from CC, confirmed by researcher)
- Known philanthropy history (from Factary Phi, researcher-verified)
- Correct wealth band with label (verified / vendor estimate / my estimate)
- Sanctions status (clear / match)
- Known network connections to Bloomsbury trustees (hops, via what entity)

Ground truth is stored in `tests/gold_set/` as JSON files; not included in pipeline input.

---

## Metrics with Thresholds

### 1. Donor Dossier Accuracy
**Definition:** Fraction of claims in the pipeline output that match ground truth (correct claim present, correct source cited, correct confidence label applied).
**Threshold:** ≥ 95% [my estimate — this is a production-quality target; prototype acceptance threshold may be lower, see PROTOTYPE_SCOPE.md]
**Measurement:** For each dossier, count correct claims / total claims. Incorrect source citation counts as an error. Missing claim (false negative) is scored separately under recall.

### 2. Connection Precision
**Definition:** Of the network connections listed in the output dossier, what fraction are genuine connections (confirmed in ground truth)?
**Threshold:** ≥ 90% [my estimate]
**Measurement:** For each connection listed in `network_connections`, check against ground truth. False positive = connection listed but not genuine. Precision = TP / (TP + FP).

### 3. Connection Recall — Commercial Tier
**Definition:** Of the genuine connections known in ground truth, what fraction does the pipeline find?
**Target:** ~50–65% [my estimate — informed by 03_reliability_ceiling.md: US vendor UK coverage gap means recall is structurally limited; CC/CH recall ~90% for formal roles but donation-history connections are rarely surfaced]
**Measurement:** Recall = TP / (TP + FN) across all 20 records.
**Note:** This target deliberately acknowledges the US vendor UK coverage gap. A recall of 50–65% means roughly half of known connections are found by the automated pipeline; the remainder require human researcher input. This is not a pipeline defect — it reflects the structural ceiling documented in 03_reliability_ceiling.md.

### 4. Wealth-Tier Accuracy
**Definition:** Accuracy of the wealth band assignment relative to ground truth.
Two sub-metrics:
- **Confirmed accuracy (records where ground truth has verified evidence):** ≥ 85% [my estimate]
- **Estimated accuracy (records where ground truth is itself an estimate):** ≥ 60% [my estimate — structural ceiling from 03_reliability_ceiling.md applies; no architecture resolves this]
**Measurement:** Band within one tier (e.g., outputting "5m-30m" when truth is "1m-5m" counts as off-by-one; outputting "30m+" when truth is "1m-5m" counts as a two-tier error). Target is exact or off-by-one match for confirmed; exact, off-by-one, or no-claim for estimated.
**Label check:** Every wealth estimate must carry the correct confidence label (`[verified]`, `[vendor_estimate]`, or `[my_estimate]`); wrong label is counted as an error.

### 5. Hallucination Rate
**Definition:** Any claim in a pipeline output dossier for which no corresponding source signal exists in the RawSignals table for that job_id.
**Threshold:** 0% — zero tolerance [my estimate — hallucinated claims in a fundraising dossier could lead to a misdirected gift approach or reputational harm to the charity]
**Measurement:** Automated check: for every string claim in the output dossier, verify that `source_signal_id` is non-null and that the referenced RawSignal is present in Postgres. Any claim without a traceable source is a hallucination.
**Failure action:** If hallucination rate > 0% in any test run, the pipeline does not proceed to production. The SynthesisAgent prompt is revised and the full gold set re-run before re-evaluation.

### 6. Time-to-Dossier (Automated Steps Only)
**Definition:** Elapsed time from job submission to dossier ready for Checkpoint 3 review, excluding time spent waiting for human review decisions.
**Target:** ≤ 30 minutes [my estimate — suitable for a same-day or next-morning fundraiser workflow; Job C Batch API may add up to 24h latency, which is excluded from this target]
**Measurement:** Timestamps in AuditLogger: `donor_submitted` → `dossier_ready_for_review`. Human-decision wait time excluded.
**Note:** Job C Batch API latency of up to 24h is by design and does not count against this target. The 30-minute target applies to Jobs A and B (entity resolution + fan-out + synthesis + wealth scoring).

### 7. Cost per Dossier
**Target:** Within ±20% of base case from COST.md
**Base cases:**
- 100 records/month: £36.42/dossier [my estimate — from 06_cost_models.md]
- 400 records/month: £9.55/dossier [my estimate — from 06_cost_models.md]
**Measurement:** Actual Anthropic API invoice for the test run + prorated vendor licence cost. Compare to COST.md projection.
**Tolerance bands:**
- £36.42 ±20% = £29.14 – £43.70 at 100 records
- £9.55 ±20% = £7.64 – £11.46 at 400 records

---

## Test Methodology

### Unit tests
- EntityResolver: test name normalisation, DOB scoring, confidence calculation against known CH/CC records
- WealthScorer: test rubric against synthetic DossierDrafts covering all routing scenarios
- Transfer mechanism gate: test that US vendor calls are blocked when `transfer_mechanism = none`
- Schema validation: test all 7 data contracts against valid and invalid inputs

### Integration tests
- CH API integration: live call against known officer ID; verify RawSignal schema
- CC API integration: live call against known trustee name; verify related charities returned
- 360Giving lookup: verify known grant recipient appears in pre-loaded CSV
- DonorSearch mock: test against vendor-provided test credentials before live data
- Wealth-X mock: same
- Claude Sonnet synthesis: test against a fixed set of RawSignals; verify source_signal_id present in all claims
- Claude Opus Job C: test against a fixed set of qualifying leads; verify capacity narrative structure

### End-to-end gold set test
- Run all 20 gold set records through full pipeline
- Compare output to ground truth JSON files
- Compute all 7 metrics above
- Flag any hallucination (automated) and any claim without source (automated)

### Regression tests
- After any change to models, prompts, or API integrations, re-run gold set
- Metrics must not degrade below thresholds; hallucination count must remain 0

---

## Edge Cases

| Scenario | Expected behaviour |
|---|---|
| Donor with no US philanthropic footprint (Group B, D3) | DonorSearch returns not_found; `us_bias_warning = true`; dossier produced from UK sources only; no fabrication |
| Common-name collision (D1: "James Bennett") | EntityResolver confidence < 0.85; Checkpoint 1 escalation; pipeline halted for fan-out until human selects correct match |
| Donor on UK Sanctions List | Sanctions match flagged in DossierDraft; Job C synthesis includes explicit sanctions flag; Checkpoint 3 review required |
| Wealth-X returns profile below $30m threshold | Profile included with note "Wealth-X coverage is strongest above $30m; estimate may be unreliable"; label = `vendor_estimate` |
| CC API unavailable (timeout after 60s) | RawSignal stored with `error = "timeout"`; synthesis proceeds without CC signal; absence noted in dossier |
| DonorSearch API unavailable | Same as above; `us_bias_warning = true`; no retry beyond configured max_retries |
| All commercial vendors return not_found (Group C + D3) | Dossier produced from free UK sources only; wealth band set to `unknown`; no fabricated wealth claim |
| Donor submits opt-out flag | Record archived immediately; no API calls made; audit log entry written; dossier never produced |
| Record with conflicting DOB between CH and DonorSearch | SynthesisAgent escalated to Claude Opus; conflict noted in dossier with both sources cited; no resolution without human confirmation |
| Bulk import with one invalid row | That row rejected with 422; all other rows proceed; summary shows 1 rejected |

---

## Exit Criteria

All of the following must be true before the prototype is declared complete:

1. All 20 gold set records processed end-to-end without unhandled exceptions.
2. Hallucination rate = 0% across all 20 records (automated check passing).
3. Dossier accuracy ≥ 95% on records from Groups A and B (where commercial data is expected to return results).
4. Entity resolution: 0 wrong merges; all Group D edge cases escalated correctly.
5. Transfer mechanism gate: confirmed blocking US vendor calls in test (Story 1.3 integration test passing).
6. Cost per dossier within ±20% of COST.md base case (measured over 20-record run).
7. All 7 audit event types present in `audit_events` table for each processed record.
8. Checkpoint 1 and Checkpoint 3 review files generated correctly; pipeline resumes after human decision.
9. Vendor coverage report (Story 4.4) or equivalent manual tally showing what fraction of records returned results from each vendor — to support the prototype decision gate.
10. Director of Fundraising and DPO have signed off on the prototype run (Checkpoint 3 sign-off on at least one dossier from each of Groups A–D).
