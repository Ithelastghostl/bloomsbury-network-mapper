# RESEARCH_PLAN.md — Execution Plan for Claude Code

**Companion to:** `docs/CLAUDE.md`
**Purpose:** Tells Claude Code exactly *how* to research the problem space and *how* to render each candidate strategy as a fully populated build kit, so the user can pick one or more strategies and immediately start a 4–6 week prototype build.

Execute phases R1 → R8 in order. Do not skip. Do not collapse. After each phase, write its output file(s) before moving on.

---

## Phase R1 — Context grounding

**Time budget:** ≤30 minutes.
**Output file:** `workspace/decision_layer/01_context.md` (target length: 1–2 pages).

### Sources to consult (primary only)

1. `https://bloomsburyfootball.com/` — about, support, donate, partners, our story.
2. Charity Commission entry for charity 1178842: `register-of-charities.charitycommission.gov.uk`. Pull financials, trustees, governing document, public benefit statement, latest annual return.
3. Companies House for any trading subsidiary (Bloomsbury Ventures was mentioned in public sources).
4. 360Giving GrantNav: search "Bloomsbury Football" as recipient — surfaces named grant-makers.

### What you are extracting

- Mission, beneficiary profile, geographic operating area (London boroughs).
- Current funder mix: corporate partners, trusts/foundations, government, individual donors.
- Income scale and growth trajectory.
- Trustees and senior leadership (relevant for connection-mapping later).
- Stated 2028 ambitions ("20,000 young Londoners playing weekly").

### Why this matters for the build

The donor profile shapes which co-philanthropy signals are highest yield. A youth-football-in-London charity with corporate partners like Mastercard and FIFA likely attracts donors who are: London-based or London-connected, sport-and-community-minded, often with corporate finance / professional services / sports industry backgrounds, frequently parents. This biases the gold set assembly in `TEST_PLAN.md` and the wealth-signal weightings in each strategy's scoring.

### Validation rule

Every claim in `01_context.md` must cite a URL retrieved during this phase with the access date.

---

## Phase R2 — Regulatory frame

**Time budget:** ≤45 minutes.
**Output file:** `workspace/decision_layer/02_regulatory_frame.md` (target length: 2–3 pages).

### Sources to consult (primary only — no secondary commentary)

1. **ICO** (`ico.org.uk`):
   - Guide to UK GDPR, Article 6(1)(f) Legitimate Interest, three-step test.
   - DPIA guidance and the ICO's list of operations always requiring a DPIA.
   - Direct marketing guidance.
   - Published enforcement notices against charities post-2017 (start with RSPCA and British Heart Foundation MPNs).

2. **Fundraising Regulator** (`fundraisingregulator.org.uk`):
   - 2025 Code of Fundraising Practice — sections on prospect research, due diligence, and consent.
   - GDPR briefings 1–6 (re-issued November 2025), particularly Briefing 4 (corporate fundraising) and Briefing 6 (charitable trust fundraising).

3. **Chartered Institute of Fundraising** — guidance for prospect researchers under UK GDPR.

4. **CASE Guidelines on GDPR Compliance: Wealth screening and prospect research** — primarily HE-sector, but the LIA/DPIA structure is sector-applicable.

5. **PECR 2003** (legislation.gov.uk) and ICO PECR guide — outreach channel rules.

### What you are extracting

- The three-step test for legitimate interest (purpose, necessity, balancing).
- DPIA trigger conditions specific to wealth screening + third-party profiling.
- Privacy notice content requirements when prospect research is performed.
- Outreach channel rules under PECR — what is permitted under legitimate interest vs what requires consent.
- The specific failures the ICO penalised in 2017 (the operative question is "what got them fined?" — answer: not telling donors, not having the assessment, sharing data without basis).
- Whether using a third-party prospect research firm requires a data processing agreement and what it must cover.

### Why this matters for the build

Section R2 outputs feed directly into every strategy's `COMPLIANCE.md`. If you don't get this right here, every build kit downstream is wrong. Specifically, the LIA three-step test, DPIA hot-spots list, and privacy-notice clause requirements must be detailed enough to be reused verbatim in the per-strategy compliance files (with strategy-specific deltas).

### Validation rules

- Quote no source for more than 14 words at a time and no more than once per source. Paraphrase the rest.
- If you cannot locate a primary source for a regulatory claim, flag it in `09_risks_and_open_questions.md` rather than relying on secondary commentary.
- Distinguish between "ICO has stated" (binding regulatory position) and "industry guidance suggests" (best practice). Never blur these.

---

## Phase R3 — Reliability ceiling

