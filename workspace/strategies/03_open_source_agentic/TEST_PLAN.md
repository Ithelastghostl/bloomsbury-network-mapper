# Test Plan: Strategy 3 — Open-Source Agentic Pipeline

**Version:** 1.0 | **Date:** 2026-05-05

---

## 1. Gold Set Design — Week 1 Priority

The gold set must be built in **week 1 of the prototype** before any pipeline code is written that touches enrichment logic. Building the gold set first prevents confirmation bias (the pipeline being tuned to match what it already found).

### Construction method

1. Select 20–30 donors from Bloomsbury's existing known network (trustees, named supporters, corporate partners).
2. For each donor, a **human researcher** manually compiles the ground truth using:
   - Direct Charity Commission register search (charity numbers confirmed by human)
   - Direct Companies House search (officer_id confirmed by human)
   - 360Giving GrantNav manual query
   - UK Sanctions List manual check
3. Ground truth is written to `tests/gold_set/DONOR_ID.json` with the following fields:

```json
{
  "donor_id": "string (anonymised ID)",
  "known_trusteeships": [
    {"charity_number": "string", "charity_name": "string", "status": "current|former"}
  ],
  "known_co_trustees": [
    {"co_trustee_name": "string", "shared_charity_number": "string"}
  ],
  "known_ch_officer_id": "string?",
  "known_directorships": [
    {"company_number": "string", "company_name": "string", "status": "active|resigned"}
  ],
  "known_psc_records": [
    {"company_number": "string", "nature_of_control": ["string"]}
  ],
  "known_grants": [
    {"funder_name": "string", "amount_gbp": "number", "date": "string"}
  ],
  "sanctions_flag": "boolean",
  "wealth_tier_ground_truth": "confirmed_5m|probable_5m|insufficient_signal|unknown",
  "wealth_tier_basis": "string",
  "notes": "string"
}
```

4. Gold set is locked (read-only) before pipeline development begins. Changes require a new gold set version, not edits to existing records.

### Gold set composition requirements
- ≥ 5 donors with at least 3 known co-trustee connections each (tests high-recall trustee path)
- ≥ 3 donors with known CH directorships
- ≥ 2 donors with common names (high collision risk)
- ≥ 1 donor with a PSC record (to test confirmed wealth scoring)
- ≥ 1 donor with zero CC trusteeships (tests graceful empty-result handling)
- ≥ 1 donor with a dormant company in their appointment history
- ≥ 1 donor with a name that matches a sanctions entry (synthetic or real public case — for SanctionsAgent testing only; not used in production dossiers)

---

## 2. Metrics and Thresholds

| Metric | Target | Minimum (exit criterion) | Notes |
|---|---|---|---|
| Donor dossier accuracy | ≥ 95% | 95% | Sourced claims verified against gold set; accuracy = correct sourced claims / total sourced claims |
| Connection precision | ≥ 90% | 90% | Precision = true positive connections / (true positive + false positive) |
| **Connection recall** | **≥ 85%** | **85%** | **Recall = true positive connections / (true positive + false negative); this is the strategy's primary strength — see R3 §1** |
| Wealth-tier accuracy (estimated band) | ≥ 60% | 50% | Accuracy = correct wealth_tier / total assessed; this strategy cannot hit 85% — structural ceiling [R3 §4] acknowledged |
| Hallucination rate | 0% | 0% | Any fabricated claim (not traced to source_url) = immediate pipeline halt |
| Time-to-dossier (automated steps) | ≤ 45 min median | ≤ 60 min | Excludes human review wait time and 24h batch API latency; API calls dominate timing |
| Cost per dossier (Job A + B) | £15.30 ± 20% | — | £12.24–£18.36; compare to COST.md [R6] |
| Sanctions screening false negative rate | 0% | 0% | Any missed sanctions hit = immediate pipeline halt and root cause analysis |

### Notes on wealth-tier accuracy ceiling
The 60% target is honest and intentional. As established in R3 §4, there is no UK open-source route to confirm £5M+ net worth for the £5M–£30M band. The PSC register is deterministic only above the 25% ownership threshold and only for corporate equity. Probabilistic scoring based on roles, property, and grant scale cannot be validated against ground truth for most individuals because no independent verification exists. A 60% accuracy target for _estimated band_ (i.e., "the pipeline correctly identifies the rough wealth tier") is the realistic ceiling for this strategy. Strategies 1 and 5 achieve 30–55% [R7] through specialist judgment; Strategy 3 targets 60% specifically because its PSC deterministic layer gives a narrow but reliable foundation.

---

## 3. Test Methodology

### 3.1 Unit tests (per agent)
Each agent has an independent test suite using recorded API responses (VCR cassettes) so tests run offline without hitting live APIs:

