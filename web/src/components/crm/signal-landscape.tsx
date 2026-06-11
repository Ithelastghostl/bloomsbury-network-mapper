'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { SIGNAL_CATEGORY_LABEL, type SignalCategory } from '@/lib/crm/signals';

export interface SignalRow {
  id: string;
  name: string;
  total: number;
  byCategory: Record<string, number>;
  sources: number;
  multiSource: boolean;
}

const CAT_ORDER: SignalCategory[] = [
  'directorship', 'co_director', 'philanthropy', 'charity', 'rich_list',
  'fund_management', 'property', 'political', 'news', 'web', 'other',
];

const CAT_COLOR: Record<string, string> = {
  directorship: 'bg-blue-400', co_director: 'bg-blue-300', philanthropy: 'bg-teal-400',
  charity: 'bg-teal-300', rich_list: 'bg-gold', fund_management: 'bg-green-400',
  property: 'bg-purple-400', political: 'bg-red-400', news: 'bg-orange-400',
  web: 'bg-mid-charcoal', other: 'bg-mid-charcoal',
};

export function SignalLandscape({ rows, poolSize }: { rows: SignalRow[]; poolSize: number }) {
  const [sortKey, setSortKey] = useState<'total' | 'sources' | 'name'>('total');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Pool-level coverage: how many candidates carry each signal category.
  const coverage = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) for (const cat of Object.keys(r.byCategory)) c[cat] = (c[cat] ?? 0) + 1;
    return CAT_ORDER.map(cat => ({ cat, n: c[cat] ?? 0 })).filter(x => x.n > 0);
  }, [rows]);

  const maxCoverage = Math.max(1, ...coverage.map(c => c.n));
  const multiSourceCount = useMemo(() => rows.filter(r => r.multiSource).length, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (catFilter !== 'all') list = list.filter(r => (r.byCategory[catFilter] ?? 0) > 0);
    if (search) { const q = search.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(q)); }
    const arr = [...list];
    arr.sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name) : (sortKey === 'sources' ? b.sources - a.sources : b.total - a.total));
    return arr;
  }, [rows, catFilter, search, sortKey]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Signal Landscape</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          Enrichment-signal coverage across {poolSize.toLocaleString()} candidates ({rows.length.toLocaleString()} have any
          signal). The bars show how many candidates carry each signal type — where evidence is thick vs. thin.
          {' '}<span className="text-green-400">{multiSourceCount.toLocaleString()}</span> are backed by 2+ independent sources.
        </p>
      </div>

      {/* Pool coverage bars */}
      <div className="border border-border-subtle rounded-lg p-4 mb-4 bg-deep-charcoal">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-3">Signal coverage across the pool</p>
        <div className="space-y-2">
          {coverage.map(({ cat, n }) => (
            <button key={cat} onClick={() => { setCatFilter(catFilter === cat ? 'all' : cat); setPage(0); }}
              className={`w-full flex items-center gap-3 group ${catFilter === cat ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}>
              <span className={`text-[11px] w-36 text-right ${catFilter === cat ? 'text-gold' : 'text-text-secondary'}`}>{SIGNAL_CATEGORY_LABEL[cat as SignalCategory]}</span>
              <div className="flex-1 h-4 bg-pitch-black rounded overflow-hidden">
                <div className={`h-full ${CAT_COLOR[cat] ?? 'bg-mid-charcoal'} rounded`} style={{ width: `${(n / maxCoverage) * 100}%` }} />
              </div>
              <span className="text-[11px] font-mono text-text-muted w-16">{n} ({Math.round((n / rows.length) * 100)}%)</span>
            </button>
          ))}
        </div>
        <p className="text-[9px] text-text-muted mt-2">Click a bar to filter the table below to candidates carrying that signal.</p>
      </div>

      {/* Per-candidate signal matrix */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input type="text" placeholder="Search candidate..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-64" />
        <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value="all">Signal: Any</option>
          {coverage.map(({ cat }) => <option key={cat} value={cat}>{SIGNAL_CATEGORY_LABEL[cat as SignalCategory]}</option>)}
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as typeof sortKey)}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value="total">Sort: most signals</option>
          <option value="sources">Sort: most sources</option>
          <option value="name">Sort: name</option>
        </select>
        <span className="text-xs text-text-muted ml-auto">{filtered.length} candidates</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className="text-left px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Candidate</th>
              <th className="text-center px-2 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Signals</th>
              <th className="text-center px-2 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Sources</th>
              {CAT_ORDER.filter(c => coverage.some(x => x.cat === c)).map(c => (
                <th key={c} className="px-1 py-2 text-[8px] font-semibold tracking-wider uppercase text-text-muted text-center" title={SIGNAL_CATEGORY_LABEL[c]}>
                  {SIGNAL_CATEGORY_LABEL[c].split(' ')[0].slice(0, 5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map(r => (
              <tr key={r.id} className="hover:bg-deep-charcoal/60 transition-colors">
                <td className="px-3 py-1.5">
                  <Link href={`/crm/entity/${r.id}`} className="text-[12px] text-text-primary hover:text-gold transition-colors">{r.name}</Link>
                </td>
                <td className="px-2 py-1.5 text-center text-xs font-mono text-text-secondary">{r.total}</td>
                <td className="px-2 py-1.5 text-center text-xs font-mono">
                  <span className={r.multiSource ? 'text-green-400' : 'text-text-muted'}>{r.sources}</span>
                </td>
                {CAT_ORDER.filter(c => coverage.some(x => x.cat === c)).map(c => {
                  const n = r.byCategory[c] ?? 0;
                  return (
                    <td key={c} className="px-1 py-1.5 text-center">
                      {n > 0 ? <span className={`inline-block w-4 h-4 rounded-sm ${CAT_COLOR[c]} text-[8px] text-pitch-black font-bold leading-4`}>{n > 9 ? '9+' : n}</span> : <span className="text-text-muted/30 text-[10px]">·</span>}
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
