import { getAdminClient } from '@/lib/supabase/admin';
import { loadScoredLeads } from '@/lib/crm/lead-loader';
import { DimensionMatrix } from '@/components/crm/dimension-matrix';

export default async function DimensionsPage() {
  const leads = await loadScoredLeads(getAdminClient());
  return <DimensionMatrix leads={leads} />;
}
