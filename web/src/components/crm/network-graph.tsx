'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as d3 from 'd3';

interface GraphNode {
  id: string;
  name: string;
  type: 'person' | 'company';
  connectionCount: number;
  component?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  via?: string;
  weight?: number;
  provenance?: string[];
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: 'person' | 'company';
  connectionCount: number;
  component?: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: string;
  weight: number;
  via?: string;
}

// Read a CSS custom property at runtime so the canvas follows the theme.
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// A categorical palette for connected components (cluster colouring), built
// from the brand gold plus complementary hues that read on a light ground.
const COMPONENT_PALETTE = [
  '#a07d0a', '#2f6f6b', '#9a4b2e', '#3b5a8a', '#6b5b95',
  '#7a8b2e', '#8a3b5a', '#b8920f', '#4a7a4a', '#7a6a4a',
];

function nodeRadius(d: { connectionCount: number }): number {
  return Math.sqrt(d.connectionCount) * 2.5 + 4;
}

export function NetworkGraph({
  nodes,
  edges,
  nodeColors,
  legend,
  colorByComponent = false,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeColors?: { person: string; company: string };
  legend?: Array<{ color: string; label: string }>;
  colorByComponent?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const router = useRouter();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; type: string; connections: number } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  // Stable primitive deps so the simulation doesn't rebuild on every parent render.
  const personColor = nodeColors?.person ?? '#a07d0a';
  const companyColor = nodeColors?.company ?? '#3b5a8a';

  // Adjacency for ego-focus filtering.
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [edges]);

  // The node/edge subset to render: full graph, or one node's 1-hop neighbourhood.
  const view = useMemo(() => {
    if (!focusId) return { nodes, edges };
    const keep = new Set<string>([focusId, ...(adjacency.get(focusId) ?? [])]);
    return {
      nodes: nodes.filter(n => keep.has(n.id)),
      edges: edges.filter(e => keep.has(e.source) && keep.has(e.target)),
    };
  }, [focusId, nodes, edges, adjacency]);

  useEffect(() => {
    if (!svgRef.current || view.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const strokeColor = cssVar('--color-pitch-black', '#ffffff'); // node stroke = app bg
    const labelColor = cssVar('--color-text-secondary', '#4a463f');
    const goldColor = cssVar('--color-gold', '#a07d0a');
    const edgeColor = cssVar('--color-border-mid', '#d4cfc4');
    const familyColor = cssVar('--color-gold', '#a07d0a');

    const componentColor = (c: number | undefined) =>
      c == null ? personColor : COMPONENT_PALETTE[c % COMPONENT_PALETTE.length];

    const fillFor = (d: SimNode) => {
      if (colorByComponent) return componentColor(d.component);
      return d.type === 'person' ? personColor : companyColor;
    };

    const simNodes: SimNode[] = view.nodes.map(n => ({ ...n }));
    const simLinks: SimLink[] = view.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      weight: e.weight ?? 1,
      via: e.via,
    }));

    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks)
        .id(d => d.id)
        .distance(l => 30 + 90 / Math.sqrt(l.weight))
        .strength(l => Math.min(1, 0.12 + 0.18 * l.weight)))
      .force('charge', d3.forceManyBody<SimNode>().strength(-260).theta(0.9).distanceMax(420))
      .force('x', d3.forceX(width / 2).strength(0.045))
      .force('y', d3.forceY(height / 2).strength(0.045))
      .force('collision', d3.forceCollide<SimNode>().radius(d => nodeRadius(d) + 2))
      .velocityDecay(0.35);

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 10])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    const link = g.append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', d => d.type === 'FAMILY_MEMBER' ? familyColor : edgeColor)
      .attr('stroke-width', d => 0.4 + Math.min(3, d.weight) * 0.55)
      .attr('stroke-opacity', d => 0.35 + Math.min(0.45, d.weight * 0.12));

    const node = g.append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', fillFor)
      .attr('stroke', strokeColor)
      .attr('stroke-width', 1)
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        // Plain click → focus this node's neighbourhood. Cmd/Ctrl-click → open detail.
        if ((event.metaKey || event.ctrlKey) && d.type === 'person') {
          router.push(`/crm/entity/${d.id}`);
        } else {
          setFocusId(curr => (curr === d.id ? null : d.id));
        }
      })
      .on('mouseover', (event, d) => {
        setTooltip({ x: event.offsetX, y: event.offsetY, name: d.name, type: d.type, connections: d.connectionCount });
        d3.select(event.currentTarget).attr('stroke', goldColor).attr('stroke-width', 2.5);
      })
      .on('mouseout', (event) => {
        setTooltip(null);
        d3.select(event.currentTarget).attr('stroke', strokeColor).attr('stroke-width', 1);
      });

    const drag = d3.drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(drag);

    // Show labels for hubs (or everything when focused on a small neighbourhood).
    const labelThreshold = focusId ? 0 : 4;
    const labels = g.append('g')
      .selectAll('text')
      .data(simNodes.filter(n => n.connectionCount >= labelThreshold))
      .join('text')
      .text(d => {
        const parts = d.name.split(' ');
        return parts.length > 1 ? parts.slice(-1)[0] : d.name;
      })
      .attr('font-size', '9px')
      .attr('fill', labelColor)
      .attr('text-anchor', 'middle')
      .attr('dy', d => -(nodeRadius(d) + 6))
      .attr('pointer-events', 'none');

    const render = () => {
      link
        .attr('x1', d => (d.source as SimNode).x!)
        .attr('y1', d => (d.source as SimNode).y!)
        .attr('x2', d => (d.target as SimNode).x!)
        .attr('y2', d => (d.target as SimNode).y!);
      node.attr('cx', d => d.x!).attr('cy', d => d.y!);
      labels.attr('x', d => d.x!).attr('y', d => d.y!);
    };
    simulation.on('tick', render);

    // Compute the layout synchronously to a settled state, then stop.
    // Leaving the simulation running is what made the graph appear "stuck"
    // rendering (perpetual low-alpha jitter). It re-activates only on drag.
    simulation.stop();
    const settleTicks = Math.min(400, Math.max(160, simNodes.length));
    for (let i = 0; i < settleTicks; i++) simulation.tick();
    render();

    return () => { simulation.stop(); };
  }, [view, focusId, router, personColor, companyColor, colorByComponent]);

  const legendItems = legend ?? [
    { color: personColor, label: 'Person' },
    { color: companyColor, label: 'Company' },
  ];

  const focusedName = focusId ? nodes.find(n => n.id === focusId)?.name : null;

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />

      {focusId && (
        <div className="absolute top-3 left-3 flex items-center gap-3 bg-surface-raised border border-border-subtle rounded-md px-3 py-1.5 text-xs shadow-sm">
          <span className="text-text-secondary">
            Focused on <span className="font-medium text-text-primary">{focusedName}</span> · {view.nodes.length} in orbit
          </span>
          <button
            onClick={() => setFocusId(null)}
            className="text-gold font-medium uppercase tracking-wide hover:text-gold-light"
          >
            Show all
          </button>
        </div>
      )}

      {tooltip && (
        <div
          className="absolute pointer-events-none bg-surface-raised border border-gold/40 rounded px-3 py-2 text-xs z-10 max-w-xs shadow-md"
          style={{ left: Math.min(tooltip.x + 12, (svgRef.current?.clientWidth ?? 800) - 200), top: tooltip.y - 10 }}
        >
          <p className="font-medium text-text-primary">{tooltip.name}</p>
          <p className="text-text-muted capitalize">{tooltip.type} · {tooltip.connections} connections</p>
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex items-center gap-4 text-xs text-text-muted bg-surface-raised/90 border border-border-subtle rounded px-3 py-1.5">
        {legendItems.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="absolute bottom-3 right-3 text-[10px] text-text-muted bg-surface-raised/90 border border-border-subtle rounded px-2.5 py-1">
        Click a node to focus · ⌘/Ctrl-click to open
      </div>
    </div>
  );
}
