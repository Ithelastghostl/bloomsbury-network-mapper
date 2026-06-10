import { getAdminClient } from '@/lib/supabase/admin';
import { loadIntroductionTables, buildIntroductionGraph, type IntroductionGraph as IntroData } from '@/lib/crm/introduction-graph';
import { IntroductionGraph } from '@/components/crm/introduction-graph';
import { GraphLoadError } from '@/components/crm/graph-load-error';

export default async function IntroductionsPage() {
  const supabase = getAdminClient();
  let data: IntroData | null = null;
  try {
    const tables = await loadIntroductionTables(supabase);
    data = buildIntroductionGraph(tables);
  } catch {
    data = null;
  }
  if (!data) return <GraphLoadError title="Introductions" />;
  return <IntroductionGraph data={data} />;
}
