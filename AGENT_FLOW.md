# AGENT_FLOW.md — Multi-Agent Orchestration for the Donor Pipeline Planning Workflow

**Companion to:** `docs/CLAUDE.md`, `RESEARCH_PLAN.md`
**Purpose:** Defines a multi-agent loop with **accountable sign-off gating** that catches missing or unreliable information before any build begins. The loop never blocks — files that cannot pass sign-off after the maximum cycles advance with their unresolved objections logged as **decisions pending the user**. Final delivery is three HTML files plus the underlying markdown sources.

---

## 1. Design principles

1. **Agents are roles, not models.** Each agent is a system prompt + tool allowance + I/O contract. Multiple agents may share a model. Pick the cheapest model that clears the role's quality bar.
2. **Sign-off is the gating mechanism.** Four accountable signatories — fundraising director, DPO, senior engineer, CFO — each take ownership of files in their domain. Their refusal blocks advancement and forces revision. This is how missing or wrong information gets caught before build.
3. **The loop never blocks the user.** Maximum 3 cycles per file. If a file cannot earn full sign-off after 3 cycles, it advances anyway, but every unresolved objection is logged as a **user-decision-required** entry that surfaces in the final "decisions pending" HTML. Most files resolve in 1–2 cycles; the few that don't become explicit asks rather than failures.
4. **Files are the interface.** Agents communicate by writing/reading markdown and JSON in a structured workspace. The orchestrator routes; it does not reason about content.
5. **HTML is the final delivery only.** No per-file HTML during the loop. At the end: three HTML files (options + decision criteria, decisions pending, per-strategy backlog) plus the underlying `.md` sources in both forms.

---

## 2. The agent roster

Nine roles. Each has: role, model, tools, input contract, output contract.

### 2.1 `planner`

**Role.** Reads `docs/CLAUDE.md` and `RESEARCH_PLAN.md`. Produces the per-run task list — which phases to run, which strategies to instantiate, what overrides apply.

**Model.** Sonnet 4.6.
**Tools.** None (reads files only).
**Input.** `docs/CLAUDE.md`, `RESEARCH_PLAN.md`, optional `USER_OVERRIDES.md`.
**Output.** `workspace/00_run_plan.json`.
**Loop.** One-shot.

### 2.2 `researcher`

**Role.** Executes phases R1–R4 and R6 of `RESEARCH_PLAN.md`. Searches, fetches, synthesises, cites. Writes the decision-layer files.

**Model.** Sonnet 4.6 default; Opus 4.7 on revision passes flagged for low-confidence content.
**Tools.** `web_search`, `web_fetch`, file write.
**Input.** `workspace/00_run_plan.json` + the phase number.
**Output.** Phase-specific markdown to `workspace/decision_layer/`.
**Loop.** Subject to evaluator + sign-off cycles (§3).

### 2.3 `synthesiser`

**Role.** Executes R5 (ranking + top-N selection) and R8 (executive summary, risks, references).

**Model.** Opus 4.7 (cross-document reasoning, ranking justification).
**Tools.** File read/write only.
**Input.** All `workspace/decision_layer/*.md`.
**Output.** `07_ranking_and_recommendation.md` (containing the top-N selection block — see §6), `00_executive_summary.md`, `09_risks_and_open_questions.md`, `10_references.md`.

### 2.4 `builder`

**Role.** Executes R7 — instantiates each strategy as 8 build-kit files.

**Model.** Sonnet 4.6 with prompt caching of the decision-layer context. Cache once, reuse across all five builds.
**Tools.** File read/write. `web_search` only when sign-off requires sourced data.
**Input.** All decision-layer files + the strategy index being built.
**Output.** `workspace/strategies/0X_<name>/{STRATEGY,ARCHITECTURE,BACKLOG,PROTOTYPE_SCOPE,TEST_PLAN,HUMAN_CHECKPOINTS,COMPLIANCE,COST}.md`.
**Run shape.** One invocation per strategy. Sequential — caching depends on it. Anthropic batch API acceptable if 24h latency is fine.

### 2.5 `evaluator`

**Role.** Reads the previous agent's output and grades it against an objective rubric. Does NOT rewrite. Produces structured eval JSON with per-criterion scores.

**Model.** Sonnet 4.6.
**Tools.** File read; JSON write.
**Input.** Path to the file(s) being evaluated + the rubric for that file type.
**Output.** `workspace/evaluations/<file_path>.eval.json`:

