# 15 ways to surface clearer, truer connections for the leads

A short report on how to organize, augment, structure, add, activate, or manipulate the
data we already hold so a human can analyse, catalogue, label, and hygienize the most
promising opportunities. Each idea names: the external pattern it borrows (and who uses
it), what data we already have to build it, and what the human gets out of it.

Researched against donor-prospecting tools (DonorSearch, iWave, Kindsight, Altrata),
relationship-intelligence platforms (Affinity, RelSci, BoardEx, LinkedIn TeamLink), and
graph-analysis literature (centrality, link prediction, structural holes). Grounded against
our current schema and CRM (`OODA_IMPROVEMENT_PLAN.md`, `supabase/migrations/`,
`web/src/lib/crm/`).

The organising principle of the platform — supporters aren't leads, the value is the
*introductions* they can give us — runs through all of these. Most of the leverage is in
making the **connections themselves** clearer, not in scoring people harder.

---

## A. Surface truer connections from the graph we have

### 1. "Probably knows" suggestion queue (link prediction)
**Pattern:** Link prediction — score *unrecorded* edges by graph topology (Common Neighbors,
Jaccard, Adamic-Adar, triadic closure). Standard in network analysis; the engine behind
"people you may know."
**We have:** the full person↔person graph (`network_connections`, `co_director_edges`,
shared-company projections) already built in `introduction-graph.ts` / `supporter-reach.ts`.
**Build:** for every pair of people who share ≥2 mutual contacts or sit in the same
institution but have *no* recorded edge, emit a "likely tie — verify?" candidate, ranked by
Adamic-Adar (rare shared contacts weigh more). Route them to a human queue.
**Human gets:** a discovery loop — the platform proposes warm paths that *aren't in the data
yet*, and the analyst confirms/rejects, which both finds opportunities and grows the graph.

### 2. Key-connector ranking for supporters (centrality)
**Pattern:** Betweenness + eigenvector/PageRank centrality — "who are the bridges/brokers"
(Memgraph, Cambridge Intelligence). Betweenness finds people who sit between otherwise-
disconnected clusters; eigenvector finds the well-connected-to-the-well-connected.
**We have:** the graph + the Institution Brokerage view already computes a bridge score per
org; this extends it to *people*.
**Build:** compute betweenness + eigenvector centrality over the supporter↔target graph; add
a "Connector score" column to Supporter Reach. Sort supporters by *who unlocks the most
otherwise-unreachable targets*, not just raw reach count.
**Human gets:** knows which 10 supporters to cultivate first because they're gateways, not
redundant hubs. Directly answers "where do we spend our introduction asks."

### 3. Structural-holes / "new network" flag
**Pattern:** Burt's structural holes & constraint — a person bridging disconnected clusters
has non-redundant reach (Ronald Burt, widely cited).
**We have:** the same graph; community structure is derivable.
**Build:** flag supporters whose contacts span multiple otherwise-separate communities (low
Burt constraint) — they open *new* networks rather than more of the same.
**Human gets:** a "this supporter reaches a part of the world none of our others do" label —
the highest-value introducers to prioritise.

### 4. Auto-clustered network segments (community detection)
**Pattern:** Louvain community detection — partition the graph into densely-connected
communities ("the City finance cluster", "the arts-philanthropy cluster").
**We have:** the graph + sector/affiliation attributes to name the clusters.
**Build:** run Louvain over the person graph; surface each community as a candidate cohort
with a suggested label (from the dominant sector/affiliation).
**Human gets:** the network pre-segmented into nameable groups to target and catalogue —
turns 1,400 leads into ~15 coherent clusters a human can reason about.

---

## B. Augment & enrich the connections

### 5. Typed, trust-weighted edges
**Pattern:** BoardEx categorises *how* two people are linked (current/former colleague,
classmate, association, shared board). Edge *type* is a label a human can trust-weight — a
board co-membership beats a conference badge.
**We have:** `connection_type` and `via_organisation` on every edge, plus co-director
appointment/resignation dates — but the UI treats all edges equally.
**Build:** classify each edge into a small ontology (shared board / co-director / co-trustee /
shared employer / corpus-mentioned / inferred) and show the type on path cards with a default
trust weight; let the analyst override the weight per edge.
**Human gets:** can immediately see *why* two people are connected and how warm it really is,
instead of a flat "connected" — the core of judging an introduction.

