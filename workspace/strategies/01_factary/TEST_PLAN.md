# Test Plan — Strategy 1: Factary Outsourced

---

## Gold Set Design

### Purpose
The gold set is a curated collection of 10–20 donor records with independently verifiable outcomes. It is used to measure every metric below. Assembly is a Week 1 priority — no metric can be calculated without it.

### Fields required per gold-set record

| Field | Purpose |
|---|---|
| name (first, last) | Record identity |
| postcode | Matching and deduplication |
| donation_history | Confirm donation fields are not embellished by vendor |
| known_wealth_indicators | At least one independently verifiable wealth signal (e.g., a confirmed PSC stake, a named property purchase, an honour) |
| known_philanthropy_gifts | At least one publicly documented gift (from Factary Phi, charity press release, or 360Giving) |
| known_trustee_roles | At least one CC-verifiable trustee role |
| known_company_roles | At least one CH-verifiable directorship |
| ground_truth_capacity_band | Researcher's best estimate band: '<1m' / '1m-5m' / '5m-30m' / '>30m' |
| adverse_flag_status | Known sanctions / PEP / adverse media status (even if negative) |
| consent_metadata | Valid LIA ref and privacy notice version |

### How to assemble the gold set

1. Start with Bloomsbury's existing named donors and trustees where consent and LIA are already documented (Gary Lubner / Stuart Roden tier from 01_context.md §6 are natural calibration anchors if consent is confirmed).
2. Add 5–10 records of individuals with a strong public footprint (named in 360Giving data, Companies House as PSC, or GOV.UK honours list) to test completeness of Factary's coverage.
3. Add 3–5 records of individuals with a deliberately thin public footprint to test how Factary handles low-signal cases.
4. For each record, manually confirm the ground truth using: Charity Commission register, Companies House officer search, 360Giving GrantNav, GOV.UK Honours archive, and a targeted web search. Document each verification with a URL and access date.
5. Flag the gold set as a restricted file (`gold_set/RESTRICTED_DO_NOT_EXPORT.json`) — it must not be included in any Factary batch submission, as it is used for independent verification only.

**Target: 20 records. Minimum viable gold set: 10 records (5 high-footprint, 3 medium, 2 thin).**

---

## Metrics with Pass/Fail Thresholds

### 1. Donor dossier accuracy

**Definition:** For each gold-set record returned by Factary, the proportion of independently verifiable factual fields that are correct (name, role title, organisation name, honour type, property address). Fields that cannot be independently verified are excluded from the denominator.

**Pass threshold:** ≥ 95% of verifiable fields correct across all 20 gold-set dossiers.
**Fail threshold:** < 90% triggers an escalation to Factary before processing any live batch.

**Measurement method:** Researcher manually cross-checks each factual field in the returned dossier against the gold-set ground truth. Discrepancies logged with field name, Factary's stated value, and verified value.

---

### 2. Connection precision

**Definition:** Of the NetworkCandidates extracted from a gold-set dossier, the proportion that represent genuine connections (i.e., the named individual and the gold-set subject do have the stated relationship, confirmed against CC/CH/public sources).

**Pass threshold:** ≥ 90% of extracted NetworkCandidates are genuine connections.
**Fail threshold:** < 85% indicates that Factary is including speculative or unverified relationships; flag for vendor review.

**Measurement method:** Researcher cross-checks each NetworkCandidate's `shared_entity` and `connection_type` against Charity Commission trustee data and Companies House officer appointments for the gold-set subject.

---

### 3. Connection recall

**Definition:** Of the connections the researcher independently identifies for a gold-set record (from CC, CH, 360Giving), the proportion that appear in Factary's returned dossier.

**Strategy 1 target:** ~70–80% [my estimate — Factary uses the same underlying registers plus proprietary supplements; structural ceiling on biographical connections remains].

**Pass threshold:** ≥ 70% recall across gold-set records with ≥3 independently verifiable connections.
**Fail threshold:** < 60% for a vendor that is supposed to cover the full UK register set; raise with Factary.

**Measurement method:** Researcher compiles the independent connection list for each gold-set record, then checks what fraction appears in the Factary dossier.

---

### 4. Wealth-tier accuracy

**Definition:** For gold-set records where a ground-truth capacity band has been established, the proportion of Factary's returned capacity bands that match.

**Pass thresholds (two-tier):**
- Confirmed wealth indicators (property price data, PSC stake with published company valuation): ≥ 85% of returned bands match ground truth within one band.
- Estimated wealth indicators (occupational proxies, honour signals, philanthropy scale): ≥ 60% of returned bands match ground truth within one band.

**Fail threshold:** < 80% confirmed / < 50% estimated. Indicates the wealth-banding methodology is not calibrated to the Bloomsbury prospect profile.

**Measurement method:** Compare `value_band` on each `wealth_indicator` against the gold-set `ground_truth_capacity_band`. "Within one band" means a '5m-30m' estimate for a '>30m' ground truth is a near-miss, not a fail.

---

### 5. Hallucination rate

**Definition:** The proportion of factual fields in returned dossiers (after Claude Haiku structuring in Story 2.3) that contain information not present in the Factary source text — i.e., content introduced by the LLM rather than extracted from the vendor's output.

**Pass threshold:** 0%. No hallucinated fields in any dossier.
**Fail threshold:** Any single hallucinated field in a dossier is a critical failure — the dossier is suppressed until the extraction prompt is fixed and the batch is re-ingested.

