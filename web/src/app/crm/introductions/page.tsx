import { getAdminClient } from '@/lib/supabase/admin';
import { loadIntroductionTables, buildIntroductionGraph, type IntroductionGraph as IntroData } from '@/lib/crm/introduction-graph';
import { loadNodeMetrics, type NodeMetrics } from '@/lib/crm/graph-overlays';
import { IntroductionGraph } from '@/components/crm/introduction-graph';
import { GraphLoadError } from '@/components/crm/graph-load-error';

export default async function IntroductionsPage() {
  const supabase = getAdminClient();
  let data: IntroData | null = null;
  let metrics: Record<string, NodeMetrics> = {};
  try {
    const [tables, m] = await Promise.all([loadIntroductionTables(supabase), loadNodeMetrics(supabase)]);
    metrics = m;
    data = buildIntroductionGraph(tables);
  } catch {
    data = null;
  }
  if (!data) return <GraphLoadError title="Introductions" />;
  return <IntroductionGraph data={data} metrics={metrics} />;
}
