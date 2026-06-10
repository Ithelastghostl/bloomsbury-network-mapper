'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ActionItem {
  id: string;
  name: string;
  status: string;
  assignee: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  leadScore: number;
  category: string;
  bestPath: string | null;
  rootSupporter: string | null;
  wealthBand: string | null;
  estimatedNw: number | null;
  sector: string | null;
  bio: string | null;
  isHumanValidated: boolean;
}

type SortKey = 'name' | 'status' | 'score' | 'category' | 'wealth' | 'created';

const STATUSES = ['new', 'outreach', 'contacted', 'information_needed', 'deferred', 'won', 'lost'] as const;
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  outreach: 'bg-gold/10 text-gold border-gold/20',
  contacted: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  information_needed: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  deferred: 'bg-mid-charcoal text-text-muted border-border-subtle',
  won: 'bg-green-500/10 text-green-400 border-green-500/20',
  lost: 'bg-red-500/10 text-red-400 border-red-500/20',
};
const STATUS_ORDER: Record<string, number> = { new: 0, outreach: 1, contacted: 2, information_needed: 3, deferred: 4, won: 5, lost: 6 };

function formatNw(v: number | null): string {
  if (!v) return '—';
  if (v >= 1e9) return `£${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `£${(v / 1e6).toFixed(0)}M`;
  return `£${(v / 1e3).toFixed(0)}K`;
}

const TH = 'text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary select-none';

export function ActionBacklog({ items }: { items: ActionItem[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return items;
    return items.filter(i => i.status === statusFilter);
  }, [items, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case 'name': c = a.name.localeCompare(b.name); break;
        case 'status': c = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99); break;
        case 'score': c = b.leadScore - a.leadScore; break;
        case 'category': c = a.category.localeCompare(b.category); break;
        case 'wealth': c = (b.estimatedNw ?? 0) - (a.estimatedNw ?? 0); break;
        case 'created': c = a.createdAt.localeCompare(b.createdAt); break;
      }
      return sortAsc ? -c : c;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }
  const si = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  async function updateStatus(id: string, newStatus: string) {
    await fetch(`/api/crm/entities/${id}/update-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Action Backlog</h2>
        <p className="text-sm text-text-muted mt-0.5">
          {items.length} leads sent from the Lead Generator. Click headers to sort. Click a row to expand.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setStatusFilter('all')} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${statusFilter === 'all' ? 'bg-gold/10 text-gold border-gold/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          All ({items.length})
        </button>
        {STATUSES.map(s => statusCounts[s] ? (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${statusFilter === s ? STATUS_COLORS[s] : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
            {s.replace(/_/g, ' ')} ({statusCounts[s]})
          </button>
        ) : null)}
      </div>

      {sorted.length > 0 ? (
        <div className="border border-border-subtle rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-deep-charcoal border-b border-border-subtle">
                <th className={TH} onClick={() => handleSort('status')}>Status{si('status')}</th>
                <th className={TH} onClick={() => handleSort('name')}>Name{si('name')}</th>
                <th className={TH} onClick={() => handleSort('category')}>Category{si('category')}</th>
                <th className={TH} onClick={() => handleSort('score')}>Score{si('score')}</th>
                <th className={TH} onClick={() => handleSort('wealth')}>Wealth{si('wealth')}</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Route</th>
                <th className={TH} onClick={() => handleSort('created')}>Created{si('created')}</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {sorted.map(item => {
                const isOpen = expandedId === item.id;
                return (
                  <tr key={item.id} className={`transition-colors cursor-pointer ${isOpen ? 'bg-deep-charcoal' : 'hover:bg-deep-charcoal/60'}`} onClick={() => setExpandedId(isOpen ? null : item.id)}>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLORS[item.status] ?? ''}`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/crm/entity/${item.id}`} className="text-[13px] font-medium text-text-primary hover:text-gold transition-colors" onClick={e => e.stopPropagation()}>
                        {item.name}
                      </Link>
                      {isOpen && item.bio && <p className="text-[10px] text-text-muted mt-1">{item.bio}</p>}
                      {!item.isHumanValidated && <span className="text-[9px] text-orange-400 ml-1.5">unvalidated</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-text-muted">{item.category.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-text-secondary">{item.leadScore}</td>
                    <td className="px-3 py-2.5">
                      {item.estimatedNw ? <span className="text-xs text-gold font-mono">{formatNw(item.estimatedNw)}</span> : <span className="text-[10px] text-text-muted">{item.wealthBand ?? '—'}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.bestPath ? (
                        <div>
                          <p className="text-[11px] text-text-secondary truncate max-w-[180px]">{item.bestPath}</p>
                          {isOpen && item.rootSupporter && <p className="text-[10px] text-gold mt-0.5">via {item.rootSupporter}</p>}
                        </div>
                      ) : <span className="text-[10px] text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-text-muted">{item.createdAt.slice(0, 10)}</td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      {isOpen && (
                        <select
                          value={item.status}
                          onChange={e => updateStatus(item.id, e.target.value)}
                          className="bg-mid-charcoal border border-border-subtle rounded text-[10px] text-text-primary px-1.5 py-1 focus:outline-none focus:border-gold/50"
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted text-sm border border-border-subtle rounded-lg">
          {items.length === 0 ? 'No leads sent to the backlog yet. Use the Lead Generator to send leads here.' : 'No items match this filter.'}
        </div>
      )}
    </div>
  );
}
