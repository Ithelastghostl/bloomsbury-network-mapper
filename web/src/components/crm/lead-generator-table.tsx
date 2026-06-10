'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import type { ScoredLead, IntroPathDetail } from '@/lib/crm/lead-score';
import type { EnrichedEntity } from '@/lib/crm/types';
import { ExportCsvButton } from './export-csv-button';

type SortKey = 'priority' | 'confidence' | 'introability' | 'affinity' | 'capacity' | 'influence' | 'name' | 'hops';
type CategoryFilter = 'all' | 'hnw_target' | 'wealth_identified' | 'charity_donor' | 'discovered';

const CAT_LABELS: Record<string, string> = { hnw_target: 'HNW Target', wealth_identified: 'Wealth ID', charity_donor: 'Charity Donor', discovered: 'Discovered' };
const CAT_COLORS: Record<string, string> = { hnw_target: 'text-orange-400 bg-orange-400/10', wealth_identified: 'text-gold bg-gold/10', charity_donor: 'text-teal-400 bg-teal-400/10', discovered: 'text-text-muted bg-mid-charcoal' };

/** Per-ranking-method presentation: heading, default sort, and which extra sub-signal columns to surface. */
const METHODS: Record<string, { title: string; description: string; sortKey: SortKey; subColumns: Array<'connections' | 'estimatedNw' | 'pathCount' | 'bestPathScore' | 'charityOverlap' | 'sector'> }> = {
  priority: {
    title: 'Lead Generator',
    description: 'ranked by PRD §18.1 priority (introability 30%, affinity 25%, capacity 20%, influence 15%, strategic fit 10%).',
    sortKey: 'priority',
    subColumns: [],
  },
  introability: {
    title: 'Leads by Introability',
    description: 'ranked by §18.1 introability — how warm and how many routes our supporters have to them.',
    sortKey: 'introability',
    subColumns: ['pathCount', 'bestPathScore'],
  },
  affinity: {
    title: 'Leads by Affinity',
    description: 'ranked by §18.1 affinity — charity overlaps, donor category, and sector signals.',
    sortKey: 'affinity',
    subColumns: ['charityOverlap', 'sector'],
  },
  capacity: {
    title: 'Leads by Capacity',
    description: 'ranked by §18.1 capacity — observable giving capacity from researched figures and band estimates.',
    sortKey: 'capacity',
    subColumns: ['estimatedNw'],
  },
  influence: {
    title: 'Leads by Influence',
    description: 'ranked by §18.1 influence — how many mapped network connections each lead has.',
    sortKey: 'influence',
    subColumns: ['connections'],
  },
  confidence: {
    title: 'Leads by Confidence',
    description: 'ranked by §18.2 evidence confidence — how trustworthy each lead\'s priority is.',
    sortKey: 'confidence',
    subColumns: [],
  },
};

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

/**
 * Group a lead's introduction paths by the institution that creates the
 * connection. When several supporters reach the target through the SAME
 * institution, each supporter stays a distinct introduction option inside
 * that institution's group — the analyst picks the introducer, not just the
 * org. Identical people-chains are deduplicated (best score wins).
 */
function groupPathsByInstitution(paths: IntroPathDetail[]): Array<{ institution: string; paths: IntroPathDetail[] }> {
  const byChain = new Map<string, IntroPathDetail>();
  for (const p of paths) {
    const key = p.path_names.join('|');
    const existing = byChain.get(key);
    if (!existing || p.score > existing.score) byChain.set(key, p);
  }
  const groups = new Map<string, IntroPathDetail[]>();
  for (const p of byChain.values()) {
    const inst = p.via_orgs[0] ?? 'Direct relationship';
    const list = groups.get(inst) ?? [];
    list.push(p);
    groups.set(inst, list);
  }
  return [...groups.entries()]
    .map(([institution, list]) => ({ institution, paths: list.sort((a, b) => b.score - a.score) }))
    .sort((a, b) => (b.paths[0]?.score ?? 0) - (a.paths[0]?.score ?? 0));
}

