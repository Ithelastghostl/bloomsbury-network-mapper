'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as d3 from 'd3';
import { EntityPanel } from './entity-panel';

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
// Exported so the legend can mirror the exact colours the canvas assigns.
export const COMPONENT_PALETTE = [
  '#a07d0a', '#2f6f6b', '#9a4b2e', '#3b5a8a', '#6b5b95',
  '#7a8b2e', '#8a3b5a', '#b8920f', '#4a7a4a', '#7a6a4a',
];

// The colour a given connected-component index maps to (same logic as fillFor).
export function componentColor(c: number | undefined): string {
  return c == null ? COMPONENT_PALETTE[0] : COMPONENT_PALETTE[c % COMPONENT_PALETTE.length];
}

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
  const [tooltip, setTooltip] = useState<{ left: number; top: number; name: string; type: string; connections: number } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // The node whose profile is open in the slide-in panel.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bumping this re-runs the layout effect (used by the "Re-layout" control).
  const [relayoutKey, setRelayoutKey] = useState(0);

  // d3 fires `click` before `dblclick`, so a single click is deferred briefly
  // and cancelled if a double-click follows. Single → open panel, double → isolate.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Imperative handles so the control buttons can drive the zoom + fit the graph.
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  // Selection ring: a ref mirror of selectedId (read inside d3 event handlers
  // without re-binding them) plus a helper to repaint the ring on change.
  const selectedIdRef = useRef<string | null>(null);
  const applySelectionRef = useRef<((id: string | null) => void) | null>(null);

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
    // Disable d3's default double-click-to-zoom so it doesn't fight the
    // double-click-to-isolate behaviour on nodes.
    svg.on('dblclick.zoom', null);
    zoomRef.current = zoom;

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
        // Cmd/Ctrl-click → open the full detail page immediately.
        if ((event.metaKey || event.ctrlKey) && d.type === 'person') {
          router.push(`/crm/entity/${d.id}`);
          return;
        }
        // Plain click → open the profile panel, but defer so a double-click
        // (which isolates) can cancel it first.
        if (clickTimer.current) clearTimeout(clickTimer.current);
        clickTimer.current = setTimeout(() => {
          setSelectedId(d.id);
          clickTimer.current = null;
        }, 220);
      })
      .on('dblclick', (event, d) => {
        // Double-click → isolate this node's neighbourhood. Cancel the pending
        // single-click so the panel doesn't also open.
        if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
        event.preventDefault();
        event.stopPropagation();
        setFocusId(curr => (curr === d.id ? null : d.id));
      })
      .on('mouseover', (event, d) => {
        // Clamp position here (in the event handler, not during render) so we
        // don't read the ref while rendering.
        const maxLeft = (svgRef.current?.clientWidth ?? 800) - 200;
        setTooltip({ left: Math.min(event.offsetX + 12, maxLeft), top: event.offsetY - 10, name: d.name, type: d.type, connections: d.connectionCount });
        d3.select(event.currentTarget).attr('stroke', goldColor).attr('stroke-width', 2.5);
      })
      .on('mouseout', (event, d) => {
        setTooltip(null);
        // Keep the gold ring on the selected node; otherwise revert to default.
        const sel = d3.select(event.currentTarget);
        if (d.id === selectedIdRef.current) {
          sel.attr('stroke', goldColor).attr('stroke-width', 3);
        } else {
          sel.attr('stroke', strokeColor).attr('stroke-width', 1);
        }
      });

    // Apply / move the persistent selection ring. Stored in a ref-driven helper
    // so selecting a node doesn't rebuild the whole simulation.
    applySelectionRef.current = (id: string | null) => {
      node
        .attr('stroke', d => (d.id === id ? goldColor : strokeColor))
        .attr('stroke-width', d => (d.id === id ? 3 : 1));
    };
    applySelectionRef.current(selectedIdRef.current);

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

    // Zoom-to-fit: frame all nodes with padding. Exposed so the "Reset view"
    // control can recentre after the user has panned/zoomed/dragged around.
    const fitToView = (animate = false) => {
      const xs = simNodes.map(n => n.x!).filter(v => Number.isFinite(v));
      const ys = simNodes.map(n => n.y!).filter(v => Number.isFinite(v));
      if (!xs.length || !ys.length) return;
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
      const pad = 60;
      const scale = Math.min(8, 0.95 / Math.max(w / (width - pad), h / (height - pad)));
      const tx = width / 2 - scale * (minX + maxX) / 2;
      const ty = height / 2 - scale * (minY + maxY) / 2;
      const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
      const sel = animate ? svg.transition().duration(400) : svg;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sel as any).call(zoom.transform, transform);
    };
    fitRef.current = () => fitToView(true);
    fitToView(false); // start framed

    return () => { simulation.stop(); };
  }, [view, focusId, relayoutKey, router, personColor, companyColor, colorByComponent]);

  // Repaint the selection ring when the selected node changes, without
  // rebuilding the simulation.
  useEffect(() => {
    selectedIdRef.current = selectedId;
    applySelectionRef.current?.(selectedId);
  }, [selectedId]);

  // Clear any pending single-click timer on unmount.
  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current); }, []);

  const legendItems = legend ?? [
    { color: personColor, label: 'Person' },
    { color: companyColor, label: 'Company' },
  ];

  const focusedName = focusId ? nodes.find(n => n.id === focusId)?.name : null;

  function resetView() {
    setFocusId(null);
    fitRef.current?.();
  }

  function relayout() {
    setRelayoutKey(k => k + 1);
  }

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />

      {/* Graph controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <button
          onClick={resetView}
          title="Recentre and fit the whole graph in view"
          className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide rounded-md bg-surface-raised border border-border-subtle text-text-secondary hover:text-gold hover:border-gold/50 shadow-sm transition-colors"
        >
          Reset view
        </button>
        <button
          onClick={relayout}
          title="Re-run the layout (untangle the nodes)"
          className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide rounded-md bg-surface-raised border border-border-subtle text-text-secondary hover:text-gold hover:border-gold/50 shadow-sm transition-colors"
        >
          Re-layout
        </button>
        {focusId && (
          <button
            onClick={() => setFocusId(null)}
            title="Exit focus and show the full graph"
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide rounded-md bg-gold text-warm-white hover:bg-gold-light shadow-sm transition-colors"
          >
            Show all
          </button>
        )}
      </div>

      {focusId && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-surface-raised border border-border-subtle rounded-md px-3 py-1.5 text-xs shadow-sm">
          <span className="text-text-secondary">
            Focused on <span className="font-medium text-text-primary">{focusedName}</span> · {view.nodes.length} in orbit
          </span>
        </div>
      )}

      {tooltip && (
        <div
          className="absolute pointer-events-none bg-surface-raised border border-gold/40 rounded px-3 py-2 text-xs z-10 max-w-xs shadow-md"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <p className="font-medium text-text-primary">{tooltip.name}</p>
          <p className="text-text-muted capitalize">{tooltip.type} · {tooltip.connections} connections</p>
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 max-w-[60%] text-xs text-text-muted bg-surface-raised/90 border border-border-subtle rounded px-3 py-1.5">
        {legendItems.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="absolute bottom-3 right-3 text-[10px] text-text-muted bg-surface-raised/90 border border-border-subtle rounded px-2.5 py-1">
        Click a node for profile · double-click to isolate · ⌘/Ctrl-click to open · drag · scroll to zoom
      </div>

      <EntityPanel entityId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
