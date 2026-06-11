# Scoring and tabs reference

Two parts. First, how every score is calculated and why it is built that way, in plain language. Second, what each tab is, what it means, and what it is for.

The scoring rules here match the code (`web/src/lib/ranking/` and `web/src/lib/crm/crm-priority.ts`) and trace to PRD sections 18.1, 18.2, and 18.3. If you change a weight in the code, update this document.

---

# Part 1: The scores

Every lead carries two headline scores, each from 0 to 100:

- **Priority** — how worth pursuing this person is.
- **Confidence** — how much we trust the data behind that priority.

They are separate on purpose. A person can be high priority and low confidence (looks very promising, but the data is thin and needs checking), or high confidence and modest priority (we are sure about them, they are just not a standout). You read both together: priority tells you *who*, confidence tells you *how much to trust it*.

Both are weighted averages of smaller scores, each measuring one thing. Showing the breakdown, rather than a single black-box number, is deliberate. The analyst can see *why* a person ranks where they do and challenge it.

## The priority score

Priority is a weighted blend of five dimensions. The weights are fixed and sum to 100%:

| Dimension | Weight | The question it answers |
| --- | --- | --- |
| Introability | 30% | Can we reach them warmly, and how easily? |
| Affinity | 25% | Is there a reason they would give to *this* cause? |
| Capacity | 20% | Do they have the means to give meaningfully? |
| Influence | 15% | How central are they in the network? |
| Strategic fit | 10% | Do they align with what the charity is about? |

**Why these weights.** Introability is the largest because a warm route is what makes a lead actionable at all. The wealthiest person in the world is not a useful lead if there is no way to reach them; a reachable person with moderate capacity is. Affinity comes next because giving follows interest, then capacity because means matter once interest and access exist. Influence and strategic fit are real but secondary tie-breakers.

Each dimension is scored 0 to 1 internally, then the weighted sum is multiplied by 100 for display. Here is how each one is built.

### Introability (30%)

Measures how easily a supporter can introduce us to this person.

- If the system has computed a scored **introduction path** to them, the best path's score (0 to 100) maps straight in. A path is scored higher when it is shorter, goes through a shared institution, comes from a well-connected introducer, and starts from a high-tier supporter.
- If there is no fully scored path but we know the **hop distance** from a supporter, we use that as a fallback: one hop away scores 0.6, two hops scores 0.35.
- No path from any supporter scores 0.

**Why.** A direct, one-hop, institution-backed route from a strong supporter is the gold standard, so it scores near the top. The fallback rewards being close in the graph even before a full path is scored, so genuinely reachable people are not buried.

### Affinity (25%)

Measures whether there is a reason this person would support this particular cause. It adds up several signals, capped at 1.0:

- **Shared charity connections**: each charity they share with our network adds 0.15, up to 0.5.
- **Donor category**: if they are already a charity donor, +0.4; on the HNW target list, +0.3; wealth-identified, +0.15.
- **Philanthropy sector**: if their sector or role mentions philanthropy, charity, a foundation or a trust, +0.1.
- **Recorded giving**: if we have an actual evidenced donation on record, +0.3 for the first, +0.1 each beyond that, up to 0.5.

**Why.** Demonstrated giving is the strongest affinity signal there is, so a single recorded gift lifts the score hard. An evidenced donation beats an inferred overlap, because one is a fact and the other is a guess. Shared charities and a philanthropic sector are softer signals of alignment, so they add less.

### Capacity (20%)

Measures observable ability to give. Note the word *observable*. This is built from signals we can point to, not from a guessed net-worth number on its own (that distinction is PRD 18.3, and it matters for honesty).

- **Wealth band** sets the base: £100m+ scores 1.0, £25m–100m scores 0.8, £5m–25m scores 0.6, £1m–5m scores 0.4, unknown scores 0.
- **An explicit money figure** that backs the band adds 0.1 (it firms up the estimate).
- **Directorships**: each one adds 0.05, up to 0.2, as a corroborating signal of standing.

The total is capped at 1.0.

**Why.** Capacity is built from observable signals so the score stays defensible. A wealth band tied to a directorship and a researched figure is something you can stand behind in front of a colleague. A bare estimate with nothing behind it is not, so on its own it scores low. The directorship boost rewards corroboration, not wealth twice over, which is why it is small.

### Influence (15%)

Measures how central the person is in the mapped network, by their number of connections. It scales linearly and saturates at 20 connections (so 10 connections scores 0.5, 20 or more scores 1.0).

**Why.** A well-connected person is more valuable: they are easier to reach through multiple routes, and they can open doors themselves. It saturates because beyond a point, more connections do not make someone meaningfully more influential for our purposes.

### Strategic fit (10%)

Measures alignment with the cause (Bloomsbury Football: sport, youth, education, wellbeing, social mobility, community).

