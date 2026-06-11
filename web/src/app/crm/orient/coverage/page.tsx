import { getAdminClient } from '@/lib/supabase/admin';
import { loadScoredLeads } from '@/lib/crm/lead-loader';
import { CoverageView } from '@/components/crm/coverage-view';

/**
 * Orient → Evidence Coverage. Pool-level read on how well-evidenced the
 * candidate leads are and where augmentation should point next. Dynamic
 * rendering is inherited from the /crm layout.
 */
export default async function CoveragePage() {
  const leads = await loadScoredLeads(getAdminClient());
  return <CoverageView leads={leads} />;
}
