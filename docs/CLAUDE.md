# CLAUDE.md — Mission Brief: Donor-to-Lead Enrichment Pipeline (Plan → Build)

**Project:** Bloomsbury Football Foundation — Donor → Network → Lead enrichment pipeline
**Charity number:** 1178842 (Charity Commission for England and Wales)
**Location:** London, UK
**Mode:** Planning session, build-ready output. Do not write production code in this session — but produce planning artefacts detailed enough that the next session can begin building immediately.

---

## 1. The end state this work must enable

The user will read your output and decide: **one or more of these strategies, we are going to build and test in a 4–6 week prototype window.** Your output must therefore contain enough specification that, the moment the user picks, the next Claude Code session can:

- Pull a per-strategy `BACKLOG.md` and start sprint planning.
- Use a per-strategy `ARCHITECTURE.md` to scaffold repos, services, and data contracts.
- Run a per-strategy `TEST_PLAN.md` against a labelled gold-set of donors to measure real effectiveness on real data.
- Hand a stakeholder a per-strategy `PROTOTYPE_SCOPE.md` defining what is in the 4–6 week build and what is explicitly out.

A planning document that wins the strategy debate but leaves the team at a blank repo is a failure. A planning document that produces a defensible recommendation *and* lets the team open Linear and start writing tickets is the bar.

---

## 2. What the workflow does (the three jobs)

### Job A — Donor dossier enrichment

**Input.** A known charity donor: name + some structured data (address, donation history, contact details) + confirmed opt-in consent that covers research for fundraising purposes including network research for warm introductions.

**Output.** An enriched donor dossier covering:
- Confirmed identity, age/birthday where lawfully available
- Professional history and current roles (Companies House)
- Charity trusteeships and board roles (Charity Commission)
- Stated philanthropic interests
- Personal interests, education, family context (only from sources where the individual has placed this in the public domain)
- Communication preferences and existing relationship with Bloomsbury

### Job B — Network discovery via co-philanthropy

**Input.** The enriched donor dossier from Job A.

**Output.** A ranked list of third-party individuals connected to the donor through co-philanthropy, then filtered to **HNW / UHNW at £5M+ net worth**.

Co-philanthropy signals, in priority order (user confirmed):
1. **Shared charity trusteeships** — donor and contact serve or have served as trustees of the same registered charity. Strongest signal: deterministic, fully public, structured.
2. **Joint donations to the same charity** — partial recall; named-individual donations are sparsely published.
3. **Co-appearance on charity advisory boards, ambassador lists, patron lists, fundraising committees** — published on charity sites and annual reports.
4. **Co-attendance or co-sponsorship of named philanthropic events** — galas, named campaigns, capital appeals.

For each candidate connection, capture: connection type, evidence sources with URL + retrieval date, strength score with rubric, confidence level.

### Job C — Lead dossier for warm introduction

**Input.** Each qualifying lead from Job B.

**Output.** A dossier designed for **the donor** to make a warm introduction to Bloomsbury, OR for Bloomsbury to make the donor aware of the lead so the donor can decide. NOT for cold outreach by Bloomsbury (legally constrained — see §4).

Each lead dossier covers: identity and confirmed wealth band with evidence; philanthropic profile (causes, giving size estimates, recency); connection back to the donor (the bridge story); proximity score; suggested introduction angle aligned with Bloomsbury's mission; risk flags (reputational, sanctions, PEP, adverse media).

---

## 3. Volume and infra

- **Throughput:** 100–400 donor records per month maximum.
- **Scaling:** non-issue. If volume needs to scale, the user will shard donor lists and run in parallel.
- **Cost minimisation:** not a goal. The user prefers options that effectively deliver reliable output, even if more expensive.
- **Tech footprint:** greenfield. Claude Code + lightweight infra acceptable for v1. No mandatory CRM integration in v1.
- **Build window for prototype phase:** 4–6 weeks per chosen strategy.

