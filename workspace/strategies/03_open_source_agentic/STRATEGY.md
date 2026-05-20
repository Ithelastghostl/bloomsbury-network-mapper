# Strategy 3 — Open-Source Agentic Pipeline

**Version:** 1.0 | **Date:** 2026-05-05

---

## Mechanism of Reliability

Strategy 3's reliability is grounded in the Charity Commission bulk register, which provides near-deterministic co-trusteeship recall (~90–95% [my estimate] — see R3 §1) because trustee disclosure is structurally enforced by statute (Charities Act 2011, s.30) for all ~170,000 registered charities in England and Wales. A co-trusteeship query against `signal.charity_commission_ew.trustee_data` — specifically the `GetTrusteeAndRelatedCharities` endpoint — retrieves essentially all shared-charity connections for any named individual as a near-deterministic open-data join; no commercial tool adds meaningfully to this signal. Companies House (`signal.companies_house.officer_appointments`, `signal.companies_house.persons_with_significant_control`) extends the network to ~70–80% recall for formal corporate roles [my estimate — R3 §3], providing a deterministic layer for PSC-registered controlling shareholders (>25% equity). 360Giving GrantNav (`signal.threesixtygiving.grantnav`) adds grant-history evidence for any individual connected to a receiving organisation. HMLR Overseas Companies (`signal.hmlr.overseas_companies_property`) identifies UK property held via foreign corporate vehicles. Targeted web search fills biographical gaps. Claude Code orchestrates all agents, Claude Haiku resolves entity ambiguity, Claude Sonnet synthesises Job A dossiers, and Claude Opus produces Job C lead dossiers. Every claim is traceable to a URL or API response. The structural weakness is signals _not_ covered by registers: individual donation history (~5–10% open-source recall [my estimate — R3 §2]) and £5M+ net worth confirmation (<5% open-source recall [my estimate — R3 §4]); many leads will be flagged "probable £5M+" rather than confirmed.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  DONOR INTAKE                                                       │
│  DonorIngestionCLI                                                  │
│  {name, email, postcode, donation_history, consent_metadata}        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ tracking_id
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ENTITY RESOLUTION                                                  │
│  EntityResolutionAgent  (Claude Haiku)                              │
│  Disambiguates name variants; assigns canonical_id + confidence     │
└──────┬──────────────────────────────────────────────────────────────┘
       │ canonical_id
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  PARALLEL DATA ACQUISITION (fan-out; all agents write to shared SQLite record store)             │
│                                                                                                  │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────────────────┐   │
│  │  TrusteeGraphAgent    │  │  CompaniesHouseAgent  │  │  GrantNavAgent                     │   │
│  │  CC API               │  │  CH API               │  │  360Giving GrantNav                │   │
│  │  GetTrusteeAnd        │  │  officer_appointments │  │  signal.threesixtygiving.grantnav   │   │
│  │  RelatedCharities     │  │  + PSC register       │  │  (bulk CSV; no API rate limit)     │   │
│  │  → co-trustee graph   │  │  → director/PSC roles │  └────────────────────────────────────┘   │
│  └───────────────────────┘  └───────────────────────┘                                           │
│                                                                                                  │
│  ┌───────────────────────┐  ┌───────────────────────┐                                           │
│  │  PropertyAgent        │  │  WebSearchAgent        │                                          │
│  │  HMLR OCOD            │  │  Targeted web search   │                                          │
│  │  signal.hmlr.overseas │  │  → advisory boards,    │                                          │
│  │  _companies_property  │  │    event co-attendance,│                                          │
│  │  → overseas property  │  │    honours, media      │                                          │
│  └───────────────────────┘  └───────────────────────┘                                           │
│                                                                                                  │
│  ┌────────────────────────────────────┐                                                         │
│  │  SanctionsAgent                    │                                                         │
│  │  signal.ofsi.uk_sanctions_list     │                                                         │
│  │  → PEP / sanctions flag            │                                                         │
│  └────────────────────────────────────┘                                                         │
└──────────────────────────────┬───────────────────────────────────────────────────────────────────┘
                               │ raw signals
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  WEALTH SCORING                                                     │
│  WealthScoringAgent  (Claude Sonnet)                                │
│  PSC-tier deterministic + web-signal probabilistic →                │
│  wealth_tier: confirmed_5m | probable_5m | insufficient_signal      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  JOB A SYNTHESIS                                                    │
│  SynthesisAgent  (Claude Sonnet)                                    │
│  Donor enrichment dossier; source URL for every claim               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ shortlist (wealth_tier ≠ insufficient)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  HUMAN REVIEW — CHECKPOINT 1                                        │
│  HumanReviewQueue                                                   │
│  Fundraiser confirms shortlist; removes out-of-scope candidates     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ approved leads
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  JOB C LEAD DOSSIERS  (batch API, 24h latency)                      │
│  SynthesisAgent  (Claude Opus)                                      │
│  Full dossier: connections, capacity, giving interests, risks       │
│  £5M+ confirmed vs. £5M+ probable clearly distinguished            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  HUMAN REVIEW — CHECKPOINT 2 (FINAL SIGN-OFF)                      │
│  Fundraiser reviews; approves for outreach                          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    OUTPUT     │
                    │  Lead dossier │
                    │  + audit log  │
                    └───────────────┘

