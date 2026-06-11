'use client';

import type { EntitySignals, SignalCategory } from '@/lib/crm/signals';
import { SIGNAL_CATEGORY_LABEL } from '@/lib/crm/signals';

/** Compact category-coloured chip set summarising an entity's enrichment signals. */
const CAT_CLS: Record<string, string> = {
  directorship: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  co_director: 'text-blue-300 bg-blue-300/10 border-blue-300/20',
  philanthropy: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
  property: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  rich_list: 'text-gold bg-gold/10 border-gold/20',
  fund_management: 'text-green-400 bg-green-400/10 border-green-400/20',
  political: 'text-red-400 bg-red-400/10 border-red-400/20',
  charity: 'text-teal-300 bg-teal-300/10 border-teal-300/20',
  news: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  web: 'text-text-secondary bg-mid-charcoal border-border-subtle',
  other: 'text-text-muted bg-mid-charcoal border-border-subtle',
};

const SHORT: Record<string, string> = {
  directorship: 'Dir', co_director: 'Co-dir', philanthropy: 'Phil', property: 'Prop',
  rich_list: 'Press', fund_management: 'Fund', political: 'Pol', charity: 'Charity',
  news: 'News', web: 'Web', other: 'Other',
};

export function SignalChips({ signals, max = 5 }: { signals: EntitySignals | undefined; max?: number }) {
  if (!signals || !signals.signals.length) return <span className="text-[10px] text-text-muted">—</span>;
  const cats = Object.entries(signals.byCategory).sort((a, b) => b[1] - a[1]) as [SignalCategory, number][];
  const shown = cats.slice(0, max);
  const hidden = cats.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map(([cat, n]) => (
        <span key={cat} title={`${SIGNAL_CATEGORY_LABEL[cat]}: ${n}`} className={`text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border ${CAT_CLS[cat] ?? CAT_CLS.other}`}>
          {SHORT[cat] ?? cat} {n}
        </span>
      ))}
      {hidden > 0 && <span className="text-[8px] text-text-muted">+{hidden}</span>}
      {signals.multiSource && <span title="Backed by multiple independent sources" className="text-[8px] text-green-400">✓ multi-source</span>}
    </div>
  );
}

/** Full signal list grouped by category with source links — for expanded rows and the dossier. */
export function SignalList({ signals }: { signals: EntitySignals | undefined }) {
  if (!signals || !signals.signals.length) {
    return <p className="text-[10px] text-text-muted">No enrichment signals collected yet — run augmentation.</p>;
  }
  const grouped = new Map<SignalCategory, typeof signals.signals>();
  for (const s of signals.signals) {
    if (!grouped.has(s.category)) grouped.set(s.category, []);
    grouped.get(s.category)!.push(s);
  }
  const order = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <div className="space-y-2">
      {order.map(([cat, list]) => (
        <div key={cat}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-0.5">
            {SIGNAL_CATEGORY_LABEL[cat]} <span className="text-text-muted">({list.length})</span>
          </p>
          <div className="space-y-0.5">
            {list.slice(0, 8).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px]">
                <span className="text-text-muted shrink-0">·</span>
                <span className="text-text-secondary flex-1">{s.detail || s.label}</span>
                <span className="text-text-muted shrink-0">
                  {s.contribution != null && <span className="font-mono">+{Math.round(s.contribution * 100)}%</span>}
                  {s.confidence != null && <span className="font-mono">{Math.round(s.confidence * 100)}%</span>}
                  <span className="ml-1 opacity-60">{s.sourceLayer}</span>
                  {s.sourceUrl && <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-gold/80 hover:text-gold ml-1">↗</a>}
                </span>
              </div>
            ))}
            {list.length > 8 && <p className="text-[9px] text-text-muted">+{list.length - 8} more</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
