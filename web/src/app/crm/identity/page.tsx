import { getAdminClient } from '@/lib/supabase/admin';
import { normaliseSeedName } from '@/lib/crm/seed-reference';
import { IdentityQa, type DupGroup, type DupEntity, type AliasRow } from '@/components/crm/identity-qa';

/** "john a smith" -> "john|smith" for variant clustering (null if single token). */
function firstLastKey(name: string): string | null {
  const tokens = normaliseSeedName(name).split(' ').filter(Boolean);
  if (tokens.length < 2) return null;
  return `${tokens[0]}|${tokens[tokens.length - 1]}`;
}

export default async function IdentityPage() {
  const supabase = getAdminClient();

  const persons: Array<{ canonical_entity_id: string; display_name: string; source: string; attributes: Record<string, unknown> }> = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase.from('canonical_entities').select('canonical_entity_id, display_name, source, attributes').eq('entity_type', 'person').range(offset, offset + 999);
    if (!data?.length) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    persons.push(...(data as any[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Connection + evidence counts for richness ranking.
  const connCount = new Map<string, number>();
  offset = 0;
  for (;;) {
    const { data } = await supabase.from('network_connections').select('source_entity_id, connected_entity_id').range(offset, offset + 999);
    if (!data?.length) break;
    for (const c of data) {
      if (c.source_entity_id) connCount.set(c.source_entity_id, (connCount.get(c.source_entity_id) ?? 0) + 1);
      if (c.connected_entity_id) connCount.set(c.connected_entity_id, (connCount.get(c.connected_entity_id) ?? 0) + 1);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  const evCount = new Map<string, number>();
  offset = 0;
  for (;;) {
    const { data } = await supabase.from('enrichment_evidence').select('entity_id').range(offset, offset + 999);
    if (!data?.length) break;
    for (const e of data) evCount.set(e.entity_id, (evCount.get(e.entity_id) ?? 0) + 1);
    if (data.length < 1000) break;
    offset += 1000;
  }

  const toDup = (p: typeof persons[number]): DupEntity => ({
    id: p.canonical_entity_id,
    name: p.display_name,
    source: p.source ?? 'corpus',
    connections: connCount.get(p.canonical_entity_id) ?? 0,
    evidence: evCount.get(p.canonical_entity_id) ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wealthBand: ((p.attributes as any)?.wealth_band ?? null) as string | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hasAction: !!(p.attributes as any)?.action_item,
  });

  // Exact-name groups.
  const byExact = new Map<string, typeof persons>();
  for (const p of persons) {
    const key = normaliseSeedName(p.display_name);
    if (!key) continue;
    if (!byExact.has(key)) byExact.set(key, []);
    byExact.get(key)!.push(p);
  }
  const groups: DupGroup[] = [];
  const inExactGroup = new Set<string>();
  for (const [key, list] of byExact) {
    if (list.length < 2) continue;
    for (const p of list) inExactGroup.add(p.canonical_entity_id);
    groups.push({ key, kind: 'exact', entities: list.map(toDup) });
  }

  // Variant groups (same first+last, different full name), excluding entities
  // already flagged in an exact group.
  const byVariant = new Map<string, typeof persons>();
  for (const p of persons) {
    if (inExactGroup.has(p.canonical_entity_id)) continue;
    const key = firstLastKey(p.display_name);
    if (!key) continue;
    if (!byVariant.has(key)) byVariant.set(key, []);
    byVariant.get(key)!.push(p);
  }
  for (const [key, list] of byVariant) {
    if (list.length < 2) continue;
    const distinctNames = new Set(list.map(p => normaliseSeedName(p.display_name)));
    if (distinctNames.size < 2) continue;
    groups.push({ key: key.replace('|', ' … '), kind: 'variant', entities: list.map(toDup) });
  }

  groups.sort((a, b) => (a.kind === b.kind ? b.entities.length - a.entities.length : a.kind === 'exact' ? -1 : 1));

  // Alias history.
  const { data: aliasRows } = await supabase
    .from('entity_aliases')
    .select('alias_id, alias_entity_id, canonical_entity_id, alias_source, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const nameOf = new Map(persons.map(p => [p.canonical_entity_id, p.display_name]));
  const aliases: AliasRow[] = (aliasRows ?? []).map((a: Omit<AliasRow, 'canonical_name'>) => ({
    ...a,
    canonical_name: nameOf.get(a.canonical_entity_id) ?? null,
  }));

  return <IdentityQa groups={groups} aliases={aliases} />;
}
