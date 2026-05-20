# Prototype Scope: Strategy 2 — Commercial API Stack + Claude Synthesis

## Goal

Prove that the commercial API stack (DonorSearch + Wealth-X + Factary Phi + free UK APIs, synthesised by Claude) produces accurate, sourced dossiers for N/M test donors from a 20-record gold set, meeting the accuracy and hallucination thresholds defined in TEST_PLAN.md, within the cost envelope defined in COST.md.

Success criterion: ≥14/20 gold set records produce a substantially complete dossier (at least three sourced signals) with zero hallucinations and cost per dossier within ±20% of the COST.md base case (£36.42 at 100 records/month).

---

## In Scope

The prototype covers the minimum path from ingest to human-reviewed dossier for the 20-record gold set.

| Story | Description |
|---|---|
| 1.1 | Donor record ingest (JSON only; CSV deferred) |
| 1.2 | Consent metadata capture |
| 1.3 | US vendor transfer mechanism gate |
| 2.1 | Entity resolution (Claude Haiku) |
| 2.2 | Companies House fan-out |
| 2.3 | Charity Commission fan-out |
| 2.4 | 360Giving + UK Sanctions List fan-out (pre-loaded CSVs) |
| 2.5 | DonorSearch API fan-out |
| 2.6 | Wealth-X fan-out |
| 2.7 | Job A synthesis (Claude Sonnet) |
| 3.1 | Wealth scoring rubric |
| 3.2 | Routing to Job C or archive |
| 4.1 | DonorSearch score normalisation |
| 4.2 | Wealth-X net worth integration |
| 4.3 | Factary Phi manual CSV import |
| 5.1 | Checkpoint 1: entity resolution review |
| 5.3 | Checkpoint 3: final sign-off |
| 6.1 | Job C Opus synthesis (Batch API) |
| 7.1 | Audit log (append-only) |
| 8.1 | Gold set test harness |
| 8.2 | Entity resolution collision tests |

---

## Out of Scope (Prototype)

| Story | Deferred reason |
|---|---|
| 1.4 | CSV bulk ingest — JSON sufficient for 20-record gold set |
| 4.4 | Vendor coverage audit report — useful only at volume |
| 5.2 | Checkpoint 2 uncertainty review — simplified: borderline records go directly to Checkpoint 3 in prototype |
| 6.2 | Adverse media synthesis — deferred; placeholder "No adverse media source in v1" |
| 7.2 | DSAR endpoint — deferred to v2; records small enough to handle manually in prototype |
| 7.3 | Automated retention enforcement — deferred; manual retention review acceptable for 20 records |
| 9.1 | Runbook — deferred until pipeline stable |
| 9.2 | Vendor DPA checklist integration into pipeline startup — manual checklist in COMPLIANCE.md for prototype |
| HMLR Price Paid / OSCR / CCNI | All deferred to v2 |
| Honours Lists scraping | Deferred to v2; manually added to RawSignal if available |
| CRM integration | Not in scope |
| BoardEx / RelSci / WealthEngine / LexisNexis | Explicitly on kill list for v1 |

---

## Definition of Done

1. **Pipeline runs end-to-end** for all 20 gold set records without unhandled exceptions.
2. **Accuracy:** ≥14/20 records produce a substantially complete dossier (≥3 sourced signals); measured against gold set ground truth.
3. **Hallucination rate = 0%:** Every claim in every output dossier has a `source_signal_id` present in the corresponding RawSignals. Zero fabricated claims.
4. **Entity resolution:** Zero wrong merges on gold set. All common-name collision cases (Stories 8.2) escalate correctly.
5. **Transfer mechanism gate works:** A record submitted with `transfer_mechanism = none` produces a UK-sources-only dossier; no call is made to DonorSearch or Wealth-X.
6. **Cost within envelope:** Actual Claude API spend across 20 records is within ±20% of £0.443/record LLM estimate from COST.md.
7. **Human review checkpoints function:** Checkpoint 1 and Checkpoint 3 review files are produced correctly; pipeline resumes only after reviewer decision is written.
8. **Audit log complete:** Every API call, model invocation, and human decision for all 20 records is present in `audit_events`.
9. **Compliance gating:** IDTA/SCC status for all three US vendors confirmed signed before any gold set record is processed through commercial endpoints.

