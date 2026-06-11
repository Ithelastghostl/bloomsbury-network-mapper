'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ScoredLead } from '@/lib/crm/lead-score';

/**
 * Orient → Evidence Coverage. A pool-level read on how well-evidenced the
 * candidate leads are: what share carry wealth / affinity / multi-source
 * evidence, how confidence is distributed, and — most actionably — which
 * high-priority leads rest on thin evidence, so the analyst knows where
 * augmentation buys the most. Operates over scored leads with our own
 * supporters filtered out (they aren't leads).
 */

function hasWealth(l: ScoredLead): boolean {
  return l.estimatedNw != null || (l.wealthBand != null && l.wealthBand !== 'unknown');
}
function hasAffinity(l: ScoredLead): boolean {
  return l.dimensions.affinity > 0;
}
function hasMultiSource(l: ScoredLead): boolean {
  return l.signalSources >= 2;
}

/** A lead is "thinly evidenced" when it ranks well but the evidence under it is
 * weak — high priority with either low confidence or a single source. These are
 * the highest-leverage augmentation targets: promising, but under-corroborated. */
function isThinlyEvidenced(l: ScoredLead): boolean {
  return l.priority > 50 && (l.confidence < 40 || l.signalSources < 2);
}

function StatCard({ label, value, sub, tone = 'default' }: { label: string; value: string; sub: string; tone?: 'default' | 'good' | 'warn' }) {
  const valueCls = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-amber-400' : 'text-text-primary';
  return (
    <div className="rounded-lg border border-border-subtle bg-deep-charcoal px-4 py-3">
      <p className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${valueCls}`}>{value}</p>
      <p className="text-[10px] text-text-muted mt-0.5">{sub}</p>
    </div>
  );
}

/** 10-bucket confidence histogram (0–9, 10–19, … 90–100). */
function ConfidenceHistogram({ leads }: { leads: ScoredLead[] }) {
  const buckets = useMemo(() => {
    const b = new Array(10).fill(0);
    for (const l of leads) b[Math.min(9, Math.floor(l.confidence / 10))]++;
    return b;
  }, [leads]);
  const max = Math.max(1, ...buckets);
  const lowCount = buckets.slice(0, 4).reduce((a, c) => a + c, 0); // confidence < 40

  return (
    <div className="rounded-lg border border-border-subtle bg-deep-charcoal p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Confidence distribution</p>
        <span className="text-[10px] text-text-muted">
          <span className="text-amber-400">{lowCount.toLocaleString()}</span> under 40 (thin)
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-32">
        {buckets.map((n, i) => {
          const lo = i * 10;
          const cls = lo < 40 ? 'bg-amber-400/60' : lo < 70 ? 'bg-gold/60' : 'bg-green-500/60';
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`Confidence ${lo}–${lo === 90 ? 100 : lo + 9}: ${n} leads`}>
              <span className="text-[9px] font-mono text-text-muted mb-0.5">{n > 0 ? n : ''}</span>
              <div className={`w-full rounded-t ${cls}`} style={{ height: `${Math.max(n > 0 ? 3 : 0, (n / max) * 100)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1">
        {buckets.map((_, i) => (
          <span key={i} className="flex-1 text-center text-[8px] font-mono text-text-muted">{i * 10}</span>
        ))}
      </div>
    </div>
  );
}

export function CoverageView({ leads }: { leads: ScoredLead[] }) {
  // Candidates only — our own supporters aren't leads to evidence.
  const pool = useMemo(() => leads.filter(l => !l.existingSupporter), [leads]);
  const total = pool.length;

  const wealthN = useMemo(() => pool.filter(hasWealth).length, [pool]);
  const affinityN = useMemo(() => pool.filter(hasAffinity).length, [pool]);
  const multiN = useMemo(() => pool.filter(hasMultiSource).length, [pool]);
  const singleSourceN = useMemo(() => pool.filter(l => l.signalSources <= 1).length, [pool]);

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  const thin = useMemo(
    () => pool.filter(isThinlyEvidenced).sort((a, b) => b.priority - a.priority),
    [pool],
  );
  const [thinLimit, setThinLimit] = useState(40);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Evidence Coverage</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          How well-evidenced the candidate pool is. {total.toLocaleString()} leads (our supporters excluded). The
          stats show what share carry wealth, affinity, and 2+ independent sources; the histogram shows how trustworthy
          the priority scores are; the list below flags promising leads that rest on thin evidence — where augmentation
          should point next.
        </p>
      </div>

      {/* Pool coverage stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Wealth evidence" value={`${pct(wealthN)}%`} sub={`${wealthN.toLocaleString()} of ${total.toLocaleString()} have a band or figure`} tone={pct(wealthN) >= 50 ? 'good' : 'warn'} />
        <StatCard label="Affinity evidence" value={`${pct(affinityN)}%`} sub={`${affinityN.toLocaleString()} have an affinity signal`} tone={pct(affinityN) >= 50 ? 'good' : 'warn'} />
        <StatCard label="Multi-source" value={`${pct(multiN)}%`} sub={`${multiN.toLocaleString()} backed by 2+ sources`} tone={pct(multiN) >= 50 ? 'good' : 'warn'} />
        <StatCard label="Single / no source" value={`${pct(singleSourceN)}%`} sub={`${singleSourceN.toLocaleString()} rest on ≤1 source`} tone="warn" />
      </div>

      <div className="mb-6">
        <ConfidenceHistogram leads={pool} />
      </div>

      {/* Thinly-evidenced leads — where augmentation buys the most */}
      <div className="rounded-lg border border-border-subtle bg-deep-charcoal">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Thinly evidenced — augment next</p>
            <p className="text-[10px] text-text-muted mt-0.5">High priority (&gt;50) but low confidence (&lt;40) or fewer than 2 sources. Promising, under-evidenced.</p>
          </div>
          <span className="text-xs text-text-muted">{thin.length.toLocaleString()} leads</span>
        </div>
        {thin.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left px-4 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Lead</th>
                <th className="text-center px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-24">Priority</th>
                <th className="text-center px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-24">Confidence</th>
                <th className="text-center px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-20">Sources</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-40">Gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {thin.slice(0, thinLimit).map(l => {
                const gaps: string[] = [];
                if (l.confidence < 40) gaps.push('low confidence');
                if (l.signalSources < 2) gaps.push('single source');
                if (!hasWealth(l)) gaps.push('no wealth');
                return (
                  <tr key={l.id} className="hover:bg-mid-charcoal/40 transition-colors">
                    <td className="px-4 py-1.5">
                      <Link href={`/crm/entity/${l.id}`} className="text-[12px] text-text-primary hover:text-gold transition-colors">{l.name}</Link>
                    </td>
                    <td className="px-3 py-1.5 text-center text-xs font-mono text-text-secondary">{l.priority}</td>
                    <td className="px-3 py-1.5 text-center text-xs font-mono"><span className="text-amber-400">{l.confidence}</span></td>
                    <td className="px-3 py-1.5 text-center text-xs font-mono"><span className={l.signalSources >= 2 ? 'text-green-400' : 'text-amber-400'}>{l.signalSources}</span></td>
                    <td className="px-3 py-1.5 text-[10px] text-text-muted">{gaps.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-text-muted">No thinly-evidenced leads — high-priority leads are well-corroborated.</p>
        )}
        {thin.length > thinLimit && (
          <div className="px-4 py-3 border-t border-border-subtle">
            <button onClick={() => setThinLimit(thinLimit + 40)} className="text-xs px-3 py-1.5 rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary transition-colors">
              Show more ({thin.length - thinLimit} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
