# Prototype Scope — Strategy 5: Human-Led + Claude Copilot

## Goal

Prove that a part-time researcher using Claude as copilot can produce verified, fully-cited lead dossiers for 12 of 16 test donors (75% complete rate target) at a sustained rate of 20–25 records per week, with all quality metrics in TEST_PLAN.md passing by the end of week 6.

The prototype is the researcher's first 4–6 weeks of operation. It is a **process test, not a software test**. The software is a simple CLI tool that supports the researcher's workflow; the question under test is whether an experienced UK prospect researcher, using that tool alongside their existing methods, can sustain throughput and quality without degradation.

---

## What This Prototype Is

The prototype is a **structured pilot** run in three phases:

- **Weeks 1–2 (Engineer sprint):** Build the copilot CLI tooling (Stories 2.1, 2.2, 2.3, 3.1, 3.2, 5.1, 6.2, 7.1, 9.1). Researcher is onboarded in week 2 (Stories 9.1, 9.2). Target: researcher can execute a full enrichment run, complete all three checkpoints, and export an approved dossier by end of week 2.
- **Weeks 3–4 (Initial production run):** Researcher processes 10 test donors from the gold set. Metrics are logged but no pass/fail gate is applied yet. Goal: identify workflow friction points, missing signals, and time sinks.
- **Weeks 5–6 (Sustained production run):** Researcher processes the remaining 6 test donors plus a further 10–15 additional records drawn from the Bloomsbury donor list. At the end of week 6, all TEST_PLAN.md metrics are evaluated against the exit criteria.

---

## Resourcing

| Resource | Commitment | Cost basis |
|---|---|---|
| Engineer | 2 weeks (10 days × £318/day) | £3,180 one-off [my estimate — from 06_cost_models.md day rate] |
| Prospect researcher | 0.5 FTE × 6 weeks | ~£2,308 (0.5 FTE × 6/52 × £40k/yr) [my estimate] |
| Factary Phi | Monthly subscription during prototype | ~£104/month [vendor estimate] |
| Claude API (Sonnet, ad hoc copilot use) | ~£4/month at copilot usage volumes | £24 total [my estimate — from 06_cost_models.md] |
| **Total prototype cost** | | **~£5,616** |

Engineer time is front-loaded into weeks 1–2 so the researcher is not blocked. After week 2, the engineer is available for bug fixes and minor enhancements but is not required full-time.

---

## In Scope

**Stories (from BACKLOG.md) in scope for prototype:**

- E1: Stories 1.1, 1.2, 1.3 (donor record ingest and queue)
- E2: Stories 2.1, 2.2, 2.3, 2.4 (full enrichment CLI including disambiguation and sanctions check)
- E3: Stories 3.1, 3.2 (Checkpoint 1 audit and false-positive marking)
- E4: Stories 4.1, 4.2 (candidate profile drafting and scoring)
- E5: Stories 5.1, 5.2 (dossier drafting and re-draft)
- E6: Stories 6.1, 6.2, 6.3 (Checkpoint 2 and 3 workflow; export)
- E7: Stories 7.1, 7.2 (audit database and weekly report)
- E9: Stories 9.1, 9.2 (setup and onboarding)

**Gold set:** 16 test donor records (see TEST_PLAN.md §Gold Set Design). 10 processed in weeks 3–4; 6 processed in weeks 5–6.

**Signals:** All free open-source signals (CH, CC, 360Giving, UK Sanctions List). Factary Phi consulted manually by the researcher for all records where the CH/CC/360G skeleton is thin.

**Metrics collection:** Researcher records start and end time for each record; quality metrics are assessed by independent review of a sample of 4 dossiers (25%) at week 6.

---

## Out of Scope

- E8 stories (DSAR and retention reporting) — compliance tooling is not required for the prototype period
- OSCR and CCNI lookups (researcher checks manually for records with known Scottish or NI connections; no CLI integration in v1)
- HMLR per-title searches (researcher initiates manually for high-priority records)
- Any CRM integration
- Multi-user support
- Connection graph visualisation
- Automated Article 14 notice generation
- Full DPIA completion — DPIA is completed before the prototype starts, not as part of the engineering sprint

---

## Decision Gate

At the end of week 6, the following question is evaluated:

**Can the researcher sustain throughput of 20–25 records per week without degradation in citation quality?**

A yes/no decision is made against the TEST_PLAN.md exit criteria. The specific question is whether citation quality degrades in weeks 5–6 relative to weeks 3–4 (the researcher fatigue test), not just whether week 6 quality is acceptable in isolation.

If the gate passes:
- Researcher continues at 0.5 FTE; donor list is expanded to the full Bloomsbury prospect pipeline
- E8 stories are built (DSAR, retention reporting)
- Consider whether to expand to 1.0 FTE if the fundraising team's demand exceeds 40 records/month

If the gate fails on throughput but not quality:
- Evaluate whether a reduced-scope weekly workflow (15 records/week) is still commercially viable
- Consider using Strategy 3 automated pipeline for triage, with researcher handling the top 15–20 records/week only (the Strategy 3/5 hybrid recommended in 07_ranking_and_recommendation.md)

If the gate fails on citation quality:
- Diagnose root cause: researcher methodology gap, or copilot tool not surfacing the right sources
- If tool: engineer fixes; re-run weeks 5–6 with the same researcher
- If methodology: provide targeted training on CC/CH register structure; re-evaluate after one further week

---

## Notes on Prototype Nature

This is not a software test where passing means "the code works." The code passing its own unit tests is a necessary precondition, not the prototype goal. The prototype tests a human process at a specific throughput and quality standard. The engineer's deliverable for the prototype is a working tool; the researcher's deliverable is sustained, verified dossier production. Both must succeed for the gate to pass.

The 2-engineer-week build estimate assumes the engineer is familiar with Python, the Claude SDK (signal.anthropic.claude_api), and the CH/CC REST APIs. If unfamiliar with the APIs, add 2 days for initial exploration. The engineer does not need to be a machine-learning specialist; the Claude integration is straightforward SDK calls with structured prompts.
