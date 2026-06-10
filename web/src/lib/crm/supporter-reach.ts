import { cache } from 'react';
import { isSupporter, isHnwTarget, seedInfo } from './seed-reference';
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

export interface SupporterNode {
  id: string;
  name: string;
  tier: string | null;
  funderSubType: string | null;
  firstDegreeHnw: number;
  firstDegreeWealth: number;
  firstDegreeNames: string[];
  totalReachWealth: number;
  totalReachCount: number;
  hnwNames: string[];
  /** People exactly 2 hops away (not supporters, not 1-hop). */
  secondDegreeCount: number;
  /** HNW targets reachable within 2 hops. */
  hnwWithin2Hops: number;
  /** Combined net worth of everyone reachable within 2 hops. */
  reach2Wealth: number;
}

export interface ReachEdge {
  source: string;
  target: string;
  via?: string;
}

export interface SupporterReachData {
  supporters: SupporterNode[];
  edges: ReachEdge[];
  hnwNodes: Array<{ id: string; name: string; netWorth: number }>;
}

interface EntityRow { canonical_entity_id: string; display_name: string; entity_type: string; attributes: Record<string, unknown> | null }
interface ConnRow { source_entity_id: string; connected_entity_id: string | null; connection_type: string; via_organisation: string | null }
interface CoDirRow { seed_entity_id: string; co_director_entity_id: string; company_name: string | null }
interface WealthRow { entity_id: string; band: string; score: number }

