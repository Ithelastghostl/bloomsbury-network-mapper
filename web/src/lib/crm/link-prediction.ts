import { loadPersonGraph, type PersonGraph } from './person-graph';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Link prediction — "probably knows" candidate ties.
 *
 * Over the person↔person adjacency, find pairs with NO recorded edge but a
 * strong topological signal: many shared contacts, or a shared institution.
 * Each candidate is scored by Adamic-Adar — the sum over common neighbours w of
 * 1/log(degree(w)) — so a shared low-degree contact (a tight, specific tie)
 * counts for more than a shared hub everyone knows.
 *
 * A pair qualifies when it has ≥2 common neighbours OR shares an institution.
 * Already-connected pairs, suppressed pairs, and pairs already decided in
 * suggested_tie_decisions are excluded. Returns the top-N by score, desc.
 */

export interface SuggestedTie {
  a: string;
  b: string;
  aName: string;
  bName: string;
  score: number;
  commonNeighbours: string[];
  sharedInstitutions: string[];
}

/** Undirected pair key, order-independent. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const MIN_COMMON_NEIGHBOURS = 2;

/**
 * Pure scorer over a prepared PersonGraph. `decided` is the set of pairKeys
 * already confirmed/dismissed (filtered out so they don't resurface).
 */
export function suggestTies(graph: PersonGraph, decided: Set<string>, limit: number): SuggestedTie[] {
  const { adj, nameOf, institutionsOf } = graph;

  // Degree per node, and Adamic-Adar weight 1/log(deg) for each node (as a
  // common neighbour). deg ≤ 1 contributes nothing usable (log 1 = 0), so skip.
  const aaWeight = new Map<string, number>();
  for (const [id, nbrs] of adj) {
    const deg = nbrs.size;
    if (deg >= 2) aaWeight.set(id, 1 / Math.log(deg));
  }

  // Candidate generation 1: pairs sharing ≥1 common neighbour. We walk each
  // node w and pair up its neighbours — every such pair shares w. Accumulate
  // the Adamic-Adar contribution and the witness w per candidate pair.
  interface Acc { a: string; b: string; score: number; common: string[] }
  const acc = new Map<string, Acc>();
  const bump = (a: string, b: string, w: string, weight: number) => {
    if (a === b) return;
    if (adj.get(a)?.has(b)) return; // already connected
    const k = pairKey(a, b);
    if (decided.has(k)) return;
    let e = acc.get(k);
    if (!e) { e = { a: a < b ? a : b, b: a < b ? b : a, score: 0, common: [] }; acc.set(k, e); }
    e.score += weight;
    e.common.push(w);
  };

  for (const [w, nbrs] of adj) {
    const weight = aaWeight.get(w);
    if (weight === undefined) continue; // hub of degree <2 contributes nothing
    const arr = [...nbrs];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) bump(arr[i], arr[j], w, weight);
    }
  }

  // Candidate generation 2: pairs sharing an institution (same-institution
  // qualifier, even with <2 common neighbours). Group people by institution
  // key, then pair within each group (skip hairballs to stay bounded).
  const byInstitution = new Map<string, string[]>();
  for (const [person, keys] of institutionsOf) {
    for (const key of keys) {
      if (!byInstitution.has(key)) byInstitution.set(key, []);
      byInstitution.get(key)!.push(person);
    }
  }
  const sharedInst = new Map<string, Set<string>>(); // pairKey → institution keys
  for (const [key, people] of byInstitution) {
    if (people.length < 2 || people.length > 60) continue;
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i], b = people[j];
        if (a === b || adj.get(a)?.has(b)) continue;
        const k = pairKey(a, b);
        if (decided.has(k)) continue;
        if (!sharedInst.has(k)) sharedInst.set(k, new Set());
        sharedInst.get(k)!.add(key);
        if (!acc.has(k)) acc.set(k, { a: a < b ? a : b, b: a < b ? b : a, score: 0, common: [] });
      }
    }
  }

  const instName = graph.institutionName;
  const out: SuggestedTie[] = [];
  for (const [k, e] of acc) {
    const insts = sharedInst.get(k);
    const qualifies = e.common.length >= MIN_COMMON_NEIGHBOURS || (insts && insts.size > 0);
    if (!qualifies) continue;
    const sharedInstitutions = insts ? [...insts].map(key => instName.get(key) ?? key).sort() : [];
    out.push({
      a: e.a,
      b: e.b,
      aName: nameOf.get(e.a) ?? e.a,
      bName: nameOf.get(e.b) ?? e.b,
      score: e.score,
      commonNeighbours: e.common.map(id => nameOf.get(id) ?? id).sort(),
      sharedInstitutions,
    });
  }

  out.sort((x, y) =>
    y.score - x.score ||
    y.commonNeighbours.length - x.commonNeighbours.length ||
    x.aName.localeCompare(y.aName),
  );
  return out.slice(0, limit);
}

interface DecisionRow { entity_a: string; entity_b: string }

/** Load already-decided pairs from suggested_tie_decisions (kept out of results). */
async function loadDecidedPairs(supabase: SupabaseClient): Promise<Set<string>> {
  const decided = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('suggested_tie_decisions')
      .select('entity_a, entity_b')
      .range(offset, offset + 999);
    if (error || !data?.length) break; // table may not exist yet pre-migration
    for (const r of data as DecisionRow[]) decided.add(pairKey(r.entity_a, r.entity_b));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return decided;
}

/** Top-N suggested ties, ready for the review queue. */
export async function loadSuggestedTies(supabase: SupabaseClient, limit = 200): Promise<SuggestedTie[]> {
  const [graph, decided] = await Promise.all([
    loadPersonGraph(supabase),
    loadDecidedPairs(supabase),
  ]);
  return suggestTies(graph, decided, limit);
}