**Time budget:** ≤45 minutes.
**Output file:** `workspace/decision_layer/03_reliability_ceiling.md` (target length: 1–2 pages with a table).

### What you are determining

For each of the three deliverables (donor dossier, network discovery, lead dossier with £5M+ qualification), what is the *realistic upper bound* on reliability when using:

a) Open UK sources only.
b) Open UK sources + commercial wealth databases.
c) Open UK sources + a UK specialist (Factary, Prospecting for Gold).

### Sources to consult

1. Factary's published commentary on identification rates (`factary.com` — particularly post-GDPR methodology pieces).
2. Prospecting for Gold's resources page (`prospectingforgold.co.uk`) on wealth screening realism.
3. Boston Consulting Group / Capgemini wealth reports — UK HNW population baseline.
4. Sunday Times Rich List methodology — what the published list covers.
5. Wealth-X (Altrata) World Ultra Wealth Report — UHNW UK population numbers.
6. Charity Commission published statistics on charity sector trustee population.

### Output format

A table:

| Signal | Source(s) | Open-source recall | Commercial recall | Specialist recall | Notes |
|---|---|---|---|---|---|

Plus prose explaining the structural reasons for the ceilings — e.g. why named-individual donation history is poorly captured in open data, why £5M+ confirmation is a genuine ceiling problem in the UK regardless of architecture.

### Why this matters for the build

The numbers in this file become the *target thresholds* in each `TEST_PLAN.md`. If open-source recall on shared-trusteeship signals is genuinely 90%+, then Strategy 3's connection-recall target should be 90%+. If commercial UK coverage on £5M+ confirmation is realistically 40–60% (Wealth-X is US-skewed), Strategy 2's wealth-tier-accuracy target reflects that. Honest ceilings up here = honest test thresholds down the chain.

### Validation rule

If you state a recall percentage, either it is sourced or it is labelled `[my estimate]` with reasoning shown (e.g. "PSC filings give beneficial ownership ≥25%, so individuals with significant equity in private companies above a wealth threshold are deterministically detectable; everyone else is probabilistic").

---

## Phase R4 — Signal and tooling inventory

**Time budget:** ≤90 minutes.
**Output file:** `workspace/decision_layer/04_signal_inventory.md` (target length: 3–4 pages, structured as a catalog).

### Sources to consult (each must be visited)

**Free UK public-sector APIs and datasets:**

1. **Companies House API** — `developer.company-information.service.gov.uk`. Confirm: rate limits (600 req/5min last verified), authentication, key endpoints (`/search/officers`, `/officers/{officer_id}/appointments`, `/company/{company_number}/persons-with-significant-control`), terms of use, ECCTA 2023 changes to the data surface.
2. **Charity Commission API** — `register-of-charities.charitycommission.gov.uk` developer hub. Confirm: rate limits, key endpoints (particularly `GetTrusteeAndRelatedCharities` and `GetCharityTrustees`), data freshness, beta status.
3. **OSCR** (Scottish charity regulator) — `oscr.org.uk` — what's available for Scottish charities.
4. **CCNI** (NI Charity Commission) — equivalent for Northern Ireland.
5. **360Giving GrantNav and API** — `grantnav.threesixtygiving.org`. Confirm: data coverage (current grant count and total value), API stability caveats, data licence (CC-BY-SA), full-dataset download size.
6. **HM Land Registry** — Price Paid Data, INSPIRE polygons, overseas owners dataset.
7. **UK Sanctions List (OFSI)** and **HM Treasury PEP indicators** — for risk flagging.
8. **Gov.uk Honours List** archive.

**Commercial wealth/prospect-research vendors:**

For each, document: published price (or note "POA"), UK coverage, primary use case, integration options (API / Salesforce / CSV), ToS suitability for UK charity use.

1. **Factary** — UK specialist; profile services and database screening.
2. **Prospecting for Gold** — UK specialist; consultancy and screening.
3. **DonorSearch** — US-origin, UK applicable; wealth + philanthropic; published entry pricing.
4. **Wealth-X (Altrata)** — global HNW/UHNW; POA pricing.
5. **iWave** — US-origin; wealth + relationship; POA pricing.
6. **WealthEngine** — US-origin; wealth capacity; POA pricing.
7. **RelSci (Altrata)** — relationship mapping; POA pricing.
8. **BoardEx (Altrata)** — board-level relationship mapping; POA pricing.
9. **Nexis for Development Professionals** (LexisNexis) — news and adverse media; POA pricing.

**LLM/AI infrastructure:**

