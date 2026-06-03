import { getAdminClient } from '@/lib/supabase/admin';
import { loadGraphTables, buildInstitutionGraph } from '@/lib/crm/graph-queries';
import { NetworkGraph } from '@/components/crm/network-graph';
import { GraphLoadError } from '@/components/crm/graph-load-error';

export default async function InstitutionGraphPage() {
  const supabase = getAdminClient();
  let nodes, edges;
  try {
    ({ nodes, edges } = buildInstitutionGraph(await loadGraphTables(supabase)));
  } catch {
    return <GraphLoadError title="Institutions" />;
  }

  const personCount = nodes.filter(n => n.type === 'person').length;
  const companyCount = nodes.filter(n => n.type === 'company').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Institutions</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {personCount} individuals linked to {companyCount} companies via {edges.length} directorships
          </p>
        </div>
      </div>
      <div className="border border-border-subtle rounded-lg overflow-hidden bg-deep-charcoal" style={{ height: 'calc(100vh - 200px)' }}>
        <NetworkGraph
          nodes={nodes}
          edges={edges}
          nodeColors={{ person: '#a07d0a', company: '#3b5a8a' }}
          legend={[
            { color: '#a07d0a', label: 'Individual' },
            { color: '#3b5a8a', label: 'Company' },
          ]}
        />
      </div>
    </div>
  );
}