---

## 4. Non-negotiable constraints

### Legal / regulatory

UK GDPR, DPA 2018, PECR 2003, and the 2025 Code of Fundraising Practice apply. You must verify and respect:

- **Lawful basis is Legitimate Interest** under Article 6(1)(f) UK GDPR for both donor research and third-party (lead) research. Confirm donor consent language covers third-party network research; if it only covers research of the donor, Job B/C requires separate legitimate-interest justification (harder to defend for non-donor third parties).
- **LIA** (Legitimate Interests Assessment) documented before processing begins.
- **DPIA** (Data Protection Impact Assessment) likely required — wealth screening + profiling of non-consenting third parties triggers DPIA conditions.
- **Privacy Notice** must clearly describe wealth screening and prospect research, name third-party providers if any, and offer an opt-out.
- **Outreach channel constrained.** Under PECR, electronic marketing requires consent, not legitimate interest. Permitted outreach to identified leads: postal mail, live phone (subject to TPS), or — preferred — warm introduction made by the donor.
- **The 2017 ICO actions against RSPCA and BHF** define the boundary: not telling donors prospect research was happening, and not having a legitimate-interest assessment, were the violations. Doing the research itself was not.

### Ethical

- No facilitation of harassment, discrimination, or surveillance.
- No inference or storage of special category data (health, ethnicity, religion, sexual orientation, political opinion) even if technically extractable.
- No enrichment of children, ever.
- Adverse-media and risk flagging only from accurate, primary, recent sources.

---

## 5. The user's stated priorities (in order)

1. **Effectiveness** of delivering correct and reliable network connections and dossiers. Dominant ranking criterion.
2. **Automated data reliability** — minimise hallucination, maximise source-grounded extraction with citations.
3. **Human in the loop on outcome analysis and evaluation** — humans judge whether output is acceptable to move forward; humans do not do data entry.
4. **Rigorous referencing** — every claim, figure, and recommendation is sourced or labelled as estimated.

The user explicitly dropped the MECE constraint. Strategies should be different *because they deliver effectiveness through different means*, not because they tile architectural space.

---

## 6. Your deliverable — a planning document that is also a build kit

Produce a single repo-style folder of Markdown files. Two layers:

### Layer 1 — Decision artefacts (read by the user to choose)

```
00_executive_summary.md          # 1 page; recommendation, headline cost, next step
01_context.md                    # Bloomsbury, donor profile, signals that matter
02_regulatory_frame.md           # LIA, DPIA, PECR, privacy notice requirements
03_reliability_ceiling.md        # What's knowable in UK from open vs paid sources
04_signal_inventory.md           # Every data source, what it gives, what it costs
06_cost_models.md                # 100/mo and 400/mo per strategy, all assumptions stated
07_ranking_and_recommendation.md # Effectiveness-weighted ranking + which to pick
09_risks_and_open_questions.md   # What could go wrong, what user must confirm
10_references.md                 # Every URL with access date — full audit trail
```

### Layer 2 — Per-strategy build kits (read by the team that builds)

For **each** of the 5 strategies, produce a folder:

```
strategies/01_factary/
  STRATEGY.md          # mechanism of reliability, architecture, when to choose
  ARCHITECTURE.md      # components, data flow, contracts, tech choices
  BACKLOG.md           # epics → user stories → acceptance criteria, sized
  PROTOTYPE_SCOPE.md   # what's in the 4–6 week build, what's explicitly out
  TEST_PLAN.md         # gold set, metrics, pass thresholds, failure modes
  HUMAN_CHECKPOINTS.md # the 3 stacked checkpoints, with UI/process for each
  COMPLIANCE.md        # LIA template, DPIA hot-spots, retention, DSAR handling
  COST.md              # one-time + monthly at 100 and 400 records, sourced

strategies/02_commercial_apis/
  ... (same 8 files)
strategies/03_open_source_agentic/
  ... (same 8 files)
strategies/04_hybrid_tiered/
  ... (same 8 files)
strategies/05_human_led/
  ... (same 8 files)
```

