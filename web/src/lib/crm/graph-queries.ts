import { cache } from 'react';
import { seedInfo } from './seed-reference';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// PostgREST caps a single response at 1000 rows by default. These tables are
// small (≤ ~2k rows), so one page is enough — but we keep a loop as a safety net.
const PAGE_SIZE = 1000;

export interface GraphNode {
  id: string;
  name: string;
  type: 'person' | 'company';
  connectionCount: number;
  /** Connected-component id (for cluster colouring). Set by projection builders. */
  component?: number;
  /** Which seed-reference list this person came from, if any (drives the HNW highlight). */
  seedSource?: 'hnw_targets' | 'supporters';
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  via?: string;
  /** Number of distinct reasons two nodes are linked (bundled). Defaults to 1. */
  weight?: number;
  /** The set of relationship/membership types that produced this edge. */
  provenance?: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface EntityRow {
  canonical_entity_id: string;
  display_name: string;
  entity_type: string;
}

interface ConnectionRow {
  source_entity_id: string;
  connected_entity_id: string;
  connection_type: string;
  via_organisation: string | null;
}

interface CoDirectorRow {
  seed_entity_id: string;
  co_director_entity_id: string;
  company_name: string | null;
}

/** Paginate a table fully via .range(). Generic over the row type. */
async function fetchAll<T>(supabase: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

const fetchAllConnections = (supabase: SupabaseClient) =>
  fetchAll<ConnectionRow>(supabase, 'network_connections', 'source_entity_id, connected_entity_id, connection_type, via_organisation');

const fetchAllEntities = (supabase: SupabaseClient) =>
  fetchAll<EntityRow>(supabase, 'canonical_entities', 'canonical_entity_id, display_name, entity_type');

const fetchCoDirectorEdges = (supabase: SupabaseClient) =>
  fetchAll<CoDirectorRow>(supabase, 'co_director_edges', 'seed_entity_id, co_director_entity_id, company_name');

export interface GraphTables {
  entities: EntityRow[];
  entityMap: Map<string, EntityRow>;
  connections: ConnectionRow[];
  coDirectors: CoDirectorRow[];
  charityIds: Set<string>;
}

/**
 * Load every table the graphs need — ONCE, in parallel — and derive the
 * entity map + charity-id set. Wrapped in React.cache() so that within a single
 * server render, all graph builders (orbit, bipartite, institutions, charities)
 * share one load instead of each re-fetching the full tables. This is the fix
 * for the multi-second graph page loads.
 */
export const loadGraphTables = cache(async (supabase: SupabaseClient): Promise<GraphTables> => {
  const [entities, connections, coDirectors, charityEvidence] = await Promise.all([
    fetchAllEntities(supabase),
    fetchAllConnections(supabase),
    fetchCoDirectorEdges(supabase),
    fetchCharityEvidenceIds(supabase),
  ]);

  const entityMap = new Map(entities.map(e => [e.canonical_entity_id, e]));

  const charityIds = new Set<string>(charityEvidence);
  for (const e of entities) {
    if (e.entity_type === 'company' && isCharityByName(e.display_name)) charityIds.add(e.canonical_entity_id);
  }

  return { entities, entityMap, connections, coDirectors, charityIds };
});

const CHARITY_KEYWORDS = ['foundation', 'trust', 'charity', 'charitable', 'endowment'];

function isCharityByName(name: string): boolean {
  const lower = name.toLowerCase();
  return CHARITY_KEYWORDS.some(kw => lower.includes(kw));
}

/** Undirected pair key, order-independent. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface EdgeAcc {
  a: string;
  b: string;
  weight: number;
  types: Set<string>;
  vias: Set<string>;
}

/** Connected-component labelling over an undirected edge list. */
function labelComponents(nodeIds: string[], edges: Array<{ a: string; b: string }>): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  }
  const comp = new Map<string, number>();
  let next = 0;
  for (const id of nodeIds) {
    if (comp.has(id)) continue;
    const stack = [id];
    comp.set(id, next);
    while (stack.length) {
      const x = stack.pop()!;
      for (const y of adj.get(x) ?? []) {
        if (!comp.has(y)) {
          comp.set(y, next);
          stack.push(y);
        }
      }
    }
    next++;
  }
  return comp;
}

/**
 * ORBIT graph — people connected by shared "orbit".
 *
 * People are linked person↔person by the union of:
 *   1. existing person→person network_connections (CO_DIRECTOR_OF, FAMILY_MEMBER, …)
 *   2. co-membership: two people who share a company (collapsed from person→company)
 *   3. co_director_edges (Companies House shared boards — ignored by the old graph)
 *
 * Edges are undirected, de-duplicated by canonical pair key, and weighted by the
 * number of distinct reasons the two people are linked (so strong bonds read thicker).
 *
 * With `bipartite: true`, returns people AND companies as nodes with the raw
 * person→company edges instead (the toggle's second mode).
 */
