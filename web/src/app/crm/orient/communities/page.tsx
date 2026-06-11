import { getAdminClient } from '@/lib/supabase/admin';
import { loadCommunities } from '@/lib/crm/communities';
import { CommunitiesTable } from '@/components/crm/communities-table';

export default async function CommunitiesPage() {
  const { communities } = await loadCommunities(getAdminClient());
  return <CommunitiesTable communities={communities} />;
}