/** On-demand evidence behind the score dimensions: wealth signals + charity affinity, with source links. */
function LeadEvidence({ entityId }: { entityId: string }) {
  const [profile, setProfile] = useState<EnrichedEntity | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(`/api/crm/entities/${entityId}/profile`);
        const json = await res.json();
        if (!cancelled) setProfile(res.ok ? json : null);
      } catch {
        if (!cancelled) setProfile(null);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [entityId]);

  if (profile === 'loading') return <p className="text-[10px] text-text-muted">Loading evidence…</p>;
  if (!profile) return <p className="text-[10px] text-text-muted">No evidence available.</p>;

  const wealthSignals = (profile.wealth?.evidence ?? []).slice(0, 4);
  const charityConnections = profile.connections.filter(c => /foundation|trust|charit/i.test(c.via_organisation ?? '')).slice(0, 4);
  const charityEvidence = profile.evidence.filter(e => e.source === 'charity_commission').slice(0, 3);
  const linkedEvidence = profile.evidence.filter(e => e.evidence_url).slice(0, 3);

  if (!wealthSignals.length && !charityConnections.length && !charityEvidence.length && !linkedEvidence.length) {
    return <p className="text-[10px] text-text-muted">No detailed evidence collected yet — run augmentation from the entity page.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <p className="text-[10px] font-semibold text-text-secondary mb-1">What drove the wealth score</p>
        {wealthSignals.length ? wealthSignals.map((e, i) => (
          <p key={i} className="text-[10px] text-text-muted leading-relaxed">
            · {e.detail} <span className="font-mono">({Math.round(e.contribution * 100)}%)</span>
          </p>
        )) : <p className="text-[10px] text-text-muted">No wealth signals recorded.</p>}
        {linkedEvidence.length > 0 && (
          <div className="mt-1.5">
            {linkedEvidence.map(e => (
              <a key={e.evidence_id} href={e.evidence_url!} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-gold/80 hover:text-gold truncate">
                ↗ {e.source}: {e.evidence_text.slice(0, 70)}
              </a>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-text-secondary mb-1">What drove the affinity score</p>
        {charityConnections.length ? charityConnections.map(c => (
          <p key={c.connection_id} className="text-[10px] text-text-muted leading-relaxed">
            · {c.connected_name ?? 'Connection'} via {c.via_organisation}
          </p>
        )) : <p className="text-[10px] text-text-muted">No charity-linked connections.</p>}
        {charityEvidence.map(e => (
          <p key={e.evidence_id} className="text-[10px] text-text-muted leading-relaxed">· {e.evidence_text.slice(0, 90)}</p>
        ))}
      </div>
    </div>
  );
}

export function LeadGeneratorTable({ leads, method = 'priority' }: { leads: ScoredLead[]; method?: string }) {
  const cfg = METHODS[method] ?? METHODS.priority;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [hopFilter, setHopFilter] = useState<'all' | '1' | '2'>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [bandFilter, setBandFilter] = useState<string>('all');
  const [validatedFilter, setValidatedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [showExisting, setShowExisting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(cfg.sortKey);
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const [excluding, setExcluding] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Map<string, ScoredLead['existingDonor']>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 40;

  // Apply optimistic exclude/restore overrides on top of the server data.
  const effective = useMemo(() => leads.map(l => overrides.has(l.id) ? { ...l, existingDonor: overrides.get(l.id) ?? null } : l), [leads, overrides]);

  const existingCount = useMemo(() => effective.filter(l => l.existingDonor).length, [effective]);

  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of effective) c[l.category] = (c[l.category] ?? 0) + 1;
    return c;
  }, [effective]);

  const sectors = useMemo(() => [...new Set(effective.map(l => l.sector).filter(Boolean))].sort() as string[], [effective]);
  const bands = useMemo(() => {
    const order = ['100m_plus', '25m_100m', '5m_25m', '1m_5m', 'unknown'];
    return order.filter(b => effective.some(l => l.wealthBand === b));
  }, [effective]);
  const BAND_LABELS: Record<string, string> = { '100m_plus': '£100M+', '25m_100m': '£25M–100M', '5m_25m': '£5M–25M', '1m_5m': '£1M–5M', unknown: 'Unknown' };

  const filtered = useMemo(() => {
    let list = effective;
    if (!showExisting) list = list.filter(l => !l.existingDonor);
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
  }, [effective, search, category, hopFilter, sectorFilter, bandFilter, validatedFilter, showExisting]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'priority': cmp = b.priority - a.priority; break;
        case 'confidence': cmp = b.confidence - a.confidence; break;
        case 'introability': cmp = b.dimensions.introability - a.dimensions.introability; break;
        case 'affinity': cmp = b.dimensions.affinity - a.dimensions.affinity; break;
        case 'capacity': cmp = b.dimensions.capacity - a.dimensions.capacity; break;
        case 'influence': cmp = b.dimensions.influence - a.dimensions.influence; break;
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
          compositeScore: lead.priority,
          confidence: lead.confidence,
          category: lead.category,
          bestPath: lead.bestPath,
          rootSupporter: lead.rootSupporter,
          wealthBand: lead.wealthBand,
          estimatedNw: lead.estimatedNw,
          sector: lead.sector,
          bio: lead.bio,
          breakdown: lead.dimensions,
          explanations: lead.explanations,
          affinityRationale: lead.explanations.affinity,
          bestPathReason: lead.introPaths[0]?.reason ?? null,
          viaOrgs: lead.introPaths[0]?.via_orgs ?? null,
          rankingMethod: method,
          hops: lead.minHops,
        }),
      });
    } catch { /* ignore */ }
    setSending(null);
  }

  async function excludeLead(lead: ScoredLead) {
    setExcluding(lead.id);
    try {
      const res = await fetch(`/api/crm/entities/${lead.id}/exclude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'analyst_exclusion' }),
      });
      if (res.ok) setOverrides(prev => new Map(prev).set(lead.id, { matchName: lead.name, kind: 'excluded' }));
    } catch { /* ignore */ }
    setExcluding(null);
  }

  async function restoreLead(lead: ScoredLead) {
    setExcluding(lead.id);
    try {
      const res = await fetch(`/api/crm/entities/${lead.id}/exclude`, { method: 'DELETE' });
      // Restore only clears analyst exclusions; a name match stays flagged.
      if (res.ok) setOverrides(prev => new Map(prev).set(lead.id, null));
    } catch { /* ignore */ }
    setExcluding(null);
  }

  const DONOR_BADGE: Record<string, { label: string; cls: string }> = {
    exact: { label: 'Existing donor', cls: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
    variant: { label: 'Donor name match?', cls: 'text-amber-300 bg-amber-300/10 border-amber-300/30' },
    excluded: { label: 'Excluded', cls: 'text-red-400 bg-red-400/10 border-red-400/30' },
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">{cfg.title}</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {filtered.length} scored leads {cfg.description} Click a row for introduction options and evidence.
          </p>
        </div>
        <ExportCsvButton href={`/api/crm/export/leads.csv?method=${method}`} filename={`leads-${method}.csv`} />
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
        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
          <input type="checkbox" checked={showExisting} onChange={e => { setShowExisting(e.target.checked); setPage(0); }} className="accent-gold" />
          Show existing donors &amp; excluded ({existingCount})
        </label>
        <span className="text-xs text-text-muted ml-auto">{sorted.length} results</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-8">#</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary" onClick={() => handleSort('name')}>Name{si('name')}</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-20">Category</th>
              {cfg.subColumns.includes('connections') && <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-20">Conns</th>}
              {cfg.subColumns.includes('estimatedNw') && <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-24">Est. worth</th>}
              {cfg.subColumns.includes('pathCount') && <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-16">Routes</th>}
              {cfg.subColumns.includes('bestPathScore') && <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-20">Best route</th>}
              {cfg.subColumns.includes('charityOverlap') && <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-20">Charity links</th>}
              {cfg.subColumns.includes('sector') && <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-24">Sector</th>}
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('priority')}>Priority{si('priority')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('confidence')}>Confidence{si('confidence')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('introability')}>Introability{si('introability')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('affinity')}>Affinity{si('affinity')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('capacity')}>Capacity{si('capacity')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-24" onClick={() => handleSort('influence')}>Influence{si('influence')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary w-14" onClick={() => handleSort('hops')}>Hops{si('hops')}</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Best route</th>
              <th className="px-3 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map((l, i) => {
              const isOpen = expandedId === l.id;
              const colCount = 12 + cfg.subColumns.length;
              const donorBadge = l.existingDonor ? DONOR_BADGE[l.existingDonor.kind] : null;
              return (
                <tr key={l.id} className={`transition-colors cursor-pointer ${isOpen ? 'bg-deep-charcoal' : 'hover:bg-deep-charcoal/60'} ${l.existingDonor ? 'opacity-75' : ''}`} onClick={() => setExpandedId(isOpen ? null : l.id)}>
                  <td className="px-3 py-2.5 text-[10px] text-text-muted font-mono align-top">{page * pageSize + i + 1}</td>
                  <td className="px-3 py-2.5 align-top" colSpan={isOpen ? colCount - 1 : 1}>
                    <div className="flex items-center gap-2">
                      <Link href={`/crm/entity/${l.id}`} className="text-text-primary hover:text-gold font-medium transition-colors text-[13px]" onClick={e => e.stopPropagation()}>{l.name}</Link>
                      {donorBadge && (
                        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${donorBadge.cls}`} title={l.existingDonor!.kind === 'variant' ? `Possible match: ${l.existingDonor!.matchName}` : l.existingDonor!.matchName}>
                          {donorBadge.label}
                        </span>
                      )}
                      {!isOpen && l.bio && l.bio !== 'No public profile found.' && <span className="text-[10px] text-text-muted truncate max-w-[180px]">{l.bio}</span>}
                    </div>

                    {isOpen && (
                      <div className="mt-3 space-y-4" onClick={e => e.stopPropagation()}>
                        {l.existingDonor && (
                          <div className="rounded border border-amber-400/30 bg-amber-400/[0.05] px-3 py-2 max-w-3xl">
                            <p className="text-[11px] text-amber-300">
                              {l.existingDonor.kind === 'exact' && <>Already a current donor in the original supporters list — not a new lead.</>}
                              {l.existingDonor.kind === 'variant' && <>Possible match with current donor <span className="font-semibold">{l.existingDonor.matchName}</span> (name variant). Verify before outreach — if it is the same person, exclude this entry.</>}
                              {l.existingDonor.kind === 'excluded' && <>Excluded from lead generation by an analyst.</>}
                            </p>
                          </div>
                        )}

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
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">Priority breakdown (§18.1: {l.priority}/100, confidence {l.confidence}/100)</p>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              ['Introability (30%)', l.dimensions.introability, l.explanations.introability],
                              ['Affinity (25%)', l.dimensions.affinity, l.explanations.affinity],
                              ['Capacity (20%)', l.dimensions.capacity, l.explanations.capacity],
                              ['Influence (15%)', l.dimensions.influence, l.explanations.influence],
                              ['Strategic Fit (10%)', l.dimensions.strategicFit, l.explanations.strategicFit],
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
                          {/* §18.2 confidence sub-panel */}
                          <div className="mt-2 rounded border border-border-subtle px-2.5 py-2 bg-mid-charcoal/20">
                            <p className="text-[10px] text-text-muted mb-1.5">§18.2 confidence: how trustworthy this priority is ({l.confidence}/100).</p>
                            <div className="grid grid-cols-4 gap-2">
                              {([
                                ['Identity', l.confidenceDimensions.identity],
                                ['Relationship', l.confidenceDimensions.relationship],
                                ['Corroboration', l.confidenceDimensions.corroboration],
                                ['Freshness', l.confidenceDimensions.freshness],
                              ] as [string, number][]).map(([label, score]) => (
                                <div key={label} className="flex items-center justify-between gap-1.5">
                                  <span className="text-[10px] text-text-secondary">{label}</span>
                                  <ScoreBar value={score} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Evidence behind the dimensions */}
                        <div className="rounded border border-border-subtle px-2.5 py-2 bg-mid-charcoal/20">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Evidence</p>
                          <LeadEvidence entityId={l.id} />
                        </div>

                        {/* Introduction options, grouped by connecting institution */}
                        {l.introPaths.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                              Introduction options ({l.introPaths.length} path{l.introPaths.length > 1 ? 's' : ''})
                            </p>
                            <div className="space-y-2">
                              {groupPathsByInstitution(l.introPaths).map((group, gi) => (
                                <div key={gi}>
                                  {group.paths.length > 1 && (
                                    <p className="text-[10px] text-text-secondary mb-1">
                                      Via <span className="font-medium text-gold/90">{group.institution}</span> — {group.paths.length} introducer options:
                                    </p>
                                  )}
                                  <div className="space-y-1.5">
                                    {group.paths.map((p, pi) => (
                                      <div key={pi} className={`rounded border px-2.5 py-2 ${gi === 0 && pi === 0 ? 'border-gold/20 bg-gold/[0.04]' : 'border-border-subtle bg-mid-charcoal/20'}`}>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-bold text-text-muted">#{p.rank}</span>
                                          <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${p.score >= 70 ? 'text-green-400 bg-green-400/10' : p.score >= 45 ? 'text-gold bg-gold/10' : 'text-text-muted bg-mid-charcoal'}`}>{p.score}</span>
                                          <span className="text-xs text-text-primary font-medium">{p.root_supporter}</span>
                                          {p.supporter_tier && <span className="text-[10px] text-text-muted">({p.supporter_tier === 'Priority / very important' ? 'Priority' : p.supporter_tier})</span>}
                                          {p.supporter_sub_type && <span className="text-[10px] text-gold">{p.supporter_sub_type}</span>}
                                        </div>
                                        <p className="text-[10px] text-text-secondary mt-1">{p.path_names.join(' → ')}</p>
                                        {p.via_orgs.length > 0 && group.paths.length === 1 && <p className="text-[10px] text-text-muted">Via: {p.via_orgs.join(', ')}</p>}
                                        {p.via_orgs.length > 1 && group.paths.length > 1 && <p className="text-[10px] text-text-muted">Also via: {p.via_orgs.slice(1).join(', ')}</p>}
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
                          {l.existingDonor?.kind === 'excluded' ? (
                            <button
                              onClick={() => restoreLead(l)}
                              disabled={excluding === l.id}
                              className="text-xs px-3 py-1.5 rounded bg-mid-charcoal text-text-secondary border border-border-subtle hover:text-text-primary disabled:opacity-30 transition-colors"
                            >
                              {excluding === l.id ? 'Restoring…' : 'Restore as lead'}
                            </button>
                          ) : (
                            <button
                              onClick={() => excludeLead(l)}
                              disabled={excluding === l.id}
                              className="text-xs px-3 py-1.5 rounded bg-mid-charcoal text-text-muted border border-border-subtle hover:text-red-400 hover:border-red-400/30 disabled:opacity-30 transition-colors"
                              title="Exclude from lead generation (persists across recomputes)"
                            >
                              {excluding === l.id ? 'Excluding…' : 'Exclude from leads'}
                            </button>
                          )}
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
                      {cfg.subColumns.includes('connections') && <td className="px-3 py-2.5 text-center text-xs font-mono text-text-secondary">{l.connectionCount}</td>}
                      {cfg.subColumns.includes('estimatedNw') && <td className="px-3 py-2.5 text-center text-xs font-mono text-gold">{l.estimatedNw ? formatNw(l.estimatedNw) : <span className="text-text-muted">{l.wealthBand?.replace(/_/g, '-') ?? '—'}</span>}</td>}
                      {cfg.subColumns.includes('pathCount') && <td className="px-3 py-2.5 text-center text-xs font-mono text-text-secondary">{l.pathCount}</td>}
                      {cfg.subColumns.includes('bestPathScore') && <td className="px-3 py-2.5 text-center text-xs font-mono text-text-secondary">{l.bestPathScore || '—'}</td>}
                      {cfg.subColumns.includes('charityOverlap') && <td className="px-3 py-2.5 text-center text-xs font-mono text-text-secondary">{l.charityOverlap}</td>}
                      {cfg.subColumns.includes('sector') && <td className="px-3 py-2.5 text-[10px] text-text-muted">{l.sector ?? '—'}</td>}
                      <td className="px-3 py-2.5"><ScoreBar value={l.priority} /></td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.confidence} /></td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.dimensions.introability} /></td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.dimensions.affinity} /></td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.dimensions.capacity} /></td>
                      <td className="px-3 py-2.5"><ScoreBar value={l.dimensions.influence} /></td>
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
