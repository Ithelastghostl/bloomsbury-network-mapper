import { loadGraphTables, type GraphTables } from './graph-queries';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Shared person↔person adjacency, derived once from the graph tables that
 * supporter-reach.ts / buildOrbitGraph already build from. Link prediction and
 * community detection both need the same undirected person graph, so the build
 * lives here rather than being copied into each.
 *
 * Edges are the union of (suppression-filtered, via loadGraphTables):
 *   1. person↔person network_connections
 *   2. co-membership via a shared company (person→company DIRECTOR_OF/edges)
 *   3. co_director_edges (Companies House shared boards)
 *
 * Per-person institution membership is collected in parallel (org names from
 * shared companies, via_organisation strings, and co-director company names) so
 * callers can use "same institution" as a signal / community label.
 */

export interface PersonGraph {
  /** entityId → Set of neighbour entityIds (undirected, deduped). */
  adj: Map<string, Set<string>>;
  /** entityId → display name. */
  nameOf: Map<string, string>;
  /** entityId → lowercased sector string (from attributes.sector), if any. */
  sectorOf: Map<string, string>;
  /** entityId → Set of lowercased institution keys this person belongs to. */
  institutionsOf: Map<string, Set<string>>;
  /** lowercased institution key → display name (first seen casing). */
  institutionName: Map<string, string>;
}

const MAX_ORG_FANOUT = 50; // skip hairball orgs when projecting co-membership

export function buildPersonGraph(tables: GraphTables): PersonGraph {
  const { connections, coDirectors, entityMap } = tables;
  const typeOf = (id: string) => entityMap.get(id)?.entity_type;
  const isPerson = (id: string) => typeOf(id) === 'person';
  const isCompany = (id: string) => typeOf(id) === 'company';

  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!a || !b || a === b || !isPerson(a) || !isPerson(b)) return;
    if (tables.suppressions.isSuppressedPair(a, b)) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  const institutionsOf = new Map<string, Set<string>>();
  const institutionName = new Map<string, string>();
  const addInstitution = (personId: string, orgName: string | null | undefined) => {
    if (!orgName || !isPerson(personId)) return;
    const key = orgName.trim().toLowerCase();
    if (!key) return;
    if (!institutionsOf.has(personId)) institutionsOf.set(personId, new Set());
    institutionsOf.get(personId)!.add(key);
    if (!institutionName.has(key)) institutionName.set(key, orgName.trim());
  };

  // 1. person↔person connections; collect person→company memberships
  const companyMembers = new Map<string, Set<string>>();
  for (const c of connections) {
    const s = c.source_entity_id;
    const t = c.connected_entity_id;
    if (!t) continue;
    if (isPerson(s) && isPerson(t)) {
      link(s, t);
      if (c.via_organisation) { addInstitution(s, c.via_organisation); addInstitution(t, c.via_organisation); }
    } else if (isPerson(s) && isCompany(t)) {
      if (!companyMembers.has(t)) companyMembers.set(t, new Set());
      companyMembers.get(t)!.add(s);
    }
  }

  // 2. co-membership via a shared company
  for (const [companyId, members] of companyMembers) {
    const orgName = entityMap.get(companyId)?.display_name;
    for (const m of members) addInstitution(m, orgName);
    if (members.size < 2 || members.size > MAX_ORG_FANOUT) continue;
    const arr = [...members];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) link(arr[i], arr[j]);
    }
  }

  // 3. co_director_edges (already person↔person)
  for (const d of coDirectors) {
    link(d.seed_entity_id, d.co_director_entity_id);
    addInstitution(d.seed_entity_id, d.company_name);
    addInstitution(d.co_director_entity_id, d.company_name);
  }

  const nameOf = new Map<string, string>();
  const sectorOf = new Map<string, string>();
  for (const e of entityMap.values()) {
    if (e.entity_type !== 'person') continue;
    nameOf.set(e.canonical_entity_id, e.display_name);
  }
  // sector lives in attributes, which loadGraphTables doesn't select — callers
  // that need it pass an entity attributes map (see loadPersonGraph below).
  return { adj, nameOf, sectorOf, institutionsOf, institutionName };
}

interface AttrRow { canonical_entity_id: string; attributes: Record<string, unknown> | null }

/** Load the person graph plus per-person sector (from canonical_entities.attributes). */
export async function loadPersonGraph(supabase: SupabaseClient): Promise<PersonGraph> {
  const tables = await loadGraphTables(supabase);
  const graph = buildPersonGraph(tables);

  // attributes aren't part of loadGraphTables' projection; pull sector separately.
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const { data } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, attributes')
      .eq('entity_type', 'person')
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data as AttrRow[]) {
      const sector = r.attributes?.sector;
      if (typeof sector === 'string' && sector.trim()) {
        graph.sectorOf.set(r.canonical_entity_id, sector.trim().toLowerCase());
      }
    }
    if (data.length < PAGE) break;
    offset += data.length;
  }
  return graph;
}