- If their sector matches one of those themes, 0.7.
- Otherwise a neutral 0.3.
- Being on the HNW target list lifts it to at least 0.6.

**Why.** Someone whose own work is in youth or education is a more natural fit for a football-and-young-people cause, and is more likely to engage. It is the smallest weight because fit is a nice-to-have on top of access, interest, and means, not a substitute for them.

## The confidence score

Confidence is a weighted blend of four dimensions, weights fixed and summing to 100%:

| Dimension | Weight | The question it answers |
| --- | --- | --- |
| Identity | 35% | Are we sure this is the right person? |
| Relationship | 30% | How solid is the connection evidence? |
| Corroboration | 20% | How many independent sources agree? |
| Freshness | 15% | How recent is the evidence? |

**Why these weights.** Identity is the largest because if we have the wrong person, nothing else matters: the capacity, the connections, the affinity all belong to someone else. Relationship strength is next because a lead's whole value is the route to them, and a route built on a weak inference is a weak lead. Corroboration and freshness adjust how much to trust the rest.

Here is how each is built.

### Identity (35%)

- If a human has confirmed this is the right person, 1.0.
- Otherwise a neutral prior of 0.6 (the data exists, but no person has verified it).

**Why.** Public records have same-name collisions. The system cannot be certain on its own that two "J. Smith" filings are the same individual, so it sits at a cautious-but-not-dismissive 0.6 until a person checks. A human confirmation is the strongest possible signal, so it goes to the top. This is the single biggest reason the human in the loop matters.

### Relationship (30%)

Reads the strongest introduction path and scores trust by how the connection was established:

- Direct (one hop) and backed by a shared organisation: 0.85.
- Direct but with no organisation behind it: 0.7.
- Two hops, organisation-backed: 0.7.
- Two hops, nothing behind it: 0.55.
- No path at all: a neutral 0.5.

**Why.** A connection grounded in a shared institution (they sat on the same board) is far more trustworthy than a bare "these two are near each other in the graph". Shorter, declared, institution-backed connections score higher because they are harder to be wrong about.

### Corroboration (20%)

Counts distinct evidence items:

- Three or more sources: 1.0.
- Two: 0.7.
- One: 0.4.
- None: 0.1.

**Why.** One source could be a mistake or an outdated record. Several independent sources telling the same story is what makes a claim solid. This is the standard "do not trust a single source" principle turned into a number.

### Freshness (15%)

Scores the age of the most recent evidence:

- 30 days or newer: 1.0.
- Within 90 days: 0.85.
- Within 180 days: 0.7.
- Within a year: 0.5.
- Older than a year: 0.3.

**Why.** People change roles, leave boards, and move. A directorship confirmed last month is more reliable than one from three years ago. Old evidence is not worthless, so it never drops to zero, but it is discounted.

## The introduction path score

Separate from the two headline scores, each *route* to a person is scored so the analyst can pick the best one. A path score rewards:

- **Fewer hops** — a direct introduction beats a friend-of-a-friend.
- **A shared institution** — a route through a board both people sit on is concrete.
- **A well-connected introducer** — someone with reach can actually make the introduction land.
- **A higher-tier supporter** — a route that starts from a close, committed supporter is warmer.

The best path's score feeds the introability dimension above, which is why introability and "is there a good route" move together.

## How to read the scores together

- **High priority, high confidence**: a strong, well-evidenced lead. Act on it.
- **High priority, low confidence**: promising but unproven. Worth the analyst's time to verify identity and chase corroboration before approaching. These are exactly what the "Needs Review" queue surfaces.
- **Low priority, high confidence**: we are sure about them, they are simply not a standout. Fine to deprioritise.
- **Low on both**: park it.

The scores rank the pool so a human looks at the right people first. They are not a decision. Read the breakdown, read the evidence, and make the call.

---

# Part 2: The tabs

The sidebar has five sections following the OODA loop. Here is every tab, what it shows, and why it is useful.

## Observe — what we have

The raw and enriched base data. Start here to understand the inputs.

| Tab | What it is | Why it is useful |
| --- | --- | --- |
| **What's New** | Recently added or changed entities | A quick read on what the last processing run surfaced. |
| **Supporters Sheet** | The original supporters spreadsheet, as imported | The untouched source of truth for who we started from. |
| **HNW Sheet** | The original high-net-worth target spreadsheet | The untouched source list of priority targets. |
| **Supporters (enriched)** | Our supporters after enrichment | The people we already have access to, with wealth and bio attached. Their value is the introductions they enable. |
| **HNW Targets (enriched)** | The priority targets after enrichment | The named high-value people, now with evidence and paths. |
| **Leads** | The discovered people, enriched | The pool of candidates found through the network, the raw material for the ranked Lead Generator. |
| **All Entities** | Everything: people and organisations | The complete table when you need to find anything. |
| **Pipeline** | The processing pipeline status | What the system has run and where data came from. |

