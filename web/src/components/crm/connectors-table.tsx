'use client';

import { useState, useMemo } from 'react';

export interface ConnectorRow {
  id: string;
  name: string;
  tier: string | null;
  connectorScore: number; // betweenness, 0–1
  influence: number; // eigenvector, 0–1
  constraint: number; // Burt constraint, raw ~0–1+
  degree: number;
  firstDegreeHnw: number;
  hnwWithin2Hops: number;
}

type SortKey = 'connector' | 'influence' | 'brokerage' | 'degree' | 'hnw1' | 'hnw2' | 'name';

/** Brokerage = inverted constraint. Low constraint → spans structural holes. */
function brokerageTier(row: ConnectorRow): { label: 'High' | 'Med' | 'Low' | '—'; isBroker: boolean } {
  if (row.degree < 2) return { label: '—', isBroker: false };
  if (row.constraint < 0.4) return { label: 'High', isBroker: true };
  if (row.constraint < 0.7) return { label: 'Med', isBroker: false };
  return { label: 'Low', isBroker: false };
}

function pct(v: number): string {
  return (v * 100).toFixed(0);
}

export function ConnectorsTable({ rows }: { rows: ConnectorRow[] }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('connector');
  const [sortAsc, setSortAsc] = useState(false);
  const [brokersOnly, setBrokersOnly] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 40;

  const brokerCount = useMemo(() => rows.filter(r => brokerageTier(r).isBroker).length, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (brokersOnly) list = list.filter(r => brokerageTier(r).isBroker);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q));
    }
    return list;
  }, [rows, brokersOnly, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'connector': cmp = b.connectorScore - a.connectorScore; break;
        case 'influence': cmp = b.influence - a.influence; break;
        // Sort by brokerage descending = lowest constraint first.
        case 'brokerage': cmp = a.constraint - b.constraint; break;
        case 'degree': cmp = b.degree - a.degree; break;
        case 'hnw1': cmp = b.firstDegreeHnw - a.firstDegreeHnw; break;
        case 'hnw2': cmp = b.hnwWithin2Hops - a.hnwWithin2Hops; break;
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
  const TH = 'px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary select-none';

  const brokerBadge: Record<'High' | 'Med' | 'Low' | '—', string> = {
    High: 'bg-gold/10 text-gold',
    Med: 'bg-teal-400/10 text-teal-400',
    Low: 'bg-mid-charcoal text-text-muted',
    '—': 'bg-transparent text-text-muted',
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Key Connectors</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          These supporters are the gateways — ranked by how many otherwise-unreachable targets they bridge to.
          Prioritise them for introductions. Connector score is betweenness (bridging power); Influence is
          eigenvector centrality (how central their contacts are); Brokerage is inverted Burt constraint —
          High means their contacts don&apos;t know each other, so they open fresh networks. {brokerCount} supporters
          are structural-hole brokers.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input type="text" placeholder="Search supporter..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-72" />
        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
          <input type="checkbox" checked={brokersOnly} onChange={e => { setBrokersOnly(e.target.checked); setPage(0); }}
            className="accent-gold" />
          Brokers only ({brokerCount})
        </label>
        <span className="text-xs text-text-muted ml-auto">{sorted.length} supporters</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className={`text-left ${TH}`} onClick={() => handleSort('name')}>Supporter{si('name')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('connector')}>Connector score{si('connector')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('influence')}>Influence{si('influence')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('brokerage')}>Brokerage{si('brokerage')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('degree')}>Connections{si('degree')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('hnw1')}>HNW 1-hop{si('hnw1')}</th>
              <th className={`text-center ${TH}`} onClick={() => handleSort('hnw2')}>HNW ≤2-hop{si('hnw2')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {paged.map(r => {
              const tier = brokerageTier(r);
              return (
                <tr key={r.id} className="transition-colors hover:bg-deep-charcoal/60">
                  <td className="px-3 py-2.5">
                    <span className="text-[13px] text-text-primary font-medium">{r.name}</span>
                    {tier.isBroker && <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/15 text-gold ml-2">Broker</span>}
                    {r.tier && <span className="text-[9px] uppercase tracking-wider text-text-muted ml-2">{r.tier}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-mono ${r.connectorScore > 0 ? 'text-gold' : 'text-text-muted'}`}>{pct(r.connectorScore)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm font-mono text-text-secondary">{pct(r.influence)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${brokerBadge[tier.label]}`}>{tier.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm font-mono text-text-muted">{r.degree}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-mono ${r.firstDegreeHnw > 0 ? 'text-orange-400' : 'text-text-muted'}`}>{r.firstDegreeHnw}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-mono ${r.hnwWithin2Hops > 0 ? 'text-orange-400' : 'text-text-muted'}`}>{r.hnwWithin2Hops}</span>
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">No supporters match.</td></tr>
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
