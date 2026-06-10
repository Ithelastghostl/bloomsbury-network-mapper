import { getAdminClient } from '@/lib/supabase/admin';
import { scoreLead } from '@/lib/crm/lead-score';
import { isSupporter } from '@/lib/crm/seed-reference';
import { LeadGeneratorTable } from '@/components/crm/lead-generator-table';

export default async function DecidePage() {
  const supabase = getAdminClient();

  const all: Array<{ canonical_entity_id: string; display_name: string; entity_type: string; attributes: Record<string, unknown> }>  = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase.from('canonical_entities').select('canonical_entity_id, display_name, entity_type, attributes').eq('entity_type', 'person').range(offset, offset + 999);
    if (!data?.length) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    all.push(...(data as any[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  const conns: Array<{ source_entity_id: string; connected_entity_id: string | null; via_organisation: string | null }> = [];
  offset = 0;
  for (;;) {
    const { data } = await supabase.from('network_connections').select('source_entity_id, connected_entity_id, via_organisation').range(offset, offset + 999);
    if (!data?.length) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conns.push(...(data as any[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Connection count per person
  const connCount = new Map<string, number>();
  for (const c of conns) {
    if (c.source_entity_id) connCount.set(c.source_entity_id, (connCount.get(c.source_entity_id) ?? 0) + 1);
    if (c.connected_entity_id) connCount.set(c.connected_entity_id, (connCount.get(c.connected_entity_id) ?? 0) + 1);
  }

  // Charity overlap: count how many charity-like orgs each person is connected to
  const charityOverlap = new Map<string, number>();
  for (const c of conns) {
    const via = c.via_organisation ?? '';
    if (/foundation|trust|charit/i.test(via) && c.source_entity_id) {
      charityOverlap.set(c.source_entity_id, (charityOverlap.get(c.source_entity_id) ?? 0) + 1);
    }
  }

  // Score all non-supporter persons
  const leads = all
    .filter(p => !isSupporter(p.display_name))
    .map(p => scoreLead(
      p.canonical_entity_id,
      p.display_name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.attributes ?? {}) as any,
      connCount.get(p.canonical_entity_id) ?? 0,
      charityOverlap.get(p.canonical_entity_id) ?? 0,
    ))
    .filter(l => l.compositeScore > 0 || l.pathCount > 0 || l.connectivity > 0)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  return <LeadGeneratorTable leads={leads} />;
}
