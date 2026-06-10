import { cache } from 'react';
import { isSupporter, isHnwTarget } from './seed-reference';
import type { GraphEdge } from './graph-queries';
import { loadSuppressions, EMPTY_SUPPRESSIONS, type SuppressionSet } from './suppressions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;
const PAGE_SIZE = 1000;

/**
 * The Introduction Graph answers: starting from our 287 supporters (the people
 * we already know), how do we reach the 62 HNW targets and other HNW individuals?
 *
 *   degree 0 = a supporter (we already know them — the starting point)
 *   degree 1 = someone a supporter knows directly (one hop away)
 *   degree 2 = someone a degree-1 person knows (two hops from a supporter)
 *   hnw_target = one of the 62 HNW targets we want to reach (highlighted)
 *
 * Two people are linked if they share an org/board (co-director / co-membership)
 * or have a direct person↔person tie; the freshly-staged outward contacts are
 * leaf people linked to the supporter that surfaced them.
 */

export interface IntroNode {
  id: string;
  name: string;
  type: 'person' | 'company';
  connectionCount: number;
  degree: number;            // 0 supporter, 1 first-order, 2 second-order, -1 org
  /** Whom to go through to reach this node (one degree closer to a supporter). */
  introducer?: string;
  /** The supporter at the root of this node's shortest introduction path. */
  rootSupporter?: string;
  /** The org/board that links this node to its introducer. */
  via?: string;
  staged?: boolean;
  /** Whether this node is one of the 62 HNW targets we want to reach. */
  isHnwTarget?: boolean;
}

export interface IntroRoute {
  id: string;
  name: string;
  degree: number;
  introducer: string;
  rootSupporter: string;
  via?: string;
  path: string[];            // [supporter, …, node] by display name
  staged: boolean;
  isHnwTarget: boolean;
}

export interface IntroductionGraph {
  peopleChain: { nodes: IntroNode[]; edges: GraphEdge[] };
  viaOrgs: { nodes: IntroNode[]; edges: GraphEdge[] };
  routes: IntroRoute[];
  supporterCount: number;
  firstOrder: number;
  secondOrder: number;
  hnwReached: number;
  hnwTotal: number;
}

interface EntityRow { canonical_entity_id: string; display_name: string; entity_type: string }
interface ConnRow { source_entity_id: string; connected_entity_id: string | null; staged_entity_id: string | null; connection_type: string; via_organisation: string | null }
interface CoDirRow { seed_entity_id: string; co_director_entity_id: string; company_name: string | null }
interface StagedRow { staged_entity_id: string; display_name: string }

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

export interface IntroTables {
  entities: EntityRow[];
  connections: ConnRow[];
  coDirectors: CoDirRow[];
  staged: StagedRow[];
  suppressions?: SuppressionSet;
}

export const loadIntroductionTables = cache(async (supabase: SupabaseClient): Promise<IntroTables> => {
  const [entities, connections, coDirectors, staged, suppressions] = await Promise.all([
    fetchAll<EntityRow>(supabase, 'canonical_entities', 'canonical_entity_id, display_name, entity_type'),
    fetchAll<ConnRow>(supabase, 'network_connections', 'source_entity_id, connected_entity_id, staged_entity_id, connection_type, via_organisation'),
    fetchAll<CoDirRow>(supabase, 'co_director_edges', 'seed_entity_id, co_director_entity_id, company_name'),
    fetchAll<StagedRow>(supabase, 'staged_entities', 'staged_entity_id, display_name'),
    loadSuppressions(supabase),
  ]);
  return { entities, connections, coDirectors, staged, suppressions };
});

