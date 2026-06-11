# Glossary

Plain-language definitions of the terms used across the platform and these documents. Sorted alphabetically. When a term has a precise technical meaning that differs from everyday use, the everyday assumption is called out.

---

**Affinity** — One of the five priority dimensions (25%). How likely a person is to give to *this* cause specifically, based on shared charities, donor category, philanthropic sector, and any recorded giving. Affinity is about fit and reason-to-give, not ability-to-give (that is capacity).

**Augmentation / enrichment** — The process of taking a bare name and attaching information to it: wealth band, biography, directorships, connections, evidence. "Enriched" entities have been through this; "discovered" ones may be awaiting it. Enrichment draws on Charity Commission filings and web research.

**Band** (wealth band) — A bracket for a person's wealth rather than an exact figure: £1m–5m, £5m–25m, £25m–100m, £100m+, or unknown. Bands are used because public data supports a range more honestly than a precise number. Feeds the capacity score.

**Capacity** — One of the five priority dimensions (20%). Observable ability to give meaningfully, built from the wealth band, any researched money figure, and directorships. The word *observable* is deliberate: capacity is built from signals you can point to, not a guessed number alone.

**Category** — A lead's bucket: *HNW target* (on the named high-net-worth list), *wealth identified* (we found wealth signals), *charity donor* (connected to charities we track), or *discovered* (found through the network, not yet otherwise classified). Affects the affinity score and is a filter in the Lead Generator.

**Cohort** — A named, curated group of leads an analyst assembles to work together, such as an event guest list or a sector group. Lives under Act. Distinct from a *community*, which is auto-detected.

**Community** — A cluster of densely connected people the system detects automatically in the network (using community-detection maths). Distinct from a *cohort*, which a human curates by hand.

**Confidence** — One of the two headline scores (0 to 100). How much to trust the priority score, built from identity certainty, relationship strength, source corroboration, and freshness. High priority with low confidence means "promising but verify before acting".

**Connection / edge** — A relationship between two entities: a shared board seat, a co-directorship, a charity trusteeship, a family tie, a corpus mention. "Edge" is the graph term for the same thing. Each connection has an *edge type* and a *tie strength*.

**Connector** — A person who bridges otherwise separate parts of the network. Reaching a connector can unlock a whole cluster of people. Surfaced in Orient → Key Connectors, ranked by centrality and brokerage.

**Corroboration** — One of the four confidence dimensions (20%). How many independent sources back a claim. One source is weak; three or more is solid. The "do not trust a single source" principle as a number.

**Corpus** — The body of source documents the system reads: about 20,000 Charity Commission filings (trustee reports and financial statements) converted to text. A "corpus mention" is a connection inferred from two people appearing together in these documents.

