import type { ScoreTier, OutreachStage } from '../data/mockLeads';
import { SPONSORS, STAGES, TIERS } from '../data/mockLeads';
import './FilterBar.css';

export interface Filters {
  tier: ScoreTier | 'All';
  stage: OutreachStage | 'All';
  sponsor: string;
  triggerOnly: boolean;
}

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  totalCount: number;
  filteredCount: number;
}

export function FilterBar({ filters, onChange, totalCount, filteredCount }: Props) {
  const activeCount = [
    filters.tier !== 'All',
    filters.stage !== 'All',
    filters.sponsor !== 'All sponsors',
    filters.triggerOnly,
  ].filter(Boolean).length;

  function reset() {
    onChange({ tier: 'All', stage: 'All', sponsor: 'All sponsors', triggerOnly: false });
  }

  return (
    <div className="filter-bar">
      <div className="filter-bar__controls">
        <label className="filter-bar__control">
          <span className="filter-bar__label">Score</span>
          <select
            value={filters.tier}
            onChange={e => onChange({ ...filters, tier: e.target.value as ScoreTier | 'All' })}
          >
            <option value="All">All tiers</option>
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="filter-bar__control">
          <span className="filter-bar__label">Stage</span>
          <select
            value={filters.stage}
            onChange={e => onChange({ ...filters, stage: e.target.value as OutreachStage | 'All' })}
          >
            <option value="All">All stages</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label className="filter-bar__control">
          <span className="filter-bar__label">Sponsor</span>
          <select
            value={filters.sponsor}
            onChange={e => onChange({ ...filters, sponsor: e.target.value })}
          >
            {SPONSORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label className="filter-bar__toggle">
          <input
            type="checkbox"
            checked={filters.triggerOnly}
            onChange={e => onChange({ ...filters, triggerOnly: e.target.checked })}
          />
          <span>Triggered only</span>
        </label>
      </div>

      <div className="filter-bar__meta">
        <span className="filter-bar__count">
          {filteredCount === totalCount
            ? `${totalCount} leads`
            : `${filteredCount} of ${totalCount}`}
        </span>
        {activeCount > 0 && (
          <button className="filter-bar__reset" onClick={reset}>
            Clear {activeCount} filter{activeCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}
