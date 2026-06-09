import { getAdminClient } from '@/lib/supabase/admin';
import { loadIntroductionTables, buildIntroductionGraph } from '@/lib/crm/introduction-graph';
import { IntroductionGraph } from '@/components/crm/introduction-graph';
import { GraphLoadError } from '@/components/crm/graph-load-error';

export default async function IntroductionsPage() {
  const supabase = getAdminClient();
  try {
    const tables = await loadIntroductionTables(supabase);
    const data = buildIntroductionGraph(tables);
    return <IntroductionGraph data={data} />;
  } catch {
    return <GraphLoadError title="Introductions" />;
  }
}
