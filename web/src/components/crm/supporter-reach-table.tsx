'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { SupporterReachData } from '@/lib/crm/supporter-reach';

type SortKey = 'name' | 'hnw' | 'wealth' | 'reach' | 'tier' | 'reach2' | 'hnw2' | 'wealth2';
type ViewFilter = 'all' | 'with_hnw' | 'with_wealth';

function formatCurrency(v: number): string {
  if (v >= 1_000_000_000) return `£${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `£${(v / 1_000).toFixed(0)}K`;
  if (v === 0) return '—';
  return `£${v}`;
}

export function SupporterReachTable({ data }: { data: SupporterReachData }) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('hnw');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 40;

  const filtered = useMemo(() => {
    let list = data.supporters;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.hnwNames.some(n => n.toLowerCase().includes(q)));
    }
    if (view === 'with_hnw') list = list.filter(s => s.firstDegreeHnw > 0);
    if (view === 'with_wealth') list = list.filter(s => s.totalReachWealth > 0);
    return list;
  }, [data.supporters, search, view]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'hnw': cmp = b.firstDegreeHnw - a.firstDegreeHnw; break;
        case 'wealth': cmp = b.totalReachWealth - a.totalReachWealth; break;
        case 'reach': cmp = b.totalReachCount - a.totalReachCount; break;
        case 'tier': cmp = (a.tier ?? 'z').localeCompare(b.tier ?? 'z'); break;
        case 'reach2': cmp = b.secondDegreeCount - a.secondDegreeCount; break;
        case 'hnw2': cmp = b.hnwWithin2Hops - a.hnwWithin2Hops; break;
        case 'wealth2': cmp = b.reach2Wealth - a.reach2Wealth; break;
      }
      return sortAsc ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }
  const stats = useMemo(() => ({
    withHnw: data.supporters.filter(s => s.firstDegreeHnw > 0).length,
    withWealth: data.supporters.filter(s => s.totalReachWealth > 0).length,
    totalWealth: data.supporters.reduce((s, n) => s + n.totalReachWealth, 0),
  }), [data.supporters]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Supporter Reach</h2>
        <p className="text-sm text-text-muted mt-0.5">
          {data.supporters.length} supporters. {stats.withHnw} have direct HNW connections.
          Combined 1st-degree network worth: {formatCurrency(stats.totalWealth)}.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search supporter or HNW name..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-72"
        />
        <select
          value={view}
          onChange={e => { setView(e.target.value as ViewFilter); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/50"
        >
          <option value="all">All supporters ({data.supporters.length})</option>
          <option value="with_hnw">With HNW contacts ({stats.withHnw})</option>
          <option value="with_wealth">With wealth data ({stats.withWealth})</option>
        </select>
        <span className="text-xs text-text-muted ml-auto">{sorted.length} results</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <Th label="Supporter" sortKey="name" current={sortKey} asc={sortAsc} onClick={handleSort} />
              <Th label="Tier" sortKey="tier" current={sortKey} asc={sortAsc} onClick={handleSort} />
              <Th label="1-hop HNW" sortKey="hnw" current={sortKey} asc={sortAsc} onClick={handleSort} center />
              <Th label="1-hop reach" sortKey="reach" current={sortKey} asc={sortAsc} onClick={handleSort} center />
              <Th label="1-hop worth" sortKey="wealth" current={sortKey} asc={sortAsc} onClick={handleSort} />
              <Th label="2-hop reach" sortKey="reach2" current={sortKey} asc={sortAsc} onClick={handleSort} center />
              <Th label="HNW ≤2 hops" sortKey="hnw2" current={sortKey} asc={sortAsc} onClick={handleSort} center />
              <Th label="≤2-hop worth" sortKey="wealth2" current={sortKey} asc={sortAsc} onClick={handleSort} />
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">HNW names</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map(s => (
              <tr
                key={s.id}
                className="hover:bg-deep-charcoal/60 transition-colors cursor-pointer"
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
              >
                <td className="px-4 py-3">
                  <Link href={`/crm/entity/${s.id}`} className="text-text-primary hover:text-gold font-medium transition-colors" onClick={e => e.stopPropagation()}>
                    {s.name}
                  </Link>
                  {s.funderSubType && <span className="text-[10px] text-gold ml-2">{s.funderSubType}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${s.tier === 'Priority / very important' ? 'text-gold' : 'text-text-muted'}`}>
                    {s.tier === 'Priority / very important' ? 'Priority' : s.tier === 'Important' ? 'Important' : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-mono ${s.firstDegreeHnw > 0 ? 'text-orange-400' : 'text-text-muted'}`}>{s.firstDegreeHnw}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-sm font-mono text-text-secondary">{s.totalReachCount}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-mono ${s.totalReachWealth > 0 ? 'text-gold' : 'text-text-muted'}`}>{formatCurrency(s.totalReachWealth)}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-sm font-mono text-text-secondary">{s.secondDegreeCount}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-mono ${s.hnwWithin2Hops > 0 ? 'text-orange-400' : 'text-text-muted'}`}>{s.hnwWithin2Hops}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-mono ${s.reach2Wealth > 0 ? 'text-gold/80' : 'text-text-muted'}`}>{formatCurrency(s.reach2Wealth)}</span>
                </td>
                <td className="px-4 py-3">
                  {s.hnwNames.length > 0 ? (
                    <span className="text-xs text-text-secondary">{s.hnwNames.slice(0, 3).join(', ')}{s.hnwNames.length > 3 ? ` +${s.hnwNames.length - 3}` : ''}</span>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-text-muted">No supporters match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 text-sm rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Previous</button>
          <span className="text-sm text-text-muted tabular-nums">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 text-sm rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next</button>
        </div>
      )}
    </div>
  );
}

function Th({ label, sortKey: key, current, asc, onClick, center }: { label: string; sortKey: SortKey; current: SortKey; asc: boolean; onClick: (k: SortKey) => void; center?: boolean }) {
  const icon = current === key ? (asc ? ' ↑' : ' ↓') : '';
  return (
    <th
      className={`${center ? 'text-center' : 'text-left'} px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary`}
      onClick={() => onClick(key)}
    >
      {label}{icon}
    </th>
  );
}
