import { getAdminClient } from '@/lib/supabase/admin';
import { loadSignalsForEntities } from '@/lib/crm/signals';
import { isSupporter } from '@/lib/crm/seed-reference';
import { SignalLandscape, type SignalRow } from '@/components/crm/signal-landscape';

/**
 * Orient → Signal Landscape. Visualises the enrichment-signal coverage across
 * the candidate pool: which signals we hold, on how many people, and where the
 * evidence is thick vs. thin — so the analyst sees where to point augmentation
 * and which leads rest on a single weak source.
 */
export default async function SignalsPage() {
  const supabase = getAdminClient();

  // All persons (signals only matter for people we might pursue).
  const persons: Array<{ canonical_entity_id: string; display_name: string }> = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name')
      .eq('entity_type', 'person')
      .range(offset, offset + 999);
    if (!data?.length) break;
    persons.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Exclude our own supporters (they aren't leads).
  const candidates = persons.filter(p => !isSupporter(p.display_name));
  const sigMap = await loadSignalsForEntities(supabase, candidates.map(p => p.canonical_entity_id));

  const rows: SignalRow[] = candidates.map(p => {
    const s = sigMap.get(p.canonical_entity_id);
    return {
      id: p.canonical_entity_id,
      name: p.display_name,
      total: s?.signals.length ?? 0,
      byCategory: s?.byCategory ?? {},
      sources: s?.sources.length ?? 0,
      multiSource: s?.multiSource ?? false,
    };
  }).filter(r => r.total > 0);

  return <SignalLandscape rows={rows} poolSize={candidates.length} />;
}
