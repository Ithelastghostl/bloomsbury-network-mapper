import { getAdminClient } from '@/lib/supabase/admin';
import { loadScoredLeads } from '@/lib/crm/lead-loader';
import { ReviewQueueTable } from '@/components/crm/review-queue-table';

/**
 * Tools → Needs Review. An uncertainty-ranked triage queue over the scored
 * leads, surfacing the cases where a human decision moves the most. Dynamic
 * rendering is inherited from the /crm layout.
 */
export default async function ReviewQueuePage() {
  const leads = await loadScoredLeads(getAdminClient());
  return <ReviewQueueTable leads={leads} />;
}
