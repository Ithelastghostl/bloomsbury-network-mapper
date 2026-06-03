'use client';

export function ScoreBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 75 ? 'bg-gold' : pct >= 50 ? 'bg-status-info' : 'bg-text-muted';

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-text-muted tracking-wide">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-mid-charcoal overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs text-text-secondary font-mono">{pct}%</span>
    </div>
  );
}