```json
{
  "file": "strategies/03_open_source_agentic/BACKLOG.md",
  "evaluated_at": "2026-05-05T14:23:00Z",
  "rubric_version": "1.0",
  "scores": {
    "story_format_compliance": {"score": 5, "of": 5},
    "sprint_slicing_viability": {"score": 4, "of": 5, "notes": "E5 has 3 XL stories"},
    "citation_integrity": {"score": 3, "of": 5, "notes": "3 unsourced; lines 47, 92, 138"},
    "build_readiness": {"score": 4, "of": 5, "notes": "Story 3.4 ACs ambiguous"},
    "internal_consistency": {"score": 5, "of": 5}
  },
  "overall_score": 21,
  "max_score": 25,
  "pass_threshold": 22,
  "passed": false,
  "blocking_issues": ["citation_integrity below threshold", "Story 3.4 needs concrete ACs"],
  "non_blocking_issues": ["E5 stories need splitting"]
}
```

**Loop.** One-shot per evaluation pass.

### 2.6 Four signatory agents — accountable sign-off

Replaces the old "critic" role. Each signatory reads the file and answers one question: *Will I sign off that this file is accurate, feasible, and reliable within my domain?*

Each signatory is **named accountable** for the claims in their domain. They cannot sign outside their lane.

- **`signatory_fundraising`** — usefulness for warm-intro fundraising, donor sensitivity, charity reputation, output quality.
- **`signatory_dpo`** — UK GDPR / DPA 2018 / PECR / Code of Fundraising Practice compliance, LIA, DPIA, privacy notice, retention, DSAR procedures.
- **`signatory_engineer`** — architecture feasibility, data contracts, rate limits, observability, deployability, sprint plan realism, story quality.
- **`signatory_cfo`** — cost realism, vendor pricing, hidden costs (DPO time, gold-set assembly, RFQ effort), prototype ROI.

**Model.** Opus 4.7 for all four. The sign-off is the most consequential gate; underspending here collapses the whole flow's value.
**Tools.** File read; JSON write.
**Input.** The file, the evaluator JSON, and the signatory's domain brief from `workspace/personas/`.
**Output.** `workspace/signoffs/<file_path>.<persona>.signoff.json`:

```json
{
  "file": "strategies/03_open_source_agentic/COMPLIANCE.md",
  "persona": "dpo",
  "cycle": 2,
  "in_scope": true,
  "verdict": "refuse",
  "blocking_objections": [
    {
      "id": "DPO-1",
      "claim": "Privacy notice clause does not name the LLM provider",
      "evidence": "ICO guidance requires named third-party processors in privacy notices",
      "required_fix": "Add Anthropic to the named-processors list; reference the DPA"
    },
    {
      "id": "DPO-2",
      "claim": "Retention period stated as 7 years without justification",
      "required_fix": "Justify with reference to Bloomsbury's retention schedule, or replace with a sourced figure"
    }
  ],
  "non_blocking_objections": [],
  "i_will_sign_when": "Both DPO-1 and DPO-2 are addressed",
  "signed_at": null
}
```

**Sign-off verdicts:**

- `sign` — file is in lane, file is acceptable, persona accepts named accountability for it.
- `refuse` — file is in lane, has blocking objections, persona will not sign until resolved.
- `n/a` — file is not in this persona's lane (e.g. engineer reading legal text). Does not gate.

**A file ADVANCES when:**

- Every in-scope signatory returns `sign`, OR
- The file has been through 3 revision cycles (regardless of remaining refusals — see §3 termination rule).

### 2.7 `reviser`

**Role.** Takes the original file, the evaluator notes, and the union of blocking objections from all refusing signatories. Rewrites to address every blocking item. Preserves what already passed.

**Model.** Sonnet 4.6 default; Opus 4.7 if total blocking objections ≥ 4.
**Tools.** File read/write. `web_search` if sourced data was demanded.
**Input.** Original file + evaluator JSON + all signatory JSONs.
**Output.** Overwrites original. Appends to `workspace/changelogs/<file_path>.log`:

```
## Revision 2 — 2026-05-05T15:01:00Z
- Addressed DPO-1: added Anthropic to named-processors list; referenced DPA
- Addressed DPO-2: replaced 7-year figure with reference to ICO retention guidance
- Addressed ENG-1: tightened Story 3.4 ACs
- Outstanding after revision: none
```

