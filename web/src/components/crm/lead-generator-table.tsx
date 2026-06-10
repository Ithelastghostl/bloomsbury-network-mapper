'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ScoredLead } from '@/lib/crm/lead-score';

type SortKey = 'composite' | 'connectivity' | 'wealth' | 'paths' | 'affinity' | 'name' | 'hops';
type CategoryFilter = 'all' | 'hnw_target' | 'wealth_identified' | 'charity_donor' | 'discovered';

const CAT_LABELS: Record<string, string> = { hnw_target: 'HNW Target', wealth_identified: 'Wealth ID', charity_donor: 'Charity Donor', discovered: 'Discovered' };
const CAT_COLORS: Record<string, string> = { hnw_target: 'text-orange-400 bg-orange-400/10', wealth_identified: 'text-gold bg-gold/10', charity_donor: 'text-teal-400 bg-teal-400/10', discovered: 'text-text-muted bg-mid-charcoal' };

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-gold' : 'bg-mid-charcoal';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-pitch-black rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-text-muted w-6 text-right">{value}</span>
    </div>
  );
}

function formatNw(v: number | null): string {
  if (!v) return '—';
  if (v >= 1e9) return `£${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `£${(v / 1e6).toFixed(0)}M`;
  return `£${(v / 1e3).toFixed(0)}K`;
}

export function LeadGeneratorTable({ leads }: { leads: ScoredLead[] }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [hopFilter, setHopFilter] = useState<'all' | '1' | '2'>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [bandFilter, setBandFilter] = useState<string>('all');
  const [validatedFilter, setValidatedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('composite');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 40;

  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.category] = (c[l.category] ?? 0) + 1;
    return c;
  }, [leads]);

  const sectors = useMemo(() => [...new Set(leads.map(l => l.sector).filter(Boolean))].sort() as string[], [leads]);
  const bands = useMemo(() => {
    const order = ['100m_plus', '25m_100m', '5m_25m', '1m_5m', 'unknown'];
    return order.filter(b => leads.some(l => l.wealthBand === b));
  }, [leads]);
  const BAND_LABELS: Record<string, string> = { '100m_plus': '£100M+', '25m_100m': '£25M–100M', '5m_25m': '£5M–25M', '1m_5m': '£1M–5M', unknown: 'Unknown' };

  const filtered = useMemo(() => {
    let list = leads;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l => l.name.toLowerCase().includes(q) || (l.rootSupporter ?? '').toLowerCase().includes(q) || (l.sector ?? '').toLowerCase().includes(q));
    }
    if (category !== 'all') list = list.filter(l => l.category === category);
    if (hopFilter !== 'all') {
      const maxHop = Number(hopFilter);
      list = list.filter(l => l.minHops != null && l.minHops <= maxHop);
    }
    if (sectorFilter !== 'all') list = list.filter(l => l.sector === sectorFilter);
    if (bandFilter !== 'all') list = list.filter(l => l.wealthBand === bandFilter);
    if (validatedFilter !== 'all') list = list.filter(l => validatedFilter === 'yes' ? l.isHumanValidated : !l.isHumanValidated);
    return list;
  }, [leads, search, category, hopFilter, sectorFilter, bandFilter, validatedFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'composite': cmp = b.compositeScore - a.compositeScore; break;
        case 'connectivity': cmp = b.connectivity - a.connectivity; break;
        case 'wealth': cmp = b.networkWorth - a.networkWorth; break;
        case 'paths': cmp = b.bestPathScore - a.bestPathScore; break;
        case 'affinity': cmp = b.donorAffinity - a.donorAffinity; break;
        case 'hops': cmp = (a.minHops ?? 99) - (b.minHops ?? 99); break;
        case 'name': cmp = a.name.localeCompare(b.name); break;
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

  async function sendToBacklog(lead: ScoredLead) {
    setSending(lead.id);
    try {
      await fetch(`/api/crm/entities/${lead.id}/send-to-backlog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compositeScore: lead.compositeScore,
          category: lead.category,
          bestPath: lead.bestPath,
          rootSupporter: lead.rootSupporter,
          wealthBand: lead.wealthBand,
          estimatedNw: lead.estimatedNw,
          sector: lead.sector,
          bio: lead.bio,
          breakdown: lead.breakdown,
        }),
      });
    } catch { /* ignore */ }
    setSending(null);
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Lead Generator</h2>
        <p className="text-sm text-text-muted mt-0.5">
          {leads.length} scored leads ranked by composite of connectivity, wealth, introduction paths, and donor affinity.
          Click a column header to re-rank by that dimension.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input type="text" placeholder="Search name, supporter, sector..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-64" />
        <select value={category} onChange={e => { setCategory(e.target.value as CategoryFilter); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value="all">Category: All</option>
          <option value="hnw_target">HNW Targets ({catCounts['hnw_target'] ?? 0})</option>
          <option value="wealth_identified">Wealth Identified ({catCounts['wealth_identified'] ?? 0})</option>
          <option value="charity_donor">Charity Donors ({catCounts['charity_donor'] ?? 0})</option>
          <option value="discovered">Discovered ({catCounts['discovered'] ?? 0})</option>
        </select>
        <select value={hopFilter} onChange={e => { setHopFilter(e.target.value as 'all' | '1' | '2'); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value="all">Hops: All</option>
          <option value="1">1-hop only</option>
          <option value="2">Within 2 hops</option>
        </select>
        <select value={sectorFilter} onChange={e => { setSectorFilter(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value="all">Sector: All</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={bandFilter} onChange={e => { setBandFilter(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value="all">Wealth: All</option>
          {bands.map(b => <option key={b} value={b}>{BAND_LABELS[b] ?? b}</option>)}
        </select>
        <select value={validatedFilter} onChange={e => { setValidatedFilter(e.target.value as 'all' | 'yes' | 'no'); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value="all">Validated: All</option>
          <option value="yes">Human validated</option>
          <option value="no">Unvalidated</option>
        </select>
        <span className="text-xs text-text-muted ml-auto">{sorted.length} results</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-8">#</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary" onClick={() => handleSort('name')}>Name{si('name')}</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-20">Category</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('composite')}>Score{si('composite')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('connectivity')}>Connect.{si('connectivity')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('wealth')}>Wealth{si('wealth')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('paths')}>Paths{si('paths')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('affinity')}>Affinity{si('affinity')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-14" onClick={() => handleSort('hops')}>Hops{si('hops')}</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Best route</th>
              <th className="px-3 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map((l, i) => {
              const isOpen = expandedId === l.id;
              return (
                <tr key={l.id} className={`transition-colors cursor-pointer ${isOpen ? 'bg-deep-charcoal' : 'hover:bg-deep-charcoal/60'}`} onClick={() => setExpandedId(isOpen ? null : l.id)}>
                  <td className="px-3 py-2.5 text-[10px] text-text-muted font-mono align-top">{page * pageSize + i + 1}</td>
                  <td className="px-3 py-2.5 align-top" colSpan={isOpen ? 10 : 1}>
                    <div className="flex items-center gap-2">
                      <Link href={`/crm/entity/${l.id}`} className="text-text-primary hover:text-gold font-medium transition-colors text-[13px]" onClick={e => e.stopPropagation()}>{l.name}</Link>
                      {!isOpen && l.bio && l.bio !== 'No public profile found.' && <span className="text-[10px] text-text-muted truncate max-w-[180px]">{l.bio}</span>}
                    </div>

                    {isOpen && (
                      <div className="mt-3 space-y-4" onClick={e => e.stopPropagation()}>
                        {/* Profile summary */}
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Profile</p>
                            {l.currentRole && <p className="text-xs text-text-secondary">{l.currentRole}{l.employer ? ` at ${l.employer}` : ''}</p>}
                            {l.bio && l.bio !== 'No public profile found.' && <p className="text-xs text-text-muted mt-1">{l.bio}</p>}
                            {l.location && <p className="text-[10px] text-text-muted mt-1">{l.location}</p>}
                            {l.sector && <p className="text-[10px] text-text-muted">Sector: {l.sector}</p>}
                            <p className="text-[10px] text-text-muted">{l.connectionCount} connections &middot; {l.minHops ? `${l.minHops}-hop` : 'no path'} &middot; {l.isHumanValidated ? 'validated' : 'unvalidated'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Wealth</p>
                            {l.estimatedNw ? (
                              <p className="text-sm font-medium text-gold">{formatNw(l.estimatedNw)}</p>
                            ) : (
                              <p className="text-xs text-text-muted">{l.wealthBand && l.wealthBand !== 'unknown' ? l.wealthBand.replace(/_/g, '-') : 'Unknown'}</p>
                            )}
                            {l.wealthSource && <p className="text-[10px] text-text-muted mt-0.5">Source: {l.wealthSource}</p>}
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Category</p>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CAT_COLORS[l.category] ?? ''}`}>{CAT_LABELS[l.category] ?? l.category}</span>
                          </div>
                        </div>

                        {/* Score explainability */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">Score breakdown (composite: {l.compositeScore}/100)</p>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              ['Connectivity (20%)', l.breakdown.connectivity, l.explanations.connectivity],
                              ['Wealth (30%)', l.breakdown.wealth, l.explanations.wealth],
                              ['Paths (30%)', l.breakdown.paths, l.explanations.paths],
                              ['Donor Affinity (20%)', l.breakdown.affinity, l.explanations.affinity],
                            ] as [string, number, string][]).map(([label, score, explanation]) => (
                              <div key={label} className="rounded border border-border-subtle px-2.5 py-2 bg-mid-charcoal/30">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-medium text-text-secondary">{label}</span>
                                  <ScoreBar value={score} />
                                </div>
                                <p className="text-[10px] text-text-muted leading-relaxed">{explanation}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Introduction paths — best contacts */}
                        {l.introPaths.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                              Best introduction contacts ({l.introPaths.length} path{l.introPaths.length > 1 ? 's' : ''})
                            </p>
                            <div className="space-y-1.5">
                              {l.introPaths.map((p, pi) => (
                                <div key={pi} className={`rounded border px-2.5 py-2 ${pi === 0 ? 'border-gold/20 bg-gold/[0.04]' : 'border-border-subtle bg-mid-charcoal/20'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-text-muted">#{p.rank}</span>
                                    <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${p.score >= 70 ? 'text-green-400 bg-green-400/10' : p.score >= 45 ? 'text-gold bg-gold/10' : 'text-text-muted bg-mid-charcoal'}`}>{p.score}</span>
                                    <span className="text-xs text-text-primary font-medium">{p.root_supporter}</span>
                                    {p.supporter_tier && <span className="text-[10px] text-text-muted">({p.supporter_tier === 'Priority / very important' ? 'Priority' : p.supporter_tier})</span>}
                                    {p.supporter_sub_type && <span className="text-[10px] text-gold">{p.supporter_sub_type}</span>}
                                  </div>
                                  <p className="text-[10px] text-text-secondary mt-1">{p.path_names.join(' → ')}</p>
                                  {p.via_orgs.length > 0 && <p className="text-[10px] text-text-muted">Via: {p.via_orgs.join(', ')}</p>}
                                  <p className="text-[10px] text-text-muted mt-0.5">{p.reason}</p>
                                  <div className="flex gap-3 text-[9px] text-text-muted mt-1">
                                    <span>Hops {p.score_breakdown.hops}/40</span>
                                    <span>Shared orgs {p.score_breakdown.shared_orgs}/25</span>
                                    <span>Introducer reach {p.score_breakdown.introducer_reach}/20</span>
                                    <span>Supporter tier {p.score_breakdown.supporter_tier}/15</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
                          <button
                            onClick={() => sendToBacklog(l)}
                            disabled={sending === l.id || l.actionStatus === 'new'}
                            className="text-xs px-3 py-1.5 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-30 transition-colors"
                          >
                            {l.actionStatus ? `Status: ${l.actionStatus}` : sending === l.id ? 'Sending...' : 'Send to Action Backlog'}
                          </button>
                          <Link href={`/crm/entity/${l.id}`} className="text-xs text-text-muted hover:text-gold transition-colors">Open full profile →</Link>
                        </div>
                      </div>
                    )}
                  </td>
                  {!isOpen && (
                    <>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CAT_COLORS[l.category] ?? ''}`}>{CAT_LABELS[l.category] ?? l.category}</span>
                      </td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.compositeScore} /></td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.connectivity} /></td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.networkWorth} /></td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.breakdown.paths} /></td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.donorAffinity} /></td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-mono ${l.minHops === 1 ? 'text-teal-400' : l.minHops === 2 ? 'text-text-secondary' : 'text-text-muted'}`}>{l.minHops ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {l.bestPath ? (
                          <div>
                            <p className="text-[11px] text-text-secondary truncate max-w-[180px]">{l.bestPath}</p>
                            {l.estimatedNw && <p className="text-[10px] text-gold">{formatNw(l.estimatedNw)}</p>}
                          </div>
                        ) : <span className="text-[10px] text-text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={e => { e.stopPropagation(); sendToBacklog(l); }}
                          disabled={sending === l.id || l.actionStatus === 'new'}
                          className="text-[10px] px-2 py-1 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-30 transition-colors"
                        >
                          {l.actionStatus ? l.actionStatus : sending === l.id ? '...' : 'Send'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
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
