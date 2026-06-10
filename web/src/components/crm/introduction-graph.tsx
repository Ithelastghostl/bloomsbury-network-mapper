'use client';

import { useMemo, useState } from 'react';
import { NetworkGraph } from './network-graph';
import type { IntroductionGraph as IntroData, IntroNode } from '@/lib/crm/introduction-graph';
import type { GraphEdge } from '@/lib/crm/graph-queries';
import { sizeValue, SIZE_BY_OPTIONS, type NodeMetrics, type SizeBy } from '@/lib/crm/graph-overlays';

const SUPPORTER = '#a07d0a';
const FIRST = '#2f6f6b';
const SECOND = '#6b7280';
const HNW = '#c2410c';
const ORG = '#3b5a8a';

function colorForNode(degree: number, isHnw: boolean): string {
  if (isHnw) return HNW;
  if (degree === 0) return SUPPORTER;
  if (degree === 1) return FIRST;
  if (degree === 2) return SECOND;
  return ORG;
}

export function IntroductionGraph({ data, metrics = {} }: { data: IntroData; metrics?: Record<string, NodeMetrics> }) {
  const [tab, setTab] = useState<'people' | 'orgs'>('people');
  const [maxHops, setMaxHops] = useState<1 | 2>(2);
  const [sizeBy, setSizeBy] = useState<SizeBy>('degree');

  const fullGraph = tab === 'people' ? data.peopleChain : data.viaOrgs;

  const active = useMemo(() => {
    let nodes = fullGraph.nodes;
    let edges = fullGraph.edges;
    if (maxHops === 1) {
      const keepIds = new Set(
        nodes.filter((n: IntroNode) => n.degree <= 1 || n.degree === -1).map((n: IntroNode) => n.id),
      );
      nodes = nodes.filter((n: IntroNode) => keepIds.has(n.id));
      edges = edges.filter((e: GraphEdge) => keepIds.has(e.source) && keepIds.has(e.target));
    }
    if (sizeBy !== 'degree') {
      nodes = nodes.map((n: IntroNode) => ({ ...n, connectionCount: sizeValue(sizeBy, metrics[n.id], n.connectionCount) }));
    }
    return { nodes, edges };
  }, [fullGraph, maxHops, sizeBy, metrics]);

  const counts = useMemo(() => {
    const nodes = active.nodes as IntroNode[];
    return {
      supporters: nodes.filter(n => n.degree === 0).length,
      first: nodes.filter(n => n.degree === 1).length,
      second: nodes.filter(n => n.degree === 2).length,
      hnw: nodes.filter(n => n.isHnwTarget).length,
    };
  }, [active.nodes]);

  const nodeColorById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of active.nodes as IntroNode[]) m[n.id] = colorForNode(n.degree, !!n.isHnwTarget);
    return m;
  }, [active.nodes]);

  const legend = useMemo(() => {
    const base = [
      { color: SUPPORTER, label: `Supporters (${counts.supporters})` },
      { color: FIRST, label: `1st order (${counts.first})` },
    ];
    if (maxHops === 2) base.push({ color: SECOND, label: `2nd order (${counts.second})` });
    base.push({ color: HNW, label: `HNW targets (${counts.hnw}/${data.hnwTotal})` });
    if (tab === 'orgs') base.push({ color: ORG, label: 'Organisation' });
    return base;
  }, [tab, counts, maxHops, data.hnwTotal]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Introduction Paths</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {counts.supporters} supporters → {counts.first} first-order
            {maxHops === 2 ? ` → ${counts.second} second-order` : ''}.{' '}
            {counts.hnw}/{data.hnwTotal} HNW targets reachable.
            {' '}{active.nodes.length} nodes, {active.edges.length} edges.
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
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={maxHops === 1}
              onChange={e => setMaxHops(e.target.checked ? 1 : 2)}
              className="accent-gold"
            />
            1-hop only
          </label>
          <div className="inline-flex rounded-md border border-border-subtle overflow-hidden text-xs font-medium">
            <button
              onClick={() => setTab('people')}
              className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${
                tab === 'people' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
              }`}
            >
              People chain
            </button>
            <button
              onClick={() => setTab('orgs')}
              className={`px-3 py-1.5 uppercase tracking-wide transition-colors border-l border-border-subtle ${
                tab === 'orgs' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
              }`}
            >
              Via organisations
            </button>
          </div>
        </div>
      </div>

      <div
        className="border border-border-subtle rounded-lg overflow-hidden bg-deep-charcoal"
        style={{ height: 'calc(100vh - 220px)' }}
      >
        <NetworkGraph
          key={`${tab}-${maxHops}-${sizeBy}`}
          nodes={active.nodes}
          edges={active.edges}
          nodeColorById={nodeColorById}
          legend={legend}
        />
      </div>
    </div>
  );
}
