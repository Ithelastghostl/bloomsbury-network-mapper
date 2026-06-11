import { cache } from 'react';
import { loadSuppressions } from './suppressions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;
const PAGE_SIZE = 1000;

async function fetchAll<T>(supabase: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

/** Per-node structural metrics over the person↔person graph. */
export interface NodeMetrics {
  /** Neighbour count (0–1, normalised to the max degree in the graph). */
  degree: number;
  /** Raw neighbour count, un-normalised (for display). */
  degreeRaw: number;
  /** Brandes betweenness, normalised to the max betweenness (0–1). Bridge/broker score. */
  betweenness: number;
  /** Eigenvector centrality via power iteration, normalised to max (0–1). Influence. */
  eigenvector: number;
  /** Burt's constraint, raw (~0–1+). LOW = bridges structural holes = opens new networks. */
  constraint: number;
}

/**
 * An undirected person↔person adjacency list keyed by entity id. Values are the
 * neighbour id sets. This is the exact projection supporter-reach.ts builds
 * (network_connections person↔person + co_director_edges + shared-company
 * co-membership), with analyst suppressions already removed.
 */
export type Adjacency = Map<string, Set<string>>;

/**
 * Compute degree, betweenness, eigenvector centrality and Burt constraint for
 * every node in an undirected adjacency. Pure — no I/O. Internally re-indexes
 * ids to dense integers so the inner loops run over typed arrays.
 */
export function computeGraphMetrics(adjacency: Adjacency): Map<string, NodeMetrics> {
  const ids = [...adjacency.keys()];
  const n = ids.length;
  const result = new Map<string, NodeMetrics>();
  if (n === 0) return result;

  const index = new Map<string, number>();
  ids.forEach((id, i) => index.set(id, i));

  // Dense integer adjacency. Skip any neighbour that isn't itself a node (the
  // adjacency is symmetric by construction, so this should be a no-op).
  const adj: number[][] = ids.map(id => {
    const out: number[] = [];
    for (const nb of adjacency.get(id)!) {
      const j = index.get(nb);
      if (j !== undefined) out.push(j);
    }
    return out;
  });
  const degree = adj.map(a => a.length);

  const betweenness = brandes(adj);
  const eigenvector = eigenvectorCentrality(adj);
  const constraint = burtConstraint(adj);

  const maxDeg = Math.max(1, ...degree);
  const maxBtw = Math.max(...betweenness, 0) || 1;
  const maxEig = Math.max(...eigenvector, 0) || 1;

  for (let i = 0; i < n; i++) {
    result.set(ids[i], {
      degree: degree[i] / maxDeg,
      degreeRaw: degree[i],
      betweenness: betweenness[i] / maxBtw,
      eigenvector: eigenvector[i] / maxEig,
      constraint: constraint[i],
    });
  }
  return result;
}

/**
 * Brandes' betweenness for an unweighted undirected graph. O(V·E). For each
 * source s we BFS the shortest-path DAG (recording predecessors and σ, the
 * number of shortest paths), then accumulate dependencies in reverse BFS order.
 * The 1/2 at the end removes the double-count from undirected pairs.
 */
function brandes(adj: number[][]): Float64Array {
  const n = adj.length;
  const bc = new Float64Array(n);
  const sigma = new Float64Array(n);
  const dist = new Int32Array(n);
  const delta = new Float64Array(n);
  // Predecessor lists, reused per source (cleared via the BFS order stamp).
  const preds: number[][] = Array.from({ length: n }, () => []);
  const queue = new Int32Array(n);
  const order = new Int32Array(n);

  for (let s = 0; s < n; s++) {
    for (let i = 0; i < n; i++) {
      sigma[i] = 0;
      dist[i] = -1;
      delta[i] = 0;
      if (preds[i].length) preds[i].length = 0;
    }
    sigma[s] = 1;
    dist[s] = 0;

    let head = 0, tail = 0, ordTail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const v = queue[head++];
      order[ordTail++] = v;
      const dv = dist[v];
      const sv = sigma[v];
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dv + 1;
          queue[tail++] = w;
        }
        if (dist[w] === dv + 1) {
          sigma[w] += sv;
          preds[w].push(v);
        }
      }
    }

    // Back-propagation in order of non-increasing distance from s.
    for (let i = ordTail - 1; i >= 0; i--) {
      const w = order[i];
      const coeff = (1 + delta[w]) / sigma[w];
      for (const v of preds[w]) delta[v] += sigma[v] * coeff;
      if (w !== s) bc[w] += delta[w];
    }
  }

  for (let i = 0; i < n; i++) bc[i] *= 0.5;
  return bc;
}

/**
 * Eigenvector centrality by power iteration. x ← A·x, L2-normalised each step.
 * ~50 iterations converges comfortably for a graph this size. Seeded uniformly;
 * isolated nodes settle to ~0.
 */
