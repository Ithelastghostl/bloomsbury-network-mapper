'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ScoredLead } from '@/lib/crm/lead-score';

/**
 * The dimension matrix shows every candidate target against every scoring
 * dimension we hold, with a distribution sparkline per column. Its job is to
 * make visible WHICH dimensions actually discriminate across the pool (and so
 * deserve weight when ranking leads for 1-hop / 2-hop introductions).
 */

interface Dim {
  key: string;
  label: string;
  get: (l: ScoredLead) => number | null;
  format?: (v: number) => string;
}

const fmtGbp = (v: number) => v >= 1e9 ? `£${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `£${(v / 1e6).toFixed(0)}M` : v > 0 ? `£${(v / 1e3).toFixed(0)}K` : '—';

const DIMS: Dim[] = [
  { key: 'priority', label: 'Priority /100', get: l => l.priority },
  { key: 'confidence', label: 'Confidence /100', get: l => l.confidence },
  { key: 'introability', label: 'Introability /100', get: l => l.dimensions.introability },
  { key: 'affinity', label: 'Affinity /100', get: l => l.dimensions.affinity },
  { key: 'capacity', label: 'Capacity /100', get: l => l.dimensions.capacity },
  { key: 'influence', label: 'Influence /100', get: l => l.dimensions.influence },
  { key: 'strategicFit', label: 'Strategic fit /100', get: l => l.dimensions.strategicFit },
  { key: 'connections', label: 'Connections', get: l => l.connectionCount },
  { key: 'estimatedNw', label: 'Est. worth', get: l => l.estimatedNw, format: fmtGbp },
  { key: 'pathCount', label: 'Paths', get: l => l.pathCount },
  { key: 'bestPath', label: 'Best path /100', get: l => l.bestPathScore || null },
  { key: 'hops', label: 'Min hops', get: l => l.minHops },
  { key: 'sharedOrgs', label: 'Shared orgs /25', get: l => l.introPaths[0]?.score_breakdown.shared_orgs ?? null },
  { key: 'reach', label: 'Intro reach /20', get: l => l.introPaths[0]?.score_breakdown.introducer_reach ?? null },
  { key: 'tier', label: 'Supp. tier /15', get: l => l.introPaths[0]?.score_breakdown.supporter_tier ?? null },
  { key: 'charity', label: 'Charity links', get: l => l.charityOverlap },
];

/** 12-bin histogram + population stats for one dimension across the pool. */
function distribution(values: Array<number | null>): { bins: number[]; populated: number; spread: number } {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!present.length) return { bins: new Array(12).fill(0), populated: 0, spread: 0 };
  // reduce, not Math.min(...present) — spreading a large array can blow the call stack.
  let min = present[0], max = present[0];
  for (const v of present) { if (v < min) min = v; if (v > max) max = v; }
  const bins = new Array(12).fill(0);
  for (const v of present) {
    const idx = max === min ? 0 : Math.min(11, Math.floor(((v - min) / (max - min)) * 12));
    bins[idx]++;
  }
  const mean = present.reduce((a, b) => a + b, 0) / present.length;
  const sd = Math.sqrt(present.reduce((a, b) => a + (b - mean) ** 2, 0) / present.length);
  return {
    bins,
    populated: present.length / values.length,
    spread: mean !== 0 ? sd / Math.abs(mean) : 0,
  };
}

function Sparkline({ bins }: { bins: number[] }) {
  const max = Math.max(...bins, 1);
  return (
    <div className="flex items-end gap-px h-5 mt-1" title="Distribution across the pool (low → high)">
      {bins.map((b, i) => (
        <div key={i} className="w-1 bg-gold/50 rounded-sm" style={{ height: `${Math.max(b > 0 ? 12 : 4, (b / max) * 100)}%`, opacity: b > 0 ? 1 : 0.25 }} />
      ))}
    </div>
  );
}

export function DimensionMatrix({ leads }: { leads: ScoredLead[] }) {
  const [search, setSearch] = useState('');
  const [hopFilter, setHopFilter] = useState<'all' | '1' | '2'>('all');
  const [sortDim, setSortDim] = useState('priority');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Matrix considers real candidates only — our own supporters aren't targets.
  const pool = useMemo(() => leads.filter(l => !l.existingSupporter), [leads]);

  const filtered = useMemo(() => {
    let list = pool;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l => l.name.toLowerCase().includes(q));
    }
    if (hopFilter !== 'all') list = list.filter(l => l.minHops != null && l.minHops <= Number(hopFilter));
    return list;
  }, [pool, search, hopFilter]);

  const dists = useMemo(() => {
    const m = new Map<string, ReturnType<typeof distribution>>();
    for (const d of DIMS) m.set(d.key, distribution(filtered.map(d.get)));
    return m;
  }, [filtered]);

  const sorted = useMemo(() => {
    const dim = DIMS.find(d => d.key === sortDim) ?? DIMS[0];
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = dim.get(a), bv = dim.get(b);
      // hops: lower is better; everything else: higher is better
      const cmp = sortDim === 'hops'
        ? (av ?? 99) - (bv ?? 99)
        : (bv ?? -1) - (av ?? -1);
      return sortAsc ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortDim, sortAsc]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Dimension Matrix</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          Every candidate target × every scoring dimension. The sparkline under each header shows the distribution
          across the current pool; the % is how many candidates have the signal at all. Flat or empty dimensions
          don&apos;t discriminate — they tell you nothing about who to pick. Sort by any column.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input type="text" placeholder="Search name..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-64" />
        <select value={hopFilter} onChange={e => { setHopFilter(e.target.value as 'all' | '1' | '2'); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value="all">Hops: All</option>
          <option value="1">1-hop reachable</option>
          <option value="2">Within 2 hops</option>
        </select>
        <span className="text-xs text-text-muted ml-auto">{sorted.length} candidates</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[1280px]">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className="text-left px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted sticky left-0 bg-deep-charcoal z-10">Target</th>
              {DIMS.map(d => {
                const dist = dists.get(d.key)!;
                const active = sortDim === d.key;
                return (
                  <th key={d.key}
                    className={`text-left px-2 py-2 text-[9px] font-semibold tracking-wider uppercase cursor-pointer select-none ${active ? 'text-gold' : 'text-text-muted hover:text-text-secondary'}`}
                    onClick={() => { if (active) setSortAsc(!sortAsc); else { setSortDim(d.key); setSortAsc(false); } }}
                    title={`${Math.round(dist.populated * 100)}% populated · spread ${dist.spread.toFixed(2)}`}
                  >
                    {d.label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
                    <Sparkline bins={dist.bins} />
                    <span className="font-mono normal-case text-[8px]">{Math.round(dist.populated * 100)}%</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map(l => (
              <tr key={l.id} className="hover:bg-deep-charcoal/60 transition-colors">
                <td className="px-3 py-1.5 sticky left-0 bg-pitch-black z-10">
                  <Link href={`/crm/entity/${l.id}`} className="text-[12px] text-text-primary hover:text-gold transition-colors whitespace-nowrap">{l.name}</Link>
                </td>
                {DIMS.map(d => {
                  const v = d.get(l);
                  return (
                    <td key={d.key} className="px-2 py-1.5 text-[11px] font-mono text-text-secondary">
                      {v == null ? <span className="text-text-muted/50">·</span> : d.format ? d.format(v) : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 text-sm rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors">Previous</button>
          <span className="text-sm text-text-muted tabular-nums">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 text-sm rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors">Next</button>
        </div>
      )}
    </div>
  );
}