const STAGED = (id: string) => `staged:${id}`;
const undirKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function buildIntroductionGraph(tables: IntroTables): IntroductionGraph {
  const { entities, connections, coDirectors, staged } = tables;
  const suppressions = tables.suppressions ?? EMPTY_SUPPRESSIONS;

  const name = new Map<string, string>();
  const type = new Map<string, 'person' | 'company'>();
  for (const e of entities) {
    name.set(e.canonical_entity_id, e.display_name);
    type.set(e.canonical_entity_id, e.entity_type as 'person' | 'company');
  }
  for (const s of staged) name.set(STAGED(s.staged_entity_id), s.display_name);

  const isPerson = (id: string) => id.startsWith('staged:') || type.get(id) === 'person';
  const isCompany = (id: string) => type.get(id) === 'company';

  // Supporters = persons in the supporters seed list (our 287 — the starting point).
  const supporters = new Set<string>();
  // HNW targets = the 62 people we want to reach.
  const hnwTargets = new Set<string>();
  for (const e of entities) {
    if (e.entity_type !== 'person') continue;
    if (isSupporter(e.display_name)) supporters.add(e.canonical_entity_id);
    if (isHnwTarget(e.display_name)) hnwTargets.add(e.canonical_entity_id);
  }

  // ---- person↔person adjacency, each edge tagged with the linking org (via) ----
  const adj = new Map<string, Map<string, string | undefined>>(); // a -> (b -> via)
  const personToCompanies = new Map<string, Set<string>>();       // person -> company ids (for the via-orgs view)
  const companyMembers = new Map<string, Set<string>>();          // company -> person ids

  const link = (a: string, b: string, via?: string) => {
    if (!a || !b || a === b || !isPerson(a) || !isPerson(b)) return;
    if (suppressions.isSuppressedPair(a, b)) return;
    if (!adj.has(a)) adj.set(a, new Map());
    if (!adj.has(b)) adj.set(b, new Map());
    if (!adj.get(a)!.has(b) || via) adj.get(a)!.set(b, via);
    if (!adj.get(b)!.has(a) || via) adj.get(b)!.set(a, via);
  };

  for (const c of connections) {
    const s = c.source_entity_id;
    if (c.staged_entity_id) {
      // donor (or any person) -> staged outward contact (a leaf person)
      if (isPerson(s)) link(s, STAGED(c.staged_entity_id), c.via_organisation ?? undefined);
    } else if (c.connected_entity_id) {
      const t = c.connected_entity_id;
      if (isPerson(s) && isPerson(t)) {
        link(s, t, c.via_organisation ?? undefined);
      } else if (isPerson(s) && isCompany(t) && c.connection_type === 'DIRECTOR_OF') {
        if (!personToCompanies.has(s)) personToCompanies.set(s, new Set());
        personToCompanies.get(s)!.add(t);
        if (!companyMembers.has(t)) companyMembers.set(t, new Set());
        companyMembers.get(t)!.add(s);
      }
    }
  }
  for (const d of coDirectors) {
    if (isPerson(d.seed_entity_id) && isPerson(d.co_director_entity_id)) {
      link(d.seed_entity_id, d.co_director_entity_id, d.company_name ?? undefined);
    }
  }
  // co-membership: two people who share a company know each other (via that org)
  for (const [companyId, members] of companyMembers) {
    if (members.size < 2 || members.size > 40) continue; // skip singletons + hairball orgs
    const arr = [...members];
    const org = name.get(companyId);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) link(arr[i], arr[j], org);
    }
  }

  // ---- BFS from all supporters at once (multi-source), tracking degree + path ----
  const degree = new Map<string, number>();
  const introducer = new Map<string, string>(); // node -> the neighbour one step closer
  const viaOf = new Map<string, string | undefined>();
  const root = new Map<string, string>();        // node -> supporter id at path root
  let frontier: string[] = [];
  for (const s of supporters) { degree.set(s, 0); root.set(s, s); frontier.push(s); }

  for (let deg = 0; deg < 2 && frontier.length; deg++) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const [nb, via] of adj.get(cur) ?? []) {
        if (degree.has(nb)) continue;
        degree.set(nb, deg + 1);
        introducer.set(nb, cur);
        viaOf.set(nb, via);
        root.set(nb, root.get(cur)!);
        next.push(nb);
      }
    }
    frontier = next;
  }

  // ---- assemble routes + nodes ----
  const routes: IntroRoute[] = [];
  const pathTo = (id: string): string[] => {
    const out: string[] = [];
    let n: string | undefined = id;
    const guard = new Set<string>();
    while (n && !guard.has(n)) { guard.add(n); out.unshift(name.get(n) ?? n); if (degree.get(n) === 0) break; n = introducer.get(n); }
    return out;
  };

  const nodeOf = (id: string): IntroNode => {
    const deg = degree.get(id)!;
    const staged = id.startsWith('staged:');
    const introId = introducer.get(id);
    return {
      id, name: name.get(id) ?? id, type: 'person', degree: deg,
      connectionCount: adj.get(id)?.size ?? 1,
      introducer: introId ? name.get(introId) : undefined,
      rootSupporter: root.get(id) ? name.get(root.get(id)!) : undefined,
      via: viaOf.get(id), staged,
      isHnwTarget: hnwTargets.has(id),
    };
  };

  const reached = [...degree.keys()];
  for (const id of reached) {
    const deg = degree.get(id)!;
    if (deg === 0) continue;
    routes.push({
      id, name: name.get(id) ?? id, degree: deg,
      introducer: introducer.get(id) ? (name.get(introducer.get(id)!) ?? '') : '',
      rootSupporter: root.get(id) ? (name.get(root.get(id)!) ?? '') : '',
      via: viaOf.get(id), path: pathTo(id), staged: id.startsWith('staged:'),
      isHnwTarget: hnwTargets.has(id),
    });
  }

  // peopleChain edges: adjacency edges among reached nodes (deduped)
  const reachedSet = new Set(reached);
  const seenEdge = new Set<string>();
  const chainEdges: GraphEdge[] = [];
  for (const a of reached) {
    for (const [b, via] of adj.get(a) ?? []) {
      if (!reachedSet.has(b)) continue;
      const k = undirKey(a, b);
      if (seenEdge.has(k)) continue;
      seenEdge.add(k);
      chainEdges.push({ source: a, target: b, type: 'INTRO', via: via ?? undefined, weight: 1 });
    }
  }
  const chainNodes = reached.map(nodeOf);

  // viaOrgs view: reached people + the canonical companies that bridge them, person→company edges
  const orgNodes = new Map<string, IntroNode>();
  const orgEdges: GraphEdge[] = [];
  for (const id of reached) {
    for (const co of personToCompanies.get(id) ?? []) {
      // only keep orgs that connect to a reached person (always true here) and have a name
      const cname = name.get(co);
      if (!cname) continue;
      if (!orgNodes.has(co)) {
        orgNodes.set(co, { id: co, name: cname, type: 'company', degree: -1, connectionCount: companyMembers.get(co)?.size ?? 1 });
      }
      orgEdges.push({ source: id, target: co, type: 'DIRECTOR_OF', weight: 1 });
    }
  }
  const viaNodes = [...reached.map(nodeOf), ...orgNodes.values()];

  let firstOrder = 0, secondOrder = 0;
  for (const r of routes) { if (r.degree === 1) firstOrder++; else if (r.degree === 2) secondOrder++; }

  const hnwReached = routes.filter(r => r.isHnwTarget).length;

  return {
    peopleChain: { nodes: chainNodes, edges: chainEdges },
    viaOrgs: { nodes: viaNodes, edges: orgEdges },
    routes,
    supporterCount: supporters.size,
    firstOrder,
    secondOrder,
    hnwReached,
    hnwTotal: hnwTargets.size,
  };
}