Why this structure: when the user picks a strategy, the matching `strategies/0X_*/` folder is the build kit. They hand it to whoever builds — internal engineer, contractor, or a fresh Claude Code session — and that person can begin. No re-research, no re-scoping.

The user may pick **more than one** strategy to prototype in parallel (e.g. Strategy 3 and Strategy 4, since 4 builds on 3). Build kits must therefore stand alone but cross-reference cleanly where strategies share components.

---

## 7. The five candidate strategies (pre-scoped)

You will instantiate all five into the build-kit format above. Don't reinvent these — refine them with research evidence.

1. **Factary (or equivalent UK specialist)** — outsourced. Reliability comes from a 25-year UK firm with established methodology and a GDPR-compliant process. Highest per-record cost, lowest build cost.
2. **Commercial API stack + Claude synthesis** — DonorSearch + one of Wealth-X / iWave for the data layer; Claude for orchestration and dossier composition.
3. **Open-source agentic pipeline** — Companies House + Charity Commission + 360Giving + web search, orchestrated by Claude Code. Strongest for the user's primary signal (shared trusteeships). Weakest for £5M+ confirmation outside the deterministic PSC tier.
4. **Hybrid tiered** — Strategy 3 mechanics on all 100–400 records to produce a shortlist; Strategy 2 mechanics only on shortlisted leads for deep enrichment. Concentrates spend where signal is strongest.
5. **Human-led prospect researcher + Claude as copilot** — part-time or full-time in-house researcher; Claude is a per-task copilot. Highest defensibility, lowest throughput, scales linearly with headcount.

---

## 8. What goes in each per-strategy file

### `STRATEGY.md`

- One-paragraph **mechanism of reliability** — why this delivers correct connections + dossiers.
- Architecture diagram (ASCII).
- Data sources and tools (drawn from `04_signal_inventory.md`).
- Coverage and accuracy by deliverable: % of leads confidently confirmed at £5M+ vs flagged probabilistic, with reasoning.
- Failure modes and how each is caught.
- "When to choose this" — one-line decision rule.
- Effectiveness ranking on the 1–5 rubric.

### `ARCHITECTURE.md`

- Component diagram with named services / scripts / agents.
- **Data contracts** — input schema (donor record), intermediate schemas (network candidate, qualified lead), output schema (dossier). Use TypeScript/JSON-schema-style definitions; these become test fixtures and DB columns later.
- Tech stack recommendations: language, runtime, storage, queue/orchestrator, observability. Default to lightweight (Python + SQLite/Postgres + Claude SDK + a job runner) unless a strategy demands more.
- Where Claude is used and which model (Haiku / Sonnet / Opus).
- Where prompt-caching and batch-API discounts apply.
- Secrets management.
- Auth / rate-limit handling for each external API (call out the 600-req/5-min Companies House limit explicitly).
- A "kill list" of things explicitly NOT in v1 (CRM integration, web UI, multi-user accounts, etc.).

### `BACKLOG.md`

Epics → user stories → acceptance criteria. Use this format throughout:

```
### Epic 1: Donor enrichment
- Story 1.1 — As a fundraiser, I can submit a donor record and receive an enriched dossier within 5 minutes.
  - AC: input is name + email + postcode + donation history JSON.
  - AC: output dossier has Companies House appointments, Charity Commission trusteeships, and a public-domain bio paragraph.
  - AC: every claim in the dossier has a citation with URL + retrieval date.
  - AC: pipeline halts and escalates to human if entity-resolution confidence < 0.85.
  - Size: M
- Story 1.2 — ...
```

