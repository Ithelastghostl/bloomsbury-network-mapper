# Prototype Scope: Strategy 3 — Open-Source Agentic Pipeline

**Version:** 1.0 | **Date:** 2026-05-05

---

## Goal

Prove that the open-source agentic pipeline can:

1. Identify shared-trusteeship connections for N of M test donors with **≥90% connection recall** against a gold-set of known co-trustee relationships
2. Produce a **complete Job C dossier** for qualifying leads (approved at Checkpoint 1)
3. **Clearly distinguish £5M+ confidence from £5M+ confirmed** in every dossier — no conflation

Secondary: demonstrate that all automated steps complete in ≤45 minutes per donor (excluding human review wait time and 24h batch API latency for Job C).

---

## Decision Gate: What "Proven" Means

The prototype is considered proven when the following thresholds are met against the gold set (see TEST_PLAN.md):

| Metric | Threshold | Rationale |
|---|---|---|
| Connection recall | ≥ 85% (gold-set) | Below this, the strategy's primary strength is not delivering; abort or investigate |
| Connection precision | ≥ 90% | False positives in connection data create fundraiser credibility risk |
| Donor dossier accuracy | ≥ 95% | Sourced claims must be verifiable; inaccurate sourced claims are worse than absent data |
| Hallucination rate | 0% | Non-negotiable; a single hallucinated wealth claim invalidates the compliance position |
| £5M+ confirmed vs. probable distinction | 100% compliance | Every dossier must use correct label; spot-check 10 Job C dossiers manually |
| Time-to-dossier (automated steps only) | ≤ 45 minutes median | Excluding human review wait and 24h batch API latency |
| Cost per dossier (Job A + B) | Within ±20% of £15.30 [R6] | Validates COST.md assumptions |

If connection recall < 85% at prototype end: root cause analysis required before proceeding to v1. Likely causes: CC API coverage gap, entity resolution failures, or gold-set selection bias.

If hallucination rate > 0%: immediate halt; prompt revision required before any dossier is shown to a fundraiser.

---

## In Scope

The prototype covers stories needed to demonstrate the core pipeline end-to-end for a cohort of 20–30 test donors drawn from Bloomsbury's existing network (anonymised for testing):

| Story | Description |
|---|---|
| 1.1 | Fundraiser submits a donor record |
| 1.2 | Consent metadata schema validated |
| 2.1 | EntityResolutionAgent vs. CH register |
| 2.2 | EntityResolutionAgent vs. CC register |
| 2.3 | Human reviewer resolves ambiguous entity matches |
| 2.4 | Common-name collision detection |
| 3.1 | TrusteeGraphAgent — co-trustee network from CC API |
| 3.2 | CompaniesHouseAgent — officer appointments and PSC records |
| 3.3 | GrantNavAgent — 360Giving grant history |
| 3.4 | WebSearchAgent — advisory boards, honours, adverse media |
| 3.6 | SanctionsAgent — UK Sanctions List screening |
| 4.1 | PSC-based deterministic wealth scoring |
| 4.2 | Web-signal probabilistic wealth scoring |
| 5.1 | SynthesisAgent — Job A dossier |
| 6.1 | Checkpoint 1 — shortlist human review |
| 6.2 | Uncertainty-threshold auto-escalation |
| 7.1 | SynthesisAgent (Opus) — Job C lead dossier |
| 7.2 | Connection path to Bloomsbury network |
| 6.3 | Checkpoint 2 — final dossier sign-off |
| 8.1 | AuditLogger — all pipeline events |

---

## Out of Scope (deferred to v1 / v2)

| Story | Reason deferred |
|---|---|
| 1.3 — Duplicate donor detection | Useful but not needed to prove core pipeline |
| 1.4 — Status query endpoint | Prototype uses CLI output; endpoint is a v1 UX improvement |
| 3.5 — PropertyAgent (HMLR OCOD) | OCOD enriches dossiers but is not needed to prove core trustee-graph hypothesis |
| 4.3 — Human wealth tier override | Edge case; v1 feature |
| 5.2 — Batch Job A | Prototype uses single-record runs; batch pipeline is v1 |
| 8.2 — DSAR deletion script | Required before any live donor data is processed; build in v1 week 1 |
| 9.1 — Health monitoring | v1 operational feature |
| 9.2 — Cost tracking per batch | Manual review of Claude API dashboard sufficient for prototype |
| 9.3 — Gold-set regression on every run | v1 automation; gold set is used manually during prototype |
| OSCR (Scottish charities) | v2 extension |
| CCNI (Northern Ireland charities) | v2 extension |
| Honours list scraping | v2 extension (no stable API) |
| Web UI, CRM integration, multi-user auth | v1 kill list (see ARCHITECTURE.md) |

**Note on Story 8.2 (DSAR deletion):** Although deferred from the prototype, this script must be built and tested before any live (non-test) donor data enters the system. The prototype uses only anonymised test data; the deletion script is a hard prerequisite for the v1 go-live gate.

---

## Definition of Done

The prototype is done when:

1. All in-scope stories pass acceptance criteria as stated in BACKLOG.md
2. Gold-set metrics meet all thresholds in the Decision Gate table above
3. A complete Job C dossier has been produced for at least 3 qualifying leads from the test cohort
4. All 3 Job C dossiers correctly label £5M+ indicators as either "confirmed" or "probable" — verified manually by the fundraiser and DPO
5. AuditLogger produces a complete, queryable record of every pipeline event for a test run
6. At least one common-name collision case (Story 2.4) has been exercised and correctly routed to human review
7. COMPLIANCE.md has been reviewed by the DPO and the LIA draft is complete (not necessarily finalised, but written)

---

## Resourcing

| Resource | Estimate | Basis |
|---|---|---|
| Engineer build time | 6–8 engineer-weeks | [my estimate — R6 Strategy 3; midpoint 7 weeks = 35 days × £318/day = £11,130] |
| Fundraiser time (gold-set creation + review) | ~3 days | [my estimate — gold set of 20–30 known donors; review of 3 Job C dossiers] |
| DPO time (LIA draft, DPIA trigger assessment) | ~2 days | [my estimate — working from R2 checklist] |
| Vendor licence cost | £0 | All APIs are free (OGL v3.0); prototype uses Anthropic API pay-as-you-go |
| Claude API (prototype run, ~30 records) | ~£15–25 | [my estimate — 30 records × £0.334/record base rate from R6; plus Job C Opus for 3 leads] |
| Web search API (prototype) | ~£5 | [my estimate — well within Serper.dev free/low tier for prototype volume] |
| **Total prototype cost (excl. engineer time)** | **~£20–50** | |
| **Total one-off cost incl. engineer time** | **~£11,130 midpoint** | [my estimate — R6] |

---

## Prototype Test Cohort

The test cohort of 20–30 donors is drawn from Bloomsbury's existing known network to ensure the gold set has verifiable answers:

- At minimum 5 donors with known CC trusteeships (verifiable co-trustee connections in the gold set)
- At minimum 3 donors with known CH directorships or PSC records
- At minimum 2 donors with common names (to exercise Story 2.4)
- At minimum 1 donor with a sanctions/PEP flag (synthetic or known public case) to verify SanctionsAgent
- Test data is anonymised before engineering access; real charity numbers and company numbers used for API testing (these are public records)

Gold set is built in **week 1** of the prototype as the first engineering milestone (see TEST_PLAN.md §Gold Set Design).
