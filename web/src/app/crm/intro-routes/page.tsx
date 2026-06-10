import { getAdminClient } from '@/lib/supabase/admin';
import { IntroRoutesTable } from '@/components/crm/intro-routes-table';

interface PersonRow {
  canonical_entity_id: string;
  display_name: string;
  attributes: Record<string, unknown>;
}

export default async function IntroRoutesPage() {
  const supabase = getAdminClient();

  const all: PersonRow[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name, attributes')
      .eq('entity_type', 'person')
      .range(offset, offset + 999);
    if (!data?.length) break;
    all.push(...(data as PersonRow[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withPaths = all.filter(p => Array.isArray((p.attributes as any)?.intro_paths));

  return <IntroRoutesTable persons={withPaths} />;
}