AuditLogger runs throughout — all API calls, entity resolution decisions,
wealth scoring rationale, and human review decisions are recorded with
timestamps and operator IDs.
```

---

## Data Sources

| Signal ID | Description | Job fit |
|---|---|---|
| `signal.companies_house.officer_search` | Officer search across all CH-registered entities | B: high |
| `signal.companies_house.officer_appointments` | Full appointment history for a given officer_id | B: high |
| `signal.companies_house.persons_with_significant_control` | PSC register — >25% ownership, deterministic wealth indicator | A: med; B: high; C: med |
| `signal.charity_commission_ew.trustee_data` | CC register; `GetTrusteeAndRelatedCharities` for co-trustee network | B: high (core) |
| `signal.threesixtygiving.grantnav` | UK grant history from 275+ funders; 1M+ grants | A: high |
| `signal.hmlr.overseas_companies_property` | HMLR OCOD — overseas entity property in E&W | A: med; C: high |
| `signal.ofsi.uk_sanctions_list` | UK Sanctions List (FCDO/OFSI) — replaces OFSI Consolidated List from 28 Jan 2026 | C: high |
| Web search (Serper.dev or equivalent) | Advisory boards, event co-attendance, honours, adverse media | A: low-med; B: low-med |

---

## Coverage and Accuracy by Job

### Job A — Donor enrichment
- **Substantially complete dossiers:** ~30–45% [my estimate — R3 §, citing structural weakness on donation history and wealth]
- Trustee/director skeleton reliable and sourced; wealth and giving history sparse for most individuals
- Dossiers are accurate but expect thin outputs for individuals with limited formal/public footprint

### Job B — Network discovery (primary strength of this strategy)
- **Co-trusteeship recall: ~90–95%** [my estimate — R3 §1; cited from R3: "structurally enforced by statute"]
- **Corporate connection recall: ~70–80%** [my estimate — R3 §3; PSC register has a hard gap below 25% threshold]
- Strategy 3 is the highest-recall strategy for shared-trusteeship signal across all five candidates [R7 effectiveness ranking]

### Job C — £5M+ qualification
- **Confirmed £5M+: ~5–15%** [my estimate — R3 §4; PSC-tier is deterministic but narrow; below that threshold the structural ceiling applies without commercial enrichment]
- ~85–95% of leads flagged as "probable £5M+" rather than "confirmed £5M+" — this is the honest structural ceiling, not a pipeline failure
- Confirmed vs. probable is always explicitly distinguished in every dossier

---

## Failure Modes

| Failure mode | Severity | Mitigation |
|---|---|---|
| Entity resolution on common names (e.g., "John Smith") — wrong person merged | High | EntityResolutionAgent tags confidence; < 0.85 confidence blocks automation; human review required |
| PSC threshold gap — individual with 24% stake in £200m company is invisible | High | Flag as structural gap in every dossier; do not assert absent ownership as zero ownership |
| Abridged charity accounts — financial detail not available below statutory threshold | Medium | Log data absence explicitly; do not infer from missing data |
| Sparse web results for private individuals — web search returns noise or nothing | Medium | Require source URL for every web-sourced claim; low-signal web results suppressed not fabricated |
| Hallucination on unverifiable wealth claims | High | Claude must cite source for every claim; zero tolerance policy enforced by prompt; WealthScoringAgent must label every figure as "confirmed" or "estimated" with basis shown |
| Charity Commission API beta instability | Medium | Fallback to daily bulk download if API returns errors; exponential backoff |
| Companies House rate limit (600 req/5min) | Medium | Mandatory exponential backoff; batch jobs spread across multiple hours; do not exceed ~100 req/min sustained |

---

## When to Choose This Strategy

**Best fit when:**
- Cost efficiency is the primary constraint (£15.30/dossier at 100 records/month vs. £36+ for commercial strategies [R6 — Strategy 3 cost model])
- Shared-trusteeship network mapping (Job B) is the primary analytical goal
- The organisation has engineering capacity to build and maintain the pipeline (6–8 engineer-weeks [my estimate — R6])
- Prospect pool is primarily London-based charity and corporate sector (where CC and CH registers give near-complete coverage)
- No commercial vendor data licences can be justified at this stage

**Weakest when:**
- Confirmed £5M+ verification is required before any approach (this strategy cannot reliably confirm £5M+ for most leads)
- Prospect pool includes individuals with no charity/corporate footprint (will return near-empty dossiers)
- Real-time dossiers are needed (API orchestration and Opus batch latency means ≤45 minutes per dossier)
- Organisation has no engineering capacity (use Strategy 1 or 5 instead)

---

## Effectiveness Ranking (from R7)

| Dimension | Strategy 3 score | Notes |
|---|---|---|
| Effectiveness | 2 / 5 | Near-complete for network but structurally weak on wealth and giving history |
| Technical feasibility (4–6 wk) | 3 / 5 | CC + CH buildable in 4–6 weeks for MVP; web search adds noise complexity |
| Complexity | 4 / 5 (lower = more complex) | Single orchestration pipeline; simpler than Strategy 2 |
| Efficiency (cost/reliable dossier) | 5 / 5 | Near-zero data cost; lowest per-record cost at scale |
| Impact (£5M+ lead identification) | 2 / 5 | PSC-tier deterministic leads reliable; below threshold the structural ceiling applies |

**Overall ranking:** 3rd of 5 strategies overall; 1st on efficiency; 1st on Job B (trustee network) recall.
R7 recommendation: build Strategy 3 as the MVP prerequisite to Strategy 4 (Hybrid tiered).