### 2.8 `pm` and `engineer` — the consolidation pair

**Role.** Two-agent dialogue. Reads the approved decision layer + the top-2-or-3 selected strategies. Per selected strategy, produces a **consolidated technical backlog** that goes deeper than the per-strategy `BACKLOG.md` — sequenced sprints, capacity assumptions, dependency graph, risk burndown, plus PM/engineer decision notes.

**Model.** Opus 4.7 for both. Dialogue alternates writes to a shared file with role tags.
**Tools.** File read/write.
**Input.** Top-N strategy folders + their `BACKLOG.md`, `ARCHITECTURE.md`, `PROTOTYPE_SCOPE.md`, `TEST_PLAN.md`.
**Output per selected strategy:**
- `strategies/0X_<name>/TECHNICAL_BACKLOG.md` — consolidated backlog with sprints, dependencies, capacity.
- `strategies/0X_<name>/DECISION_NOTES.md` — recorded debate, choices made, alternatives considered.
- `strategies/0X_<name>/HANDOFF.md` — one-page handoff: sprint 1 scope, success metric, ownership.

**Run shape.** Three turns per strategy: PM (scope/value/sequence) → Engineer (feasibility/dependencies/risk) → PM (final sprint plan). Three turns × N selected strategies (2 or 3).

**Loop.** These outputs ALSO go through evaluator + sign-off, with `signatory_pm` and `signatory_engineer` as the in-scope reviewers (they sign their own work — but as critics of each other's contribution within the file). This catches the case where the dialogue agreed on something neither would defend in isolation.

### 2.9 `renderer`

**Role.** Converts selected workspace markdown into the three HTML handoff files. Deterministic Python. No LLM.

**Tools.** File read/write, shell.
**Input.** `workspace/` tree + the top-N selection from `07_ranking_and_recommendation.md` + `workspace/decisions_pending.json` (compiled by the orchestrator from all unresolved sign-off objections).
**Output.** `output/handoff/` — see §7.

---

## 3. The loop graph

```
                    ┌──────────────┐
                    │   planner    │
                    └──────┬───────┘
                           │ run_plan.json
                           ▼
          ┌────────────────────────────────────────┐
          │  for each phase in run_plan:           │
          │                                        │
          │   ┌──────────────┐                     │
          │   │  researcher  │                     │
          │   └──────┬───────┘                     │
          │          ▼                             │
          │   ┌──────────────┐                     │
          │   │  evaluator   │                     │
          │   └──────┬───────┘                     │
          │          ▼                             │
          │   ┌──────────────────────────────────┐ │
          │   │  4 signatories sign in parallel  │ │
          │   │  (fundraising, dpo, eng, cfo)    │ │
          │   └──────┬───────────────────────────┘ │
          │          │                             │
          │   all in-scope verdicts == "sign"?     │
          │          │                             │
          │     yes ─┼─► next phase                │
          │     no  ─┤                             │
          │          ▼                             │
          │   ┌──────────────┐                     │
          │   │   reviser    │                     │
          │   └──────┬───────┘                     │
          │          │                             │
          │   cycle < 3? ──── yes ──► back to evaluator
          │          │                             │
          │   cycle >= 3 ──► advance with          │
          │   unresolved objections logged as      │
          │   user-decisions-required              │
          └────────────────────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ synthesiser  │ → 07, 00, 09, 10
                    │ (with top-N  │
                    │  selection)  │
                    └──────┬───────┘
                           │ (same eval+signoff+revise loop)
                           ▼
                    ┌──────────────┐
                    │   builder    │ × 5 strategies
                    └──────┬───────┘
                           │ (eval+signoff+revise per file × 8 files × 5)
                           ▼
              ┌────────────────────────────┐
              │  pm ↔ engineer pair        │
              │  on top 2 or 3 strategies  │
              │  (3 turns each)            │
              └──────────────┬─────────────┘
                             │ (eval+signoff on TECHNICAL_BACKLOG, DECISION_NOTES, HANDOFF)
                             ▼
              ┌────────────────────────────┐
              │ orchestrator compiles      │
              │ decisions_pending.json     │
              │ from all unresolved        │
              │ objections across the run  │
              └──────────────┬─────────────┘
                             ▼
                    ┌──────────────┐
                    │   renderer   │
                    └──────┬───────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  HUMAN: review 3 HTML files│
              │  + .md sources, then sign  │
              │  APPROVED.md               │
              └────────────────────────────┘
```

### Loop termination rules (hard)

| Loop | Max cycles | At max-out |
|---|---|---|
| Researcher / synthesiser / builder file revision | **3** | File advances. Unresolved blocking objections from refusing signatories are appended to `workspace/decisions_pending/<file_path>.json` for surfacing in the final HTML. |
| PM ↔ engineer dialogue | Fixed at 3 turns | N/A — fixed |
| PM ↔ engineer output revision | **3** | Same as above |

### Critical rule — non-blocking advancement

When a file exits the loop with unresolved refusals, the orchestrator appends entries to `workspace/decisions_pending.json` with this shape:

```json
{
  "file": "strategies/02_commercial_apis/COMPLIANCE.md",
  "advanced_with_unresolved_objections": true,
  "cycles_used": 3,
  "remaining_objections": [
    {
      "raised_by": "dpo",
      "id": "DPO-3",
      "claim": "Wealth-X data routing implies a restricted transfer to a US processor; IDTA may be required",
      "required_fix_attempted": "Reviser added an IDTA placeholder but cannot confirm whether Bloomsbury's existing vendor contracts satisfy this without legal review",
      "user_decision_required": "Confirm with legal counsel whether Wealth-X DPA + SCCs are sufficient or whether an IDTA is required, then update the COMPLIANCE.md privacy notice clause accordingly"
    }
  ]
}
```

These entries become rows in `02_decisions_pending.html` (§7). The flow continues to the next phase regardless. The user is the final adjudicator.

### Why this works better than hard-blocking

- **Most files resolve in 1–2 cycles.** Sign-off gating filters the easy fixes early.
- **Hard problems get surfaced, not hidden.** The 5–10% of files that hit cycle 3 are the ones where automated agents genuinely cannot resolve the question without user knowledge (Bloomsbury's actual donor consent language, vendor contract terms, DPO's view on a specific edge case).
- **The user gets one consolidated decision pack** at the end, not interruptions during the run.
- **The build kit is always complete.** Every strategy folder has all its files. None are missing because the loop got stuck.

### Pass thresholds (per file type)

The evaluator scores against these. The signatories' refusal-list is independent — both must clear for `sign`.

| File type | Pass score | Max score |
|---|---|---|
| Decision layer (`01`–`04`, `06`) | 21 | 25 |
| Recommendation (`07`) | 23 | 25 |
| Build-kit `STRATEGY.md`, `COST.md` | 20 | 25 |
| Build-kit `BACKLOG.md`, `TEST_PLAN.md`, `ARCHITECTURE.md` | 22 | 25 |
| Build-kit `COMPLIANCE.md` | 23 | 25 |
| `TECHNICAL_BACKLOG.md`, `DECISION_NOTES.md`, `HANDOFF.md` | 22 | 25 |

---

## 4. Rubrics

### 4.1 Generic rubric (5 dimensions × 5 points = 25 max)

Used by the evaluator on every file unless a specialised rubric overrides.

1. **Completeness.** Every section the file template requires is present and non-trivially populated.
2. **Specificity.** Claims are concrete. No vague phrasing where a number, name, or URL is expected.
3. **Citation integrity.** Every factual claim has a source. Every estimate is labelled with reasoning. Zero hallucinations on real individuals, real prices, real regulatory text.
4. **Build readiness.** A fresh engineer or compliance officer can act on this file without re-research.
5. **Internal consistency.** No contradictions with adjacent files (`BACKLOG.md` ↔ `ARCHITECTURE.md`, `PROTOTYPE_SCOPE.md` ↔ `TEST_PLAN.md`, `COST.md` ↔ `06_cost_models.md`).

### 4.2 Specialised rubric for `BACKLOG.md`

Replaces dimensions 1–2:

1. **Story format compliance.** Every story uses As-a/I-want/So-that with explicit ACs, size, and dependencies.
2. **Sprint slicing viability.** ≥80% of stories sized M or smaller. Dependency graph permits a sprint-1 thin slice (one donor → one network candidate → one lead dossier).
3. (Citation integrity, build readiness, internal consistency as above.)

### 4.3 Specialised rubric for `COMPLIANCE.md`

Replaces dimension 4:

4. **Legal defensibility.** A DPO can (a) sign off the LIA, (b) produce a DPIA from the listed hot-spots, (c) update the privacy notice from the provided clauses, (d) handle a DSAR using the documented procedure, without coming back with questions. Anything that forces re-engagement is a deduction.

### 4.4 Signatory domain briefs

Each signatory has a brief in `workspace/personas/`. The briefs define their lane and what they look for:

- **`fundraising_director.md`** — outcomes-oriented. Reads as a senior charity executive. In lane: `STRATEGY.md`, `BACKLOG.md` (epics 7), `HUMAN_CHECKPOINTS.md`, `TEST_PLAN.md`, `HANDOFF.md`, `01_context.md`, `00_executive_summary.md`, `07_ranking_and_recommendation.md`. Out of lane: pure technical or compliance details.
- **`dpo.md`** — UK GDPR, PECR, ICO 2017 enforcement context, 2025 Code of Fundraising Practice. In lane: `COMPLIANCE.md`, `02_regulatory_frame.md`, the parts of `BACKLOG.md` and `TEST_PLAN.md` that touch personal data, the privacy-notice clauses anywhere they appear. Out of lane: cost optimisation, sprint sequencing.
- **`senior_engineer.md`** — implementability. In lane: `ARCHITECTURE.md`, `BACKLOG.md`, `TECHNICAL_BACKLOG.md`, the test methodology in `TEST_PLAN.md`, `04_signal_inventory.md`, `HANDOFF.md`. Out of lane: regulatory text, fundraising tone.
- **`cfo.md`** — financial realism. In lane: `COST.md`, `06_cost_models.md`, the resourcing assumptions in `PROTOTYPE_SCOPE.md`, vendor sections of `04_signal_inventory.md`. Out of lane: compliance language, story-level acceptance criteria.

A signatory who finds a file out of their lane returns `verdict: "n/a"`. They do NOT bandwagon — engineers don't approve legal text just because the lawyer hasn't gotten to it yet.

---

## 5. Workspace layout

```
workspace/
├── 00_run_plan.json
├── decision_layer/
│   ├── 01_context.md
│   ├── 02_regulatory_frame.md
│   ├── 03_reliability_ceiling.md
│   ├── 04_signal_inventory.md
│   ├── 06_cost_models.md
│   ├── 07_ranking_and_recommendation.md
│   ├── 00_executive_summary.md
│   ├── 09_risks_and_open_questions.md
│   └── 10_references.md
├── strategies/
│   ├── 01_factary/                    [8 base files]
│   ├── 02_commercial_apis/
│   ├── 03_open_source_agentic/
│   ├── 04_hybrid_tiered/
│   └── 05_human_led/
│   (top-N selected also get TECHNICAL_BACKLOG.md, DECISION_NOTES.md, HANDOFF.md)
├── evaluations/                       [one .eval.json per file]
├── signoffs/                          [one .signoff.json per (file × persona)]
├── changelogs/                        [one .log per revised file]
├── decisions_pending/                 [per-file unresolved objections]
├── decisions_pending.json             [aggregated for renderer]
├── personas/
│   ├── fundraising_director.md
│   ├── dpo.md
│   ├── senior_engineer.md
│   └── cfo.md
└── run_metadata.json                  [agent invocations, costs, timings]

output/
└── handoff/
    ├── 01_options_and_decision_criteria.html
    ├── 02_decisions_pending.html
    ├── 03_backlog_<strategy_a>.html
    ├── 03_backlog_<strategy_b>.html
    ├── (03_backlog_<strategy_c>.html if 3 selected)
    ├── markdown/                      [all .md sources, mirrored]
    └── assets/
```

---

## 6. Top-N selection rule (2 or 3)

The synthesiser determines whether to select 2 or 3 strategies for the PM/engineer phase, using this rule, applied after computing each strategy's effectiveness-weighted score:

1. **Always select the #1 ranked strategy.**
2. **Always select the #2 ranked strategy.**
3. **Select the #3 ranked strategy IF its overall score is within 2 points (out of 25) of the #1.**

Rationale:

- Top 2 always — the user wants real comparison, not a single-option vote.
- Top 3 only when there's genuine contention — surfacing a #3 that trails by 5+ points wastes effort building a backlog for an option that won't be picked.
- The user can override via `USER_OVERRIDES.md` with `force_strategies: [1, 3, 5]` syntax.

The synthesiser writes the selection block into `07_ranking_and_recommendation.md`:

```markdown
## Top-N selection

- **Strategy 4 (Hybrid Tiered)** — overall 22/25 — selected.
- **Strategy 3 (Open-source agentic)** — overall 21/25 — selected (within 2 points of top).
- **Strategy 2 (Commercial APIs)** — overall 19/25 — selected (within 2 points of top).
- Strategy 5 (Human-led) — overall 16/25 — not selected.
- Strategy 1 (Factary) — overall 15/25 — not selected.

Three strategies forwarded to PM/engineer consolidation.
```

---

## 7. The HTML handoff (final delivery)

Three files. Static. No JS. Open offline in a browser. Markdown sources mirrored alongside.

### 7.1 `01_options_and_decision_criteria.html`

**Purpose.** What the user reads to choose.

**Sections:**
- One-paragraph executive summary.
- Selected strategies (2 or 3) shown side-by-side: mechanism of reliability, headline cost at 100/month and 400/month, expected effectiveness on Jobs A/B/C with reasoning, "when to choose this."
- Decision criteria — explicit list of dimensions the user should weigh: effectiveness, cost, risk profile, time-to-value, organisational fit.
- Why these were selected (synthesiser's selection block).
- The two unselected strategies in a smaller "also considered, ranked lower because…" block.
- Link to each selected strategy's full backlog HTML (file 03 series).

**Visual treatment:** Estimate badges (green `[verified]`, amber `[vendor estimate]`, blue `[my estimate]`) so the user scans confidence at a glance.

### 7.2 `02_decisions_pending.html`

**Purpose.** Every unresolved question the user must answer before build can proceed.

**Compiled from:**
- All unresolved signatory objections (cycle-3 advances) in `workspace/decisions_pending.json`.
- All open questions logged in `09_risks_and_open_questions.md`.
- Vendor RFQ asks (where `[vendor estimate]` ranges exceed 5x — `COST.md` flags these).
- Gold-set assembly ask (the one item agents cannot fabricate).

**Format.** A single sortable table:

| Decision | Raised by | File | Severity | What's needed | Default if unanswered |
|---|---|---|---|---|---|
| Confirm donor consent covers third-party network research | DPO | `02_regulatory_frame.md` | Blocking | Bloomsbury's existing consent language, reviewed by DPO | Strategy assumes consent is sufficient; flagged as risk |
| Wealth-X IDTA requirement | DPO | `strategies/02_commercial_apis/COMPLIANCE.md` | Blocking | Legal review of vendor contract | Strategy 2 cannot ship without resolution |
| Vendor RFQ — iWave UK pricing | CFO | `04_signal_inventory.md` | Material | Direct quote from iWave for Bloomsbury volume | Cost estimate range remains £15k–£40k/year |
| Gold set | Engineer | `TEST_PLAN.md` | Build-blocking | 10–20 known-good donor records with ground-truth networks | Build cannot test |

**Visual treatment.** Red banner at the top with the count of blocking decisions. Group rows by severity. Each row links to the relevant `.md` file for context.

### 7.3 `03_backlog_<strategy>.html` (one per selected strategy)

**Purpose.** The actionable build kit for the strategy. The file the user hands to whoever builds.

**Embeds, in order:**
- `STRATEGY.md`
- `ARCHITECTURE.md`
- `TECHNICAL_BACKLOG.md` (the consolidated PM + engineer output, deeper than the per-strategy `BACKLOG.md`)
- `BACKLOG.md` (the strategy-level baseline backlog)
- `PROTOTYPE_SCOPE.md`
- `TEST_PLAN.md`
- `HUMAN_CHECKPOINTS.md`
- `COMPLIANCE.md`
- `COST.md`
- `DECISION_NOTES.md` (PM/engineer debate log)
- `HANDOFF.md` (one-page sprint-1 brief)

**Sidebar** with anchor links to each section.
**Footer** lists which signatories signed off and which raised objections that were resolved or escalated. The user can verify the accountability chain.

**Markdown delivery.** All these `.md` files are also delivered in `output/handoff/markdown/strategies/0X_<name>/` so the user has them in both formats. The HTML is for review; the markdown is for the next session to consume directly.

### Rendering rules

- **Markdown:** rendered with `python-markdown` + extensions (tables, footnotes, attr_list, fenced_code, def_list).
- **Citations:** `[ref:N]` and bare URL links get hover tooltips with source name and access date pulled from `10_references.md`.
- **Estimate labels:** `[verified]` / `[vendor estimate]` / `[my estimate]` rendered as coloured badges.
- **Cross-file links:** references like `Story 3.4` or `signal.companies_house.officers_appointments` become clickable.
- **Print stylesheet:** included for offline PDF export.

### Build command

```
python -m renderer.build \
  --workspace ./workspace \
  --output ./output/handoff
```

Single Python script. ≤400 lines. No build system, no Node.

---

## 8. Orchestrator implementation

Single Python file, ~500 lines. Pseudocode:

```python
def run():
    plan = run_planner()
    for phase in plan["research_phases"]:
        run_phase_with_signoff_loop(phase, role="researcher")

    run_phase_with_signoff_loop("synthesiser", role="synthesiser")

    for strategy_idx in [1, 2, 3, 4, 5]:
        for file_name in BUILD_KIT_FILES:
            run_phase_with_signoff_loop((strategy_idx, file_name), role="builder")

    selected = read_top_n_selection_from_recommendation()  # 2 or 3
    for strategy_idx in selected:
        run_pm_engineer_dialogue(strategy_idx)
        for file_name in ["TECHNICAL_BACKLOG.md", "DECISION_NOTES.md", "HANDOFF.md"]:
            run_phase_with_signoff_loop((strategy_idx, file_name), role="pm_engineer")

    compile_decisions_pending()  # aggregates from all sources
    run_renderer()
    print("Open output/handoff/01_options_and_decision_criteria.html")

def run_phase_with_signoff_loop(target, role):
    file_path = run_agent(role, target)
    for cycle in range(1, MAX_CYCLES + 1):  # MAX_CYCLES = 3
        eval_result = run_evaluator(file_path)
        signoffs = run_signatories_in_parallel(file_path, eval_result)
        if all_in_scope_signed(signoffs) and eval_result["passed"]:
            return  # file approved
        if cycle == MAX_CYCLES:
            log_unresolved_to_decisions_pending(file_path, eval_result, signoffs)
            return  # advance anyway
        run_reviser(file_path, eval_result, signoffs, cycle=cycle + 1)
```

### Invariants

1. No agent runs unless its inputs exist on disk.
2. Every invocation logged to `run_metadata.json` with timestamp, model, input/output paths, token counts, USD cost.
3. Agent failures (timeout, API error, malformed output) retry up to 3 times with exponential backoff before escalating.
4. `MAX_CYCLES = 3` is configurable via env var; the default is the contract.
5. Reproducible: same inputs → same outputs (modulo LLM noise; mitigate with `temperature=0.2`).
6. The flow always reaches the renderer. There is no path that aborts without producing the three HTML files.

---

## 9. Cost envelope (estimated)

A full run end-to-end. All `[my estimate]` based on published pricing.

| Phase | Agent(s) | Calls | Tokens (in/out) | Model(s) | Estimated cost |
|---|---|---|---|---|---|
| Planning | planner | 1 | 20k / 2k | Sonnet | ~$0.10 |
| R1–R4, R6 | researcher | 5 | 80k / 12k each | Sonnet | ~$3.50 |
| R1–R4, R6 | evaluator | 5 | 30k / 2k each | Sonnet | ~$0.60 |
| R1–R4, R6 | 4 signatories × 5 files (avg 1.6 cycles) | ~32 | 30k / 4k each | Opus | ~$10.00 |
| R1–R4, R6 | reviser (~50% trigger) | 3 | 80k / 12k each | Sonnet | ~$2.10 |
| Synth (07/00/09/10) | synthesiser | 4 | 100k / 8k each | Opus | ~$2.80 |
| Synth | eval + signoff + revise | varied | — | mixed | ~$5.00 |
| R7 | builder × 5 strategies × 8 files = 40 generations | 40 | 60k / 8k (with cache) | Sonnet | ~$8.00 |
| R7 | eval × 40 | 40 | 30k / 2k | Sonnet | ~$5.00 |
| R7 | 4 signatories × 40 (avg 1.5 cycles, in-scope filter ~60%) | ~144 | 30k / 4k | Opus | ~$45.00 |
| R7 | reviser × 40 (avg 50% trigger) | 20 | 60k / 10k | mixed | ~$10.00 |
| Final | pm + engineer × 3 strategies × 3 turns | 9 | 60k / 5k | Opus | ~$3.00 |
| Final | signoff + revise on 9 final files | varied | — | mixed | ~$8.00 |
| Renderer | (no LLM) | 0 | — | — | $0 |
| **Total (3 selected)** | | | | | **~$103** |

With prompt caching of decision-layer context across builder calls and signatory calls reading the same context repeatedly, real cost is closer to **$60–80**.

This is per-run. Subsequent re-runs after user feedback are much cheaper because cached context survives and only affected files re-process.

The biggest cost driver is the signatory step. This is intentional — sign-off accountability is the value-add of the whole loop. Cutting it to save money would defeat the purpose.

---

## 10. What the user does

1. Drops `docs/CLAUDE.md`, `RESEARCH_PLAN.md`, and `AGENT_FLOW.md` into the project root.
2. Optional `USER_OVERRIDES.md` for any forcing functions (skip a strategy, force model choice, force top-3 even on a tied score).
3. Runs `python -m orchestrator.run`.
4. Waits ~6–10 hours (LLM latency, especially the signatory step).
5. Opens `output/handoff/01_options_and_decision_criteria.html`.
6. Reads the recommendation, opens each `03_backlog_*.html` to inspect.
7. Opens `02_decisions_pending.html` and resolves each pending decision (some need DPO input, some need vendor RFQ, some need legal counsel, gold set assembly).
8. Approves a strategy (or two) by writing `output/APPROVED.md`:

```markdown
# Approved for build

## Selected
- Strategy 4 (Hybrid Tiered) — primary build
- Strategy 3 (Open-source agentic) — parallel build for comparison

## Decisions resolved (with answers)
- Donor consent: confirmed covers third-party research [DPO email 2026-05-12]
- Wealth-X IDTA: not required, SCCs in vendor DPA sufficient [legal memo 2026-05-15]
- iWave RFQ: £18k/year quoted, used as fixed cost
- Gold set: 12 records assembled, in workspace/gold_set.csv

## Decisions deferred (build proceeds with documented assumption)
- ...

## Notes
- ...
```

9. Hands `APPROVED.md` plus the selected `strategies/0X_*/` markdown folders to the next session, which builds.

---

## 11. Failure modes

### Handled by sign-off + 3-cycle loop

- Researcher hallucinates a price → evaluator catches missing citation → CFO signatory refuses → reviser searches and inserts.
- Builder writes a story without ACs → backlog rubric flags it → engineer signatory refuses → revised in cycle 2.
- Compliance file misses a DPIA hot-spot → DPO refuses → reviser adds the section.
- Cross-file inconsistency (BACKLOG.md says SQLite, ARCHITECTURE.md says Postgres) → consistency rubric + engineer signatory both flag.

### Surfaced as decisions pending (handled by user)

- Donor consent language ambiguity → DPO refuses, reviser tries, agents lack the actual contract → cycle 3 advance → entry in `02_decisions_pending.html`.
- Vendor pricing range too wide → CFO refuses, reviser cannot narrow without RFQ → entry in pending.
- Genuinely contested regulatory point (IDTA on US vendor, retention period vs Bloomsbury's existing schedule) → DPO refuses, reviser cannot resolve from public sources → entry in pending.

### Not handled — orchestrator fails

- LLM API outage > retry window — orchestrator surfaces error and exits cleanly. User reruns from the last completed phase (state is on disk).
- Workspace disk full — same.

The loop never stalls indefinitely. It either advances or surfaces an actionable user task.

---

## 12. Maintenance and re-runs

After build feedback or new evidence:

1. Add `workspace/feedback/` markdown files describing what changed.
2. Run `python -m orchestrator.run --mode=refine`. The planner reads feedback and produces a smaller `run_plan.json` covering only affected files.
3. Loop runs only on those files. Cost typically <20% of an initial run.

This keeps the planning artefact current as the build progresses.

---

## 13. Done definition

The flow is done when:

1. `output/handoff/01_options_and_decision_criteria.html`, `02_decisions_pending.html`, and one `03_backlog_*.html` per selected strategy all exist and render without errors.
2. `output/handoff/markdown/` mirrors the source markdown for every file the user might want to consume directly.
3. Every cost in the pack is labelled with its source convention.
4. `02_decisions_pending.html` lists every blocking issue that prevented full sign-off, plus all open questions and RFQ asks.
5. The selected strategy folders each contain `TECHNICAL_BACKLOG.md`, `DECISION_NOTES.md`, and `HANDOFF.md` from the PM/engineer pair.
6. `run_metadata.json` shows total cost, total tokens, all agent invocations, and a per-file sign-off audit trail.
7. The user can open the pack offline and produce `APPROVED.md` without further questions of the system.
