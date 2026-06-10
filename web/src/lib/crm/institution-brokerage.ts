import { isSupporter, isHnwTarget } from './seed-reference';
import type { GraphTables } from './graph-queries';

/**
 * Institution brokerage: which organisations bridge our supporters to targets.
 * An institution's brokerage value = it connects ≥1 supporter (someone who can
 * introduce) with ≥1 target (someone we want to reach). These orgs are where
 * same-institution introduction paths come from, so they deserve their own view.
 */

export interface BrokerageRow {
  institution: string;
  isCharity: boolean;
  memberCount: number;
  supporterCount: number;
  targetCount: number;
  bridgeScore: number;
  supporterNames: string[];
  targetNames: string[];
}

export function buildInstitutionBrokerage(tables: GraphTables, wealthPersonIds: Set<string>): BrokerageRow[] {
  const { connections, coDirectors, entityMap, charityIds } = tables;
  const typeOf = (id: string) => entityMap.get(id)?.entity_type;
  const nameOf = (id: string) => entityMap.get(id)?.display_name ?? id;

  // org key (lowercased name) -> member person ids. Merges org entities,
  // co-director company names, and via_organisation strings.
  const members = new Map<string, Set<string>>();
  const displayName = new Map<string, string>();
  const charityByKey = new Map<string, boolean>();

  const add = (orgName: string | null | undefined, personId: string, charity?: boolean) => {
    if (!orgName || !personId || typeOf(personId) !== 'person') return;
    const key = orgName.trim().toLowerCase();
    if (!key) return;
    if (!members.has(key)) members.set(key, new Set());
    members.get(key)!.add(personId);
    if (!displayName.has(key)) displayName.set(key, orgName.trim());
    if (charity !== undefined) charityByKey.set(key, charityByKey.get(key) || charity);
  };

  for (const c of connections) {
    if (typeOf(c.source_entity_id) === 'person' && typeOf(c.connected_entity_id) === 'company') {
      add(nameOf(c.connected_entity_id), c.source_entity_id, charityIds.has(c.connected_entity_id));
    } else if (typeOf(c.source_entity_id) === 'person' && typeOf(c.connected_entity_id) === 'person' && c.via_organisation) {
      add(c.via_organisation, c.source_entity_id);
      add(c.via_organisation, c.connected_entity_id);
    }
  }
  for (const d of coDirectors) {
    add(d.company_name, d.seed_entity_id);
    add(d.company_name, d.co_director_entity_id);
  }

  const rows: BrokerageRow[] = [];
  for (const [key, ids] of members) {
    if (ids.size < 2) continue;
    const supporterIds: string[] = [];
    const targetIds: string[] = [];
    for (const id of ids) {
      const name = nameOf(id);
      if (isSupporter(name)) supporterIds.push(id);
      else if (isHnwTarget(name) || wealthPersonIds.has(id)) targetIds.push(id);
    }
    rows.push({
      institution: displayName.get(key)!,
      isCharity: charityByKey.get(key) ?? /foundation|trust|charit|endowment/i.test(key),
      memberCount: ids.size,
      supporterCount: supporterIds.length,
      targetCount: targetIds.length,
      bridgeScore: supporterIds.length * targetIds.length,
      supporterNames: supporterIds.map(nameOf).sort(),
      targetNames: targetIds.map(nameOf).sort(),
    });
  }

  return rows.sort((a, b) => b.bridgeScore - a.bridgeScore || b.memberCount - a.memberCount);
}