Sizing: XS (≤ 0.5 day) / S (1–2 days) / M (3–5 days) / L (1–2 weeks) / XL (> 2 weeks; must be split). Aim for ≥ 80% of stories at M or smaller. Tag each story with the epic, AC count, and dependencies on other stories. Order epics so the prototype can ship the smallest end-to-end slice first (one donor → one network → one lead dossier), then widen.

Include at least these epics for every strategy (mechanism varies, structure doesn't):
- E1 — Ingest and store a donor record with consent metadata.
- E2 — Enrich donor (Job A).
- E3 — Discover network candidates (Job B core).
- E4 — Score wealth tier and filter to £5M+.
- E5 — Enrich qualifying leads (Job C).
- E6 — Human checkpoint workflows (3 stacked).
- E7 — Output formatting and handover (export to fundraiser).
- E8 — Observability, audit log, citation integrity check.
- E9 — Compliance scaffolding (privacy notice updates, DSAR endpoint, deletion workflow).

### `PROTOTYPE_SCOPE.md`

- **Goal** of the 4–6 week prototype in one sentence ("prove that strategy X can produce a verified-correct lead dossier on N out of M test donors with the £5M+ threshold honoured").
- **In scope** — explicit list of stories from `BACKLOG.md`.
- **Out of scope** — explicit list of what's deferred to v2.
- **Definition of done** — measurable; reuses `TEST_PLAN.md` thresholds.
- **Resourcing assumption** — engineer-weeks, prospect-researcher-hours, vendor licences active.
- **Decision gate at end** — what evidence the user evaluates to decide whether to invest in v2.

### `TEST_PLAN.md`

- **Gold set design** — the user must hand-curate 10–20 known donors with known-good network connections to test against. Specify what fields the gold set needs and how the user assembles it. The gold set is the most important deliverable of week 1 — flag this prominently.
- **Metrics**, with pass/fail thresholds:
  - **Donor dossier accuracy** — % of factual claims that survive a human spot-check (target: ≥ 95%).
  - **Connection precision** — of connections surfaced, % that a human researcher confirms as real co-philanthropy (target: ≥ 90%).
  - **Connection recall** — of known co-philanthropy connections in the gold set, % the system surfaces (target: strategy-dependent; specify).
  - **Wealth-tier accuracy** — of leads classified £5M+, % a human researcher confirms as plausibly £5M+ given evidence shown (target: ≥ 85% for confirmed-band, ≥ 60% for estimated-band).
  - **Hallucination rate** — % of dossier claims that cannot be traced to a cited source (target: 0%; any non-zero is a stop-the-line bug).
  - **Time-to-dossier** — wall-clock from donor input to lead dossier delivered (target: strategy-dependent).
  - **Cost per dossier** — actual £ at the 100/month volume (target: matches `COST.md` ± 20%).
- **Test methodology** — how each metric is measured, who measures it, with what tooling.
- **Edge cases** to deliberately test: donors with very common names; donors with no Companies House footprint; donors who are recently deceased; donors connected to charities that file abridged accounts; leads with high name-collision risk; donors who are themselves trustees of Bloomsbury or its peer charities.
- **Exit criteria** — what evidence proves the prototype was a success, partial success, or failure.

### `HUMAN_CHECKPOINTS.md`

The user wants three layers stacked:

1. **Mid-pipeline shortlist review** — what the human sees, what they decide, what triggers escalation.
2. **Every-uncertainty-threshold review** — define thresholds (entity resolution < 0.85, wealth-tier confidence < 0.7, relationship strength < 0.6 — strategy may tune these). Show what the human reviews and the escalation path.
3. **Final dossier sign-off** — format, what the reviewer checks.

For each: the screen / file / interface the human uses (markdown file in a review folder is fine for v1 — no UI needed), the decisions they can make, the time budget per record, and what happens after their decision (proceed, send back for re-enrichment, reject, escalate).

### `COMPLIANCE.md`

- **LIA** — three-step test answers specific to this strategy (purpose / necessity / balancing). Pre-fill the parts you can; flag the parts that need the user/DPO.
- **DPIA hot-spots** — risks specific to this strategy (e.g. Strategy 2 routes UK donor data to US vendors → adequacy / IDTA implications).
- **Data retention** — how long enriched data is kept, when it's purged, where consent withdrawal triggers deletion.
- **DSAR handling** — how a Subject Access Request is fulfilled given the strategy's storage model. This must be a working procedure, not a placeholder.
- **Privacy notice clauses** — exact text additions Bloomsbury's privacy notice needs.
- **Third-party processor contracts** — DPA clauses required if vendors are used.

### `COST.md`

- **One-time** — build, LIA/DPIA preparation, vendor onboarding, integration.
- **Monthly fixed** — vendor licences, retainers, headcount allocation.
- **Monthly variable** — per-record API and LLM costs.
- **At 100/month** — total monthly + cost-per-dossier.
- **At 400/month** — total monthly + cost-per-dossier.
- **Sensitivity** — vendor fees +50%, qualifying-lead rate from 10% to 30%, latency tolerance from 24h to real-time.

Every figure labelled `[verified]` (with citation), `[vendor estimate]` (range with basis), or `[my estimate]` (reasoning shown).

---

## 9. Output quality rules

1. **Every factual claim cites a source** with URL + access date. If not findable, label `[my estimate]` with reasoning.
2. **Every cost figure** labelled per the convention in `COST.md`.
3. **Pricing for opaque vendors** (Wealth-X, iWave, WealthEngine — they don't publish prices) labelled `[vendor estimate]` with stated range and basis.
4. **Coverage and reliability claims** distinguish *theoretical provision* from *realistic UK coverage*.
5. **No padding, no restatements, no "I will now…"** — just produce the artefact.
6. **Push back where the user is wrong.** If research surfaces something contradicting a brief assumption, flag it in `09_risks_and_open_questions.md`.

---

## 10. Hard rule on hallucination

If you do not know something, search. If after reasonable search you cannot find it, say so and label as a question for the user. Do not invent vendor pricing, regulatory clauses, statistics, or facts about real individuals. Every number is sourced or estimated-with-reasoning.

If you find yourself generating a dossier-style claim about a real individual without a citation, stop. That is the failure mode this whole project exists to prevent.

---

## 11. Stop and ask the user when

- A regulatory question depends on Bloomsbury's specific donor consent language (only the user has it).
- A cost estimate has a range exceeding 5x and narrowing it requires user-driven RFQ to vendors.
- A strategy depends on a vendor contract the user has not confirmed they'll procure.
- You finish `07_ranking_and_recommendation.md` and need user judgement to break a near-tie.
- The user must hand-curate the gold set in `TEST_PLAN.md` — you cannot fabricate it.

You do NOT stop to ask permission to search, read public registers, or estimate. Do those, label them.

---

## 12. Done definition

The deliverable is done when:

- Layer 1 files (00–10) all exist and are populated.
- Each of the 5 `strategies/0X_*/` folders contains all 8 build-kit files, populated.
- Every figure is labelled.
- The recommendation in `07` is defensible against "why is this strategy more effective at delivering reliable connections + dossiers than the others?"
- The selected strategy's `BACKLOG.md` and `TEST_PLAN.md` are detailed enough that a fresh engineer could open them and start sprint 1 the next morning.
- `09_risks_and_open_questions.md` lists every question the user must answer before build-out begins.
- A reader who has never seen this project can read `00_executive_summary.md` and understand the recommendation in under 5 minutes.

---

## 13. What this project is not

- It is not building the pipeline. That comes after the user picks a strategy. But the build kit you produce must let the next session start without re-planning.
- It is not writing scrapers. All data sources used must be APIs with ToS permitting this use, or licensed datasets.
- It is not a CRM integration project (v1).
- It is not a donor outreach automation project. The pipeline produces dossiers; humans (donor or fundraiser) act on them.
