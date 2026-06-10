import seedPeople from '@/lib/crm/data/seed-people.json';
import { SourceDataTable } from '@/components/crm/source-data-table';

export default function SourceHnwPage() {
  const hnw = seedPeople.filter(p => p.source === 'hnw_targets');

  return (
    <SourceDataTable
      persons={hnw}
      title="Source: HNW Targets"
      description={`${hnw.length} high-net-worth individuals from the Target Donors spreadsheet — the people we want to reach through our supporter network.`}
    />
  );
}
