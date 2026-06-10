import { getAdminClient } from '@/lib/supabase/admin';
import { loadSourceRows } from '@/lib/crm/source-rows';
import { SourceDataTable } from '@/components/crm/source-data-table';

export default async function SourceSupportersPage() {
  const { rows: supporters, origin } = await loadSourceRows(getAdminClient(), 'supporters');

  return (
    <SourceDataTable
      persons={supporters}
      title="Source: Supporters & Donors"
      description={`${supporters.length} contacts from the Friends & Supporters spreadsheet — our core network, the starting point for all introduction paths. Loaded from ${origin}.`}
    />
  );
}
