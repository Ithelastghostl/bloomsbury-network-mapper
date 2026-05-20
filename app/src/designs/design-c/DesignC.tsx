/**
 * Design C — "The Network"
 *
 * Shell:     Dark canvas background + floating top bar
 * Pipeline:  Radial score map — leads as circles sized by score, grouped by tier
 * Sponsors:  Relationship tree — sponsors as roots, leads as branches
 * Network:   Live expanding node graph showing enrichment progress
 * Triggers:  Pulsing alert nodes overlaid on the pipeline map
 */
import { useState } from 'react';
import { MOCK_LEADS, MOCK_SPONSORS } from '../../data';
import type { OutreachStage } from '../../data/mockLeads';
import { STAGES } from '../../data/mockLeads';
import { ScoreBadge } from '../../components/ScoreBadge';
import { ProvenanceTag } from '../../components/ProvenanceTag';
import './DesignC.css';

type View = 'Pipeline' | 'Sponsors' | 'Network' | 'Triggers';

const TIER_COLORS: Record<string, string> = {
  High: '#b8920f',
  Medium: '#4a90d9',
  Low: '#6b6760',
};

const STAGE_ORDER: Record<string, number> = {
  New: 0, Contacted: 1, Meeting: 2, Donated: 3, Closed: 4,
};