**Measurement method:** For each structured field in `EnrichedDonor`, compare against the raw Factary source text (PDF or CSV). Any field populated in the JSON that has no corresponding text in the source is a hallucination. The extraction prompt must instruct Claude to set fields to null when absent, never to infer.

**Note:** This metric applies to Claude's extraction step only, not to Factary's research methodology. Factary's own research may contain inaccuracies (measured by dossier accuracy above), but those are vendor accuracy issues, not hallucinations.

---

### 6. Time-to-dossier

**Definition:** Calendar days from `export.py` completing the batch package to `ingest.py` receiving the returned dossier ZIP from Factary.

**Pass threshold:** ≤ 10 business days [my estimate — UK managed prospect research sector norm; no published Factary SLA found at access date 2026-05-05].
**Fail threshold:** > 15 business days for a standard batch of 100 records or fewer. Triggers an SLA escalation clause in the DPA.

**Measurement method:** Compare `batch_submissions.exported_at` timestamp against `enriched_donors.ingested_at` timestamp after first ingest run. Report in business days (Mon–Fri, excluding UK bank holidays).

---

### 7. Cost per dossier

**Definition:** Total monthly spend (retainer + per-record fees + internal coordinator time) divided by number of dossiers received and accepted at Checkpoint 1.

**Pass threshold:** Within ±20% of the base case £36.87/dossier at 100 records/month [06_cost_models.md, Strategy 1, 100 records/month scenario, verified against vendor estimate midpoints].
**Fail threshold:** > £44.24/dossier (base × 1.20) at 100 records/month triggers a cost review with the vendor.

**Measurement method:** Track invoiced retainer and per-record fees monthly. Add internal coordinator time at £3,333/month × 0.25 FTE = £833/month [my estimate, per 06_cost_models.md]. Divide by accepted dossier count. Compare to base case.

---

## Test Methodology

**Phase 1 — Pilot batch (Weeks 1–6):**
- Week 1: Assemble gold set (20 records); confirm consent and LIA for each.
- Week 2–3: Build v1 tooling (Stories 1.1–9.3 per PROTOTYPE_SCOPE.md).
- Week 4: Submit first batch to Factary (gold set plus live records, if consent confirmed).
- Week 5–6: Receive returns; run ingest; measure all 7 metrics against gold set.

**Phase 2 — Steady-state monitoring:**
- Every batch: run `status.py --batch-id` and confirm metrics 5 (hallucination) and 7 (cost).
- Monthly: spot-check 3 random dossiers from each batch for dossier accuracy and connection precision.
- At 3-month review: recalculate all metrics across full batch history; compare to thresholds.

**Tool for tracking:** `tests/gold_set_evaluator.py` (to be written as part of the prototype build). Takes a gold set JSON and an ingested batch ID, computes all 7 metrics, and writes a markdown report.

---

## Edge Cases

| Edge case | Expected behaviour | Test approach |
|---|---|---|
| Donor record with no public footprint (thin profile) | Dossier returned with `dossier_quality = 'thin'`; wealth indicators array is empty; no null fields populated | Include 2–3 thin gold-set records; verify Factary returns a thin dossier rather than a fabricated one |
| Name clash (two people with same name in batch) | Factary returns separate dossiers; ingest matches by name+postcode; unmatched records flagged | Include 2 gold-set records with the same surname; verify correct matching |
| Donor on UK Sanctions List | `adverse_flags.sanctions_hit = true`; record is flagged at Checkpoint 2 and blocked from sign-off | Include one gold-set record known to be sanctions-free; confirm `sanctions_hit = false`. Add a synthetic test case with a known sanctions name (not a real donor) to test the flag path in isolation |
| Donor who has opted out before submission | `submit.py` rejects the record with 403 error | Story 1.2 AC3; test with a record where `opt_out_date` is set |
| Consent metadata with unknown privacy notice version | Submit rejected with 422 | Story 1.2 AC2; test with an invalid version string |
| Factary returns a dossier for a record not in the batch | Dossier written to `unmatched_YYYYMMDD/`; Checkpoint 1 reviewer notified | Story 2.4; simulate by including an extra dossier in the test ingest ZIP |
| Claude Haiku populates a field from inference rather than source text | Hallucination rate > 0%; ingest pipeline must catch this in post-processing check | Deliberately include a gold-set record where Factary's source PDF mentions no property holdings; verify `wealth_indicators` is empty after ingest |

---

## Exit Criteria

The prototype is ready for the v2 investment decision when:

1. All 7 metrics have been measured against at least one full batch of ≥20 gold-set records.
2. Hallucination rate = 0% across all ingested gold-set dossiers.
3. Donor dossier accuracy ≥ 95% and connection precision ≥ 90% against gold set.
4. At least one complete end-to-end run has been observed: submit → export → ingest → qualify → dossier → sign-off → output CSV.
5. All three human checkpoints have been exercised with at least one 'proceed', one 'send_back', and one 'suppress' decision recorded in the audit log.
6. `compliance.py --batch-id` has been run and all Article 14 notice due dates are within the 30-day window.
7. DPIA and LIA are completed and stored as PDFs in `compliance/` folder.
8. Decision gate criteria from PROTOTYPE_SCOPE.md have been evaluated and documented.
