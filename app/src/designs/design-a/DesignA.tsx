/**
 * Design A — "The Desk"
 *
 * Shell:     Pitch-black sidebar (220px) + warm content area
 * Pipeline:  Dense sortable table rows + sliding right panel (score/record/intro)
 * Sponsors:  Data table with inline enrichment progress
 * Network:   Terminal-style job log per sponsor
 * Triggers:  Flagged rows injected at top of pipeline with gold left border
 */
import { useState } from 'react';
import { MOCK_LEADS, MOCK_SPONSORS } from '../../data';
import type { OutreachStage } from '../../data/mockLeads';
import { STAGES } from '../../data/mockLeads';
import { ScoreBadge } from '../../components/ScoreBadge';
import { ProvenanceTag } from '../../components/ProvenanceTag';
import type { Filters } from '../../components/FilterBar';
import './DesignA.css';

type View = 'Pipeline' | 'Sponsors' | 'Network' | 'Triggers';

export function DesignA() {
  const [view, setView] = useState<View>('Pipeline');
  const [leads, setLeads] = useState(MOCK_LEADS);
  const [sponsors, setSponsors] = useState(MOCK_SPONSORS);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_LEADS[0].id);
  const [filters, setFilters] = useState<Filters>({ tier: 'All', stage: 'All', sponsor: 'All sponsors', triggerOnly: false });
  const [logLines, setLogLines] = useState<Record<string, string[]>>({});

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

  const triggerLeads = leads.filter(l => l.triggerSignal);

  const visibleLeads = leads.filter(l => {
    if (view === 'Triggers') return !!l.triggerSignal;
    if (filters.sponsor !== 'All sponsors' && l.introducingSponsor !== filters.sponsor) return false;
    if (filters.tier !== 'All' && l.tier !== filters.tier) return false;
    if (filters.stage !== 'All' && l.stage !== filters.stage) return false;
    if (filters.triggerOnly && !l.triggerSignal) return false;
    return true;
  });

  const SPONSOR_NAMES = ['All sponsors', ...MOCK_SPONSORS.map(s => s.name)];

  return (
    <div className="da-shell">
      <aside className="da-sidebar">
        <div className="da-brand">
          <span className="da-brand-name">Bloomsbury</span>
          <span className="da-brand-sub">Network Mapper</span>
        </div>
        <nav className="da-nav">
          {(['Pipeline', 'Sponsors', 'Network', 'Triggers'] as View[]).map(v => (
            <button
              key={v}
              className={`da-nav-item${view === v ? ' da-nav-item--active' : ''}`}
              onClick={() => setView(v)}
            >
              {v}
              {v === 'Triggers' && triggerLeads.length > 0 && (
                <span className="da-nav-pill">{triggerLeads.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="da-sidebar-footer">
          <div className="da-sidebar-stat">
            <span className="da-sidebar-stat-val">{leads.length}</span>
            <span className="da-sidebar-stat-label">leads</span>
          </div>
          <div className="da-sidebar-stat">
            <span className="da-sidebar-stat-val">{leads.filter(l => l.tier === 'High').length}</span>
            <span className="da-sidebar-stat-label">high priority</span>
          </div>
        </div>
      </aside>

      <div className="da-main">
        <header className="da-topbar">
          <span className="da-topbar-title">{view}</span>
          {view === 'Pipeline' && (
            <div className="da-filters">
              <select className="da-select" value={filters.sponsor} onChange={e => setFilters(f => ({ ...f, sponsor: e.target.value }))}>
                {SPONSOR_NAMES.map(s => <option key={s}>{s}</option>)}
              </select>
              <select className="da-select" value={filters.tier} onChange={e => setFilters(f => ({ ...f, tier: e.target.value as any }))}>
                <option value="All">All tiers</option>
                {['High','Medium','Low'].map(t => <option key={t}>{t}</option>)}
              </select>
              <select className="da-select" value={filters.stage} onChange={e => setFilters(f => ({ ...f, stage: e.target.value as any }))}>
                <option value="All">All stages</option>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
              <span className="da-filter-count">{visibleLeads.length} of {leads.length}</span>
            </div>
          )}
          <button className="da-add-btn">Add sponsor</button>
        </header>

        <div className="da-body">

          {/* ── PIPELINE / TRIGGERS ── */}
          {(view === 'Pipeline' || view === 'Triggers') && (
            <div className="da-pipeline-layout">
              <div className="da-table-wrap">
                {view === 'Triggers' && (
                  <div className="da-triggers-banner">
                    Fresh signals from the past 30 days requiring attention
                  </div>
                )}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                <table className="da-table">
                  <thead>
                    <tr>
                      <th>Score</th>
                      <th>Name</th>
                      <th>Organisation</th>
                      <th>Connection</th>
                      <th>Sponsor</th>
                      <th>Stage</th>
                      {view === 'Triggers' && <th>Signal</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeads.map(lead => (
                      <tr
                        key={lead.id}
                        className={`da-row${selectedId === lead.id ? ' da-row--selected' : ''}${lead.triggerSignal ? ' da-row--triggered' : ''}`}
                        onClick={() => setSelectedId(lead.id)}
                      >
                        <td><ScoreBadge score={lead.score} tier={lead.tier} /></td>
                        <td className="da-row-name">{lead.name}</td>
                        <td className="da-row-org">{lead.organisation}</td>
                        <td className="da-row-path">{lead.connectionPath}</td>
                        <td className="da-row-sponsor">{lead.introducingSponsor}</td>
                        <td>
                          <span className={`da-stage-dot da-stage-dot--${lead.stage.toLowerCase()}`} />
                          {lead.stage}
                        </td>
                        {view === 'Triggers' && (
                          <td className="da-row-signal">{lead.triggerSignal}</td>
                        )}
                      </tr>
                    ))}
                    {visibleLeads.length === 0 && (
                      <tr><td colSpan={7} className="da-empty-row">No leads match these filters</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>

              {/* Detail panel */}
              <div className="da-panel">
                {!selected ? (
                  <div className="da-panel-empty">Select a row to view details</div>
                ) : (
                  <div className="da-panel-inner">
                    {selected.triggerSignal && (
                      <div className="da-panel-trigger">{selected.triggerSignal}</div>
                    )}
                    <div className="da-panel-header">
                      <div>
                        <div className="da-panel-name">{selected.name}</div>
                        <div className="da-panel-role">{selected.title}, {selected.organisation}</div>
                      </div>
                      <select
                        className="da-select"
                        value={selected.stage}
                        onChange={e => handleStage(selected.id, e.target.value as OutreachStage)}
                      >
                        {STAGES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>

                    <div className="da-panel-score-row">
                      <ScoreBadge score={selected.score} tier={selected.tier} size="lg" />
                      <span className="da-panel-path">{selected.connectionPath} {selected.connectionVia}</span>
                    </div>

                    <div className="da-panel-section-title">Score reasons</div>
                    <ul className="da-panel-reasons">
                      {selected.scoreReasons.map((r, i) => (
                        <li key={i}>
                          <strong>{r.label}:</strong> {r.detail}
                          {r.source && <> <ProvenanceTag source={r.source} date={r.sourceDate!} /></>}
                        </li>
                      ))}
                    </ul>

                    <div className="da-panel-divider" />
                    <div className="da-panel-section-title">Record</div>
                    <dl className="da-panel-fields">
                      {selected.enrichedFields.knownDonations && (
                        <><dt>Known donations</dt><dd>{selected.enrichedFields.knownDonations.value} <ProvenanceTag source={selected.enrichedFields.knownDonations.source} date={selected.enrichedFields.knownDonations.date} /></dd></>
                      )}
                      {selected.enrichedFields.netWorthEstimate && (
                        <><dt>Net worth estimate</dt><dd>{selected.enrichedFields.netWorthEstimate.value} <ProvenanceTag source={selected.enrichedFields.netWorthEstimate.source} date={selected.enrichedFields.netWorthEstimate.date} /></dd></>
                      )}
                      {selected.enrichedFields.boardRoles && (
                        <><dt>Board roles</dt><dd>{selected.enrichedFields.boardRoles.value} <ProvenanceTag source={selected.enrichedFields.boardRoles.source} date={selected.enrichedFields.boardRoles.date} /></dd></>
                      )}
                      {selected.enrichedFields.philanthropicFocus && (
                        <><dt>Philanthropic focus</dt><dd>{selected.enrichedFields.philanthropicFocus.value} <ProvenanceTag source={selected.enrichedFields.philanthropicFocus.source} date={selected.enrichedFields.philanthropicFocus.date} /></dd></>
                      )}
                    </dl>

                    <div className="da-panel-divider" />
                    <div className="da-panel-section-title">Introduction via {selected.introducingSponsor}</div>
                    {selected.introDraft ? (
                      <textarea className="da-panel-draft" defaultValue={selected.introDraft} rows={7} />
                    ) : (
                      <p className="da-panel-no-draft">No draft prepared.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SPONSORS ── */}
          {view === 'Sponsors' && (
            <div className="da-sponsors-view">
              <table className="da-table">
                <thead>
                  <tr>
                    <th>Sponsor</th>
                    <th>Organisation</th>
                    <th>Since</th>
                    <th>Leads</th>
                    <th>Capacity</th>
                    <th>Focus</th>
                    <th>Last enriched</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sponsors.map(s => (
                    <tr key={s.id} className="da-row">
                      <td>
                        <div className="da-row-name">{s.name}</div>
                        <div className="da-row-org">{s.title}</div>
                      </td>
                      <td>{s.organisation}</td>
                      <td>{s.relationshipStart}</td>
                      <td><span className="da-chip">{s.leadsGenerated}</span></td>
                      <td>{s.estimatedCapacity ?? '—'}</td>
                      <td className="da-row-focus">{s.philanthropicFocus ?? '—'}</td>
                      <td>
                        {s.lastEnriched
                          ? <ProvenanceTag source="run" date={s.lastEnriched} />
                          : <span className="da-muted">Not run</span>}
                      </td>
                      <td>
                        <button
                          className="da-run-btn"
                          onClick={() => { setView('Network'); runEnrich(s.id); }}
                          disabled={s.enrichmentStatus === 'running'}
                        >
                          {s.enrichmentStatus === 'running' ? 'Running…' : 'Enrich'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── NETWORK ── */}
          {view === 'Network' && (
            <div className="da-network-view">
              <p className="da-network-desc">
                Enrichment maps each sponsor's public network via Companies House, Charity Commission, and press sources, then scores contacts as donor candidates.
              </p>
              <div className="da-job-grid">
                {sponsors.map(s => (
                  <div key={s.id} className="da-job-card">
                    <div className="da-job-header">
                      <div>
                        <div className="da-job-name">{s.name}</div>
                        <div className="da-job-org">{s.organisation}</div>
                      </div>
                      <div className="da-job-actions">
                        <span className={`da-status-dot da-status-dot--${s.enrichmentStatus}`} />
                        <button
                          className="da-run-btn"
                          onClick={() => runEnrich(s.id)}
                          disabled={s.enrichmentStatus === 'running'}
                        >
                          {s.enrichmentStatus === 'running' ? 'Running…' : s.enrichmentStatus === 'complete' ? 'Re-run' : 'Run'}
                        </button>
                      </div>
                    </div>
                    {s.enrichmentStatus === 'running' && (
                      <div className="da-progress"><div className="da-progress-bar" style={{ width: `${s.enrichmentProgress ?? 0}%` }} /></div>
                    )}
                    <div className="da-job-terminal">
                      {(logLines[s.id] ?? (s.enrichmentStatus === 'complete' ? ['Complete.'] : ['No run yet.'])).map((line, i) => (
                        <div key={i} className="da-terminal-line">› {line}</div>
                      ))}
                    </div>
                    <div className="da-job-footer">
                      <span>{s.leadsGenerated} leads found</span>
                      {s.lastEnriched && <ProvenanceTag source="Last run" date={s.lastEnriched} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