1. **Anthropic Claude API** — current model lineup (Opus, Sonnet, Haiku), per-million-token pricing, batch and prompt-caching discounts. Source: `claude.com/pricing` and `platform.claude.com/docs/en/about-claude/pricing`.
2. **Web search and web fetch costs** if invoking server-side tools.
3. **Vector store / embeddings** if needed for entity resolution.

### What you extract for each entry

- Name, vendor, URL.
- What it provides (precisely — distinguish "trustee names" from "trustee + appointment date + status").
- Coverage relevant to UK individuals.
- Cost: published or POA. If POA, give a `[vendor estimate]` range with the basis.
- Rate limits and ToS constraints.
- Strength of fit for each of Job A, Job B, Job C.
- **Build-kit metadata**: a stable identifier (e.g. `signal.companies_house.officers_appointments`) that the strategy `ARCHITECTURE.md` files will reference, so the build kits link cleanly back to this catalog.

### Validation rules

- Visit each vendor's product page. Do not infer pricing from review sites without crosschecking the vendor.
- For POA vendors, your estimate range must come from at least two corroborating data points (comparable charity sector contracts, published case studies, third-party review mentions of order-of-magnitude pricing).
- Check whether each vendor's ToS permits use by a UK charity for the described purpose. Some US vendor licences restrict redistribution of dossier output.

---

## Phase R5 — Strategy synthesis (Layer 1 — decision artefacts)

**Time budget:** ≤45 minutes.
**Output file:** `workspace/decision_layer/07_ranking_and_recommendation.md` (target length: 2–3 pages).

You are not yet writing the build kits in this phase — that is R6. Here you produce the decision-layer ranking that the user reads.

### What you produce

For each of the five strategies (defined in `docs/CLAUDE.md` §7):

- **Mechanism of reliability** — one paragraph: why this strategy produces correct connections and dossiers.
- **Coverage and accuracy by deliverable** (A, B, C) — what % of leads will the strategy confidently confirm at £5M+ vs flag as probabilistic, with reasoning grounded in `03_reliability_ceiling.md`.
- **Failure modes** and how each is caught.
- **Expected effectiveness vs cost shape** — qualitative, with the headline cost number from `06_cost_models.md`.
- **Effectiveness ranking** — 1–5 on each of: Effectiveness (primary), Technical feasibility, Complexity (lower = better), Efficiency, Impact. One-line justification per dimension.

End the file with the **recommendation**: which strategy(ies) should the user prototype, and why. The user may run more than one prototype in parallel — if so, recommend the combination and order.

---

## Phase R6 — Cost modelling

**Time budget:** ≤45 minutes.
**Output file:** `workspace/decision_layer/06_cost_models.md`.

For each strategy, compute total monthly cost at 100/month and 400/month volumes. Show:

- **Fixed costs** — vendor licences, specialist retainers, in-house headcount.
- **Variable costs** — per-record API calls, per-profile vendor fees, per-record LLM token cost.
- **One-off costs** — initial build, DPIA preparation, LIA documentation, integration.

### LLM cost model assumptions to make explicit

- Donor enrichment (Job A): estimate input tokens (gathered context) and output tokens (dossier). Reasonable starting point: 30k input / 5k output per record using Sonnet-class for synthesis, escalated to Opus for ambiguous cases.
- Network discovery (Job B): mostly deterministic API work with light LLM scoring on entity matching and relationship strength. Estimate token use accordingly.
- Lead dossier (Job C): deeper than Job A. Estimate 60k input / 10k output per qualifying lead with Opus-class for synthesis.
- Apply prompt-caching discount where the same context (donor profile, system prompt, scoring rubric) is reused across multiple lead enrichments.
- Apply batch-API discount where the user accepts ≤24h latency.

Each cost figure must be labelled `[verified]`, `[vendor estimate]`, or `[my estimate]`. Show the formula, not just the number.

### Sensitivity

Show how the total moves if:
- Volume goes from 100 to 400.
- Qualifying-lead rate moves from 10% to 30% of network candidates.
- Vendor fees come in 50% above your estimate (worst case for POA vendors).

The headline figures from this file are referenced in `07_ranking_and_recommendation.md` and copied into each strategy's `COST.md`.

---

## Phase R7 — Build-kit instantiation (Layer 2 — per-strategy build kits)

**Time budget:** ≤4 hours total (≤45 minutes per strategy).
**Output:** five folders, each containing 8 files. Total of 40 files.

```
workspace/strategies/01_factary/
workspace/strategies/02_commercial_apis/
workspace/strategies/03_open_source_agentic/
workspace/strategies/04_hybrid_tiered/
workspace/strategies/05_human_led/
```

For each folder, produce:

### 1. `STRATEGY.md` (~1 page)

