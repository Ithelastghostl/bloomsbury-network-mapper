# Graph Engine Load Test Plan — Phase 0

## 1. Question

Can NetworkX handle the full-corpus graph in-memory inside a Supabase Edge Function? (PRD 8.1: "Default: in-process NetworkX in Edge Functions; migrate to a dedicated graph engine only if Phase 0 load test fails.")

## 2. Estimated Graph Size

Source data: 20,444 documents, 4,888 unique charity registries.

| Dimension | Estimate | Basis |
|---|---:|---|
| Unique person entities | ~50,000 | ~331 name patterns/doc median 265, heavy duplication across filings of same charity; post-identity-resolution estimate |
| Unique org entities | ~6,000 | 4,888 charity registries + associated companies/trusts |
| Donation event nodes | ~10,000 | Subset of 111 monetary amounts/doc that are attributable donation events |
| Total nodes | ~66,000 | Persons + orgs + donation events |
| Total edges | 250,000 - 800,000 | PRD 8.2 / 25 estimate for 25k-doc corpus |

## 3. Test Approach

### 3a. Generate Synthetic Graph

- Create a NetworkX DiGraph with node/edge counts matching the estimates above.
- Node types: person (50K), organisation (6K), donation_event (10K).
- Edge types matching PRD 15.6: TRUSTEE_OF, DIRECTOR_OF, REGISTERED_AT, MADE_DONATION, RECEIVED_BY, MENTIONED_IN, CO_OCCURS_WITH.
- Edges carry weight, type, and a small metadata dict (simulating provenance) to model realistic memory overhead.
- Power-law degree distribution to simulate hub trustees who serve on many boards.

### 3b. Measurements

Run inside a constrained environment simulating Edge Function limits:

| Measurement | Method |
|---|---|
| Memory footprint | `tracemalloc` before/after graph load; `sys.getsizeof` spot checks |
| Graph load time | Time to build DiGraph from node/edge lists (simulating Postgres view read) |
| Shortest path query | `nx.shortest_path` for 100 random seed-candidate pairs |
| Personalised PageRank | `nx.pagerank` with `personalization` vector on single seed, `alpha=0.85` |
| Multi-seed PPR | PPR for 10 seeds sequentially |
| Memory ceiling test | Attempt graph load inside a process with 150MB memory limit (`resource.setrlimit`) |

### 3c. Scale Variants

Run at three scales to find the breakpoint:

| Variant | Nodes | Edges |
|---|---:|---:|
| Low estimate | 66K | 250K |
| Mid estimate | 66K | 500K |
| High estimate | 66K | 800K |

## 4. Pass/Fail Criteria

Per PRD R0.8 and R0.9:

| Metric | Pass | Fail |
|---|---|---|
| Graph load time | < 10 seconds | >= 10 seconds |
| PPR per seed | < 5 seconds | >= 5 seconds |
| Memory footprint | < 150 MB | >= 150 MB |
| Shortest path (p95) | < 1 second | >= 1 second |

All criteria must pass at the **mid estimate** (500K edges). If only the high estimate fails, NetworkX is acceptable with a note to monitor at full-corpus scale.

## 5. Fallback Options

If NetworkX fails the load test (PRD R0.9):

1. **pg_graph views** — Keep the graph in Postgres, use recursive CTEs or `pg_graph` extension for path queries. Avoids memory limits but likely slower for PPR.
2. **Neo4j AuraDB** — Managed graph database. Native PPR support, no memory constraint. Adds operational complexity and cost (~$65/month for starter tier).
3. **Memgraph Cloud** — In-memory graph database with Cypher support. Fast PPR but adds a service dependency.

Decision is binary: if mid-estimate passes, proceed with NetworkX. If it fails, evaluate pg_graph first (simpler ops), then Neo4j if pg_graph path query latency exceeds 10 seconds per seed.
