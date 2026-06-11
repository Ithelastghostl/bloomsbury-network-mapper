import { getAdminClient } from '@/lib/supabase/admin';
import { loadGraphMetrics } from '@/lib/crm/graph-metrics';
import { loadSupporterReach } from '@/lib/crm/supporter-reach';
import { ConnectorsTable, type ConnectorRow } from '@/components/crm/connectors-table';

export default async function ConnectorsPage() {
  const supabase = getAdminClient();
  const [{ metrics }, reach] = await Promise.all([
    loadGraphMetrics(supabase),
    loadSupporterReach(supabase),
  ]);

  const rows: ConnectorRow[] = reach.supporters.map(s => {
    const m = metrics.get(s.id);
    return {
      id: s.id,
      name: s.name,
      tier: s.tier,
      // Brandes betweenness (0–1): how much this supporter bridges otherwise
      // disconnected people. The headline "Connector score".
      connectorScore: m?.betweenness ?? 0,
      // Power-iteration eigenvector (0–1): are their contacts themselves central?
      influence: m?.eigenvector ?? 0,
      // Burt constraint (raw). Low = neighbours don't know each other = the
      // supporter spans structural holes and opens fresh networks.
      constraint: m?.constraint ?? 0,
      degree: m?.degreeRaw ?? 0,
      firstDegreeHnw: s.firstDegreeHnw,
      hnwWithin2Hops: s.hnwWithin2Hops,
    };
  });

  return <ConnectorsTable rows={rows} />;
}
