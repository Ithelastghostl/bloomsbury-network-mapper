import type { EnrichedEntity, WealthBand } from '@/lib/crm/types';
import { WEALTH_BAND_LABELS, WEALTH_BAND_ORDER } from '@/lib/crm/types';

function formatGbp(value: number): string {
  if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(1)}bn`;
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(0)}m`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(0)}k`;
  return `£${value}`;
}

const BAND_BAR: Record<WealthBand, string> = {
  '100m_plus': 'bg-gold',
  '25m_100m': 'bg-gold-light',
  '5m_25m': 'bg-status-info',
  '1m_5m': 'bg-text-muted',
  unknown: 'bg-border-mid',
};

/**
 * Portfolio summary — total/average estimated net worth across a set of
 * entities plus the wealth-band distribution and the best-connected people.
 * A higher-altitude view than the per-row table.
 */
export function PortfolioSummary({ entities }: { entities: EnrichedEntity[] }) {
  const withWorth = entities.filter(e => typeof e.wealth?.estimated_net_worth_gbp === 'number');
  const total = withWorth.reduce((s, e) => s + (e.wealth!.estimated_net_worth_gbp ?? 0), 0);
  const avg = withWorth.length ? total / withWorth.length : 0;

  const bands: Record<WealthBand, number> = { unknown: 0, '1m_5m': 0, '5m_25m': 0, '25m_100m': 0, '100m_plus': 0 };
  for (const e of entities) {
    const b = e.wealth?.band;
    if (b && b in bands) bands[b]++;
  }
  const bandTotal = Object.values(bands).reduce((a, b) => a + b, 0) || 1;

  const topConnectors = [...entities]
    .sort((a, b) => b.connections.length - a.connections.length)
    .slice(0, 5)
    .filter(e => e.connections.length > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <div className="bg-surface-raised border border-border-subtle rounded-lg p-5">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-2">Combined estimated wealth</p>
        <p className="text-3xl font-semibold text-gold tabular-nums">{formatGbp(total)}</p>
        <p className="text-xs text-text-muted mt-1">
          across {withWorth.length} profiled · avg {formatGbp(avg)}
        </p>
      </div>

      <div className="bg-surface-raised border border-border-subtle rounded-lg p-5">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-3">Wealth bands</p>
        <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
          {WEALTH_BAND_ORDER.map(band => bands[band] > 0 && (
            <div
              key={band}
              className={BAND_BAR[band]}
              style={{ width: `${(bands[band] / bandTotal) * 100}%` }}
              title={`${WEALTH_BAND_LABELS[band]}: ${bands[band]}`}
            />
          ))}
        </div>
        <div className="space-y-1">
          {WEALTH_BAND_ORDER.filter(b => bands[b] > 0).map(band => (
            <div key={band} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className={`w-2 h-2 rounded-sm ${BAND_BAR[band]}`} />
                {WEALTH_BAND_LABELS[band]}
              </span>
              <span className="text-text-muted tabular-nums">{bands[band]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface-raised border border-border-subtle rounded-lg p-5">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-3">Best connected</p>
        {topConnectors.length > 0 ? (
          <div className="space-y-1.5">
            {topConnectors.map(e => (
              <div key={e.canonical_entity_id} className="flex items-center justify-between text-sm">
                <span className="text-text-primary truncate">{e.display_name}</span>
                <span className="text-xs text-text-muted tabular-nums shrink-0 ml-2">{e.connections.length} links</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No connections mapped yet.</p>
        )}
      </div>
    </div>
  );
}
