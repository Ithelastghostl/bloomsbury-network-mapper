import { getAdminClient } from '@/lib/supabase/admin';
import { enrichEntities } from '@/lib/crm/queries';
import { EntityTable } from '@/components/crm/entity-table';
import { isSeedPerson } from '@/lib/crm/seed-reference';

type PersonRow = { canonical_entity_id: string; entity_type: string; display_name: string; source: string; attributes: Record<string, unknown> };

export default async function PipelinePage() {
  const supabase = getAdminClient();

  const [personsRes, wealthRes, evidenceRes] = await Promise.all([
    supabase.from('canonical_entities')
      .select('canonical_entity_id, entity_type, display_name, source, attributes')
      .eq('entity_type', 'person').order('display_name').limit(1100),
    supabase.from('wealth_estimates').select('entity_id').limit(1000),
    supabase.from('enrichment_evidence').select('entity_id').limit(5000),
  ]).catch(() => [{ data: null }, { data: null }, { data: null }]);

  const allPersons = personsRes.data as PersonRow[] | null;
  const wealthSet = new Set(((wealthRes.data ?? []) as Array<{ entity_id: string }>).map(w => w.entity_id));
  const evidenceSet = new Set(((evidenceRes.data ?? []) as Array<{ entity_id: string }>).map(e => e.entity_id));

  // Pipeline: discovered people (not original seeds) with NO enrichment yet.
  const pipeline = (allPersons ?? []).filter(e =>
    !isSeedPerson(e.display_name) &&
    !wealthSet.has(e.canonical_entity_id) &&
    !evidenceSet.has(e.canonical_entity_id)
  );

  // Only enrich the first 200 to avoid timeout on large pipelines.
  const batch = pipeline.slice(0, 200);
  const enriched = await enrichEntities(supabase, batch);

  return (
    <EntityTable
      entities={enriched}
      title="Pipeline"
      description={`${pipeline.length} discovered leads awaiting enrichment (showing ${batch.length}).`}
    />
  );
}
