import { getAdminClient } from '@/lib/supabase/admin';
import { loadGraphTables, buildOrbitGraph } from '@/lib/crm/graph-queries';
import { loadNodeMetrics, type NodeMetrics } from '@/lib/crm/graph-overlays';
import { OrbitGraph } from '@/components/crm/orbit-graph';
import { GraphLoadError } from '@/components/crm/graph-load-error';

export default async function GraphPage() {
  const supabase = getAdminClient();

  let graphs: { orbit: ReturnType<typeof buildOrbitGraph>; bipartite: ReturnType<typeof buildOrbitGraph> } | null = null;
  let metrics: Record<string, NodeMetrics> = {};
  try {
    const [tables, m] = await Promise.all([loadGraphTables(supabase), loadNodeMetrics(supabase)]);
    metrics = m;
    graphs = { orbit: buildOrbitGraph(tables), bipartite: buildOrbitGraph(tables, { bipartite: true }) };
  } catch {
    graphs = null;
  }

  if (!graphs) return <GraphLoadError title="Orbit" />;
  return <OrbitGraph orbit={graphs.orbit} bipartite={graphs.bipartite} metrics={metrics} />;
}
