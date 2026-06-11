import { getAdminClient } from '@/lib/supabase/admin';
import { CohortsView } from '@/components/crm/cohorts-view';

export default async function CohortsPage() {
  const supabase = getAdminClient();

  const { data: cohorts } = await supabase
    .from('lead_cohorts')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: members } = await supabase
    .from('lead_cohort_members')
    .select('cohort_id');

  const counts: Record<string, number> = {};
  for (const m of (members ?? []) as Array<{ cohort_id: string }>) {
    counts[m.cohort_id] = (counts[m.cohort_id] ?? 0) + 1;
  }

  const initialCohorts = ((cohorts ?? []) as Array<Record<string, unknown>>).map(c => ({
    cohort_id: c.cohort_id as string,
    name: c.name as string,
    description: (c.description ?? null) as string | null,
    status: c.status as string,
    created_by: c.created_by as string,
    created_at: c.created_at as string,
    member_count: counts[c.cohort_id as string] ?? 0,
  }));

  return <CohortsView initialCohorts={initialCohorts} />;
}
