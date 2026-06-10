import { getAdminClient } from '@/lib/supabase/admin';
import { loadSupporterReach, type SupporterReachData } from '@/lib/crm/supporter-reach';
import { SupporterReachView } from '@/components/crm/supporter-reach-view';
import { GraphLoadError } from '@/components/crm/graph-load-error';

export default async function ReachPage() {
  const supabase = getAdminClient();
  let data: SupporterReachData | null = null;
  try {
    data = await loadSupporterReach(supabase);
  } catch {
    data = null;
  }
  if (!data) return <GraphLoadError title="Supporter Reach" />;
  return <SupporterReachView data={data} />;
}
