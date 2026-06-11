import { loadPersonGraph, type PersonGraph } from './person-graph';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Community detection (Louvain modularity maximisation) over the person graph.
 *
 * Louvain greedily assigns each node to the neighbouring community that yields
 * the largest modularity gain, repeating until no single move improves Q. The
 * graph here is small (~1.7k nodes), so we run the local-moving phase to
 * convergence (no multi-level aggregation needed) — fast and deterministic.
 *
 * Each community is named by its dominant sector (attributes.sector) when one is
 * clearly present, else its dominant shared institution, else "Community N".
 */

export interface Community {
  id: number;
  label: string;
  size: number;
  dominantSector: string | null;
  /** A handful of members (id + name) for the table. */
  sampleMembers: Array<{ id: string; name: string }>;
}

export interface CommunityAssignment {
  communityId: number;
  communityLabel: string;
}

export interface CommunityResult {
  assignment: Map<string, CommunityAssignment>;
  communities: Community[];
}

const SAMPLE_SIZE = 8;

/**
 * One pass of Louvain local-moving over an unweighted undirected graph.
 * Returns a community id per node (consecutive ints after a final relabel).
 */
function louvain(adj: Map<string, Set<string>>): Map<string, number> {
  const nodes = [...adj.keys()];
  const deg = new Map<string, number>();
  let m2 = 0; // 2 * |edges|  (sum of degrees)
  for (const n of nodes) {
    const d = adj.get(n)!.size;
    deg.set(n, d);
    m2 += d;
  }
  const comm = new Map<string, number>();
  nodes.forEach((n, i) => comm.set(n, i));

  // sigmaTot[c] = sum of degrees of nodes in community c
  const sigmaTot = new Map<number, number>();
  nodes.forEach((n, i) => sigmaTot.set(i, deg.get(n)!));

  if (m2 === 0) return comm;

  let improved = true;
  let passes = 0;
  const MAX_PASSES = 20;
  while (improved && passes < MAX_PASSES) {
    improved = false;
    passes++;
    for (const n of nodes) {
      const dn = deg.get(n)!;
      const cur = comm.get(n)!;

      // weight (edge count) from n into each neighbouring community
      const kIn = new Map<number, number>();
      for (const nb of adj.get(n)!) {
        const c = comm.get(nb)!;
        kIn.set(c, (kIn.get(c) ?? 0) + 1);
      }

      // remove n from its community
      sigmaTot.set(cur, sigmaTot.get(cur)! - dn);

      // pick the community maximising modularity gain. Gain for moving into c:
      //   kIn(c) - sigmaTot(c) * dn / m2   (constants dropped — same for all c)
      let bestC = cur;
      let bestGain = (kIn.get(cur) ?? 0) - (sigmaTot.get(cur)! * dn) / m2;
      for (const [c, ki] of kIn) {
        const gain = ki - (sigmaTot.get(c)! * dn) / m2;
        if (gain > bestGain) { bestGain = gain; bestC = c; }
      }

      sigmaTot.set(bestC, sigmaTot.get(bestC)! + dn);
      if (bestC !== cur) { comm.set(n, bestC); improved = true; }
    }
  }

  // relabel to consecutive ids
  const remap = new Map<number, number>();
  let next = 0;
  for (const n of nodes) {
    const c = comm.get(n)!;
    if (!remap.has(c)) remap.set(c, next++);
    comm.set(n, remap.get(c)!);
  }
  return comm;
}

/** Name a community by dominant sector, else dominant institution, else fallback. */
function labelCommunity(
  members: string[],
  graph: PersonGraph,
  fallbackId: number,
): { label: string; dominantSector: string | null } {
  const sectorCounts = new Map<string, number>();
  for (const m of members) {
    const s = graph.sectorOf.get(m);
    if (s) sectorCounts.set(s, (sectorCounts.get(s) ?? 0) + 1);
  }
  let topSector: string | null = null;
  let topSectorN = 0;
  for (const [s, n] of sectorCounts) if (n > topSectorN) { topSectorN = n; topSector = s; }

  // A sector "dominates" if it labels a meaningful share of the community.
  if (topSector && topSectorN >= Math.max(2, Math.ceil(members.length * 0.25))) {
    const cap = topSector.charAt(0).toUpperCase() + topSector.slice(1);
    return { label: `${cap} cluster`, dominantSector: topSector };
  }

  // else dominant shared institution
  const instCounts = new Map<string, number>();
  for (const m of members) {
    for (const key of graph.institutionsOf.get(m) ?? []) {
      instCounts.set(key, (instCounts.get(key) ?? 0) + 1);
    }
  }
  let topInst: string | null = null;
  let topInstN = 0;
  for (const [k, n] of instCounts) if (n > topInstN) { topInstN = n; topInst = k; }
  if (topInst && topInstN >= 2) {
    return { label: graph.institutionName.get(topInst) ?? topInst, dominantSector: topSector };
  }

  return { label: `Community ${fallbackId + 1}`, dominantSector: topSector };
}

/** Run Louvain and build the named-community summary. */
export function detectCommunities(graph: PersonGraph): CommunityResult {
  const comm = louvain(graph.adj);

  const byComm = new Map<number, string[]>();
  for (const [id, c] of comm) {
    if (!byComm.has(c)) byComm.set(c, []);
    byComm.get(c)!.push(id);
  }

  const assignment = new Map<string, CommunityAssignment>();
  const communities: Community[] = [];
  for (const [c, members] of byComm) {
    const { label, dominantSector } = labelCommunity(members, graph, c);
    for (const id of members) assignment.set(id, { communityId: c, communityLabel: label });
    const sampleMembers = members
      .slice()
      .sort((a, b) => (graph.adj.get(b)?.size ?? 0) - (graph.adj.get(a)?.size ?? 0))
      .slice(0, SAMPLE_SIZE)
      .map(id => ({ id, name: graph.nameOf.get(id) ?? id }));
    communities.push({ id: c, label, size: members.length, dominantSector, sampleMembers });
  }

  communities.sort((a, b) => b.size - a.size);
  return { assignment, communities };
}

/** Load the person graph and segment it into named communities. */
export async function loadCommunities(supabase: SupabaseClient): Promise<CommunityResult> {
  const graph = await loadPersonGraph(supabase);
  return detectCommunities(graph);
}