---

## Resourcing

### Engineering
- **Build:** 4–6 engineer-weeks [my estimate — from 06_cost_models.md]. At £318/day (midpoint £70k/yr) this is £7,950 (midpoint 5 weeks). Assumes one engineer working full-time.
- **Allocation by component:** EntityResolver + APIOrchestrator fan-out (2 wks), SynthesisAgent prompts + Batch API integration (1 wk), WealthScorer + routing (0.5 wk), Human review file generation (0.5 wk), test harness + gold set (1 wk).
- **Ongoing maintenance (post-prototype):** 0.25 FTE = £1,458/month [my estimate — from 06_cost_models.md].

### Vendor Procurement
Vendor procurement must run in parallel with build. Estimated lead time per vendor:

| Vendor | Estimated procurement timeline | Blocker if delayed |
|---|---|---|
| DonorSearch | ~4 weeks [my estimate] | Stories 2.5 and 4.1 blocked until API key and DPA signed |
| Wealth-X (Altrata) | ~4 weeks [my estimate] | Story 2.6 blocked; enterprise contract may take longer |
| Factary Phi | ~2 weeks [my estimate — smaller vendor, simpler ToB] | Story 4.3 unblocked (manual CSV import) but licence required |
| Anthropic Claude API | ~1 week [verified — self-serve signup; DPA via data processing agreement at platform.claude.com] | All synthesis stories blocked |

**Critical path implication:** DonorSearch and Wealth-X procurement must start on day 1 of the build. If either vendor takes >4 weeks, the prototype cannot run the commercial fan-out until procurement completes. Plan: use mock responses for US vendors during build phase; switch to live calls once procurement completes.

### Legal / DPO
- LIA and DPIA preparation: £2,250 one-off [my estimate — from 06_cost_models.md]. Must be complete before any live donor data is processed.
- IDTA / SCC execution: included in vendor integration cost estimate of £1,136 [my estimate — from 06_cost_models.md]; add DPO review time.

### Total One-Off Cost (Prototype)
£7,950 (build) + £2,250 (DPIA/LIA) + £1,136 (vendor integration) = **£11,336** [my estimate — from 06_cost_models.md]

---

## Decision Gate

After the prototype run against the 20-record gold set:

| Metric | Pass threshold | Fail action |
|---|---|---|
| Substantially complete dossiers | ≥14/20 (70%) | Investigate which record types fail; if US-only bias causing failures, reconsider Wealth-X scope |
| Hallucination rate | 0% | Revise SynthesisAgent prompt before any production run |
| Entity resolution wrong merges | 0 | Revise EntityResolver confidence threshold |
| Cost per dossier | Within ±20% of £36.42 | If over, analyse token counts; consider batch API for Job A |
| Time to dossier (excl. human review) | ≤30 minutes automated | Profile bottlenecks; likely rate-limiting or Batch API latency |
| Vendor coverage rate | DonorSearch or Wealth-X returns result for ≥5/20 records | If <5/20, UK coverage confirmed insufficient; escalate vendor discussion before annual contract |

**Go/no-go decision owner:** Director of Fundraising (Anthony Hayman) with DPO sign-off.

**Go** → Proceed to production deployment (400 records/month target), annual vendor contracts, and Stories 1.4, 5.2, 7.2, 7.3.

**No-go on vendor coverage** → Revert to Strategy 4 (Hybrid): Strategy 3 open-source pipeline as primary, Factary Phi as sole commercial enrichment layer. DonorSearch and Wealth-X contracts not renewed.
