# Prototype Scope — Strategy 4 Hybrid Tiered Pipeline

---

## Goal

Prove that the hybrid tiered pipeline achieves:

1. **≥ 85% recall** on co-trusteeship connections in Tier 1 (open-source pipeline), measured against a gold set of 20 known-positive pairs from Bloomsbury's existing network
2. **≥ 60% confirmed wealth-band rate** on shortlisted leads in Tier 2, after Factary Phi enrichment [my estimate — based on Factary's ~83% yield on screened UK records]
3. **Blended cost/dossier ≤ £35** across both tiers at a 20% shortlist rate, consistent with the Strategy 4 cost model in COST.md

The prototype gates Tier 2 investment on Tier 1 success. Tier 2 build does not begin until Tier 1 has passed its evidence gate.

---

## Phasing

### Phase 1 — Tier 1 only (Weeks 1–3)

Stories in scope: E1 (all), E2 (all), E5.1, E8.1

Deliverable: A working Tier 1 pipeline that ingests donor records, queries Companies House, Charity Commission, 360Giving, HMLR, and GOV.UK honours, scores candidates via ShortlistScorer, and delivers a ranked markdown shortlist to the ShortlistGate reviewer.

Prototype run: 20 records drawn from Bloomsbury's existing network (trustees, named donors, corporate partner contacts). Known co-trusteeship relationships within this set serve as the gold set for recall measurement (Story 9.1).

**Tier 1 evidence gate:** Recall ≥ 85% on gold set AND ShortlistGate markdown review usable without technical intervention.

If gate passes → proceed to Phase 2.
If gate fails → diagnose before Phase 2 spend: check name matching quality, CC bulk data freshness, ShortlistScorer threshold calibration.

### Phase 2 — Add ShortlistGate and Tier 2 (Weeks 3–7)

**Precondition:** Factary Phi licence obtained. Target: licence in place by end of Week 3.

Stories in scope: E3a (all), E3b (all), E4 (all), E6 (all), E7.1

Deliverable: Complete hybrid pipeline from donor ingestion to approved lead dossier, with human ShortlistGate, Factary Phi enrichment, WealthConfirmer reconciliation, and Job C synthesis via Claude Opus.

Prototype run: First real batch — submit the approved shortlist from Phase 1 (estimated 4–6 candidates from 20 records at 20–30% shortlist rate) to Factary Phi. Measure confirmed wealth-band rate and blended cost/dossier (Story 9.2).

**Tier 2 evidence gate:** Confirmed wealth-band rate ≥ 60% AND blended cost/dossier ≤ £35.

### Phase 3 — Hardening and evaluation (Weeks 7–10)

Stories in scope: E5.2, E7.1 (DSAR), E9.1, E9.2, compliance documentation

Deliverable: Production-ready pipeline with retention enforcement, DSAR CLI, full audit logging, and documented LIA/DPIA.

---

## In Scope

- DonorIngestionCLI for CSV and JSON input
- Tier 1 agents: TrusteeGraphAgent, CompaniesHouseAgent, GrantNavAgent, PropertyAgent, WebSearchAgent
- ShortlistScorer using claude-sonnet-4-6 with cached scoring rubric
- ShortlistGate: markdown review interface, Postgres approval tracking, Prefect pause task
- Tier 2 orchestration with FactaryPhiClient (manual CSV ingest), optional WealthXClient
- WealthConfirmer (claude-sonnet-4-6 batch)
- Job C SynthesisAgent (claude-opus-4-7 batch)
- AuditLogger (all tiers)
- Retention sweeper (E5.2)
- DSAR CLI (E7.1)
- UK Sanctions List screening on all records (integrated into WebSearchAgent or as standalone check)
- Postgres + Redis infrastructure
- Prefect orchestration with stage gates

---

## Out of Scope for Prototype

- OSCR (Scottish charities) and CCNI (Northern Ireland) — v2
- DonorSearch integration — optional; add only if US-connected donors appear in shortlist
- Wealth-X integration beyond UHNWI-flagged leads — v2
- Web frontend for review interface — markdown files only in v1
- CRM write-back (Salesforce, Raiser's Edge, etc.) — v2
- Automated PECR-compliant outreach — never automated; human decision only
- Real-time streaming ingestion — scheduled batch only
- RelSci or BoardEx — v2 if Job B corporate network gaps confirmed
- LexisNexis Nexis for Development Professionals — not in v1

---

## Resourcing

**Total: 8–10 engineer-weeks** [my estimate — from `06_cost_models.md` Strategy 4 build cost: 9 weeks midpoint]

| Phase | Engineer-weeks | Activities |
|---|---|---|
| Phase 1 (Weeks 1–3) | 3–4 | Ingestion CLI, Tier 1 agents (CH, CC, 360Giving, HMLR), ShortlistScorer, basic Postgres schema, E5.1 audit logging |
| Phase 2 (Weeks 3–7) | 4–5 | ShortlistGate (E3a), Factary ingest (E3b.1), WealthConfirmer (E3b.3), Job C synthesis (E4), uncertainty routing (E6), Prefect flows |
| Phase 3 (Weeks 7–10) | 1–2 | Retention sweeper, DSAR CLI, E9 gold set evaluation, hardening and documentation |

**Factary Phi licence:** Required by end of Week 3. Procurement lead time: allow 2 weeks for contract and DPA execution. Initiate contact with Factary (willw@factary.com) at project start. Cost: £500–£2,000/year [vendor estimate].

**Human time:**
- Fundraising team: ~4 hours for ShortlistGate review of prototype batch
- DPO/legal: ~3 days for LIA, DPIA, and Article 28 DPA review (Factary + Anthropic)
- Project lead: 1–2 days for gold set assembly and evidence gate review at each phase

---

## Story Reference

| Phase | Stories |
|---|---|
| Phase 1 | 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 5.1, 8.1 |
| Phase 2 | 3a.1, 3a.2, 3b.1, 3b.2, 3b.3, 4.1, 4.2, 6.1, 6.2 |
| Phase 3 | 5.2, 7.1, 9.1, 9.2 |

---

## Decision Gate

At the end of Phase 2 (or after Story 9.2 is complete), the project lead and head of fundraising review the prototype evaluation report and make a go/no-go decision on production investment. The gate passes if all three prototype goals are met:

| Gate criterion | Target | Source |
|---|---|---|
| Tier 1 co-trusteeship recall | ≥ 85% on gold set | Story 9.1 |
| Tier 2 confirmed wealth-band rate | ≥ 60% on shortlisted leads | Story 9.2 |
| Blended cost/dossier | ≤ £35 | Story 9.2; COST.md |

If any criterion is missed:
- Recall < 85%: investigate name resolution quality; consider lowering shortlist threshold before declaring failure
- Wealth-band rate < 60%: assess whether Factary coverage gaps are systematic (prospect pool skews to low-profile sectors) or random; consider adding Wealth-X for UHNWI subset
- Cost > £35: check if Factary per-record cost is above estimate; renegotiate or reduce Tier 2 volume

**If all three gates pass:** proceed to production pipeline with full volume (100–400 records/month) and complete compliance documentation.

**If gates do not pass after one remediation cycle:** escalate to strategy review — consider whether Strategy 1 (Factary outsourced) better suits the prospect pool characteristics found in the prototype.
