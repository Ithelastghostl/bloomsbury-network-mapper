'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

interface IntroPath {
  rank: number;
  score: number;
  hops: number;
  path_names: string[];
  root_supporter: string;
  supporter_tier: string | null;
  supporter_sub_type: string | null;
  via_orgs: string[];
  score_breakdown: { hops: number; shared_orgs: number; introducer_reach: number; supporter_tier: number };
  reason: string;
}

interface PersonRow {
  canonical_entity_id: string;
  display_name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: Record<string, any>;
}

type CategoryFilter = 'all' | 'hnw_target' | 'wealth_identified' | 'charity_donor';
type SortKey = 'name' | 'score' | 'hops' | 'paths';

const CATEGORY_LABELS: Record<string, string> = {
  hnw_target: 'HNW Target',
  wealth_identified: 'Wealth Identified',
  charity_donor: 'Charity Donor',
};

function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? 'text-green-400 bg-green-400/10' : score >= 45 ? 'text-gold bg-gold/10' : 'text-text-muted bg-mid-charcoal';
  return <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${color}`}>{score}</span>;
}

function PathCard({ path, isExpanded }: { path: IntroPath; isExpanded: boolean }) {
  return (
    <div className={`rounded border border-border-subtle px-3 py-2 ${path.rank === 1 ? 'bg-gold/[0.04] border-gold/20' : 'bg-mid-charcoal/30'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-text-muted w-4">#{path.rank}</span>
          <ScorePill score={path.score} />
          <span className="text-xs text-text-secondary truncate">
            {path.path_names.join(' → ')}
          </span>
        </div>
        <span className="text-[10px] text-text-muted shrink-0">{path.hops} hop{path.hops > 1 ? 's' : ''}</span>
      </div>
      {isExpanded && (
        <div className="mt-2 space-y-1.5">
          {path.via_orgs.length > 0 && (
            <p className="text-xs text-text-muted">Via: {path.via_orgs.join(', ')}</p>
          )}
          <p className="text-xs text-text-secondary">{path.reason}</p>
          <div className="flex gap-3 text-[10px] text-text-muted">
            <span>Hops: {path.score_breakdown.hops}/40</span>
            <span>Shared orgs: {path.score_breakdown.shared_orgs}/25</span>
            <span>Introducer reach: {path.score_breakdown.introducer_reach}/20</span>
            <span>Supporter tier: {path.score_breakdown.supporter_tier}/15</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function IntroRoutesTable({ persons }: { persons: PersonRow[] }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 30;

  const enriched = useMemo(() => {
    return persons.map(p => {
      const paths = (p.attributes.intro_paths ?? []) as IntroPath[];
      const best = paths[0];
      return {
        ...p,
        paths,
        bestScore: best?.score ?? 0,
        bestHops: best?.hops ?? 99,
        pathCount: paths.length,
        category: (p.attributes.target_category as string) ?? 'other',
        isHnw: p.attributes.target_category === 'hnw_target',
      };
    });
  }, [persons]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.display_name.toLowerCase().includes(q) ||
        p.paths.some(path => path.root_supporter.toLowerCase().includes(q)) ||
        p.paths.some(path => path.via_orgs.some(o => o.toLowerCase().includes(q)))
      );
    }
    if (category !== 'all') {
      list = list.filter(p => p.category === category);
    }
    return list;
  }, [enriched, search, category]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.display_name.localeCompare(b.display_name); break;
        case 'score': cmp = b.bestScore - a.bestScore; break;
        case 'hops': cmp = a.bestHops - b.bestHops; break;
        case 'paths': cmp = b.pathCount - a.pathCount; break;
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
  const sortIcon = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of enriched) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [enriched]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Introduction Routes</h2>
        <p className="text-sm text-text-muted mt-0.5">
          {enriched.length} reachable targets with scored introduction paths from our supporters.
          Search by name, supporter, or organisation.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search name, supporter, or organisation..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-80"
        />
        <select
          value={category}
          onChange={e => { setCategory(e.target.value as CategoryFilter); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/50"
        >
          <option value="all">All categories ({enriched.length})</option>
          <option value="hnw_target">HNW Targets ({categoryCounts['hnw_target'] ?? 0})</option>
          <option value="wealth_identified">Wealth Identified ({categoryCounts['wealth_identified'] ?? 0})</option>
          <option value="charity_donor">Charity Donors ({categoryCounts['charity_donor'] ?? 0})</option>
        </select>
        <span className="text-xs text-text-muted ml-auto">{sorted.length} results</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary" onClick={() => handleSort('name')}>
                Target{sortIcon('name')}
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-24">
                Category
              </th>
              <th className="text-center px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-20" onClick={() => handleSort('score')}>
                Score{sortIcon('score')}
              </th>
              <th className="text-center px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-16" onClick={() => handleSort('hops')}>
                Hops{sortIcon('hops')}
              </th>
              <th className="text-center px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-16" onClick={() => handleSort('paths')}>
                Paths{sortIcon('paths')}
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">
                Best route
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map(p => {
              const isOpen = expandedId === p.canonical_entity_id;
              const best = p.paths[0];
              return (
                <tr
                  key={p.canonical_entity_id}
                  className={`transition-colors cursor-pointer ${isOpen ? 'bg-deep-charcoal' : 'hover:bg-deep-charcoal/60'}`}
                  onClick={() => setExpandedId(isOpen ? null : p.canonical_entity_id)}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/crm/entity/${p.canonical_entity_id}`}
                      className="text-text-primary hover:text-gold font-medium transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      {p.display_name}
                    </Link>
                    {isOpen && (
                      <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                        {p.paths.map((path, i) => (
                          <PathCard key={i} path={path} isExpanded={isOpen} />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {p.isHnw ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">HNW</span>
                    ) : (
                      <span className="text-[10px] text-text-muted">{CATEGORY_LABELS[p.category] ?? p.category}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    <ScorePill score={p.bestScore} />
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    <span className="text-sm font-mono text-text-secondary">{best?.hops ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    <span className="text-sm font-mono text-text-secondary">{p.pathCount}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {best && (
                      <div>
                        <p className="text-xs text-text-secondary">{best.path_names.join(' → ')}</p>
                        {best.via_orgs.length > 0 && (
                          <p className="text-[10px] text-text-muted mt-0.5">via {best.via_orgs.slice(0, 2).join(', ')}</p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">No targets match your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-text-muted tabular-nums">Page {page + 1} of {totalPages}</span>
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
