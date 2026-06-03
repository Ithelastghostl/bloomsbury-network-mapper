import { getAdminClient } from '@/lib/supabase/admin';
import { enrichEntities } from '@/lib/crm/queries';
import { EntityTable } from '@/components/crm/entity-table';

type PersonRow = { canonical_entity_id: string; entity_type: string; display_name: string; source: string; attributes: Record<string, unknown> };

export default async function EnrichedLeadsPage() {
  const supabase = getAdminClient();

  const { data: allPersons } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, entity_type, display_name, source, attributes')
    .eq('entity_type', 'person')
    .order('display_name')
    .limit(1100) as { data: PersonRow[] | null };

  // Enriched leads: persons that have evidence or wealth estimates
  // from the automated sweep but haven't been manually augmented yet.
  const { data: wealthEntities } = await supabase
    .from('wealth_estimates')
    .select('entity_id')
    .limit(1000) as { data: Array<{ entity_id: string }> | null };
  const wealthSet = new Set((wealthEntities ?? []).map(w => w.entity_id));

  const { data: evidenceEntities } = await supabase
    .from('enrichment_evidence')
    .select('entity_id')
    .limit(5000) as { data: Array<{ entity_id: string }> | null };
  const evidenceSet = new Set((evidenceEntities ?? []).map(e => e.entity_id));

  const enrichedLeads = (allPersons ?? []).filter(e =>
    !e.attributes?.wealth_augmented_at &&
    (wealthSet.has(e.canonical_entity_id) || evidenceSet.has(e.canonical_entity_id))
  );

  const enriched = await enrichEntities(supabase, enrichedLeads);

  return (
    <EntityTable
      entities={enriched}
      title="Leads"
      description={`${enrichedLeads.length} relevant leads with wealth or evidence signals — augment & persist to promote them to seeds.`}
    />
  );
}
