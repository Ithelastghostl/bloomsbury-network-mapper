/**
 * Design B — "The Briefing"
 *
 * Shell:     White top nav + full-width content
 * Pipeline:  Kanban columns by outreach stage, expandable lead cards
 * Sponsors:  Portrait cards with capacity gauge and enrichment status
 * Network:   Horizontal event timeline per sponsor
 * Triggers:  Alert ticker banner + expandable signal cards
 */
import { useState } from 'react';
import { MOCK_LEADS, MOCK_SPONSORS } from '../../data';
import type { OutreachStage } from '../../data/mockLeads';
import { STAGES } from '../../data/mockLeads';
import { ScoreBadge } from '../../components/ScoreBadge';
import { ProvenanceTag } from '../../components/ProvenanceTag';
import './DesignB.css';

type View = 'Pipeline' | 'Sponsors' | 'Network' | 'Triggers';

export function DesignB() {
  const [view, setView] = useState<View>('Pipeline');
  const [leads, setLeads] = useState(MOCK_LEADS);
  const [sponsors, setSponsors] = useState(MOCK_SPONSORS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<Record<string, string[]>>({});

  const triggerLeads = leads.filter(l => l.triggerSignal);

  function handleStage(id: string, stage: OutreachStage) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l));
  }

  function runEnrich(sid: string) {
    const steps = [
      'Resolving Companies House records…',
      'Querying Charity Commission…',
      'Scanning public press sources…',
      'Indexing network contacts…',
      'Scoring candidates…',
      'Complete.',
    ];
    setSponsors(prev => prev.map(s => s.id === sid ? { ...s, enrichmentStatus: 'running' as const, enrichmentProgress: 0 } : s));
    setLogLines(prev => ({ ...prev, [sid]: [] }));
    steps.forEach((line, i) => {
      setTimeout(() => {
        setLogLines(prev => ({ ...prev, [sid]: [...(prev[sid] ?? []), line] }));
        const pct = Math.round(((i + 1) / steps.length) * 100);
        setSponsors(prev => prev.map(s => s.id === sid
          ? { ...s, enrichmentProgress: pct, enrichmentStatus: pct === 100 ? 'complete' as const : 'running' as const, lastEnriched: pct === 100 ? '05 May 2025' : s.lastEnriched }
          : s));
      }, i * 600);
    });
  }

  return (
    <div className="db-shell">
      {/* Top Nav */}
      <header className="db-topnav">
        <div className="db-logo">
          <div className="db-logo-mark">B</div>
          <div>
            <div className="db-logo-name">Bloomsbury</div>
            <div className="db-logo-sub">Network Mapper</div>
          </div>
        </div>
        <nav className="db-nav">
          {(['Pipeline', 'Sponsors', 'Network', 'Triggers'] as View[]).map(v => (
            <button
              key={v}
              className={`db-nav-item${view === v ? ' db-nav-item--active' : ''}`}
              onClick={() => setView(v)}
            >
              {v}
              {v === 'Triggers' && triggerLeads.length > 0 && (
                <span className="db-nav-badge">{triggerLeads.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="db-topnav-meta">
          <span>{leads.length} leads</span>
          <span className="db-topnav-dot" />
          <span>{leads.filter(l => l.tier === 'High').length} high priority</span>
        </div>
        <button className="db-add-btn">+ Add sponsor</button>
      </header>

      <div className="db-body">

        {/* ── PIPELINE (Kanban) ── */}
        {view === 'Pipeline' && (
          <div className="db-kanban">
            {STAGES.map(stage => {
              const col = leads.filter(l => l.stage === stage);
              return (
                <div key={stage} className="db-col">
                  <div className="db-col-header">
                    <span className={`db-col-dot db-col-dot--${stage.toLowerCase()}`} />
                    <span className="db-col-title">{stage}</span>
                    <span className="db-col-count">{col.length}</span>
                  </div>
                  <div className="db-col-scroll">
                    {col.map(lead => (
                      <div
                        key={lead.id}
                        className={`db-card${lead.triggerSignal ? ' db-card--triggered' : ''}${selectedId === lead.id ? ' db-card--open' : ''}`}
                        onClick={() => setSelectedId(selectedId === lead.id ? null : lead.id)}
                      >
                        <div className="db-card-top">
                          <ScoreBadge score={lead.score} tier={lead.tier} />
                          <div>
                            <div className="db-card-name">{lead.name}</div>
                            <div className="db-card-org">{lead.organisation}</div>
                          </div>
                        </div>
                        {lead.triggerSignal && (
                          <div className="db-card-signal">{lead.triggerSignal}</div>
                        )}
                        <div className="db-card-meta">
                          <span>{lead.connectionPath}</span>
                          <span className="db-card-via">via {lead.introducingSponsor}</span>
                        </div>

                        {selectedId === lead.id && (
                          <div className="db-card-detail" onClick={e => e.stopPropagation()}>
                            <div className="db-card-detail-sep" />
                            <div className="db-card-detail-label">Score reasons</div>
                            <ul className="db-card-reasons">
                              {lead.scoreReasons.map((r, i) => (
                                <li key={i}><strong>{r.label}:</strong> {r.detail}</li>
                              ))}
                            </ul>
                            <div className="db-card-detail-label" style={{ marginTop: 10 }}>Move stage</div>
                            <select
                              className="db-select"
                              value={lead.stage}
                              onChange={e => handleStage(lead.id, e.target.value as OutreachStage)}
                            >
                              {STAGES.map(s => <option key={s}>{s}</option>)}
                            </select>
                            {lead.introDraft && (
                              <>
                                <div className="db-card-detail-label" style={{ marginTop: 10 }}>Draft introduction</div>
                                <textarea className="db-card-draft" defaultValue={lead.introDraft} rows={5} />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {col.length === 0 && <div className="db-col-empty">—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SPONSORS (Portrait cards) ── */}
        {view === 'Sponsors' && (
          <div className="db-sponsors-view">
            <div className="db-sponsor-grid">
              {sponsors.map(s => {
                const leadsCount = leads.filter(l => l.introducingSponsor === s.name).length;
                return (
                  <div key={s.id} className="db-sponsor-card">
                    <div className="db-sponsor-avatar">
                      {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="db-sponsor-name">{s.name}</div>
                    <div className="db-sponsor-title">{s.title}</div>
                    <div className="db-sponsor-org">{s.organisation}</div>
                    <div className="db-sponsor-divider" />
                    <div className="db-sponsor-row">
                      <span className="db-sponsor-label">Since</span>
                      <span>{s.relationshipStart}</span>
                    </div>
                    <div className="db-sponsor-row">
                      <span className="db-sponsor-label">Capacity</span>
                      <span>{s.estimatedCapacity ?? '—'}</span>
                    </div>
                    <div className="db-sponsor-row">
                      <span className="db-sponsor-label">Focus</span>
                      <span className="db-sponsor-focus">{s.philanthropicFocus ?? '—'}</span>
                    </div>
                    <div className="db-sponsor-gauge-label">{leadsCount} leads introduced</div>
                    <div className="db-sponsor-gauge">
                      <div className="db-sponsor-gauge-fill" style={{ width: `${Math.min(100, (leadsCount / 4) * 100)}%` }} />
                    </div>
                    <div className="db-sponsor-divider" />
                    <div className="db-sponsor-enrich-row">
                      <span className={`db-enrich-dot db-enrich-dot--${s.enrichmentStatus}`} />
                      <span className="db-sponsor-label">
                        {s.enrichmentStatus === 'complete' ? `Enriched ${s.lastEnriched}`
                          : s.enrichmentStatus === 'running' ? `Running… ${s.enrichmentProgress ?? 0}%`
                          : 'Not enriched'}
                      </span>
                    </div>
                    {s.enrichmentStatus === 'running' && (
                      <div className="db-progress"><div className="db-progress-bar" style={{ width: `${s.enrichmentProgress ?? 0}%` }} /></div>
                    )}
                    <button
                      className="db-enrich-btn"
                      onClick={() => { setView('Network'); runEnrich(s.id); }}
                      disabled={s.enrichmentStatus === 'running'}
                    >
                      {s.enrichmentStatus === 'running' ? 'Running…' : s.enrichmentStatus === 'complete' ? 'Re-run enrichment' : 'Run enrichment'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── NETWORK (Horizontal timeline) ── */}
        {view === 'Network' && (
          <div className="db-network-view">
            <p className="db-network-intro">
              Each sponsor's public network is mapped via Companies House, Charity Commission, and press — contacts scored as donor candidates and surfaced to your pipeline.
            </p>
            {sponsors.map(s => (
              <div key={s.id} className="db-timeline-block">
                <div className="db-timeline-header">
                  <div className="db-timeline-avatar">
                    {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="db-timeline-ident">
                    <div className="db-timeline-name">{s.name}</div>
                    <div className="db-timeline-org">{s.organisation}</div>
                  </div>
                  <div className="db-timeline-actions">
                    <span className={`db-enrich-dot db-enrich-dot--${s.enrichmentStatus}`} />
                    <button
                      className="db-run-btn"
                      onClick={() => runEnrich(s.id)}
                      disabled={s.enrichmentStatus === 'running'}
                    >
                      {s.enrichmentStatus === 'running' ? 'Running…' : s.enrichmentStatus === 'complete' ? 'Re-run' : 'Run'}
                    </button>
                  </div>
                </div>
                {s.enrichmentStatus === 'running' && (
                  <div className="db-progress"><div className="db-progress-bar" style={{ width: `${s.enrichmentProgress ?? 0}%` }} /></div>
                )}
                <div className="db-timeline-track">
                  {(logLines[s.id] ?? (s.enrichmentStatus === 'complete'
                    ? ['Resolved Companies House.', 'Queried Charity Commission.', 'Scanned press sources.', 'Indexed contacts.', 'Scored candidates.', 'Complete.']
                    : [])).map((line, i, arr) => (
                    <div key={i} className="db-timeline-event">
                      <div className={`db-timeline-node${i === arr.length - 1 && s.enrichmentStatus === 'running' ? ' db-timeline-node--pulse' : ''}${line === 'Complete.' ? ' db-timeline-node--done' : ''}`} />
                      <div className="db-timeline-text">{line}</div>
                    </div>
                  ))}
                  {s.enrichmentStatus === 'idle' && !logLines[s.id] && (
                    <div className="db-timeline-empty">No enrichment run yet</div>
                  )}
                </div>
                {(s.enrichmentStatus === 'complete' || (logLines[s.id]?.length ?? 0) > 0) && (
                  <div className="db-timeline-footer">
                    <span>{s.leadsGenerated} leads surfaced</span>
                    {s.lastEnriched && <ProvenanceTag source="Last run" date={s.lastEnriched} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── TRIGGERS (Ticker + signal cards) ── */}
        {view === 'Triggers' && (
          <div className="db-triggers-view">
            {triggerLeads.length > 0 && (
              <div className="db-ticker">
                <span className="db-ticker-label">SIGNALS</span>
                <div className="db-ticker-items">
                  {triggerLeads.map((l, i) => (
                    <span key={l.id} className="db-ticker-item">
                      {i > 0 && <span className="db-ticker-sep">·</span>}
                      <strong>{l.name}</strong> — {l.triggerSignal}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="db-signals-grid">
              {triggerLeads.map(lead => (
                <div key={lead.id} className="db-signal-card">
                  <div className="db-signal-top">
                    <ScoreBadge score={lead.score} tier={lead.tier} />
                    <div>
                      <div className="db-signal-name">{lead.name}</div>
                      <div className="db-signal-role">{lead.title}, {lead.organisation}</div>
                    </div>
                  </div>
                  <div className="db-signal-alert">{lead.triggerSignal}</div>
                  <div className="db-signal-meta">
                    <span>{lead.connectionPath}</span>
                    <span>{lead.connectionVia}</span>
                    <span className={`db-signal-stage db-signal-stage--${lead.stage.toLowerCase()}`}>{lead.stage}</span>
                  </div>
                  <div className="db-signal-reasons">
                    {lead.scoreReasons.slice(0, 2).map((r, i) => (
                      <div key={i} className="db-signal-reason">
                        <span className="db-signal-reason-label">{r.label}:</span> {r.detail}
                      </div>
                    ))}
                  </div>
                  <div className="db-signal-actions">
                    <select
                      className="db-select"
                      value={lead.stage}
                      onChange={e => handleStage(lead.id, e.target.value as OutreachStage)}
                    >
                      {STAGES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              {triggerLeads.length === 0 && (
                <div className="db-triggers-empty">No active trigger signals</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