## Orient — how it fits together

The relationships between the data. This is where the network becomes legible.

| Tab | What it is | Why it is useful |
| --- | --- | --- |
| **Orbit** | The interactive network graph | See the shape of the network: clusters, hubs, who sits near whom. |
| **Supporter Reach** | How far each supporter's network extends | Find which supporters open the most doors. |
| **Key Connectors** | People ranked by network centrality and brokerage | The individuals who bridge otherwise separate groups. Reaching one connector can unlock a whole cluster. |
| **Signal Landscape** | Coverage of enrichment signals across the pool | See at a glance who has directorships, philanthropy, property, and press signals, and where the gaps are. |
| **Evidence Coverage** | How well-evidenced the pool is | Shows which promising leads are thinly evidenced, so you know where research should go next. |
| **Dimension Matrix** | Leads laid out across the score dimensions | Compare candidates dimension by dimension instead of by a single number. |
| **Institution Brokerage** | Institutions that bridge groups | Which boards and organisations act as connection hubs. |
| **Institutions** | The organisations in the network | Browse companies, charities, and boards as entities. |
| **Charities** | The charities specifically | The charity layer, central to affinity. |
| **Introduction Graph** | The graph of who can introduce whom | The routes through the network, visualised. |
| **Introduction Routes** | Routes laid out as a list | The same routing information in a readable table. |
| **Suggested Ties** | People who probably know each other but are not yet linked | Link prediction. Suggests likely connections for a human to confirm or dismiss, growing the graph. |
| **Communities** | Auto-detected clusters in the network | Natural groupings, useful for spotting a cohort to work as a set. |

## Decide — who to pursue, and how

The ranked leads. The core of the analyst's work.

| Tab | What it is | Why it is useful |
| --- | --- | --- |
| **Lead Generator** | All leads ranked by the balanced overall priority | The main shortlist. Start here. Filter by category and signal, expand a row for the case and the routes. |
| **By Influence** | Leads ranked by network centrality only | When you want the most connected people first. |
| **By Capacity** | Leads ranked by observable giving capacity only | When capacity is the priority for a particular campaign. |
| **By Introability** | Leads ranked by how reachable they are only | When you want the warmest, easiest introductions first. |
| **By Affinity** | Leads ranked by cause alignment only | When fit to the cause matters most. |

The "By X" tabs are the same pool sorted by a single dimension instead of the blended priority. They let you ask focused questions ("who can we reach most easily right now?") without the other dimensions diluting the answer.

## Act — what we did and whether it worked

The chosen actions and their outcomes, closing the loop.

| Tab | What it is | Why it is useful |
| --- | --- | --- |
| **Action Backlog** | The leads the analyst committed to pursue | The working list of live opportunities, with status and the suggested next step. |
| **Cohorts** | Named groups of leads curated for outreach | Work a set of related leads together (for example, an event guest list or a sector group). |
| **Outcomes** | Conversion reporting by method, introducer, and channel | The feedback loop. Which scoring methods, which supporters, and which institutions actually convert. This tells you which routes to trust next time. |

## Tools — supporting workflows

| Tab | What it is | Why it is useful |
| --- | --- | --- |
| **Identity QA** | The identity-confirmation workflow | Where you confirm or reject that a record is the right person. Directly feeds the confidence score's identity dimension. |
| **Needs Review** | A queue of leads ranked by uncertainty | Surfaces the cases most in need of a human: high priority but low confidence, single-source wealth, possible duplicate supporters, unvalidated high-value leads. The most efficient place to spend review time. |
| **Augment Queue** | Leads awaiting enrichment | The people the system can still learn more about. |
| **Review Queue** | The formal reviewer workflow (PRD 18.6) | Structured review states for a more formal sign-off process. |
| **Admin** | Administrative controls | System administration. |

## The dossier (every lead's own page)

Clicking any lead opens its full intelligence profile. It is not a sidebar tab but it is where the deepest work happens. It pulls everything about one person into a single page:

- **Priority and confidence**, every dimension with its plain-language explanation.
- **Enrichment signals**, the full list of what we know, grouped and sourced.
- **Introduction paths**, the ranked routes with the supporter, the institution, and the hop count.
- **Suggested action**, a model-suggested next step (clearly labelled as a suggestion to verify, not an instruction).
- **Giving history**, any recorded donations.
- **Network connections**, each with its edge type and tie strength, where you can remove or downweight a wrong or weak link.
- **Data conflicts**, flagged when sources disagree, with a way to resolve them.
- **Wealth profile**, with a human-override control so an analyst's corrected wealth band wins over the automated one.
- **Notes and tags**, your space to record judgement for the next person.

The dossier is where a lead stops being a row in a table and becomes a decision a human can make and defend.
