'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ScoredLead } from '@/lib/crm/lead-score';

/**
 * Needs Review — a triage queue ranked by UNCERTAINTY, not priority. It surfaces
 * the leads where a human decision moves the most: possible duplicate supporters,
 * high-priority leads we can't yet trust, wealth claims on a single source, and
 * high-value leads no human has confirmed. Ranking favours cases that are both
 * uncertain AND consequential (high priority), so the analyst spends review time
 * where it changes outcomes. Reuses loadScoredLeads — no re-scoring here.
 */

type FlagKind = 'variant' | 'low_confidence' | 'single_source_wealth' | 'unvalidated_value';

interface Flag {
  kind: FlagKind;
  reason: string;
}

const FLAG_META: Record<FlagKind, { label: string; cls: string }> = {
  variant: { label: 'Possible duplicate', cls: 'text-amber-300 bg-amber-300/10 border-amber-300/30' },
  low_confidence: { label: 'Trust gap', cls: 'text-red-400 bg-red-400/10 border-red-400/30' },
  single_source_wealth: { label: 'Single-source wealth', cls: 'text-purple-400 bg-purple-400/10 border-purple-400/30' },
  unvalidated_value: { label: 'Unverified high-value', cls: 'text-gold bg-gold/10 border-gold/30' },
};

const FLAG_ORDER: FlagKind[] = ['variant', 'low_confidence', 'single_source_wealth', 'unvalidated_value'];

interface ReviewRow {
  lead: ScoredLead;
  flags: Flag[];
  uncertainty: number;
}

/** Collect every reason this lead needs a human look. */
function flagsFor(l: ScoredLead): Flag[] {
  const flags: Flag[] = [];
  if (l.existingSupporter?.kind === 'variant') {
    flags.push({ kind: 'variant', reason: `Name variant of our supporter "${l.existingSupporter.matchName}" — confirm same person and dedup, or clear.` });
  }
  if (l.priority > 50 && l.confidence < 40) {
    flags.push({ kind: 'low_confidence', reason: `Ranks high (priority ${l.priority}) but confidence is only ${l.confidence} — verify before acting.` });
  }
  if (l.wealthBand != null && l.wealthBand !== 'unknown' && l.signalSources < 2) {
    flags.push({ kind: 'single_source_wealth', reason: `Wealth band recorded on ${l.signalSources === 0 ? 'no independent' : 'a single'} source — corroborate the capacity claim.` });
  }
  if (l.priority > 60 && !l.isHumanValidated) {
    flags.push({ kind: 'unvalidated_value', reason: `High-value lead (priority ${l.priority}) with no human identity confirmation.` });
  }
  return flags;
}

/**
 * Uncertainty score — higher = review sooner. Each flag contributes a base
 * weight scaled by how consequential the lead is (its priority): the same doubt
 * matters more on a high-priority target. A variant supporter match carries the
 * highest base — a bad identity match silently corrupts every downstream score
 * and path. Multiple flags compound.
 */
function uncertaintyScore(l: ScoredLead, flags: Flag[]): number {
  const consequence = 0.5 + l.priority / 100; // 0.5–1.5
  let score = 0;
  for (const f of flags) {
    const base =
      f.kind === 'variant' ? 60 :
      f.kind === 'low_confidence' ? 40 :
      f.kind === 'single_source_wealth' ? 30 :
      25; // unvalidated_value
    score += base * consequence;
  }
  return Math.round(score);
}

export function ReviewQueueTable({ leads }: { leads: ScoredLead[] }) {
  const [kindFilter, setKindFilter] = useState<'all' | FlagKind>('all');
  const [limit, setLimit] = useState(60);

  const rows = useMemo<ReviewRow[]>(() => {
    return leads
      .map(l => ({ lead: l, flags: flagsFor(l) }))
      .filter(r => r.flags.length > 0)
      .map(r => ({ ...r, uncertainty: uncertaintyScore(r.lead, r.flags) }))
      .sort((a, b) => b.uncertainty - a.uncertainty);
  }, [leads]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) for (const f of r.flags) c[f.kind] = (c[f.kind] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(
    () => kindFilter === 'all' ? rows : rows.filter(r => r.flags.some(f => f.kind === kindFilter)),
    [rows, kindFilter],
  );

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Needs Review</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          Leads ranked by uncertainty, not priority — the cases where a human decision moves the most. Possible
          duplicate supporters, high-priority leads we can&apos;t yet trust, wealth on a single source, and unverified
          high-value targets. Clear the top of this list before working the lead list.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setKindFilter('all')} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${kindFilter === 'all' ? 'bg-gold/10 text-gold border-gold/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          All ({rows.length})
        </button>
        {FLAG_ORDER.filter(k => (counts[k] ?? 0) > 0).map(k => (
          <button key={k} onClick={() => setKindFilter(kindFilter === k ? 'all' : k)} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${kindFilter === k ? FLAG_META[k].cls : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
            {FLAG_META[k].label} ({counts[k]})
          </button>
        ))}
        <span className="text-xs text-text-muted ml-auto">{visible.length} flagged</span>
      </div>

      {visible.length > 0 ? (
        <div className="border border-border-subtle rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-deep-charcoal border-b border-border-subtle">
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-12">Rank</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Lead</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Why flagged</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-20">Priority</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-20">Confidence</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted w-24" title="Uncertainty score — higher means review sooner">Uncertainty</th>
                <th className="px-3 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {visible.slice(0, limit).map((r, i) => (
                <tr key={r.lead.id} className="hover:bg-deep-charcoal/60 transition-colors align-top">
                  <td className="px-3 py-2.5 text-[10px] text-text-muted font-mono">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/crm/entity/${r.lead.id}`} className="text-[13px] text-text-primary hover:text-gold font-medium transition-colors">{r.lead.name}</Link>
                    {r.lead.wealthBand && r.lead.wealthBand !== 'unknown' && (
                      <p className="text-[10px] text-gold mt-0.5">{r.lead.wealthBand.replace(/_/g, '–')}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-1">
                      {r.flags.map(f => (
                        <div key={f.kind} className="flex items-start gap-1.5">
                          <span className={`text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border shrink-0 mt-px ${FLAG_META[f.kind].cls}`}>{FLAG_META[f.kind].label}</span>
                          <span className="text-[10px] text-text-muted leading-relaxed">{f.reason}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs font-mono text-text-secondary">{r.lead.priority}</td>
                  <td className="px-3 py-2.5 text-center text-xs font-mono"><span className={r.lead.confidence < 40 ? 'text-amber-400' : 'text-text-secondary'}>{r.lead.confidence}</span></td>
                  <td className="px-3 py-2.5 text-center text-sm font-mono text-text-primary">{r.uncertainty}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Link href={`/crm/entity/${r.lead.id}`} className="text-[11px] text-text-muted hover:text-gold transition-colors whitespace-nowrap">Open dossier →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length > limit && (
            <div className="px-3 py-3 border-t border-border-subtle">
              <button onClick={() => setLimit(limit + 60)} className="text-xs px-3 py-1.5 rounded-md bg-mid-charcoal text-text-secondary hover:text-text-primary transition-colors">
                Show more ({visible.length - limit} remaining)
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted text-sm border border-border-subtle rounded-lg">
          Nothing needs review — no duplicate-risk, trust-gap, single-source, or unverified high-value leads.
        </div>
      )}
    </div>
  );
}