- One-paragraph mechanism of reliability.
- ASCII architecture diagram.
- Data sources and tools (referenced by stable ID from `04_signal_inventory.md`).
- Coverage and accuracy summary for Jobs A, B, C.
- Failure modes and how each is caught.
- "When to choose this" decision rule.
- Effectiveness ranking row from `07_ranking_and_recommendation.md`.

### 2. `ARCHITECTURE.md` (~2 pages)

Component diagram with named services/scripts/agents.

**Data contracts** as JSON-schema-style definitions. At minimum:
- `DonorRecord` — input
- `EnrichedDonor` — Job A output
- `NetworkCandidate` — Job B intermediate
- `QualifiedLead` — post-£5M filter
- `LeadDossier` — Job C output
- `Citation` — embedded in every claim object: `{source_url, source_name, retrieved_at, confidence}`
- `HumanReview` — checkpoint record: `{checkpoint_id, reviewer, decision, notes, timestamp}`

Tech stack recommendations. Default: Python 3.12, SQLite for v1 / Postgres for v2, Claude SDK, a job runner (e.g. RQ or Prefect for v1), and structured logging to disk. Deviate only if the strategy demands it.

Where Claude is used and which model. Where prompt-caching applies. Where batch-API applies.

Auth and rate-limit handling for each external API. Companies House: explicitly note 600 req / 5 min limit and that higher rates can be requested.

A "kill list" of out-of-scope items for v1.

### 3. `BACKLOG.md` (~3 pages)

Use exactly this format throughout:

```
## E1 — Ingest and store a donor record with consent metadata

### Story 1.1 — Fundraiser submits a donor record
**As a** fundraiser
**I want** to submit a donor record (CSV or JSON) and receive an acknowledgement with a tracking ID
**So that** I can later retrieve the enriched dossier
**AC1:** input accepts {name, email, postcode, donation_history, consent_metadata}
**AC2:** consent_metadata is validated against a documented schema; missing fields reject with a 4xx-style error
**AC3:** record is persisted with an immutable `submitted_at` timestamp
**AC4:** caller receives a tracking_id within 2 seconds
**Size:** S
**Depends on:** —

### Story 1.2 — ...
```

Cover at least these epics. Each strategy populates the *contents* differently but the structure is the same:

- **E1** Ingest donor record + consent metadata
- **E2** Donor enrichment (Job A)
- **E3** Network candidate discovery (Job B core)
- **E4** Wealth-tier scoring and £5M+ filter
- **E5** Lead dossier enrichment (Job C)
- **E6** Human checkpoint workflows (3 stacked)
- **E7** Output formatting and handover
- **E8** Observability, audit log, citation integrity check
- **E9** Compliance scaffolding (privacy notice updates, DSAR endpoint, deletion workflow)

Sizing: XS (≤ 0.5 day) / S (1–2 days) / M (3–5 days) / L (1–2 weeks) / XL (split required). Aim for ≥ 80% of stories at M or smaller. Include dependencies between stories so a sprint plan can be drawn from the file directly.

### 4. `PROTOTYPE_SCOPE.md` (~1 page)

- **Goal** in one sentence ("prove that strategy X can produce a verified-correct lead dossier on N out of M test donors with the £5M+ threshold honoured").
- **In scope** — explicit list of stories from `BACKLOG.md` by ID.
- **Out of scope** — explicit list of what's deferred to v2.
- **Definition of done** — measurable; reuses thresholds from `TEST_PLAN.md`.
- **Resourcing assumption** — engineer-weeks, prospect-researcher-hours, vendor licences active.
- **Decision gate at end of prototype** — what evidence the user evaluates to decide whether to invest in v2.

### 5. `TEST_PLAN.md` (~2 pages)

- **Gold set design** — fields the gold set needs (donor name, postcode, known charity trusteeships, known co-trustees, known co-philanthropic relationships, known wealth band where the user has confidence). User assembles 10–20 records in week 1 — flag this as the highest-priority week-1 deliverable.
- **Metrics**, with pass/fail thresholds (target values from `03_reliability_ceiling.md`):
  - Donor dossier accuracy ≥ 95%
  - Connection precision ≥ 90%
  - Connection recall — strategy-dependent target
  - Wealth-tier accuracy ≥ 85% (confirmed band) / ≥ 60% (estimated band)
  - Hallucination rate = 0%
  - Time-to-dossier — strategy-dependent target
  - Cost per dossier — within ±20% of `COST.md`
- **Test methodology** — how each metric is measured, who measures it, with what tooling. For the prototype, "tooling" can be a Python script that diffs outputs against a CSV of gold-set ground truth.
- **Edge cases to deliberately test** — common-name donors; donors with no Companies House footprint; recently-deceased donors; donors connected to charities filing abridged accounts; high name-collision leads; donors who themselves are trustees of Bloomsbury or peer charities.
- **Exit criteria** — clear conditions for prototype success / partial success / failure.

