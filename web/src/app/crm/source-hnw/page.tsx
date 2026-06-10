import { getAdminClient } from '@/lib/supabase/admin';
import { loadSourceRows } from '@/lib/crm/source-rows';
import { SourceDataTable } from '@/components/crm/source-data-table';

export default async function SourceHnwPage() {
  const { rows: hnw, origin } = await loadSourceRows(getAdminClient(), 'hnw_targets');

  return (
    <SourceDataTable
      persons={hnw}
      title="Source: HNW Targets"
      description={`${hnw.length} high-net-worth individuals from the Target Donors spreadsheet — the people we want to reach through our supporter network. Loaded from ${origin}.`}
    />
  );
}
