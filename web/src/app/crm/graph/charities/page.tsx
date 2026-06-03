import { getAdminClient } from '@/lib/supabase/admin';
import { loadGraphTables, buildCharityGraph } from '@/lib/crm/graph-queries';
import { NetworkGraph } from '@/components/crm/network-graph';
import { GraphLoadError } from '@/components/crm/graph-load-error';

export default async function CharityGraphPage() {
  const supabase = getAdminClient();
  let nodes, edges;
  try {
    ({ nodes, edges } = buildCharityGraph(await loadGraphTables(supabase)));
  } catch {
    return <GraphLoadError title="Charities" />;
  }

  const personCount = nodes.filter(n => n.type === 'person').length;
  const charityCount = nodes.filter(n => n.type === 'company').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Charities</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {charityCount} charities & foundations at the centre, surrounded by {personCount} trustees & supporters ({edges.length} roles)
          </p>
        </div>
      </div>
      <div className="border border-border-subtle rounded-lg overflow-hidden bg-deep-charcoal" style={{ height: 'calc(100vh - 200px)' }}>
        <NetworkGraph
          nodes={nodes}
          edges={edges}
          nodeColors={{ person: '#a07d0a', company: '#2f6f6b' }}
          legend={[
            { color: '#a07d0a', label: 'Trustee / supporter' },
            { color: '#2f6f6b', label: 'Charity / foundation' },
          ]}
        />
      </div>
    </div>
  );
}