### 6. Edge tie-strength + staleness (relationship recency)
**Pattern:** Affinity scores every tie by *recency, frequency, depth*; fires an alert when a
relationship goes cold. The single most reusable mechanic in relationship intelligence.
**We have:** co-director appointment/resignation dates, evidence `created_at`, and the
`relationships.freshness_multiplier` that's stored but unused. A 2019 co-directorship that
ended is a colder path than a current one.
**Build:** compute a tie-strength per edge from recency (resigned vs. active, evidence age)
and multiplicity (how many distinct reasons two people are linked); decay stale edges and
flag "this warm path is going cold" on the lead.
**Human gets:** paths sorted by how *live* the relationship actually is — stops chasing
introductions through long-dead board ties.

### 7. Activate the dormant donation data (engagement signal)
**Pattern:** RFM (Recency/Frequency/Monetary) and "Most Likely to Respond" propensity models
(DonorSearch) — a constituent's *own giving history* is the strongest signal of all.
**We have:** the `donation_events` table is fully schema'd (donor → recipient, amount, year,
confidence) but **completely dormant** — no ingestion, no UI, nothing reads it.
**Build:** populate it from the Charity Commission filings already in the corpus + the
electoral-commission donation signals already harvested but unscored; then feed donation
overlap into §18 affinity (someone who already gives to *similar* charities is the strongest
affinity signal we could have).
**Human gets:** leads ranked partly by demonstrated giving behaviour, not just inferred
affinity — the single highest-value augmentation available from data we already collect.

### 8. Multi-source corroboration & wealth-coverage view
**Pattern:** "Why this prospect = wealth + philanthropic + affinity, all three" (Kindsight);
confidence rises with independent sources (§18.2 already models this).
**We have:** `enrichment_evidence.source_layer` (A/B/C), `entity_articles`, multiple wealth
signals — but no view of *coverage* (what % of leads have multi-source corroboration vs. a
single weak signal).
**Build:** a coverage dashboard — per lead and across the pool, how many independent sources
back the wealth/affinity/identity, with a "thinly evidenced — needs research" flag. Surface
political donations and property holdings (harvested but unused) as additional pillars.
**Human gets:** knows which top leads are *solidly* evidenced vs. resting on one stale
article — and where to point augmentation next.

---

## C. Structure & label for the human

### 9. Structured tags / labels (beyond free-text notes)
**Pattern:** Every prospect tool offers pick-list tagging and saved segments; free text alone
doesn't filter.
**We have:** only `entity_notes` (free text). No structured label exists.
**Build:** a small `entity_tags` table + a pick-list of common labels ("conflict of interest",
"already in contact", "do not approach", "warm — board member knows them", "needs verification",
"front company"). Filterable and bulk-applicable.
**Human gets:** can catalogue at scale and filter the lead list by human judgment, not just
machine score — the foundation of cataloguing/labeling the user asked for.

