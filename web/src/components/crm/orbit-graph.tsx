'use client';

import { useState } from 'react';
import { NetworkGraph } from './network-graph';
import type { GraphData } from '@/lib/crm/graph-queries';

export function OrbitGraph({
  orbit,
  bipartite,
}: {
  orbit: GraphData;
  bipartite: GraphData;
}) {
  const [mode, setMode] = useState<'orbit' | 'bipartite'>('orbit');
  const active = mode === 'orbit' ? orbit : bipartite;

  const orbitCompanies = bipartite.nodes.filter(n => n.type === 'company').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Orbit</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {mode === 'orbit'
              ? `${orbit.nodes.length} people clustered by shared boards, charities & relationships (${orbit.edges.length} ties)`
              : `${bipartite.nodes.length - orbitCompanies} people and ${orbitCompanies} institutions (${bipartite.edges.length} links)`}
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border-subtle overflow-hidden text-xs font-medium">
          <button
            onClick={() => setMode('orbit')}
            className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${
              mode === 'orbit' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
            }`}
          >
            People orbits
          </button>
          <button
            onClick={() => setMode('bipartite')}
            className={`px-3 py-1.5 uppercase tracking-wide transition-colors border-l border-border-subtle ${
              mode === 'bipartite' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
            }`}
          >
            + Institutions
          </button>
        </div>
      </div>

      <div
        className="border border-border-subtle rounded-lg overflow-hidden bg-deep-charcoal"
        style={{ height: 'calc(100vh - 220px)' }}
      >
        <NetworkGraph
          key={mode}
          nodes={active.nodes}
          edges={active.edges}
          colorByComponent={mode === 'orbit'}
          nodeColors={{ person: '#a07d0a', company: '#3b5a8a' }}
          legend={
            mode === 'orbit'
              ? [{ color: '#a07d0a', label: 'Cluster (colour = community)' }]
              : [
                  { color: '#a07d0a', label: 'Person' },
                  { color: '#3b5a8a', label: 'Institution' },
                ]
          }
        />
      </div>
    </div>
  );
}