**Discovered** — A person found through the network (in the filings or via a supporter's connections) rather than from one of the original input spreadsheets. Discovered people are the raw material the Lead Generator ranks.

**Dossier** — A lead's full intelligence profile on its own page: every score with its explanation, all evidence with sources, connections, suggested action, giving history, conflicts, and the analyst's notes and tags. Where the real analytical work happens.

**Downweight** — A human action on a connection: "this tie is real but weak or suspect". The connection is kept (so the graph stays connected) but its contribution to scores and routes is reduced. Contrast with *suppress / remove*, which deletes the connection from view entirely.

**Edge type** — The kind of a connection: co-director, shared board, co-trustee, shared employer, corpus mention, inferred, or direct. Different types carry different default trust. A shared board seat is stronger evidence than a bare corpus co-mention.

**Entity** — Any node in the system: a person or an organisation (a company, charity, or board). The most general term for "a thing the platform tracks".

**Evidence** — A piece of sourced information supporting a fact about an entity: a filing, a directorship record, a web-research finding. Every score traces back to evidence. "Evidence-first" means no score or claim exists without something behind it.

**Freshness** — One of the four confidence dimensions (15%). How recent the evidence is. A directorship confirmed last month is more reliable than one from three years ago, because people change roles.

**HNW** — High net worth. "HNW target" is a person on the named priority list of high-net-worth individuals provided as an input, as opposed to people discovered through the network.

**Hop** — A step in an introduction path. One hop means a supporter knows the person directly. Two hops means a supporter knows someone who knows the person. Fewer hops is a warmer, easier introduction.

**Influence** — One of the five priority dimensions (15%). How central a person is in the network, measured by their number of connections. More connections means easier to reach and more able to open doors themselves.

**Introability** — One of the five priority dimensions, and the largest (30%). How easily a supporter can introduce us to this person, based on the best introduction path and hop distance. The biggest weight because a warm route is what makes a lead actionable at all.

**Introducer** — The supporter at the start of an introduction path; the person who can make the warm introduction. On a lead's dossier, the introducer is named on each route.

**Introduction path / route** — A chain from one of our supporters to a target person, through shared institutions. Each path is scored by hops, shared institutions, the introducer's reach, and the supporter's tier. The best path's score feeds introability.

**Lead** — A person worth approaching for support who is *not* already one of our supporters, with some mix of capacity, affinity, and a reachable introduction path. Leads are what the platform exists to surface. Supporters are deliberately excluded from the leads list.

**Multi-source** — A lead or claim backed by more than one independent source. The multi-source toggle in the Lead Generator filters to the most trustworthy candidates. Related to the corroboration score.

**OODA** — Observe, Orient, Decide, Act. The decision-making loop the whole platform is organised around. The sidebar follows these four stages in order. See `00_WHAT_THIS_IS.md`.

**Override** — A human correction that wins over automated logic, permanently. Examples: confirming or rejecting an identity, removing a connection, downweighting one, setting a wealth band by hand. Human decisions always win and survive re-processing.

**Priority** — One of the two headline scores (0 to 100). How worth pursuing a person is, a weighted blend of introability, affinity, capacity, influence, and strategic fit. Ranks the pool so a human looks at the right people first.

**Provenance** — Where a piece of data came from. Every entity, connection, score, and claim has provenance (a source). No orphan data: nothing exists without a recorded origin. See `05_DATA_AND_PROVENANCE.md`.

**Seed** — The original set of input people: the supporters and HNW targets loaded from the starting spreadsheets, with their reference details. Seeds are the starting point the rest of the network was discovered from. Note: a wealth-augmented person discovered later is *not* a seed, even though they have rich data.

**Signal** — A discrete enrichment fact about a person, grouped into categories: directorship, co-director, philanthropy, property, rich-list/press, fund management, political, charity, news, web. The signal chips on a lead summarise what we know. More signals from more sources means a more trustworthy lead.

**Strategic fit** — One of the five priority dimensions, the smallest (10%). How well a person aligns with the cause (sport, youth, education, wellbeing, social mobility, community).

**Structural hole** — A gap between two groups in a network that a single person bridges. People who sit across structural holes are valuable connectors because they are the only route between otherwise separate clusters. Surfaced in the connector analysis.

**Supporter** — Someone Bloomsbury Football already has a relationship with: a current donor, a key introducer, a strategic contact. Supporters are *not* leads (we already have access). Their value is the introductions they enable to other people. There are several hundred of them, all excluded from the leads list by design.

**Suppress / remove** — A human action on a connection: "this is wrong". The connection is filtered out of every view and never resurfaces, even after re-processing. The decision is recorded and auditable. Contrast with *downweight*, which keeps a weak tie at reduced strength.

**Tie strength** — How warm or solid a connection is, on a scale, combining the edge type's default trust with recency (a resigned co-directorship decays) and how many reasons back it. Shown as Warm, Cool, or Cold on the dossier.

**Tier** (supporter tier) — How close or committed a supporter is. A route that starts from a higher-tier supporter is warmer, and scores higher in the introduction-path score.

**Wealth-augmented** — A person who has had wealth data attached through enrichment. Note this does not make them a *seed* or a *supporter*; a discovered person can be wealth-augmented and still be a lead.
