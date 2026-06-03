'use client';

const STATE_STYLES: Record<string, string> = {
  'Discovered': 'bg-text-muted/20 text-text-muted',
  'Enriched': 'bg-status-info/20 text-status-info',
  'Ready for Review': 'bg-status-warning/20 text-status-warning',
  'In Review': 'bg-gold/20 text-gold',
  'Qualified': 'bg-status-active/20 text-status-active',
  'Intro Requested': 'bg-gold-light/20 text-gold-light',
  'Intro Made': 'bg-gold/20 text-gold',
  'Meeting': 'bg-status-active/20 text-status-active',
  'Opportunity': 'bg-status-active/30 text-status-active',
  'Converted': 'bg-status-active/40 text-status-active',
  'Rejected': 'bg-status-danger/20 text-status-danger',
};

export function StatusBadge({ state }: { state: string }) {
  const style = STATE_STYLES[state] ?? STATE_STYLES['Discovered'];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide ${style}`}>
      {state}
    </span>
  );
}
