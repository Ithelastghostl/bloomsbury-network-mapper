'use client';

import { useState, useMemo } from 'react';

interface SourcePerson {
  name: string;
  source: 'supporters' | 'hnw_targets';
  funder_type: string | null;
  funder_sub_type: string | null;
  tier: string | null;
  account_name: string | null;
  affiliation: string | null;
  account_owner: string | null;
  introduced_by: string | null;
}

type SortKey = 'name' | 'category' | 'role' | 'tier' | 'account' | 'affiliation' | 'owner' | 'introduced_by';

const TH_CLASS = 'text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary select-none';

export function SourceDataTable({ persons, title, description }: { persons: SourcePerson[]; title: string; description: string }) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const tiers = useMemo(() => [...new Set(persons.map(p => p.tier).filter(Boolean))].sort() as string[], [persons]);
  const funderTypes = useMemo(() => [...new Set(persons.map(p => p.funder_type).filter(Boolean))].sort() as string[], [persons]);

  const filtered = useMemo(() => {
    let list = persons;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.affiliation ?? '').toLowerCase().includes(q) ||
        (p.introduced_by ?? '').toLowerCase().includes(q) ||
        (p.account_name ?? '').toLowerCase().includes(q)
      );
    }
    if (tierFilter !== 'all') list = list.filter(p => p.tier === tierFilter);
    if (typeFilter !== 'all') list = list.filter(p => p.funder_type === typeFilter);
    return list;
  }, [persons, search, tierFilter, typeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const cmp = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '');
    arr.sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case 'name': c = cmp(a.name, b.name); break;
        case 'category': c = cmp(a.funder_type, b.funder_type); break;
        case 'role': c = cmp(a.funder_sub_type, b.funder_sub_type); break;
        case 'tier': c = cmp(a.tier, b.tier); break;
        case 'account': c = cmp(a.account_name, b.account_name); break;
        case 'affiliation': c = cmp(a.affiliation, b.affiliation); break;
        case 'owner': c = cmp(a.account_owner, b.account_owner); break;
        case 'introduced_by': c = cmp(a.introduced_by, b.introduced_by); break;
      }
      return sortAsc ? c : -c;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPage(0);
  }
  const si = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  const typeColors: Record<string, string> = {
    'High-net-worth': 'text-gold bg-gold/10',
    'Trust & Foundation': 'text-teal-400 bg-teal-400/10',
    'Corporate': 'text-blue-400 bg-blue-400/10',
    'Statutory': 'text-text-muted bg-mid-charcoal',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <p className="text-sm text-text-muted mt-0.5">{description}</p>
        </div>
        <span className="text-sm text-text-muted tabular-nums">{sorted.length} of {persons.length}</span>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input type="text" placeholder="Search name, affiliation, account..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-72" />
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/50">
          <option value="all">All categories</option>
          {funderTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={tierFilter} onChange={e => { setTierFilter(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/50">
          <option value="all">All tiers</option>
          {tiers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className={TH_CLASS} onClick={() => handleSort('name')}>Name{si('name')}</th>
              <th className={TH_CLASS} onClick={() => handleSort('category')}>Category{si('category')}</th>
              <th className={TH_CLASS} onClick={() => handleSort('role')}>Role{si('role')}</th>
              <th className={TH_CLASS} onClick={() => handleSort('tier')}>Tier{si('tier')}</th>
              <th className={TH_CLASS} onClick={() => handleSort('account')}>Account{si('account')}</th>
              <th className={TH_CLASS} onClick={() => handleSort('affiliation')}>Affiliation{si('affiliation')}</th>
              <th className={TH_CLASS} onClick={() => handleSort('owner')}>Owner{si('owner')}</th>
              <th className={TH_CLASS} onClick={() => handleSort('introduced_by')}>Introduced by{si('introduced_by')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map((p, i) => (
              <tr key={i} className="hover:bg-deep-charcoal/80 transition-colors">
                <td className="px-3 py-2.5 text-text-primary font-medium text-[13px]">{p.name}</td>
                <td className="px-3 py-2.5">
                  {p.funder_type ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeColors[p.funder_type] ?? 'text-text-muted bg-mid-charcoal'}`}>{p.funder_type}</span>
                  ) : <span className="text-[10px] text-text-muted">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {p.funder_sub_type ? (
                    <span className="text-[10px] bg-gold/10 text-gold border border-gold/20 px-1.5 py-0.5 rounded">{p.funder_sub_type}</span>
                  ) : <span className="text-[10px] text-text-muted">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] ${p.tier === 'Priority / very important' ? 'text-gold' : 'text-text-muted'}`}>
                    {p.tier === 'Priority / very important' ? 'Priority' : p.tier ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[11px] text-text-secondary max-w-[140px] truncate">{p.account_name ?? '—'}</td>
                <td className="px-3 py-2.5 text-[11px] text-text-secondary max-w-[120px] truncate">{p.affiliation ?? '—'}</td>
                <td className="px-3 py-2.5 text-[10px] text-text-muted">{p.account_owner ?? '—'}</td>
                <td className="px-3 py-2.5 text-[11px] text-text-secondary">{p.introduced_by ?? '—'}</td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-text-muted">No records match your filters.</td></tr>
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
