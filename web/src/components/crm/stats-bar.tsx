import type { CrmStats } from '@/lib/crm/types';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">{label}</span>
      <span className="text-lg font-semibold text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

export function StatsBar({ stats }: { stats: CrmStats }) {
  return (
    <div className="flex items-center gap-8 px-6 py-3 bg-deep-charcoal/50">
      <Stat label="Persons" value={stats.total_persons.toLocaleString()} />
      <Stat label="Companies" value={stats.total_companies.toLocaleString()} />
      <Stat label="Wealth Est." value={stats.wealth_estimated.toLocaleString()} />
      <Stat label="Evidence" value={stats.evidence_entries.toLocaleString()} />
      <Stat label="Connections" value={stats.connections.toLocaleString()} />
      <div className="ml-auto flex items-center gap-3">
        {stats.wealth_bands['100m_plus'] > 0 && (
          <span className="text-xs text-gold font-medium">
            {stats.wealth_bands['100m_plus']} at £100M+
          </span>
        )}
      </div>
    </div>
  );
}
