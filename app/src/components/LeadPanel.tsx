import { useState } from 'react';
import type { Lead, OutreachStage } from '../data/mockLeads';
import { STAGES } from '../data/mockLeads';
import { ScoreBadge } from './ScoreBadge';
import { ProvenanceTag } from './ProvenanceTag';
import './LeadPanel.css';

interface Props {
  lead: Lead | null;
  onStageChange: (id: string, stage: OutreachStage) => void;
}

export function LeadPanel({ lead, onStageChange }: Props) {
  const [draft, setDraft] = useState('');

  if (!lead) {
    return (
      <div className="lead-panel lead-panel--empty">
        <p className="lead-panel__empty-hint">Select a lead to review</p>
      </div>
    );
  }

  const currentDraft = draft || lead.introDraft;

  return (
    <div className="lead-panel" key={lead.id}>
      {/* Header */}
      <div className="lead-panel__header">
        <div className="lead-panel__identity">
          <h2 className="lead-panel__name">{lead.name}</h2>
          <p className="lead-panel__role">{lead.title}, {lead.organisation}</p>
        </div>
        <div className="lead-panel__header-actions">
          <label className="lead-panel__stage-label" htmlFor="stage-select">Stage</label>
          <select
            id="stage-select"
            className="lead-panel__stage-select"
            value={lead.stage}
            onChange={e => onStageChange(lead.id, e.target.value as OutreachStage)}
          >
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Score section */}
      <section className="lead-panel__section">
        <h3 className="lead-panel__section-title">Score</h3>
        <div className="lead-panel__score-row">
          <ScoreBadge score={lead.score} tier={lead.tier} size="lg" />
          <span className="lead-panel__connection">
            {lead.connectionPath} {lead.connectionVia}
          </span>
        </div>
        <ul className="lead-panel__reasons">
          {lead.scoreReasons.map((reason, i) => (
            <li key={i} className="lead-panel__reason">
              <span className="lead-panel__reason-label">{reason.label}:</span>
              <span className="lead-panel__reason-detail"> {reason.detail}</span>
              {reason.source && (
                <span className="lead-panel__reason-source">
                  {' '}<ProvenanceTag source={reason.source} date={reason.sourceDate!} />
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="lead-panel__divider" />

      {/* Enriched fields */}
      <section className="lead-panel__section">
        <h3 className="lead-panel__section-title">Record</h3>
        <dl className="lead-panel__fields">
          {lead.enrichedFields.knownDonations && (
            <div className="lead-panel__field">
              <dt>Known donations</dt>
              <dd>
                {lead.enrichedFields.knownDonations.value}
                <ProvenanceTag
                  source={lead.enrichedFields.knownDonations.source}
                  date={lead.enrichedFields.knownDonations.date}
                />
              </dd>
            </div>
          )}
          {lead.enrichedFields.netWorthEstimate && (
            <div className="lead-panel__field">
              <dt>Net worth estimate</dt>
              <dd>
                {lead.enrichedFields.netWorthEstimate.value}
                <ProvenanceTag
                  source={lead.enrichedFields.netWorthEstimate.source}
                  date={lead.enrichedFields.netWorthEstimate.date}
                />
              </dd>
            </div>
          )}
          {lead.enrichedFields.boardRoles && (
            <div className="lead-panel__field">
              <dt>Board roles</dt>
              <dd>
                {lead.enrichedFields.boardRoles.value}
                <ProvenanceTag
                  source={lead.enrichedFields.boardRoles.source}
                  date={lead.enrichedFields.boardRoles.date}
                />
              </dd>
            </div>
          )}
          {lead.enrichedFields.philanthropicFocus && (
            <div className="lead-panel__field">
              <dt>Philanthropic focus</dt>
              <dd>
                {lead.enrichedFields.philanthropicFocus.value}
                <ProvenanceTag
                  source={lead.enrichedFields.philanthropicFocus.source}
                  date={lead.enrichedFields.philanthropicFocus.date}
                />
              </dd>
            </div>
          )}
        </dl>
      </section>

      <div className="lead-panel__divider" />

      {/* Intro draft */}
      <section className="lead-panel__section lead-panel__section--draft">
        <h3 className="lead-panel__section-title">
          Introduction
          <span className="lead-panel__section-subtitle"> via {lead.introducingSponsor}</span>
        </h3>
        {currentDraft ? (
          <textarea
            className="lead-panel__draft"
            value={currentDraft}
            onChange={e => setDraft(e.target.value)}
            rows={8}
            placeholder="Draft an introduction note"
          />
        ) : (
          <div className="lead-panel__draft-empty">
            <p>No draft yet.</p>
            <button
              className="lead-panel__draft-start"
              onClick={() => setDraft(`Dear ${lead.name.split(' ')[0]},\n\n`)}
            >
              Start draft
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
