'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { EnrichedEntity, WealthBand } from '@/lib/crm/types';
import { WEALTH_BAND_ORDER } from '@/lib/crm/types';
import { seedInfo } from '@/lib/crm/seed-reference';
import { StatusBadge } from './status-badge';
import { WealthBadge } from './wealth-badge';

type SortKey = 'name' | 'foundAs' | 'wealth' | 'connections' | 'evidence' | 'state' | 'completeness';

/** Colour per funder sub-type — "Current donor" is the one that already gave money. */
const SUBTYPE_CLS: Record<string, string> = {
  'Current donor': 'text-green-400 bg-green-400/10 border-green-400/30',
  'Key introducer': 'text-gold bg-gold/10 border-gold/20',
  'Strategic contact': 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  'Target donor': 'text-orange-400 bg-orange-400/10 border-orange-400/20',
};

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

/** Which augmentation fields are populated for this record (the completeness meter). */
function completeness(e: EnrichedEntity): { filled: number; total: number; parts: Array<[string, boolean]> } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = e.attributes as Record<string, any>;
  const parts: Array<[string, boolean]> = [
    ['wealth', !!e.wealth],
    ['role', !!(a?.current_role || a?.employer)],
    ['sector', !!a?.sector],
    ['paths', Array.isArray(a?.intro_paths) && a.intro_paths.length > 0],
    ['evidence', e.evidence.length > 0],
  ];
  return { filled: parts.filter(p => p[1]).length, total: parts.length, parts };
}

