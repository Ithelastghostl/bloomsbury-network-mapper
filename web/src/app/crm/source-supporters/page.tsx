import seedPeople from '@/lib/crm/data/seed-people.json';
import { SourceDataTable } from '@/components/crm/source-data-table';

export default function SourceSupportersPage() {
  const supporters = seedPeople.filter(p => p.source === 'supporters');

  return (
    <SourceDataTable
      persons={supporters}
      title="Source: Supporters & Donors"
      description={`${supporters.length} contacts from the Friends & Supporters spreadsheet — our core network, the starting point for all introduction paths.`}
    />
  );
}
