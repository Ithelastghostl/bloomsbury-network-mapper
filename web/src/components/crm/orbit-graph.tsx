'use client';

import { useMemo, useState } from 'react';
import { NetworkGraph, componentColor } from './network-graph';
import type { GraphData } from '@/lib/crm/graph-queries';

// Build a legend for component-coloured (orbit) mode: one entry per colour
// actually painted on the canvas, ranked by cluster size so the largest
// communities lead. Colours wrap at the palette length, so distinct components
// sharing a colour are merged into a single legend row (their sizes summed).
function buildClusterLegend(nodes: GraphData['nodes']): Array<{ color: string; label: string }> {
  const sizeByComponent = new Map<number, number>();
  for (const n of nodes) {
    if (n.component == null) continue;
    sizeByComponent.set(n.component, (sizeByComponent.get(n.component) ?? 0) + 1);
  }
  // Merge by the colour each component resolves to.
  const sizeByColor = new Map<string, number>();
  for (const [comp, size] of sizeByComponent) {
    const color = componentColor(comp);
    sizeByColor.set(color, (sizeByColor.get(color) ?? 0) + size);
  }
  const ranked = [...sizeByColor.entries()].sort((a, b) => b[1] - a[1]);
  const ordinal = ['Largest', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  return ranked.map(([color, size], i) => ({
    color,
    label: `${ordinal[i] ?? `${i + 1}th`} cluster (${size})`,
  }));
}

// The colour the freshly-mapped HNW-target cohort is painted on the canvas.
// Kept in sync with NetworkGraph's default highlightColor.
const HNW_COLOR = '#c2410c';

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
  const clusterLegend = useMemo(() => buildClusterLegend(orbit.nodes), [orbit.nodes]);

  // The HNW-target seeds, highlighted in a single distinct colour on top of the
  // normal cluster/type fill. Memoised so the simulation isn't rebuilt each render.
  const hnwIds = useMemo(
    () => new Set(active.nodes.filter(n => n.seedSource === 'hnw_targets').map(n => n.id)),
    [active.nodes],
  );
  const hnwLegendEntry = { color: HNW_COLOR, label: `HNW targets (${hnwIds.size})` };

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
          highlightIds={hnwIds}
          highlightColor={HNW_COLOR}
          legend={
            mode === 'orbit'
              ? [hnwLegendEntry, ...clusterLegend]
              : [
                  hnwLegendEntry,
                  { color: '#a07d0a', label: 'Person' },
                  { color: '#3b5a8a', label: 'Institution' },
                ]
          }
        />
      </div>
    </div>
  );
}