function eigenvectorCentrality(adj: number[][], iterations = 50): Float64Array {
  const n = adj.length;
  let x = new Float64Array(n).fill(1 / Math.sqrt(n));
  let next = new Float64Array(n);
  for (let it = 0; it < iterations; it++) {
    next.fill(0);
    for (let v = 0; v < n; v++) {
      const xv = x[v];
      if (xv === 0) continue;
      for (const w of adj[v]) next[w] += xv;
    }
    let norm = 0;
    for (let i = 0; i < n; i++) norm += next[i] * next[i];
    norm = Math.sqrt(norm);
    if (norm === 0) break;
    for (let i = 0; i < n; i++) next[i] /= norm;
    const tmp = x; x = next; next = tmp;
  }
  return x;
}

/**
 * Burt's constraint per node. With unweighted ties, proportional tie strength
 * p_ij = 1/deg(i) for each neighbour j. Constraint on i from j is
 * (p_ij + Σ_q p_iq·p_qj)^2, summed over j. The Σ_q term is indirect investment:
 * how much i's other contacts q are also tied to j. LOW constraint means i's
 * neighbours don't know each other — i spans structural holes. Isolated/degree-0
 * nodes get 0.
 */
function burtConstraint(adj: number[][]): Float64Array {
  const n = adj.length;
  const constraint = new Float64Array(n);
  // Neighbour membership lookup for the q→j tie test.
  const nbSet: Set<number>[] = adj.map(a => new Set(a));

  for (let i = 0; i < n; i++) {
    const Ni = adj[i];
    const di = Ni.length;
    if (di === 0) continue;
    const pi = 1 / di; // p_iq is the same for every contact q of i

    let total = 0;
    for (const j of Ni) {
      // Indirect: Σ over q in N(i), q≠j, q≠i, of p_iq · p_qj.
      let indirect = 0;
      for (const q of Ni) {
        if (q === j || q === i) continue;
        const dq = adj[q].length;
        if (dq === 0) continue;
        // p_qj = 1/deg(q) if q is tied to j, else 0.
        if (nbSet[q].has(j)) indirect += pi * (1 / dq);
      }
      const pij = pi; // direct proportional tie i→j
      total += (pij + indirect) * (pij + indirect);
    }
    constraint[i] = total;
  }
  return constraint;
}

interface EntityRow { canonical_entity_id: string; display_name: string; entity_type: string }
interface ConnRow { source_entity_id: string; connected_entity_id: string | null; connection_type: string }
interface CoDirRow { seed_entity_id: string; co_director_entity_id: string }

export interface GraphMetricsResult {
  metrics: Map<string, NodeMetrics>;
  nameOf: Map<string, string>;
}

/**
 * Build the person↔person adjacency from Postgres (the same projection as
 * supporter-reach.ts: network_connections + co_director_edges + shared-company
 * co-membership, suppressions-filtered, person↔person only) and return the
 * computed structural metrics plus an id→name map.
 */
export const loadGraphMetrics = cache(async (supabase: SupabaseClient): Promise<GraphMetricsResult> => {
  const [entities, connections, coDirectors, suppressions] = await Promise.all([
    fetchAll<EntityRow>(supabase, 'canonical_entities', 'canonical_entity_id, display_name, entity_type'),
    fetchAll<ConnRow>(supabase, 'network_connections', 'source_entity_id, connected_entity_id, connection_type'),
    fetchAll<CoDirRow>(supabase, 'co_director_edges', 'seed_entity_id, co_director_entity_id'),
    loadSuppressions(supabase),
  ]);

  const nameOf = new Map(entities.map(e => [e.canonical_entity_id, e.display_name]));
  const typeOf = new Map(entities.map(e => [e.canonical_entity_id, e.entity_type]));
  const isPerson = (id: string) => typeOf.get(id) === 'person';
  const isCompany = (id: string) => typeOf.get(id) === 'company';

  const adj: Adjacency = new Map();
  const link = (a: string, b: string) => {
    if (!a || !b || a === b || !isPerson(a) || !isPerson(b)) return;
    if (suppressions.isSuppressedPair(a, b)) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  const companyMembers = new Map<string, Set<string>>();
  for (const c of connections) {
    const s = c.source_entity_id, t = c.connected_entity_id;
    if (!t) continue;
    if (isPerson(s) && isPerson(t)) link(s, t);
    else if (isPerson(s) && isCompany(t) && c.connection_type === 'DIRECTOR_OF') {
      if (!companyMembers.has(t)) companyMembers.set(t, new Set());
      companyMembers.get(t)!.add(s);
    }
  }
  for (const d of coDirectors) link(d.seed_entity_id, d.co_director_entity_id);
  for (const [, members] of companyMembers) {
    if (members.size < 2 || members.size > 40) continue;
    const arr = [...members];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) link(arr[i], arr[j]);
  }

  return { metrics: computeGraphMetrics(adj), nameOf };
});
