'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface FeedItem {
  type: string;
  at: string;
  title: string;
  detail: string | null;
  entity_id: string | null;
}

const TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  wealth: { label: 'Wealth', cls: 'text-gold bg-gold/10 border-gold/20' },
  connection: { label: 'Connection', cls: 'text-teal-400 bg-teal-400/10 border-teal-400/20' },
  co_director: { label: 'Co-director', cls: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  evidence: { label: 'Evidence', cls: 'text-text-secondary bg-mid-charcoal border-border-subtle' },
  promotion: { label: 'Promoted', cls: 'text-green-400 bg-green-400/10 border-green-400/20' },
  analyst: { label: 'Analyst', cls: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
};

export function WhatsNewFeed() {
  const [days, setDays] = useState(7);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setItems(null);
      try {
        const res = await fetch(`/api/crm/whats-new?days=${days}`);
        const json = await res.json();
        if (!cancelled) setItems(json.items ?? []);
      } catch {
        if (!cancelled) setItems([]);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [days]);

  const visible = (items ?? []).filter(i => typeFilter === 'all' || i.type === typeFilter);
  const typeCounts = (items ?? []).reduce<Record<string, number>>((acc, i) => { acc[i.type] = (acc[i.type] ?? 0) + 1; return acc; }, {});

  // Group by calendar day for scannability.
  const byDay = new Map<string, FeedItem[]>();
  for (const i of visible) {
    const day = i.at.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(i);
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">What&apos;s New</h2>
        <p className="text-sm text-text-muted mt-0.5">
          Everything the pipeline and analysts changed in the last {days} days — new connections,
          wealth estimates, evidence, promotions, and human decisions.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/50">
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button onClick={() => setTypeFilter('all')} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${typeFilter === 'all' ? 'bg-gold/10 text-gold border-gold/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          All ({items?.length ?? '…'})
        </button>
        {Object.entries(TYPE_STYLE).map(([t, s]) => typeCounts[t] ? (
          <button key={t} onClick={() => setTypeFilter(t)} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${typeFilter === t ? s.cls : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
            {s.label} ({typeCounts[t]})
          </button>
        ) : null)}
      </div>

      {items === null ? (
        <div className="text-center py-12 text-text-muted text-sm border border-border-subtle rounded-lg">Loading feed…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm border border-border-subtle rounded-lg">
          Nothing new in this window. Run augmentation or widen the time range.
        </div>
      ) : (
        <div className="space-y-5">
          {[...byDay.entries()].map(([day, dayItems]) => (
            <div key={day}>
              <p className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-2">{day} · {dayItems.length} changes</p>
              <div className="border border-border-subtle rounded-lg divide-y divide-border-subtle">
                {dayItems.map((i, idx) => {
                  const style = TYPE_STYLE[i.type] ?? TYPE_STYLE.evidence;
                  return (
                    <div key={`${i.type}:${i.entity_id ?? ''}:${i.at}:${idx}`} className="flex items-center gap-3 px-3 py-2 hover:bg-deep-charcoal/60 transition-colors">
                      <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${style.cls}`}>{style.label}</span>
                      <div className="min-w-0">
                        {i.entity_id ? (
                          <Link href={`/crm/entity/${i.entity_id}`} className="text-[13px] text-text-primary hover:text-gold transition-colors">{i.title}</Link>
                        ) : (
                          <span className="text-[13px] text-text-primary">{i.title}</span>
                        )}
                        {i.detail && <p className="text-[11px] text-text-muted truncate">{i.detail}</p>}
                      </div>
                      <span className="text-[10px] text-text-muted font-mono ml-auto shrink-0">{i.at.slice(11, 16)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