export function DesignC() {
  const [view, setView] = useState<View>('Pipeline');
  const [leads, setLeads] = useState(MOCK_LEADS);
  const [sponsors, setSponsors] = useState(MOCK_SPONSORS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<Record<string, string[]>>({});

  const triggerLeads = leads.filter(l => l.triggerSignal);
  const selected = leads.find(l => l.id === selectedId) ?? null;

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

  // Lay out leads in a grid-based "score map": columns = stage, rows = rank by score
  const sortedLeads = [...leads].sort((a, b) => {
    const sd = STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage];
    return sd !== 0 ? sd : b.score - a.score;
  });

  return (
    <div className="dc-shell">
      {/* Floating top bar */}
      <header className="dc-topbar">
        <div className="dc-brand">
          <span className="dc-brand-dot" />
          <span className="dc-brand-name">Bloomsbury</span>
          <span className="dc-brand-sub">Network Mapper</span>
        </div>
        <nav className="dc-nav">
          {(['Pipeline', 'Sponsors', 'Network', 'Triggers'] as View[]).map(v => (
            <button
              key={v}
              className={`dc-nav-item${view === v ? ' dc-nav-item--active' : ''}`}
              onClick={() => { setView(v); setSelectedId(null); }}
            >
              {v}
              {v === 'Triggers' && triggerLeads.length > 0 && (
                <span className="dc-nav-pill">{triggerLeads.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="dc-topbar-right">
          <span className="dc-stat">{leads.length} leads</span>
          <span className="dc-stat-sep" />
          <span className="dc-stat">{leads.filter(l => l.tier === 'High').length} high</span>
          <button className="dc-add-btn">+ Add</button>
        </div>
      </header>

      <div className="dc-canvas">

        {/* ── PIPELINE (Score map grid) ── */}
        {view === 'Pipeline' && (
          <div className="dc-pipeline-layout">
            {/* Score map */}
            <div className="dc-score-map">
              <div className="dc-stage-headers">
                {STAGES.map(stage => (
                  <div key={stage} className="dc-stage-header">
                    <span className="dc-stage-header-label">{stage}</span>
                    <span className="dc-stage-header-count">
                      {leads.filter(l => l.stage === stage).length}
                    </span>
                  </div>
                ))}
              </div>
              <div className="dc-node-area">
                {STAGES.map(stage => (
                  <div key={stage} className="dc-stage-col">
                    {sortedLeads.filter(l => l.stage === stage).map(lead => {
                      const size = 36 + Math.round((lead.score / 100) * 28);
                      const isSelected = selectedId === lead.id;
                      return (
                        <div
                          key={lead.id}
                          className={`dc-node${isSelected ? ' dc-node--selected' : ''}${lead.triggerSignal ? ' dc-node--trigger' : ''}`}
                          style={{
                            width: size,
                            height: size,
                            background: isSelected ? TIER_COLORS[lead.tier] : 'transparent',
                            borderColor: TIER_COLORS[lead.tier],
                          }}
                          onClick={() => setSelectedId(isSelected ? null : lead.id)}
                          title={lead.name}
                        >
                          <span className="dc-node-score">{lead.score}</span>
                          {lead.triggerSignal && <span className="dc-node-pulse" />}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="dc-legend">
                {(['High', 'Medium', 'Low'] as const).map(t => (
                  <div key={t} className="dc-legend-item">
                    <span className="dc-legend-dot" style={{ background: TIER_COLORS[t] }} />
                    <span>{t}</span>
                  </div>
                ))}
                <span className="dc-legend-sep" />
                <span className="dc-legend-note">Circle size = score. Click to inspect.</span>
              </div>
            </div>

            {/* Detail panel */}
            <div className={`dc-panel${selected ? ' dc-panel--open' : ''}`}>
              {!selected ? (
                <div className="dc-panel-empty">
                  <span>Select a node</span>
                </div>
              ) : (
                <div className="dc-panel-inner">
                  <button className="dc-panel-close" onClick={() => setSelectedId(null)}>✕</button>
                  {selected.triggerSignal && (
                    <div className="dc-panel-signal">{selected.triggerSignal}</div>
                  )}
                  <div className="dc-panel-name">{selected.name}</div>
                  <div className="dc-panel-role">{selected.title}</div>
                  <div className="dc-panel-org">{selected.organisation}</div>

                  <div className="dc-panel-score-row">
                    <ScoreBadge score={selected.score} tier={selected.tier} size="lg" />
                    <div>
                      <div className="dc-panel-path">{selected.connectionPath}</div>
                      <div className="dc-panel-via">{selected.connectionVia}</div>
                    </div>
                  </div>

                  <div className="dc-panel-divider" />
                  <div className="dc-panel-section">Score reasons</div>
                  <ul className="dc-panel-reasons">
                    {selected.scoreReasons.map((r, i) => (
                      <li key={i}>
                        <strong>{r.label}:</strong> {r.detail}
                        {r.source && <> <ProvenanceTag source={r.source} date={r.sourceDate!} /></>}
                      </li>
                    ))}
                  </ul>

                  <div className="dc-panel-divider" />
                  <div className="dc-panel-section">Record</div>
                  <dl className="dc-panel-fields">
                    {selected.enrichedFields.knownDonations && (
                      <><dt>Known donations</dt><dd>{selected.enrichedFields.knownDonations.value} <ProvenanceTag source={selected.enrichedFields.knownDonations.source} date={selected.enrichedFields.knownDonations.date} /></dd></>
                    )}
                    {selected.enrichedFields.netWorthEstimate && (
                      <><dt>Net worth</dt><dd>{selected.enrichedFields.netWorthEstimate.value} <ProvenanceTag source={selected.enrichedFields.netWorthEstimate.source} date={selected.enrichedFields.netWorthEstimate.date} /></dd></>
                    )}
                    {selected.enrichedFields.boardRoles && (
                      <><dt>Board roles</dt><dd>{selected.enrichedFields.boardRoles.value} <ProvenanceTag source={selected.enrichedFields.boardRoles.source} date={selected.enrichedFields.boardRoles.date} /></dd></>
                    )}
                    {selected.enrichedFields.philanthropicFocus && (
                      <><dt>Focus</dt><dd>{selected.enrichedFields.philanthropicFocus.value}</dd></>
                    )}
                  </dl>

                  <div className="dc-panel-divider" />
                  <div className="dc-panel-section">Stage</div>
                  <select
                    className="dc-select"
                    value={selected.stage}
                    onChange={e => handleStage(selected.id, e.target.value as OutreachStage)}
                  >
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>

                  {selected.introDraft && (
                    <>
                      <div className="dc-panel-divider" />
                      <div className="dc-panel-section">Draft introduction</div>
                      <textarea className="dc-panel-draft" defaultValue={selected.introDraft} rows={6} />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SPONSORS (Relationship tree) ── */}
        {view === 'Sponsors' && (
          <div className="dc-sponsors-view">
            <div className="dc-tree">
              {/* Root node */}
              <div className="dc-tree-root">
                <div className="dc-root-node">
                  <div className="dc-root-label">Bloomsbury Football Foundation</div>
                  <div className="dc-root-sub">{leads.length} leads mapped</div>
                </div>
              </div>

              {/* Sponsor branches */}
              <div className="dc-tree-branches">
                {sponsors.map(s => {
                  const sponsorLeads = leads.filter(l => l.introducingSponsor === s.name);
                  return (
                    <div key={s.id} className="dc-branch">
                      <div className="dc-branch-connector" />
                      <div className="dc-sponsor-node">
                        <div className="dc-sponsor-node-avatar">
                          {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div className="dc-sponsor-node-info">
                          <div className="dc-sponsor-node-name">{s.name}</div>
                          <div className="dc-sponsor-node-org">{s.organisation}</div>
                          <div className="dc-sponsor-node-meta">{s.philanthropicFocus}</div>
                        </div>
                        <div className="dc-sponsor-node-actions">
                          <span className={`dc-enrich-dot dc-enrich-dot--${s.enrichmentStatus}`} />
                          <button
                            className="dc-run-btn"
                            onClick={() => { setView('Network'); runEnrich(s.id); }}
                            disabled={s.enrichmentStatus === 'running'}
                          >
                            {s.enrichmentStatus === 'running' ? '…' : s.enrichmentStatus === 'complete' ? '↺' : '▶'}
                          </button>
                        </div>
                      </div>

                      {/* Lead leaves */}
                      <div className="dc-leaves">
                        {sponsorLeads.map(lead => (
                          <div
                            key={lead.id}
                            className={`dc-leaf${lead.triggerSignal ? ' dc-leaf--trigger' : ''}${selectedId === lead.id ? ' dc-leaf--selected' : ''}`}
                            onClick={() => setSelectedId(selectedId === lead.id ? null : lead.id)}
                          >
                            <div
                              className="dc-leaf-dot"
                              style={{ background: TIER_COLORS[lead.tier] }}
                            />
                            <div>
                              <div className="dc-leaf-name">{lead.name}</div>
                              <div className="dc-leaf-meta">{lead.connectionPath} · {lead.stage}</div>
                            </div>
                            <div className="dc-leaf-score">{lead.score}</div>
                          </div>
                        ))}
                        {sponsorLeads.length === 0 && (
                          <div className="dc-leaves-empty">No leads yet</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Side panel for selected lead */}
            {selected && (
              <div className="dc-panel dc-panel--open dc-panel--sponsors">
                <div className="dc-panel-inner">
                  <button className="dc-panel-close" onClick={() => setSelectedId(null)}>✕</button>
                  <div className="dc-panel-name">{selected.name}</div>
                  <div className="dc-panel-role">{selected.title}, {selected.organisation}</div>
                  <div className="dc-panel-score-row">
                    <ScoreBadge score={selected.score} tier={selected.tier} />
                    <span className="dc-panel-path">{selected.connectionPath} {selected.connectionVia}</span>
                  </div>
                  <div className="dc-panel-divider" />
                  <div className="dc-panel-section">Score reasons</div>
                  <ul className="dc-panel-reasons">
                    {selected.scoreReasons.map((r, i) => (
                      <li key={i}><strong>{r.label}:</strong> {r.detail}</li>
                    ))}
                  </ul>
                  <div className="dc-panel-divider" />
                  <select
                    className="dc-select"
                    value={selected.stage}
                    onChange={e => handleStage(selected.id, e.target.value as OutreachStage)}
                  >
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── NETWORK (Node expansion graph) ── */}
        {view === 'Network' && (
          <div className="dc-network-view">
            <div className="dc-network-intro">
              Enrichment expands each sponsor's network node by node — discovering new contacts, scoring them, and surfacing the strongest into your pipeline.
            </div>
            <div className="dc-network-grid">
              {sponsors.map(s => (
                <div key={s.id} className="dc-network-card">
                  <div className="dc-network-card-header">
                    <div className="dc-network-avatar">
                      {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="dc-network-ident">
                      <div className="dc-network-name">{s.name}</div>
                      <div className="dc-network-org">{s.organisation}</div>
                    </div>
                    <div className="dc-network-actions">
                      <span className={`dc-enrich-dot dc-enrich-dot--${s.enrichmentStatus}`} />
                      <button
                        className="dc-run-btn"
                        onClick={() => runEnrich(s.id)}
                        disabled={s.enrichmentStatus === 'running'}
                      >
                        {s.enrichmentStatus === 'running' ? 'Running…' : s.enrichmentStatus === 'complete' ? 'Re-run' : 'Run'}
                      </button>
                    </div>
                  </div>

                  {s.enrichmentStatus === 'running' && (
                    <div className="dc-progress">
                      <div className="dc-progress-bar" style={{ width: `${s.enrichmentProgress ?? 0}%` }} />
                    </div>
                  )}

                  {/* Node graph visual */}
                  <div className="dc-graph">
                    <div className="dc-graph-center">
                      <div className="dc-graph-root">{s.name.split(' ')[1][0]}</div>
                    </div>
                    <div className="dc-graph-ring">
                      {(logLines[s.id] ?? (s.enrichmentStatus === 'complete'
                        ? ['CH', 'CC', 'Press', 'Net', 'Score']
                        : [])).slice(0, 5).map((_, i) => {
                        const angle = (i / 5) * 360;
                        const rad = angle * (Math.PI / 180);
                        const r = 52;
                        const x = Math.cos(rad) * r;
                        const y = Math.sin(rad) * r;
                        return (
                          <div
                            key={i}
                            className="dc-graph-satellite"
                            style={{ transform: `translate(${x}px, ${y}px)` }}
                          />
                        );
                      })}
                    </div>
                    {s.enrichmentStatus === 'idle' && !logLines[s.id] && (
                      <div className="dc-graph-idle">Not run</div>
                    )}
                  </div>

                  <div className="dc-network-log">
                    {(logLines[s.id] ?? (s.enrichmentStatus === 'complete' ? ['Complete.'] : ['No run yet.'])).map((line, i) => (
                      <div key={i} className="dc-log-line">› {line}</div>
                    ))}
                  </div>
                  <div className="dc-network-footer">
                    <span>{s.leadsGenerated} leads found</span>
                    {s.lastEnriched && <ProvenanceTag source="Last run" date={s.lastEnriched} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TRIGGERS (Pulsing nodes + side panel) ── */}
        {view === 'Triggers' && (
          <div className="dc-triggers-view">
            <div className="dc-triggers-map">
              <div className="dc-triggers-label">
                {triggerLeads.length} active signal{triggerLeads.length !== 1 ? 's' : ''} — click to inspect
              </div>
              <div className="dc-trigger-nodes">
                {triggerLeads.map((lead, i) => {
                  const x = 10 + (i % 4) * 24;
                  const y = 10 + Math.floor(i / 4) * 28;
                  const isSelected = selectedId === lead.id;
                  return (
                    <div
                      key={lead.id}
                      className={`dc-trigger-node${isSelected ? ' dc-trigger-node--selected' : ''}`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                      onClick={() => setSelectedId(isSelected ? null : lead.id)}
                    >
                      <div className="dc-trigger-pulse" />
                      <div className="dc-trigger-core" style={{ background: TIER_COLORS[lead.tier] }}>
                        {lead.score}
                      </div>
                      <div className="dc-trigger-label-text">{lead.name.split(' ').pop()}</div>
                    </div>
                  );
                })}
                {triggerLeads.length === 0 && (
                  <div className="dc-triggers-none">No active trigger signals</div>
                )}
              </div>
            </div>

            {/* Side panel */}
            <div className={`dc-panel${selected ? ' dc-panel--open' : ''}`}>
              {!selected ? (
                <div className="dc-panel-empty">Select a signal node</div>
              ) : (
                <div className="dc-panel-inner">
                  <button className="dc-panel-close" onClick={() => setSelectedId(null)}>✕</button>
                  <div className="dc-panel-signal">{selected.triggerSignal}</div>
                  <div className="dc-panel-name">{selected.name}</div>
                  <div className="dc-panel-role">{selected.title}, {selected.organisation}</div>
                  <div className="dc-panel-score-row">
                    <ScoreBadge score={selected.score} tier={selected.tier} size="lg" />
                    <span className="dc-panel-path">{selected.connectionPath} {selected.connectionVia}</span>
                  </div>
                  <div className="dc-panel-divider" />
                  <div className="dc-panel-section">Score reasons</div>
                  <ul className="dc-panel-reasons">
                    {selected.scoreReasons.map((r, i) => (
                      <li key={i}><strong>{r.label}:</strong> {r.detail}</li>
                    ))}
                  </ul>
                  <div className="dc-panel-divider" />
                  <div className="dc-panel-section">Stage</div>
                  <select
                    className="dc-select"
                    value={selected.stage}
                    onChange={e => handleStage(selected.id, e.target.value as OutreachStage)}
                  >
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  {selected.introDraft && (
                    <>
                      <div className="dc-panel-divider" />
                      <div className="dc-panel-section">Draft</div>
                      <textarea className="dc-panel-draft" defaultValue={selected.introDraft} rows={5} />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
