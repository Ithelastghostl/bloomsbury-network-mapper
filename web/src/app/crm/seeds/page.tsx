import { getAdminClient } from '@/lib/supabase/admin';
import { enrichEntities } from '@/lib/crm/queries';
import { EntityTable } from '@/components/crm/entity-table';
import { PortfolioSummary } from '@/components/crm/portfolio-summary';
import { isSeedPerson } from '@/lib/crm/seed-reference';

type PersonRow = { canonical_entity_id: string; entity_type: string; display_name: string; source: string; attributes: Record<string, unknown> };

export default async function SeedsPage() {
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

  // Seeds = the original people we already have, from the Seed_reference HNW +
  // supporter lists (matched by name). These are "the ones we have" — with
  // reports and the v10 prompts behind them — not merely anyone we've enriched.
  const seeds = (allPersons ?? []).filter(e => isSeedPerson(e.display_name));

  const enriched = await enrichEntities(supabase, seeds);

  return (
    <div>
      <PortfolioSummary entities={enriched} />
      <EntityTable
        entities={enriched}
        title="Seeds"
        description={`${seeds.length} original seed contacts from our supporter & target lists — the people we already have. The core of the network.`}
      />
    </div>
  );
}
