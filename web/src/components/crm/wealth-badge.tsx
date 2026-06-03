'use client';

import { WEALTH_BAND_LABELS, type WealthBand } from '@/lib/crm/types';

const BAND_STYLES: Record<WealthBand, string> = {
  '100m_plus': 'bg-gold/20 text-gold border-gold/30',
  '25m_100m': 'bg-gold/15 text-gold-light border-gold/20',
  '5m_25m': 'bg-status-info/15 text-status-info border-status-info/20',
  '1m_5m': 'bg-text-muted/15 text-text-secondary border-text-muted/20',
  'unknown': 'bg-mid-charcoal text-text-muted border-border-subtle',
};

export function WealthBadge({ band }: { band: WealthBand }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${BAND_STYLES[band]}`}>
      {WEALTH_BAND_LABELS[band]}
    </span>
  );
}