export function buildOrbitGraph(
  tables: GraphTables,
  opts: { bipartite?: boolean } = {},
): GraphData {
  const { connections, coDirectors, entityMap } = tables;
  const typeOf = (id: string) => entityMap.get(id)?.entity_type;

  // ---- Bipartite mode: people + companies, raw person→company edges ----
  if (opts.bipartite) {
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();
    for (const c of connections) {
      const s = entityMap.get(c.source_entity_id);
      const t = entityMap.get(c.connected_entity_id);
      if (s?.entity_type === 'person' && t?.entity_type === 'company') {
        edges.push({ source: c.source_entity_id, target: c.connected_entity_id, type: c.connection_type, via: c.via_organisation ?? undefined });
        nodeIds.add(c.source_entity_id);
        nodeIds.add(c.connected_entity_id);
      }
    }
    return buildNodes(nodeIds, edges, entityMap);
  }

  // ---- Orbit projection (person↔person) ----
  const acc = new Map<string, EdgeAcc>();
  const addPair = (a: string, b: string, type: string, via?: string | null) => {
    if (!a || !b || a === b) return;
    const k = pairKey(a, b);
    let e = acc.get(k);
    if (!e) {
      e = { a: a < b ? a : b, b: a < b ? b : a, weight: 0, types: new Set(), vias: new Set() };
      acc.set(k, e);
    }
    e.weight += 1;
    e.types.add(type);
    if (via) e.vias.add(via);
  };

  // 1. existing person↔person connections
  for (const c of connections) {
    if (typeOf(c.source_entity_id) === 'person' && typeOf(c.connected_entity_id) === 'person') {
      addPair(c.source_entity_id, c.connected_entity_id, c.connection_type, c.via_organisation);
    }
  }

  // 2. co-membership via a shared company (reliable id-based grouping)
  const companyMembers = new Map<string, Set<string>>();
  for (const c of connections) {
    if (typeOf(c.source_entity_id) === 'person' && typeOf(c.connected_entity_id) === 'company') {
      const set = companyMembers.get(c.connected_entity_id) ?? new Set<string>();
      set.add(c.source_entity_id);
      companyMembers.set(c.connected_entity_id, set);
    }
  }
  for (const [companyId, members] of companyMembers) {
    if (members.size < 2 || members.size > 50) continue; // skip singletons + hairball orgs
    const arr = [...members];
    const orgName = entityMap.get(companyId)?.display_name;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        addPair(arr[i], arr[j], 'CO_MEMBER', orgName);
      }
    }
  }

  // 3. co_director_edges (already person↔person)
  for (const d of coDirectors) {
    if (typeOf(d.seed_entity_id) === 'person' && typeOf(d.co_director_entity_id) === 'person') {
      addPair(d.seed_entity_id, d.co_director_entity_id, 'CO_DIRECTOR_OF', d.company_name);
    }
  }

  const accList = [...acc.values()];
  const nodeIds = new Set<string>();
  for (const e of accList) {
    nodeIds.add(e.a);
    nodeIds.add(e.b);
  }

  const components = labelComponents([...nodeIds], accList);

  const degree = new Map<string, number>();
  for (const e of accList) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }

  const dominantType = (types: Set<string>): string => {
    // Prefer a human-meaningful label when present.
    const order = ['FAMILY_MEMBER', 'CO_TRUSTEE', 'CO_DIRECTOR_OF', 'CO_MEMBER', 'ASSOCIATED_WITH'];
    for (const t of order) if (types.has(t)) return t;
    return [...types][0] ?? 'ASSOCIATED_WITH';
  };

  const nodes: GraphNode[] = [...nodeIds].map(id => {
    const e = entityMap.get(id)!;
    return {
      id,
      name: e.display_name,
      type: 'person',
      connectionCount: degree.get(id) ?? 0,
      component: components.get(id),
      seedSource: seedInfo(e.display_name)?.source,
    };
  });

  const edges: GraphEdge[] = accList.map(e => ({
    source: e.a,
    target: e.b,
    type: dominantType(e.types),
    weight: e.weight,
    provenance: [...e.types],
    via: [...e.vias][0],
  }));

  return { nodes, edges };
}

/** Shared node-builder for the bipartite/institution/charity graphs. */
function buildNodes(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  entityMap: Map<string, EntityRow>,
): GraphData {
  const connCounts = new Map<string, number>();
  for (const e of edges) {
    connCounts.set(e.source, (connCounts.get(e.source) ?? 0) + 1);
    connCounts.set(e.target, (connCounts.get(e.target) ?? 0) + 1);
  }
  const nodes: GraphNode[] = [...nodeIds].map(id => {
    const e = entityMap.get(id)!;
    return {
      id,
      name: e.display_name,
      type: e.entity_type as 'person' | 'company',
      connectionCount: connCounts.get(id) ?? 0,
      seedSource: e.entity_type === 'person' ? seedInfo(e.display_name)?.source : undefined,
    };
  });
  return { nodes, edges };
}

/** Person→company edges, filtered by whether the company is a charity. */
function buildBipartiteByCharity(tables: GraphTables, wantCharity: boolean): GraphData {
  const { connections, entityMap, charityIds } = tables;
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  for (const c of connections) {
    const src = entityMap.get(c.source_entity_id);
    const tgt = entityMap.get(c.connected_entity_id);
    if (src?.entity_type === 'person' && tgt?.entity_type === 'company' && charityIds.has(tgt.canonical_entity_id) === wantCharity) {
      edges.push({ source: c.source_entity_id, target: c.connected_entity_id, type: c.connection_type, via: c.via_organisation ?? undefined });
      nodeIds.add(c.source_entity_id);
      nodeIds.add(c.connected_entity_id);
    }
  }
  return buildNodes(nodeIds, edges, entityMap);
}

export const buildInstitutionGraph = (tables: GraphTables): GraphData => buildBipartiteByCharity(tables, false);
export const buildCharityGraph = (tables: GraphTables): GraphData => buildBipartiteByCharity(tables, true);

/** Entity ids with charity_commission evidence (used as a charity signal). */
async function fetchCharityEvidenceIds(supabase: SupabaseClient): Promise<string[]> {
  const all: string[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('enrichment_evidence')
      .select('entity_id')
      .eq('source', 'charity_commission')
      .range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) all.push(r.entity_id);
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}
