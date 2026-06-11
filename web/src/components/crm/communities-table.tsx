'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Community } from '@/lib/crm/communities';

export function CommunitiesTable({ communities }: { communities: Community[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return communities;
    const q = search.toLowerCase();
    return communities.filter(c =>
      c.label.toLowerCase().includes(q) ||
      (c.dominantSector ?? '').toLowerCase().includes(q) ||
      c.sampleMembers.some(m => m.name.toLowerCase().includes(q)),
    );
  }, [communities, search]);

  const TH = 'px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted';

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Communities</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          The network auto-segmented into clusters (Louvain modularity) — name and target them as cohorts.
          Each community is labelled by its dominant sector or shared institution.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input type="text" placeholder="Search community, sector, member..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-80" />
        <span className="text-xs text-text-muted ml-auto">{filtered.length} communities</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className={`text-left ${TH}`}>Community</th>
              <th className={`text-left ${TH}`}>Dominant sector</th>
              <th className={`text-center ${TH}`}>Members</th>
              <th className={`text-left ${TH}`}>Sample members</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-deep-charcoal/60 transition-colors align-top">
                <td className="px-3 py-2.5">
                  <span className="text-[13px] text-text-primary font-medium">{c.label}</span>
                </td>
                <td className="px-3 py-2.5">
                  {c.dominantSector
                    ? <span className="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/10 text-gold">{c.dominantSector}</span>
                    : <span className="text-text-muted text-xs">—</span>}
                </td>
                <td className="px-3 py-2.5 text-center text-sm font-mono text-text-secondary">{c.size}</td>
                <td className="px-3 py-2.5">
                  <div className="text-[11px] text-text-secondary flex flex-wrap gap-x-2 gap-y-0.5 max-w-[520px]">
                    {c.sampleMembers.map((m, i) => (
                      <span key={m.id}>
                        <Link href={`/crm/entity/${m.id}`} className="hover:text-gold transition-colors">{m.name}</Link>
                        {i < c.sampleMembers.length - 1 ? ',' : ''}
                      </span>
                    ))}
                    {c.size > c.sampleMembers.length && <span className="text-text-muted">+{c.size - c.sampleMembers.length} more</span>}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-text-muted">No communities match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
