import { getAdminClient } from '@/lib/supabase/admin';
import { loadScoredLeads } from '@/lib/crm/lead-loader';
import { LeadGeneratorTable } from '@/components/crm/lead-generator-table';

export default async function ByPathsPage() {
  const leads = await loadScoredLeads(getAdminClient());
  return <LeadGeneratorTable leads={leads} method="introability" />;
}