### 10. Lead cohorts / campaigns
**Pattern:** Three-tier portfolio segmentation and moves-management cohorts (Kindsight,
Blackbaud) — group prospects and track cohort-level outcomes.
**We have:** the action backlog tracks individuals; nothing groups them.
**Build:** a `lead_cohort` concept — name a set of leads ("Summer '26 gala push", "Post-event
follow-up"), give it a shared status, and report cohort outcomes (5 won / 12 deferred / 8 lost).
**Human gets:** can organise work into campaigns and measure what's working at the group level
instead of lead-by-lead.

### 11. "Why this lead" + qualification gate cards
**Pattern:** Explainable 3-pillar "why this prospect" card (Kindsight) + a four-question
qualification gate (reason to give / means / timing / receptiveness).
**We have:** §18 priority/confidence with per-dimension explanations already; the dossier
assembler already writes an intro angle.
**Build:** condense the expansion into a single "why this lead" card — the three strongest
evidence pillars + the best introducer + a four-checkbox qualification gate the analyst fills
to accept/reject. Frozen onto the action when sent to the backlog.
**Human gets:** a fast, consistent accept/reject decision surface instead of reading raw
dimension bars — speeds triage and standardises it.

### 12. Confidence-based review queue (active learning)
**Pattern:** Human-in-the-loop ML — auto-apply high-confidence, route *low-confidence /
ambiguous* cases to a human first; active learning serves the most informative cases.
**We have:** §18.2 confidence per lead, identity-cluster confidence, suggested merges.
**Build:** a single "Needs review" queue that ranks by *uncertainty* — borderline identity
matches, single-source wealth, contested attributes, name-variant supporter matches — so a
small team reviews the cases that move the needle, not random ones.
**Human gets:** their limited attention spent on the ambiguous 5%, not the obvious 95% — the
core hygiene-throughput multiplier.

---

## D. Activate & hygienize

### 13. Attribute-conflict detection & resolution
**Pattern:** Entity resolution / data hygiene — when sources disagree, flag and let a human
pick the trusted value; don't silently merge.
**We have:** `canonical_entities.attributes` merges sector/employer/location/wealth from
multiple sources with no versioning — conflicts are silently overwritten.
**Build:** detect when two sources give a lead different sector/employer/wealth-band and raise
a conflict card; let the analyst pick the trusted source (recording the decision, like the
existing identity/suppression overrides).
**Human gets:** stops trusting whichever augmentation ran last; makes the data defensible and
auditable — true hygienization.

### 14. Edge & wealth overrides (not just suppress)
**Pattern:** Affinity/BoardEx let users adjust relationship weight; hygiene tools let you
downgrade confidence, not only delete.
**We have:** connection suppression is binary (remove/leave); `co_director_edges.confidence`
is fixed at 0.95; wealth has no human override at all.
**Build:** extend the existing `connection_overrides` (already has a `downweight` action that
isn't wired up) so an analyst can *downgrade* an edge's confidence (e.g. name-collision risk)
rather than remove it, and add a human wealth-band override that wins over automated scoring
(mirrors "human decisions always win").
**Human gets:** finer hygiene than the current all-or-nothing — correct a suspect tie without
destroying a real one.

### 15. Outcome feedback loop (close the moves-management cycle)
**Pattern:** Moves management with time-in-stage + outcome attribution at the *route* level
(Blackbaud); "which channel converts" (Affinity). Outcomes should teach the system.
**We have:** `intro_outcomes` exists and records contacted/won/lost, and the Outcomes report
breaks conversion down by method/supporter/hops — but outcomes attach to entities, *never to
the introduction_route itself*, and nothing feeds back into scoring.
**Build:** attribute outcomes to the specific route/introducer/institution used, so the report
answers "which introducer and which institution actually convert"; then surface that as a
prior ("paths via this supporter convert 3×") and, eventually, tune the §18 weights from real
outcomes instead of intuition.
**Human gets:** the platform learns which *connections* work, not just which people — and the
best introducers/channels rise on evidence.

---

## How they stack (suggested order)

The cheapest, highest-leverage cluster — all buildable from data already in the DB, no new
ingestion:

1. **Typed + tie-strength edges (#5, #6)** and **key-connector / structural-hole ranking
   (#2, #3)** — make the *connections* themselves clearer and rank *who to mine*. This is the
   heart of the request and reuses the existing graph.
2. **Link-prediction "probably knows" queue (#1)** + **confidence review queue (#12)** — the
   discovery + hygiene loop.
3. **Structured tags (#9)** + **"why this lead" cards (#11)** — the cataloguing/labeling
   surface the user explicitly asked for.
4. **Activate donation data (#7)** — the single biggest augmentation, but needs an ingestion
   step, so it's a slightly larger lift.
5. **Cohorts (#10)**, **attribute/edge overrides (#13, #14)**, **outcome attribution (#15)** —
   structure and feedback, fold in as the workflow matures.

Everything here is grounded in data we already hold or already collect; nothing requires a
paid data vendor. The recurring theme from the research: the tools that win don't score people
harder — they make the **relationships** legible (typed, weighted, fresh) and put a human in
the loop on exactly the uncertain cases.
