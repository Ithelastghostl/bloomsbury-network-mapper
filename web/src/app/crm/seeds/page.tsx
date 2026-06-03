import { getAdminClient } from '@/lib/supabase/admin';
import { enrichEntities } from '@/lib/crm/queries';
import { EntityTable } from '@/components/crm/entity-table';
import { PortfolioSummary } from '@/components/crm/portfolio-summary';

type PersonRow = { canonical_entity_id: string; entity_type: string; display_name: string; source: string; attributes: Record<string, unknown> };

export default async function SeedsPage() {
  const supabase = getAdminClient();

  const { data: allPersons } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, entity_type, display_name, source, attributes')
    .eq('entity_type', 'person')
    .order('display_name')
    .limit(1100) as { data: PersonRow[] | null };

  // Donors & Seeds: the original known contacts who have been fully profiled
  // with manual wealth augmentation (wealth_augmented_at in attributes).
  const seeds = (allPersons ?? []).filter(
    e => e.attributes?.wealth_augmented_at != null
  );

  const enriched = await enrichEntities(supabase, seeds);

  return (
    <div>
      <PortfolioSummary entities={enriched} />
      <EntityTable
        entities={enriched}
        title="Seeds"
        description={`${seeds.length} known supporters with full wealth profiles — the people we already have. The core of the network.`}
      />
    </div>
  );
}
