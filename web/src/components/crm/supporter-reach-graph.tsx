'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { SupporterReachData } from '@/lib/crm/supporter-reach';

type Mode = 'hnw_count' | 'network_wealth';

const SUPPORTER_COLOR = '#a07d0a';
const HNW_COLOR = '#c2410c';
const EDGE_COLOR = '#4a463f';

function formatCurrency(v: number): string {
  if (v >= 1_000_000_000) return `£${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `£${(v / 1_000).toFixed(0)}K`;
  return `£${v}`;
}

export function SupporterReachGraph({ data }: { data: SupporterReachData }) {
  const [mode, setMode] = useState<Mode>('hnw_count');
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ left: number; top: number; lines: string[] } | null>(null);

  const stats = useMemo(() => {
    const withHnw = data.supporters.filter(s => s.firstDegreeHnw > 0);
    const withWealth = data.supporters.filter(s => s.totalReachWealth > 0);
    const totalWealth = data.supporters.reduce((s, n) => s + n.totalReachWealth, 0);
    return {
      withHnw: withHnw.length,
      withWealth: withWealth.length,
      totalWealth,
      hnwReachable: data.hnwNodes.length,
    };
  }, [data]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const sizeValue = (s: typeof data.supporters[0]) =>
      mode === 'hnw_count' ? s.firstDegreeHnw : s.totalReachWealth;

    // Filter to supporters that have at least something to show
    const active = mode === 'hnw_count'
      ? data.supporters.filter(s => s.firstDegreeHnw > 0)
      : data.supporters.filter(s => s.totalReachWealth > 0);

    if (active.length === 0) {
      svg.append('text').attr('x', width / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle').attr('fill', '#6b6560').attr('font-size', '14px')
        .text('No supporters have data for this view.');
      return;
    }

    const maxVal = Math.max(...active.map(sizeValue));
    const rScale = d3.scaleSqrt().domain([0, maxVal]).range([6, mode === 'hnw_count' ? 40 : 50]);

    // Build nodes: supporters + HNW targets they connect to
    interface SNode extends d3.SimulationNodeDatum {
      id: string; name: string; kind: 'supporter' | 'hnw'; value: number; radius: number;
      detail: string;
    }

    const nodeMap = new Map<string, SNode>();
    for (const s of active) {
      const v = sizeValue(s);
      const detail = mode === 'hnw_count'
        ? `${s.firstDegreeHnw} HNW contact${s.firstDegreeHnw > 1 ? 's' : ''}: ${s.hnwNames.slice(0, 3).join(', ')}${s.hnwNames.length > 3 ? '…' : ''}`
        : `Network worth: ${formatCurrency(s.totalReachWealth)} (${s.totalReachCount} contacts)`;
      nodeMap.set(s.id, { id: s.id, name: s.name, kind: 'supporter', value: v, radius: rScale(v), detail });
    }

    // In HNW mode, also show the HNW target nodes
    if (mode === 'hnw_count') {
      for (const h of data.hnwNodes) {
        if (!nodeMap.has(h.id)) {
          nodeMap.set(h.id, { id: h.id, name: h.name, kind: 'hnw', value: 1, radius: 5, detail: h.netWorth > 0 ? formatCurrency(h.netWorth) : 'HNW target' });
        }
      }
    }

    const nodes = [...nodeMap.values()];
    const activeIds = new Set(nodes.map(n => n.id));

    interface SLink extends d3.SimulationLinkDatum<SNode> { via?: string }
    const links: SLink[] = mode === 'hnw_count'
      ? data.edges.filter(e => activeIds.has(e.source) && activeIds.has(e.target)).map(e => ({ source: e.source, target: e.target, via: e.via }))
      : [];

    const sim = d3.forceSimulation<SNode>(nodes)
      .force('charge', d3.forceManyBody<SNode>().strength(d => d.kind === 'supporter' ? -d.radius * 8 : -30).distanceMax(300))
      .force('x', d3.forceX(width / 2).strength(0.06))
      .force('y', d3.forceY(height / 2).strength(0.06))
      .force('collision', d3.forceCollide<SNode>().radius(d => d.radius + 3));

    if (links.length > 0) {
      sim.force('link', d3.forceLink<SNode, SLink>(links).id(d => d.id).distance(80).strength(0.15));
    }

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);
    svg.on('dblclick.zoom', null);

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', EDGE_COLOR).attr('stroke-width', 0.6).attr('stroke-opacity', 0.4);

    const node = g.append('g').selectAll<SVGCircleElement, SNode>('circle').data(nodes).join('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.kind === 'supporter' ? SUPPORTER_COLOR : HNW_COLOR)
      .attr('stroke', '#0d0d0d').attr('stroke-width', 1).attr('cursor', 'pointer')
      .attr('fill-opacity', d => d.kind === 'supporter' ? 0.85 : 0.7)
      .on('mouseover', (event, d) => {
        const maxLeft = (svgRef.current?.clientWidth ?? 800) - 260;
        setTooltip({
          left: Math.min(event.offsetX + 12, maxLeft), top: event.offsetY - 10,
          lines: [d.name, d.detail],
        });
        d3.select(event.currentTarget).attr('stroke', '#c9a227').attr('stroke-width', 2.5);
      })
      .on('mouseout', (event) => {
        setTooltip(null);
        d3.select(event.currentTarget).attr('stroke', '#0d0d0d').attr('stroke-width', 1);
      });

    const labelThreshold = mode === 'hnw_count' ? 2 : (maxVal * 0.15);
    const labels = g.append('g').selectAll('text')
      .data(nodes.filter(n => n.kind === 'supporter' && n.value >= labelThreshold))
      .join('text')
      .text(d => { const parts = d.name.split(' '); return parts.length > 1 ? parts.slice(-1)[0] : d.name; })
      .attr('font-size', '9px').attr('fill', '#8a857e').attr('text-anchor', 'middle')
      .attr('dy', d => -(d.radius + 5)).attr('pointer-events', 'none');

    const drag = d3.drag<SVGCircleElement, SNode>()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });
    node.call(drag);

    sim.stop();
    const ticks = Math.min(400, Math.max(160, nodes.length));
    for (let i = 0; i < ticks; i++) sim.tick();

    const render = () => {
      link.attr('x1', d => (d.source as SNode).x!).attr('y1', d => (d.source as SNode).y!)
        .attr('x2', d => (d.target as SNode).x!).attr('y2', d => (d.target as SNode).y!);
      node.attr('cx', d => d.x!).attr('cy', d => d.y!);
      labels.attr('x', d => d.x!).attr('y', d => d.y!);
    };
    render();

    const xs = nodes.map(n => n.x!).filter(Number.isFinite);
    const ys = nodes.map(n => n.y!).filter(Number.isFinite);
    if (xs.length && ys.length) {
      const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
      const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
      const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
      const scale = Math.min(8, 0.9 / Math.max(w / (width - 80), h / (height - 80)));
      const tx = width / 2 - scale * (minX + maxX) / 2;
      const ty = height / 2 - scale * (minY + maxY) / 2;
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    return () => sim.stop();
  }, [data, mode]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Supporter Reach</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {mode === 'hnw_count'
              ? `${stats.withHnw} supporters with direct HNW connections (${stats.hnwReachable} HNW targets reachable). Node size = number of 1st-degree HNW contacts.`
              : `${stats.withWealth} supporters with wealth-estimated contacts. Node size = total net worth of 1st-degree network (${formatCurrency(stats.totalWealth)} combined).`}
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border-subtle overflow-hidden text-xs font-medium">
          <button
            onClick={() => setMode('hnw_count')}
            className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${
              mode === 'hnw_count' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
            }`}
          >
            HNW contacts
          </button>
          <button
            onClick={() => setMode('network_wealth')}
            className={`px-3 py-1.5 uppercase tracking-wide transition-colors border-l border-border-subtle ${
              mode === 'network_wealth' ? 'bg-gold text-warm-white' : 'bg-surface-raised text-text-secondary hover:text-text-primary'
            }`}
          >
            Network worth
          </button>
        </div>
      </div>

      <div className="relative border border-border-subtle rounded-lg overflow-hidden bg-deep-charcoal" style={{ height: 'calc(100vh - 220px)' }}>
        <svg ref={svgRef} className="w-full h-full" />

        {tooltip && (
          <div className="absolute pointer-events-none bg-surface-raised border border-gold/40 rounded px-3 py-2 text-xs z-10 max-w-xs shadow-md" style={{ left: tooltip.left, top: tooltip.top }}>
            {tooltip.lines.map((l, i) => (
              <p key={i} className={i === 0 ? 'font-medium text-text-primary' : 'text-text-muted mt-0.5'}>{l}</p>
            ))}
          </div>
        )}

        <div className="absolute bottom-3 left-3 flex items-center gap-4 text-xs text-text-muted bg-surface-raised/90 border border-border-subtle rounded px-3 py-1.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SUPPORTER_COLOR }} />
            Supporter (size = {mode === 'hnw_count' ? 'HNW count' : 'network worth'})
          </span>
          {mode === 'hnw_count' && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: HNW_COLOR }} />
              HNW Target
            </span>
          )}
        </div>

        <div className="absolute bottom-3 right-3 text-[10px] text-text-muted bg-surface-raised/90 border border-border-subtle rounded px-2.5 py-1">
          Drag nodes · scroll to zoom · hover for details
        </div>
      </div>
    </div>
  );
}
