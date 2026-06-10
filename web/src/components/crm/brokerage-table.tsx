'use client';

import { useState, useMemo } from 'react';
import type { BrokerageRow } from '@/lib/crm/institution-brokerage';

type SortKey = 'bridge' | 'supporters' | 'targets' | 'members' | 'name';

export function BrokerageTable({ rows }: { rows: BrokerageRow[] }) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'bridges' | 'all' | 'charities'>('bridges');
  const [sortKey, setSortKey] = useState<SortKey>('bridge');
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 40;

  const bridgeCount = useMemo(() => rows.filter(r => r.bridgeScore > 0).length, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (view === 'bridges') list = list.filter(r => r.bridgeScore > 0);
    if (view === 'charities') list = list.filter(r => r.isCharity);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.institution.toLowerCase().includes(q)
        || r.supporterNames.some(n => n.toLowerCase().includes(q))
        || r.targetNames.some(n => n.toLowerCase().includes(q)));
    }
    return list;
  }, [rows, view, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'bridge': cmp = b.bridgeScore - a.bridgeScore; break;
        case 'supporters': cmp = b.supporterCount - a.supporterCount; break;
        case 'targets': cmp = b.targetCount - a.targetCount; break;
        case 'members': cmp = b.memberCount - a.memberCount; break;
        case 'name': cmp = a.institution.localeCompare(b.institution); break;
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
  const si = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';
  const TH = 'px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary select-none';

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Institution Brokerage</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          Organisations that connect our supporters to targets. {bridgeCount} institutions bridge at least one
          supporter to at least one target — these are where same-institution introduction paths come from.
          Bridge score = supporters × targets connected.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input type="text" placeholder="Search institution, supporter, target..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-72" />
        <select value={view} onChange={e => { setView(e.target.value as typeof view); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value="bridges">Bridging institutions ({bridgeCount})</option>
          <option value="charities">Charities only</option>
          <option value="all">All institutions ({rows.length})</option>
        </select>
        <span className="text-xs text-text-muted ml-auto">{sorted.length} results</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className={`text-left ${TH}`} onClick={() => handleSort('name')}>Institution{si('name')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('bridge')}>Bridge score{si('bridge')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('supporters')}>Supporters{si('supporters')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('targets')}>Targets{si('targets')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('members')}>Members{si('members')}</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Who connects to whom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map(r => {
              const isOpen = expanded === r.institution;
              return (
                <tr key={r.institution} className={`transition-colors cursor-pointer ${isOpen ? 'bg-deep-charcoal' : 'hover:bg-deep-charcoal/60'}`} onClick={() => setExpanded(isOpen ? null : r.institution)}>
                  <td className="px-3 py-2.5">
                    <span className="text-[13px] text-text-primary font-medium">{r.institution}</span>
                    {r.isCharity && <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400 ml-2">Charity</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-mono ${r.bridgeScore > 0 ? 'text-gold' : 'text-text-muted'}`}>{r.bridgeScore}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm font-mono text-text-secondary">{r.supporterCount}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-mono ${r.targetCount > 0 ? 'text-orange-400' : 'text-text-muted'}`}>{r.targetCount}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm font-mono text-text-muted">{r.memberCount}</td>
                  <td className="px-3 py-2.5">
                    {isOpen ? (
                      <div className="text-[11px] space-y-1">
                        <p><span className="text-gold font-medium">Supporters:</span> <span className="text-text-secondary">{r.supporterNames.join(', ') || '—'}</span></p>
                        <p><span className="text-orange-400 font-medium">Targets:</span> <span className="text-text-secondary">{r.targetNames.join(', ') || '—'}</span></p>
                      </div>
                    ) : (
                      <span className="text-[11px] text-text-muted truncate block max-w-[320px]">
                        {r.supporterNames.slice(0, 2).join(', ')}{r.supporterNames.length > 0 && r.targetNames.length > 0 ? ' → ' : ''}{r.targetNames.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">No institutions match.</td></tr>
            )}
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
