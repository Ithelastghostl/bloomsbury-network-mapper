import { getAdminClient } from '@/lib/supabase/admin';
import { loadSuggestedTies } from '@/lib/crm/link-prediction';
import { SuggestedTiesTable } from '@/components/crm/suggested-ties-table';

export default async function SuggestedTiesPage() {
  const ties = await loadSuggestedTies(getAdminClient());
  return <SuggestedTiesTable ties={ties} />;
}
