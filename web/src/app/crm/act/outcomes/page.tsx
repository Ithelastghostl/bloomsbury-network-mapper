import { getAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

/**
 * Outcome reporting: conversion by ranking method, supporter, category,
 * wealth band, and hops. Reads the action items (frozen Decide snapshots)
 * plus intro_outcomes. This is the feedback loop for tuning scoring weights
 * on evidence rather than intuition.
 */

interface ActionRow {
  id: string;
  name: string;
  status: string;
  method: string;
  supporter: string;
  institution: string;
  category: string;
  band: string;
  hops: string;
}

const TERMINAL = new Set(['won', 'lost']);
const PROGRESSED = new Set(['contacted', 'won', 'lost']);

function aggregate(rows: ActionRow[], key: (r: ActionRow) => string) {
  const m = new Map<string, { total: number; progressed: number; won: number; lost: number }>();
  for (const r of rows) {
    const k = key(r);
    const cur = m.get(k) ?? { total: 0, progressed: 0, won: 0, lost: 0 };
    cur.total++;
    if (PROGRESSED.has(r.status)) cur.progressed++;
    if (r.status === 'won') cur.won++;
    if (r.status === 'lost') cur.lost++;
    m.set(k, cur);
  }
  return [...m.entries()]
    .map(([k, v]) => ({ key: k, ...v, conversion: v.won + v.lost > 0 ? v.won / (v.won + v.lost) : null }))
    .sort((a, b) => b.total - a.total);
}

function RateTable({ title, rows }: { title: string; rows: ReturnType<typeof aggregate> }) {
  return (
    <div className="bg-deep-charcoal border border-border-subtle rounded-lg p-4">
      <h3 className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-3">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle">
            <th className="text-left py-1.5 text-[10px] font-semibold tracking-wider uppercase text-text-muted">Segment</th>
            <th className="text-center py-1.5 text-[10px] font-semibold tracking-wider uppercase text-text-muted">Sent</th>
            <th className="text-center py-1.5 text-[10px] font-semibold tracking-wider uppercase text-text-muted">Contacted+</th>
            <th className="text-center py-1.5 text-[10px] font-semibold tracking-wider uppercase text-text-muted">Won</th>
            <th className="text-center py-1.5 text-[10px] font-semibold tracking-wider uppercase text-text-muted">Lost</th>
            <th className="text-center py-1.5 text-[10px] font-semibold tracking-wider uppercase text-text-muted">Conversion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map(r => (
            <tr key={r.key}>
              <td className="py-1.5 text-xs text-text-secondary">{r.key}</td>
              <td className="py-1.5 text-center text-xs font-mono text-text-secondary">{r.total}</td>
              <td className="py-1.5 text-center text-xs font-mono text-text-secondary">{r.progressed}</td>
              <td className="py-1.5 text-center text-xs font-mono text-green-400">{r.won}</td>
              <td className="py-1.5 text-center text-xs font-mono text-red-400">{r.lost}</td>
              <td className="py-1.5 text-center text-xs font-mono text-gold">
                {r.conversion != null ? `${Math.round(r.conversion * 100)}%` : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-4 text-center text-xs text-text-muted">No data yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function OutcomesPage() {
  const supabase = getAdminClient();

  const all: Array<{ canonical_entity_id: string; display_name: string; attributes: Record<string, unknown> }> = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase.from('canonical_entities').select('canonical_entity_id, display_name, attributes').eq('entity_type', 'person').range(offset, offset + 999);
    if (!data?.length) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    all.push(...(data as any[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  const { data: outcomes } = await supabase
    .from('intro_outcomes')
    .select('intro_outcome_id, entity_id, intro_status, converted, recorded_by, recorded_at')
    .not('entity_id', 'is', null)
    .order('recorded_at', { ascending: false })
    .limit(200);

  const rows: ActionRow[] = all
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter(p => (p.attributes as any)?.action_item)
    .map(p => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ai = (p.attributes as any).action_item;
      const viaOrgs = Array.isArray(ai.via_orgs) ? ai.via_orgs : [];
      return {
        id: p.canonical_entity_id,
        name: p.display_name,
        status: ai.status as string,
        method: (ai.ranking_method as string) ?? 'composite',
        supporter: (ai.root_supporter as string) ?? 'No supporter route',
        institution: (typeof viaOrgs[0] === 'string' && viaOrgs[0]) || 'No institution',
        category: ((ai.lead_category as string) ?? 'unknown').replace(/_/g, ' '),
        band: (ai.wealth_band as string)?.replace(/_/g, '–') ?? 'unknown',
        hops: ai.hops != null ? `${ai.hops}-hop` : 'no path',
      };
    });

  const terminal = rows.filter(r => TERMINAL.has(r.status)).length;
  const nameOf = new Map(all.map(p => [p.canonical_entity_id, p.display_name]));

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Outcomes</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          Conversion by ranking method, introducer, institution, category, wealth band, and hops. {rows.length} actions,
          {' '}{terminal} with a terminal outcome. As outcomes accumulate, these tables show which scoring
          dimensions, introducers, and channels actually convert — the evidence for tuning weights.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RateTable title="By ranking method" rows={aggregate(rows, r => r.method)} />
        <RateTable title="By hops" rows={aggregate(rows, r => r.hops)} />
        <RateTable title="By category" rows={aggregate(rows, r => r.category)} />
        <RateTable title="By wealth band" rows={aggregate(rows, r => r.band)} />
        <div className="lg:col-span-2">
          <RateTable title="By introducer (root supporter)" rows={aggregate(rows, r => r.supporter).slice(0, 25)} />
        </div>
        <div className="lg:col-span-2">
          <RateTable title="By institution (channel)" rows={aggregate(rows, r => r.institution).slice(0, 25)} />
        </div>
      </div>

      <div className="mt-4 bg-deep-charcoal border border-border-subtle rounded-lg p-4">
        <h3 className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-3">Recorded outcome events ({outcomes?.length ?? 0})</h3>
        {(outcomes ?? []).length > 0 ? (
          <div className="divide-y divide-border-subtle">
            {(outcomes ?? []).map((o: { intro_outcome_id: string; entity_id: string; intro_status: string; converted: boolean | null; recorded_by: string; recorded_at: string }) => (
              <div key={o.intro_outcome_id} className="flex items-center gap-3 py-1.5 text-xs">
                <span className={`font-semibold uppercase text-[9px] tracking-wider px-1.5 py-0.5 rounded ${o.intro_status === 'won' ? 'bg-green-500/10 text-green-400' : o.intro_status === 'lost' ? 'bg-red-500/10 text-red-400' : 'bg-teal-500/10 text-teal-400'}`}>{o.intro_status}</span>
                <Link href={`/crm/entity/${o.entity_id}`} className="text-text-primary hover:text-gold transition-colors">{nameOf.get(o.entity_id) ?? o.entity_id}</Link>
                <span className="text-text-muted ml-auto font-mono">{o.recorded_at.slice(0, 10)} · {o.recorded_by}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No outcome events yet — they are recorded automatically when an action reaches contacted, won, or lost.</p>
        )}
      </div>
    </div>
  );
}
