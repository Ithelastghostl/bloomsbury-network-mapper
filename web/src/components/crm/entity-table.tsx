'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { EnrichedEntity, WealthBand } from '@/lib/crm/types';
import { WEALTH_BAND_ORDER } from '@/lib/crm/types';
import { StatusBadge } from './status-badge';
import { WealthBadge } from './wealth-badge';
import { ScoreBar } from './score-bar';

type SortKey = 'name' | 'wealth' | 'connections' | 'evidence' | 'state';

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(0)}K`;
  return `£${value}`;
}

function wealthSortValue(band: WealthBand | undefined): number {
  if (!band) return 99;
  const idx = WEALTH_BAND_ORDER.indexOf(band);
  return idx === -1 ? 99 : idx;
}

export function EntityTable({
  entities,
  title,
  description,
}: {
  entities: EnrichedEntity[];
  title: string;
  description?: string;
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('wealth');
  const [sortAsc, setSortAsc] = useState(false);
  const [bandFilter, setBandFilter] = useState<WealthBand | 'all'>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const filtered = useMemo(() => {
    let list = entities;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => e.display_name.toLowerCase().includes(q));
    }
    if (bandFilter !== 'all') {
      list = list.filter(e => e.wealth?.band === bandFilter);
    }
    if (stateFilter !== 'all') {
      list = list.filter(e => e.pipeline_state === stateFilter);
    }
    return list;
  }, [entities, search, bandFilter, stateFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.display_name.localeCompare(b.display_name);
          break;
        case 'wealth':
          cmp = wealthSortValue(a.wealth?.band) - wealthSortValue(b.wealth?.band);
          break;
        case 'connections':
          cmp = b.connections.length - a.connections.length;
          break;
        case 'evidence':
          cmp = b.evidence.length - a.evidence.length;
          break;
        case 'state':
          cmp = a.pipeline_state.localeCompare(b.pipeline_state);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const uniqueStates = [...new Set(entities.map(e => e.pipeline_state))].sort();

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          {description && <p className="text-sm text-text-muted mt-0.5">{description}</p>}
        </div>
        <span className="text-sm text-text-muted tabular-nums">
          {sorted.length} of {entities.length}
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-64"
        />
        <select
          value={bandFilter}
          onChange={e => { setBandFilter(e.target.value as WealthBand | 'all'); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/50"
        >
          <option value="all">All wealth bands</option>
          <option value="100m_plus">£100M+</option>
          <option value="25m_100m">£25M–100M</option>
          <option value="5m_25m">£5M–25M</option>
          <option value="1m_5m">£1M–5M</option>
          <option value="unknown">Unknown</option>
        </select>
        <select
          value={stateFilter}
          onChange={e => { setStateFilter(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/50"
        >
          <option value="all">All states</option>
          {uniqueStates.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="border border-border-subtle rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th
                className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary"
                onClick={() => handleSort('name')}
              >
                Name{sortIcon('name')}
              </th>
              <th
                className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary"
                onClick={() => handleSort('wealth')}
              >
                Wealth{sortIcon('wealth')}
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-48">
                Score
              </th>
              <th
                className="text-center px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary"
                onClick={() => handleSort('connections')}
              >
                Links{sortIcon('connections')}
              </th>
              <th
                className="text-center px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary"
                onClick={() => handleSort('evidence')}
              >
                Evidence{sortIcon('evidence')}
              </th>
              <th
                className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary"
                onClick={() => handleSort('state')}
              >
                State{sortIcon('state')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map(entity => (
              <tr
                key={entity.canonical_entity_id}
                className="hover:bg-deep-charcoal/80 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/crm/entity/${entity.canonical_entity_id}`}
                    className="text-text-primary hover:text-gold transition-colors font-medium"
                  >
                    {entity.display_name}
                  </Link>
                  {entity.wealth?.wealth_source && (
                    <p className="text-xs text-text-muted mt-0.5 max-w-xs truncate">
                      {entity.wealth.wealth_source}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {entity.wealth ? (
                    <div className="flex flex-col gap-1">
                      <WealthBadge band={entity.wealth.band} />
                      {entity.wealth.estimated_net_worth_gbp && (
                        <span className="text-xs text-text-muted">
                          {formatCurrency(entity.wealth.estimated_net_worth_gbp)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {entity.wealth?.score != null ? (
                    <ScoreBar label="Wealth" value={entity.wealth.score} />
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-mono ${entity.connections.length > 0 ? 'text-text-secondary' : 'text-text-muted'}`}>
                    {entity.connections.length}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-mono ${entity.evidence.length > 0 ? 'text-text-secondary' : 'text-text-muted'}`}>
                    {entity.evidence.length}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge state={entity.pipeline_state} />
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  No records match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-text-muted tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
