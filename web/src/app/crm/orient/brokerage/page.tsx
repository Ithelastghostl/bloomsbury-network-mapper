import { getAdminClient } from '@/lib/supabase/admin';
import { loadGraphTables } from '@/lib/crm/graph-queries';
import { buildInstitutionBrokerage } from '@/lib/crm/institution-brokerage';
import { BrokerageTable } from '@/components/crm/brokerage-table';

export default async function BrokeragePage() {
  const supabase = getAdminClient();
  const tables = await loadGraphTables(supabase);

  const wealthPersonIds = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data } = await supabase.from('wealth_estimates').select('entity_id').range(offset, offset + 999);
    if (!data?.length) break;
    for (const w of data) wealthPersonIds.add(w.entity_id);
    if (data.length < 1000) break;
    offset += 1000;
  }

  const rows = buildInstitutionBrokerage(tables, wealthPersonIds);
  return <BrokerageTable rows={rows} />;
}
