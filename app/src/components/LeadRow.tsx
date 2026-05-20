import type { Lead } from '../data/mockLeads';
import { ScoreBadge } from './ScoreBadge';
import './LeadRow.css';

interface Props {
  lead: Lead;
  isSelected: boolean;
  onClick: () => void;
}

export function LeadRow({ lead, isSelected, onClick }: Props) {
  return (
    <button
      className={`lead-row${isSelected ? ' lead-row--selected' : ''}`}
      onClick={onClick}
      aria-pressed={isSelected}
    >
      <ScoreBadge score={lead.score} tier={lead.tier} />

      <div className="lead-row__identity">
        <span className="lead-row__name">{lead.name}</span>
        <span className="lead-row__meta">
          {lead.title}
          {lead.organisation && <>, {lead.organisation}</>}
        </span>
      </div>

      <div className="lead-row__signals">
        {lead.triggerSignal && (
          <span className="lead-row__trigger">{lead.triggerSignal}</span>
        )}
        <span className="lead-row__connection">
          {lead.connectionPath} {lead.connectionVia}
        </span>
        <span className="lead-row__sponsor">
          via {lead.introducingSponsor}
        </span>
      </div>

      <span className={`lead-row__stage lead-row__stage--${lead.stage.toLowerCase()}`}>
        {lead.stage}
      </span>
    </button>
  );
}
