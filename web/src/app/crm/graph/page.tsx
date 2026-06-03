import { getAdminClient } from '@/lib/supabase/admin';
import { loadGraphTables, buildOrbitGraph } from '@/lib/crm/graph-queries';
import { OrbitGraph } from '@/components/crm/orbit-graph';
import { GraphLoadError } from '@/components/crm/graph-load-error';

export default async function GraphPage() {
  const supabase = getAdminClient();
  try {
    const tables = await loadGraphTables(supabase);
    const orbit = buildOrbitGraph(tables);
    const bipartite = buildOrbitGraph(tables, { bipartite: true });
    return <OrbitGraph orbit={orbit} bipartite={bipartite} />;
  } catch {
    return <GraphLoadError title="Orbit" />;
  }
}