### 6. `HUMAN_CHECKPOINTS.md` (~1.5 pages)

For each of the three stacked checkpoints:

1. Mid-pipeline shortlist review.
2. Every-uncertainty-threshold review (define thresholds per strategy).
3. Final dossier sign-off.

Cover for each:
- The **interface** the human uses. For v1, a markdown file in a `reviews/` folder is acceptable — no UI is required. Specify the file name pattern and the schema.
- The **decision options** (proceed / send back for re-enrichment / reject / escalate).
- The **time budget** per record.
- The **post-decision routing** logic.

### 7. `COMPLIANCE.md` (~2 pages)

- **LIA three-step test** answers specific to this strategy. Pre-fill what you can; flag what needs the user/DPO.
- **DPIA hot-spots** for this strategy.
- **Data retention** policy.
- **DSAR handling** procedure — must be a working procedure, not a placeholder.
- **Privacy notice clauses** — exact additions to Bloomsbury's privacy notice.
- **Third-party processor contracts** — DPA clauses required if vendors are used.

### 8. `COST.md` (~1 page)

Direct copy of the relevant section of `06_cost_models.md`, with strategy-specific notes added (e.g. licence procurement timeline, RFQ status).

---

## Phase R8 — Risks, recommendation wrap-up, audit trail

**Time budget:** ≤30 minutes.
**Output files:** `workspace/decision_layer/00_executive_summary.md`, `workspace/decision_layer/09_risks_and_open_questions.md`, `workspace/decision_layer/10_references.md`.

### `00_executive_summary.md` (1 page)

- Problem in two sentences.
- Recommendation in one sentence.
- Reasoning in three bullets.
- Cost headline (recommended strategy at 100/month and 400/month).
- Next concrete step the user takes Monday morning.

### `09_risks_and_open_questions.md`

Include at minimum:

- Whether the donor consent language actually covers third-party network research.
- Whether Bloomsbury has a designated DPO or needs to appoint one.
- Whether the user has a CRM commitment that constrains v2.
- Vendor pricing assumptions that need user-driven RFQ to firm up.
- Reputational risk policy: does Bloomsbury have published guidance on which sources of wealth they will not accept gifts from?
- Gold-set assembly: who at Bloomsbury produces the 10–20 known-good donor records and by when?
- Any open question logged during R1–R7.

### `10_references.md`

Every URL cited anywhere in the document, grouped by category, with access dates. This is the audit trail.

---

## Hard rules across all phases

1. **Search before answering** any factual question about the present-day world. Vendor pricing, regulatory text, and API capabilities all change.
2. **Cite or label.** Every figure and every claim is either cited with URL + access date, or labelled as estimate with reasoning.
3. **Paraphrase, do not quote.** Keep direct quotes under 15 words and use no more than one quote per source.
4. **Never invent.** If you cannot find a fact, the answer is "I could not find this — flagging as open question," not a plausible-sounding number.
5. **No padding.** No "I will now proceed to…". Produce the artefact.
6. **Stop and ask** when you hit one of the conditions in `docs/CLAUDE.md` §11.
7. **Stable identifiers.** Stories in `BACKLOG.md` are referenced by ID (e.g. `Story 2.3`) in `PROTOTYPE_SCOPE.md` and `TEST_PLAN.md`. Signals in `04_signal_inventory.md` are referenced by stable ID in every `ARCHITECTURE.md`. Cross-references must resolve cleanly.

---

## Sequencing summary

```
R1 Context                     (30m)  → workspace/decision_layer/01_context.md
R2 Regulatory                  (45m)  → workspace/decision_layer/02_regulatory_frame.md
R3 Reliability ceiling         (45m)  → workspace/decision_layer/03_reliability_ceiling.md
R4 Signal & tooling            (90m)  → workspace/decision_layer/04_signal_inventory.md
R5 Strategy synthesis          (45m)  → workspace/decision_layer/07_ranking_and_recommendation.md
R6 Cost modelling              (45m)  → workspace/decision_layer/06_cost_models.md
R7 Build-kit instantiation    (240m)  → workspace/strategies/0X_*/  (5 folders × 8 files = 40 files)
R8 Wrap-up & risks             (30m)  → workspace/decision_layer/00_executive_summary.md, 09_*, 10_*
                              ─────
Total                         ~9.5h    52 files (11 decision + 40 build-kit + 1 readme implied)
```

This is the plan. Execute it.
