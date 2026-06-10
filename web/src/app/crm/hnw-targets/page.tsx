import { getAdminClient } from '@/lib/supabase/admin';
import { enrichEntities } from '@/lib/crm/queries';
import { EntityTable } from '@/components/crm/entity-table';
import { PortfolioSummary } from '@/components/crm/portfolio-summary';
import { isHnwTarget } from '@/lib/crm/seed-reference';

type PersonRow = { canonical_entity_id: string; entity_type: string; display_name: string; source: string; attributes: Record<string, unknown> };

export default async function HnwTargetsPage() {
  const supabase = getAdminClient();

  let allPersons: PersonRow[] | null = null;
  try {
    ({ data: allPersons } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, entity_type, display_name, source, attributes')
      .eq('entity_type', 'person')
      .order('display_name')
      .limit(1100) as { data: PersonRow[] | null });
  } catch {
    allPersons = null;
  }

  const targets = (allPersons ?? []).filter(e => isHnwTarget(e.display_name));

  const enriched = await enrichEntities(supabase, targets);

  return (
    <div>
      <PortfolioSummary entities={enriched} />
      <EntityTable
        entities={enriched}
        title="HNW Targets"
        description={`${targets.length} high-net-worth individuals we want to reach — the destination. Use the Introduction Paths graph to find warm routes from our supporters to these targets.`}
      />
    </div>
  );
}