/** Provenance chips: which systems contributed this record's augmented data. */
function provenance(e: EnrichedEntity): string[] {
  const out = new Set<string>();
  if (seedInfo(e.display_name)) out.add('Sheet');
  for (const ev of e.evidence) {
    const src = ev.source.toLowerCase();
    if (src.includes('compan')) out.add('Companies House');
    else if (src.includes('charity')) out.add('Charity Commission');
    else if (ev.source_layer === 'B') out.add('Web');
    else if (ev.source_layer === 'A') out.add('Corpus');
    else out.add(ev.source);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((e.attributes as Record<string, any>)?.wealth_augmented_at) out.add('Web');
  return [...out];
}

const CHIP_CLS: Record<string, string> = {
  Sheet: 'text-gold bg-gold/10 border-gold/20',
  'Companies House': 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  'Charity Commission': 'text-teal-400 bg-teal-400/10 border-teal-400/20',
  Web: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  Corpus: 'text-text-secondary bg-mid-charcoal border-border-subtle',
};

const TH = 'text-left px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary select-none';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
        case 'foundAs':
          cmp = (seedInfo(a.display_name)?.funder_sub_type ?? 'zz').localeCompare(seedInfo(b.display_name)?.funder_sub_type ?? 'zz');
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
        case 'completeness':
          cmp = completeness(b).filled - completeness(a).filled;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const uniqueStates = [...new Set(entities.map(e => e.pipeline_state))].sort();

  const coverage = useMemo(() => {
    const total = entities.length || 1;
    return {
      wealth: Math.round(entities.filter(e => !!e.wealth).length / total * 100),
      evidence: Math.round(entities.filter(e => e.evidence.length > 0).length / total * 100),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paths: Math.round(entities.filter(e => Array.isArray((e.attributes as Record<string, any>)?.intro_paths) && (e.attributes as Record<string, any>).intro_paths.length > 0).length / total * 100),
    };
  }, [entities]);

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
          <p className="text-xs text-text-muted mt-1">
            Augmentation coverage: <span className="text-gold font-mono">{coverage.wealth}%</span> wealth ·{' '}
            <span className="text-gold font-mono">{coverage.evidence}%</span> evidence ·{' '}
            <span className="text-gold font-mono">{coverage.paths}%</span> intro paths
          </p>
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
      <div className="border border-border-subtle rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[1080px]">
          <thead>
            <tr className="bg-deep-charcoal/70 border-b border-border-subtle">
              <th colSpan={4} className="text-left px-3 py-1.5 text-[9px] font-semibold tracking-widest uppercase text-gold/70 border-r border-border-subtle">Source data (spreadsheets)</th>
              <th colSpan={6} className="text-left px-3 py-1.5 text-[9px] font-semibold tracking-widest uppercase text-teal-400/70">Augmented intelligence (pipeline)</th>
            </tr>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className={TH} onClick={() => handleSort('name')}>Name{sortIcon('name')}</th>
              <th className={TH} onClick={() => handleSort('foundAs')}>Found as{sortIcon('foundAs')}</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Tier</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted border-r border-border-subtle">Affiliation / Introduced by</th>
              <th className={TH} onClick={() => handleSort('wealth')}>Wealth{sortIcon('wealth')}</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Role</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('connections')}>Links{sortIcon('connections')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('evidence')}>Evidence{sortIcon('evidence')}</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Provenance</th>
              <th className={TH} onClick={() => handleSort('completeness')}>Complete{sortIcon('completeness')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map(entity => {
              const seed = seedInfo(entity.display_name);
              const comp = completeness(entity);
              const chips = provenance(entity);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const attrs = entity.attributes as Record<string, any>;
              const isOpen = expandedId === entity.canonical_entity_id;
              return (
                <tr
                  key={entity.canonical_entity_id}
                  className={`transition-colors cursor-pointer ${isOpen ? 'bg-deep-charcoal' : 'hover:bg-deep-charcoal/80'}`}
                  onClick={() => setExpandedId(isOpen ? null : entity.canonical_entity_id)}
                >
                  <td className="px-3 py-2.5" colSpan={isOpen ? 10 : 1}>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/crm/entity/${entity.canonical_entity_id}`}
                        className="text-text-primary hover:text-gold transition-colors font-medium text-[13px]"
                        onClick={e => e.stopPropagation()}
                      >
                        {entity.display_name}
                      </Link>
                      <StatusBadge state={entity.pipeline_state} />
                    </div>

                    {isOpen && (
                      <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-4 max-w-4xl">
                          <div className="rounded border border-gold/20 bg-gold/[0.03] px-3 py-2">
                            <p className="text-[9px] font-semibold tracking-widest uppercase text-gold/70 mb-1.5">Source data</p>
                            {seed ? (
                              <div className="text-[11px] text-text-secondary space-y-0.5">
                                <p>List: {seed.source === 'supporters' ? 'Supporters & Donors' : 'HNW Targets'}</p>
                                {seed.tier && <p>Tier: {seed.tier}</p>}
                                {seed.funder_sub_type && <p>Type: {seed.funder_sub_type}</p>}
                                {seed.affiliation && <p>Affiliation: {seed.affiliation}</p>}
                                {seed.account_owner && <p>Account owner: {seed.account_owner}</p>}
                                {seed.introduced_by && <p>Introduced by: {seed.introduced_by}</p>}
                              </div>
                            ) : (
                              <p className="text-[11px] text-text-muted">Not in the original spreadsheets — discovered by the pipeline.</p>
                            )}
                          </div>
                          <div className="rounded border border-teal-400/20 bg-teal-400/[0.03] px-3 py-2">
                            <p className="text-[9px] font-semibold tracking-widest uppercase text-teal-400/70 mb-1.5">Augmented data</p>
                            <div className="text-[11px] text-text-secondary space-y-0.5">
                              {attrs?.current_role && <p>Role: {attrs.current_role}{attrs.employer ? ` at ${attrs.employer}` : ''}</p>}
                              {attrs?.sector && <p>Sector: {attrs.sector}</p>}
                              {attrs?.location && <p>Location: {attrs.location}</p>}
                              {entity.wealth?.estimated_net_worth_gbp && <p>Est. worth: {formatCurrency(entity.wealth.estimated_net_worth_gbp)}</p>}
                              {attrs?.wealth_augmented_at && <p>Last augmented: {String(attrs.wealth_augmented_at).slice(0, 10)}</p>}
                              <p>{entity.connections.length} connections · {entity.evidence.length} evidence items{Array.isArray(attrs?.intro_paths) ? ` · ${attrs.intro_paths.length} intro paths` : ''}</p>
                            </div>
                          </div>
                        </div>

                        {/* Evidence drawer with provenance + links */}
                        {entity.evidence.length > 0 && (
                          <div className="max-w-4xl rounded border border-border-subtle bg-mid-charcoal/20 px-3 py-2">
                            <p className="text-[9px] font-semibold tracking-widest uppercase text-text-muted mb-1.5">Evidence ({entity.evidence.length})</p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {entity.evidence.slice(0, 12).map(ev => (
                                <div key={ev.evidence_id} className="text-[11px]">
                                  <p className="text-text-secondary">{ev.evidence_text}</p>
                                  <p className="text-[10px] text-text-muted">
                                    {ev.source} · layer {ev.source_layer} · {Math.round(ev.confidence * 100)}%
                                    {ev.evidence_url && (
                                      <a href={ev.evidence_url} target="_blank" rel="noopener noreferrer" className="text-gold hover:text-gold/80 ml-2">source ↗</a>
                                    )}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  {!isOpen && (
                    <>
                      <td className="px-3 py-2.5">
                        {seed?.funder_sub_type ? (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${SUBTYPE_CLS[seed.funder_sub_type] ?? 'text-text-secondary bg-mid-charcoal border-border-subtle'}`}>
                            {seed.funder_sub_type}
                          </span>
                        ) : <span className="text-[10px] text-text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[11px] ${seed?.tier === 'Priority / very important' ? 'text-gold' : 'text-text-muted'}`}>
                          {seed?.tier === 'Priority / very important' ? 'Priority' : seed?.tier ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 border-r border-border-subtle">
                        <span className="text-[11px] text-text-muted truncate block max-w-[160px]">
                          {seed?.affiliation ?? seed?.introduced_by ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {entity.wealth ? (
                          <div className="flex items-center gap-2">
                            <WealthBadge band={entity.wealth.band} />
                            {entity.wealth.estimated_net_worth_gbp && (
                              <span className="text-xs text-text-muted">{formatCurrency(entity.wealth.estimated_net_worth_gbp)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[11px] text-text-muted truncate block max-w-[150px]">
                          {attrs?.current_role ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-sm font-mono ${entity.connections.length > 0 ? 'text-text-secondary' : 'text-text-muted'}`}>
                          {entity.connections.length}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-sm font-mono ${entity.evidence.length > 0 ? 'text-text-secondary' : 'text-text-muted'}`}>
                          {entity.evidence.length}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {chips.length > 0 ? chips.map(c => (
                            <span key={c} className={`text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border ${CHIP_CLS[c] ?? 'text-text-muted bg-mid-charcoal border-border-subtle'}`}>
                              {c === 'Companies House' ? 'CH' : c === 'Charity Commission' ? 'CC' : c}
                            </span>
                          )) : <span className="text-[10px] text-text-muted">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1" title={comp.parts.map(([k, v]) => `${k}: ${v ? 'yes' : 'no'}`).join(', ')}>
                          {comp.parts.map(([k, v]) => (
                            <div key={k} className={`w-2.5 h-1.5 rounded-sm ${v ? 'bg-gold' : 'bg-mid-charcoal'}`} />
                          ))}
                          <span className="text-[9px] font-mono text-text-muted ml-1">{comp.filled}/{comp.total}</span>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-text-muted">
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
