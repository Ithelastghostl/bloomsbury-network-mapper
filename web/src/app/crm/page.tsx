import { getAdminClient } from '@/lib/supabase/admin';
import { fetchAllPersons, enrichEntities } from '@/lib/crm/queries';
import { EntityTable } from '@/components/crm/entity-table';

export default async function CrmPage() {
  const supabase = getAdminClient();
  const persons = await fetchAllPersons(supabase);
  const enriched = await enrichEntities(supabase, persons);

  return (
    <EntityTable
      entities={enriched}
      title="All"
      description="Every person in the network — seeds, enriched leads, and undiscovered alike."
    />
  );
}
