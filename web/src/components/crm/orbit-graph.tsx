'use client';

import { useMemo, useState } from 'react';
import { NetworkGraph, componentColor } from './network-graph';
import type { GraphData } from '@/lib/crm/graph-queries';
import { sizeValue, HOP_COLORS, SIZE_BY_OPTIONS, type NodeMetrics, type SizeBy, type ColorBy } from '@/lib/crm/graph-overlays';

function buildClusterLegend(nodes: GraphData['nodes']): Array<{ color: string; label: string }> {
  const sizeByComponent = new Map<number, number>();
  for (const n of nodes) {
    if (n.component == null) continue;
    sizeByComponent.set(n.component, (sizeByComponent.get(n.component) ?? 0) + 1);
  }
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

const HNW_COLOR = '#c2410c';
const SUPPORTER_COLOR = '#2f6f6b';

function filterToOneHop(graph: GraphData): GraphData {
  const supporterIds = new Set(graph.nodes.filter(n => n.seedSource === 'supporters').map(n => n.id));
  if (supporterIds.size === 0) return graph;

  const adj = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const keep = new Set(supporterIds);
  for (const sId of supporterIds) {
    for (const nb of adj.get(sId) ?? []) keep.add(nb);
  }

  const nodes = graph.nodes.filter(n => keep.has(n.id));
  const edges = graph.edges.filter(e => keep.has(e.source) && keep.has(e.target));
  return { nodes, edges };
}

export function OrbitGraph({
  orbit,
  bipartite,
  metrics = {},
}: {
  orbit: GraphData;
  bipartite: GraphData;
  metrics?: Record<string, NodeMetrics>;
}) {
  const [mode, setMode] = useState<'orbit' | 'bipartite'>('orbit');
  const [oneHop, setOneHop] = useState(false);
  const [sizeBy, setSizeBy] = useState<SizeBy>('degree');
  const [colorBy, setColorBy] = useState<ColorBy>('default');

  const fullGraph = mode === 'orbit' ? orbit : bipartite;
  const filteredGraph = useMemo(() => oneHop ? filterToOneHop(fullGraph) : fullGraph, [fullGraph, oneHop]);

  // Dimension overlay: re-encode node size from the selected metric.
  const active = useMemo(() => {
    if (sizeBy === 'degree') return filteredGraph;
    return {
      nodes: filteredGraph.nodes.map(n => ({ ...n, connectionCount: sizeValue(sizeBy, metrics[n.id], n.connectionCount) })),
      edges: filteredGraph.edges,
    };
  }, [filteredGraph, sizeBy, metrics]);

  const orbitCompanies = active.nodes.filter(n => n.type === 'company').length;
  const clusterLegend = useMemo(() => buildClusterLegend(active.nodes), [active.nodes]);

  const nodeColorById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of active.nodes) {
      if (colorBy === 'hops' && n.type === 'person') {
        const hops = metrics[n.id]?.hops;
        m[n.id] = HOP_COLORS[hops != null ? String(hops) : 'none'] ?? HOP_COLORS.none;
        if (n.seedSource === 'hnw_targets') m[n.id] = HNW_COLOR; // targets stay visible
      } else {
        if (n.seedSource === 'hnw_targets') m[n.id] = HNW_COLOR;
        else if (n.seedSource === 'supporters') m[n.id] = SUPPORTER_COLOR;
      }
    }
    return m;
  }, [active.nodes, colorBy, metrics]);

  const supporterCount = active.nodes.filter(n => n.seedSource === 'supporters').length;
  const hnwCount = active.nodes.filter(n => n.seedSource === 'hnw_targets').length;
  const personCount = active.nodes.filter(n => n.type === 'person').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Orbit</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {mode === 'orbit'
              ? `${personCount} people (${active.edges.length} ties)${oneHop ? ' — 1-hop from supporters only' : ''}`
              : `${personCount} people and ${orbitCompanies} institutions (${active.edges.length} links)${oneHop ? ' — 1-hop from supporters only' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sizeBy}
            onChange={e => setSizeBy(e.target.value as SizeBy)}
            className="bg-mid-charcoal border border-border-subtle rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50"
            title="Node size encoding"
          >
            {SIZE_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={colorBy}
            onChange={e => setColorBy(e.target.value as ColorBy)}
            className="bg-mid-charcoal border border-border-subtle rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50"
            title="Node colour encoding"
          >
            <option value="default">Colour: role</option>
            <option value="hops">Colour: hops</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={oneHop}
              onChange={e => setOneHop(e.target.checked)}
              className="accent-gold"
            />
            1-hop only
          </label>
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
      </div>

      <div
        className="border border-border-subtle rounded-lg overflow-hidden bg-deep-charcoal"
        style={{ height: 'calc(100vh - 220px)' }}
      >
        <NetworkGraph
          key={`${mode}-${oneHop}-${sizeBy}-${colorBy}`}
          nodes={active.nodes}
          edges={active.edges}
          colorByComponent={mode === 'orbit' && colorBy === 'default'}
          nodeColors={{ person: '#a07d0a', company: '#3b5a8a' }}
          nodeColorById={nodeColorById}
          legend={
            colorBy === 'hops'
              ? [
                  { color: HOP_COLORS['0'], label: `Supporters (${supporterCount})` },
                  { color: HOP_COLORS['1'], label: '1 hop from a supporter' },
                  { color: HOP_COLORS['2'], label: '2 hops from a supporter' },
                  { color: HOP_COLORS.none, label: 'Unreached' },
                  { color: HNW_COLOR, label: `HNW targets (${hnwCount})` },
                ]
              : mode === 'orbit'
              ? [
                  { color: SUPPORTER_COLOR, label: `Supporters (${supporterCount})` },
                  { color: HNW_COLOR, label: `HNW targets (${hnwCount})` },
                  ...clusterLegend,
                ]
              : [
                  { color: SUPPORTER_COLOR, label: `Supporters (${supporterCount})` },
                  { color: HNW_COLOR, label: `HNW targets (${hnwCount})` },
                  { color: '#a07d0a', label: 'Person' },
                  { color: '#3b5a8a', label: 'Institution' },
                ]
          }
        />
      </div>
    </div>
  );
}