export const loadSupporterReach = cache(async (supabase: SupabaseClient): Promise<SupporterReachData> => {
  const [entities, connections, coDirectors, wealthRows, suppressions] = await Promise.all([
    fetchAll<EntityRow>(supabase, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes'),
    fetchAll<ConnRow>(supabase, 'network_connections', 'source_entity_id, connected_entity_id, connection_type, via_organisation'),
    fetchAll<CoDirRow>(supabase, 'co_director_edges', 'seed_entity_id, co_director_entity_id, company_name'),
    fetchAll<WealthRow>(supabase, 'wealth_estimates', 'entity_id, band, score'),
    loadSuppressions(supabase),
  ]);

  const nameOf = new Map(entities.map(e => [e.canonical_entity_id, e.display_name]));
  const typeOf = new Map(entities.map(e => [e.canonical_entity_id, e.entity_type]));
  const attrsOf = new Map(entities.map(e => [e.canonical_entity_id, e.attributes ?? {}]));
  const isPerson = (id: string) => typeOf.get(id) === 'person';
  const isCompany = (id: string) => typeOf.get(id) === 'company';

  // Net worth: prefer attributes.estimated_net_worth_gbp, fallback to wealth_estimates band midpoint
  const bandMid: Record<string, number> = { '100m_plus': 200_000_000, '25m_100m': 50_000_000, '5m_25m': 12_000_000, '1m_5m': 2_500_000, unknown: 0 };
  const wealthBandOf = new Map(wealthRows.map(w => [w.entity_id, w.band]));
  const netWorthOf = (id: string): number => {
    const a = attrsOf.get(id) as Record<string, unknown> | undefined;
    if (a?.estimated_net_worth_gbp && typeof a.estimated_net_worth_gbp === 'number') return a.estimated_net_worth_gbp;
    const band = wealthBandOf.get(id);
    return band ? (bandMid[band] ?? 0) : 0;
  };

  // Supporter & HNW sets
  const supporterIds = new Set<string>();
  const hnwIds = new Set<string>();
  for (const e of entities) {
    if (e.entity_type !== 'person') continue;
    if (isSupporter(e.display_name)) supporterIds.add(e.canonical_entity_id);
    if (isHnwTarget(e.display_name)) hnwIds.add(e.canonical_entity_id);
  }

  // Person↔person adjacency with via
  const adj = new Map<string, Map<string, string | undefined>>();
  const link = (a: string, b: string, via?: string) => {
    if (!a || !b || a === b || !isPerson(a) || !isPerson(b)) return;
    if (suppressions.isSuppressedPair(a, b)) return;
    if (!adj.has(a)) adj.set(a, new Map());
    if (!adj.has(b)) adj.set(b, new Map());
    if (!adj.get(a)!.has(b) || via) adj.get(a)!.set(b, via);
    if (!adj.get(b)!.has(a) || via) adj.get(b)!.set(a, via);
  };

  const companyMembers = new Map<string, Set<string>>();
  for (const c of connections) {
    const s = c.source_entity_id, t = c.connected_entity_id;
    if (!t) continue;
    if (isPerson(s) && isPerson(t)) link(s, t, c.via_organisation ?? undefined);
    else if (isPerson(s) && isCompany(t) && c.connection_type === 'DIRECTOR_OF') {
      if (!companyMembers.has(t)) companyMembers.set(t, new Set());
      companyMembers.get(t)!.add(s);
    }
  }
  for (const d of coDirectors) link(d.seed_entity_id, d.co_director_entity_id, d.company_name ?? undefined);
  for (const [co, members] of companyMembers) {
    if (members.size < 2 || members.size > 40) continue;
    const arr = [...members], org = nameOf.get(co);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) link(arr[i], arr[j], org);
  }

  // Per-supporter: count 1st-degree HNWs, sum 1st-degree network wealth
  const supporters: SupporterNode[] = [];
  const edges: ReachEdge[] = [];
  const seenHnw = new Map<string, { id: string; name: string; netWorth: number }>();

  for (const sId of supporterIds) {
    const neighbours = adj.get(sId);
    if (!neighbours) {
      const si = seedInfo(nameOf.get(sId)!);
      supporters.push({
        id: sId, name: nameOf.get(sId)!, tier: si?.tier ?? null, funderSubType: si?.funder_sub_type ?? null,
        firstDegreeHnw: 0, firstDegreeWealth: 0, firstDegreeNames: [],
        totalReachWealth: 0, totalReachCount: 0, hnwNames: [],
        secondDegreeCount: 0, hnwWithin2Hops: 0, reach2Wealth: 0,
      });
      continue;
    }

    let hnwCount = 0;
    let totalWealth = 0;
    const hnwNames: string[] = [];
    const fdNames: string[] = [];

    for (const [nbId, via] of neighbours) {
      if (!isPerson(nbId)) continue;
      const nw = netWorthOf(nbId);
      totalWealth += nw;

      if (hnwIds.has(nbId)) {
        hnwCount++;
        hnwNames.push(nameOf.get(nbId)!);
        edges.push({ source: sId, target: nbId, via });
        if (!seenHnw.has(nbId)) seenHnw.set(nbId, { id: nbId, name: nameOf.get(nbId)!, netWorth: nw });
      }
      if (nw > 0) fdNames.push(nameOf.get(nbId)!);
    }

    // 2-hop scorecard: neighbours-of-neighbours (excluding self, supporters, and 1-hop)
    const firstHop = new Set(neighbours.keys());
    const secondHop = new Set<string>();
    for (const nbId of firstHop) {
      for (const nb2 of adj.get(nbId)?.keys() ?? []) {
        if (nb2 === sId || firstHop.has(nb2) || supporterIds.has(nb2)) continue;
        secondHop.add(nb2);
      }
    }
    let hnw2 = hnwCount;
    let wealth2 = totalWealth;
    for (const id2 of secondHop) {
      if (hnwIds.has(id2)) hnw2++;
      wealth2 += netWorthOf(id2);
    }

    const si = seedInfo(nameOf.get(sId)!);
    supporters.push({
      id: sId, name: nameOf.get(sId)!, tier: si?.tier ?? null, funderSubType: si?.funder_sub_type ?? null,
      firstDegreeHnw: hnwCount, firstDegreeWealth: totalWealth, firstDegreeNames: fdNames,
      totalReachWealth: totalWealth, totalReachCount: neighbours.size, hnwNames,
      secondDegreeCount: secondHop.size, hnwWithin2Hops: hnw2, reach2Wealth: wealth2,
    });
  }

  return {
    supporters: supporters.sort((a, b) => b.firstDegreeHnw - a.firstDegreeHnw),
    edges,
    hnwNodes: [...seenHnw.values()],
  };
});