- `TrusteeGraphAgent`: mock CC API responses; assert TrusteeGraphResult schema validity; assert co-trustee adjacency list completeness against gold set
- `CompaniesHouseAgent`: mock CH API responses at 600 req/5min limit; assert rate-limit backoff fires correctly on 429; assert PSC records parsed correctly
- `GrantNavAgent`: test against locally cached GrantNav CSV fixture; assert zero-result case handled
- `SanctionsAgent`: test against UK Sanctions List fixture with known hits and misses; assert ≥ 0.90 threshold blocks processing
- `WebSearchAgent`: test against mock Serper.dev responses; assert source_url is required for every extracted claim; assert unsourced claims are suppressed
- `EntityResolutionAgent`: test name disambiguation logic; assert common-name collision triggers human review; assert confidence < 0.85 routes to review queue

### 3.2 Integration tests (end-to-end pipeline)
Run on 5 gold-set records with live API calls (requires CH and CC API keys):
- Assert end-to-end pipeline completes within 45 minutes
- Assert output JSON validates against all data contracts
- Assert human review files are generated correctly
- Assert audit log contains entries for every pipeline stage

### 3.3 Gold-set evaluation (prototype milestone)
Run on full 20–30 gold-set records; compute recall, precision, accuracy, and hallucination rate:
- Connection recall computed per donor; report median and minimum
- Hallucination rate: manually review all sourced claims in 5 randomly selected dossiers; check each source URL
- Wealth-tier accuracy: compare pipeline output to gold-set ground truth for all records with known wealth tier

### 3.4 Regression tests
Automated gold-set evaluation on every CI run (Story 9.3):
- 10 gold-set records included in every pipeline run as hidden test cohort
- Recall and hallucination rate computed and compared to thresholds
- Regression alert if recall drops below 85% or any hallucination detected

---

## 4. Edge Cases Specific to Open-Source Pipeline

| Edge case | Test description | Expected behaviour |
|---|---|---|
| Donor with zero CC trusteeships | Gold-set record with no charity register entries | TrusteeGraphResult returns empty trustee_roles list; no error; dossier section states "no trustee roles identified" |
| Dormant company in CH history | Gold-set record with resigned director role at dissolved company | CompaniesHouseAgent records role with `status: resigned`; dossier includes historical role with dissolution date |
| PSC below 25% threshold | Gold-set record known to hold 20% stake (not on PSC register) | PSC result returns no record; dossier explicitly states "PSC register gap — equity stake below 25% threshold or structured below threshold" — not "no significant ownership" |
| Common-name collision (e.g., "John Smith") | Gold-set record with name matching > 20 CH/CC entries | EntityResolutionAgent flags `common_name_collision: true`; routes to human review; no auto-resolution attempted |
| CC API unavailable (5xx) | Mock CC API returning 503 | TrusteeGraphAgent falls back to bulk download; fallback logged; pipeline continues |
| CH rate limit breach (429) | Mock CH API returning 429 after N requests | CompaniesHouseAgent backs off exponentially; no silent skip; retries up to 5 times; dead-letters if still failing |
| Sanctions list match at 0.88 similarity (below threshold) | Name similar but not above 0.90 threshold | No block; match recorded as low-confidence candidate in SanctionsResult; surfaced in adverse signals section of dossier for human review |
| GrantNav CSV unavailable at download | Mock download returning 404 | GrantNavAgent logs failure; pipeline continues without grant data; dossier notes "360Giving data unavailable at time of enrichment" |
| Web search returns adversarial content (e.g., SEO-optimised misinformation) | Mock Serper.dev returning low-quality results | WebSearchAgent assigns `confidence: low`; all low-confidence web results require source_url and are labelled "unverified web source" in dossier |
| Donor with no web presence | Gold-set record of a genuinely private individual | WebSearchAgent returns zero results; dossier states "no web signals found"; pipeline does not hallucinate to fill gaps |

---

## 5. Exit Criteria

The prototype passes if **all** of the following are met:

1. Connection recall ≥ 85% on the full 20–30 gold-set cohort
2. Connection precision ≥ 90%
3. Donor dossier accuracy ≥ 95%
4. Hallucination rate = 0% across all manually reviewed dossiers
5. Time-to-dossier ≤ 45 minutes median across the test cohort (automated steps)
6. Cost per dossier within ±20% of £15.30 [R6]
7. At least 3 complete Job C dossiers produced; all correctly label £5M+ as confirmed or probable
8. All edge cases in §4 produce the expected behaviour

The prototype fails if **any** of the following occur:

- Connection recall < 85% (strategy's primary strength not demonstrated)
- Any hallucination detected in manually reviewed dossiers
- Any sanctioned individual passes through the pipeline without a block
- £5M+ confirmed and £5M+ probable are conflated in any dossier
- Time-to-dossier exceeds 60 minutes median

### On failure

- Recall < 85%: diagnose whether failure is in entity resolution, CC API coverage, or bulk download freshness; fix before declaring prototype complete
- Hallucination detected: pause all dossier output; revise prompts; re-run full gold set; require two consecutive clean runs before re-enabling
- Cost > 20% above estimate: review token consumption per agent; optimise prompt lengths or switch to batch API for all eligible jobs
