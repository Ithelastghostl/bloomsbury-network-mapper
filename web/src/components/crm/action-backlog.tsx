'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EntityNotes } from './entity-notes';
import { ExportCsvButton } from './export-csv-button';

interface ActionItem {
  id: string;
  name: string;
  status: string;
  assignee: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  leadScore: number;
  category: string;
  bestPath: string | null;
  rootSupporter: string | null;
  wealthBand: string | null;
  estimatedNw: number | null;
  sector: string | null;
  bio: string | null;
  isHumanValidated: boolean;
  // Frozen score snapshot. New actions carry the §18.1 dimensions; older ones
  // may carry the legacy {connectivity,wealth,paths,affinity} composite keys.
  breakdown: Record<string, number> | null;
  affinityRationale: string | null;
  bestPathReason: string | null;
  viaOrgs: string[] | null;
  rankingMethod: string | null;
}

type SortKey = 'name' | 'status' | 'score' | 'category' | 'wealth' | 'created';

const STATUSES = ['new', 'outreach', 'contacted', 'information_needed', 'deferred', 'won', 'lost'] as const;
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  outreach: 'bg-gold/10 text-gold border-gold/20',
  contacted: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  information_needed: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  deferred: 'bg-mid-charcoal text-text-muted border-border-subtle',
  won: 'bg-green-500/10 text-green-400 border-green-500/20',
  lost: 'bg-red-500/10 text-red-400 border-red-500/20',
};
const STATUS_ORDER: Record<string, number> = { new: 0, outreach: 1, contacted: 2, information_needed: 3, deferred: 4, won: 5, lost: 6 };

function formatNw(v: number | null): string {
  if (!v) return '—';
  if (v >= 1e9) return `£${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `£${(v / 1e6).toFixed(0)}M`;
  return `£${(v / 1e3).toFixed(0)}K`;
}

const TH = 'text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted cursor-pointer hover:text-text-secondary select-none';

/** Editable workflow panel inside an expanded action row. */
function ActionEditor({ item, onSaved }: { item: ActionItem; onSaved: () => void }) {
  const [status, setStatus] = useState(item.status);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [assignee, setAssignee] = useState(item.assignee ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = status !== item.status || notes !== (item.notes ?? '') || assignee !== (item.assignee ?? '');

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/entities/${item.id}/update-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // expectedUpdatedAt enables optimistic concurrency: a 409 means someone
        // else edited this action since it was loaded.
        body: JSON.stringify({ status, notes, assignee: assignee || null, expectedUpdatedAt: item.updatedAt }),
      });
      if (res.status === 409) {
        setError('Changed by someone else — reload to see the latest.');
      } else if (res.ok) {
        onSaved();
      } else {
        setError('Save failed.');
      }
    } catch { setError('Save failed.'); /* keep drafts so nothing is lost */ }
    setSaving(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-16">Status</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="bg-mid-charcoal border border-border-subtle rounded text-[11px] text-text-primary px-1.5 py-1 focus:outline-none focus:border-gold/50"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted ml-3">Assignee</label>
        <input
          type="text"
          value={assignee}
          onChange={e => setAssignee(e.target.value)}
          placeholder="Unassigned"
          className="bg-mid-charcoal border border-border-subtle rounded px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-40"
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1">Action notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Outreach notes, context for the assignee…"
          className="w-full bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 resize-y"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="text-xs px-3 py-1.5 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-30 transition-colors"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {error && <span className="text-[10px] text-red-400">{error}</span>}
      </div>
    </div>
  );
}

export function ActionBacklog({ items }: { items: ActionItem[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return items;
    return items.filter(i => i.status === statusFilter);
  }, [items, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case 'name': c = a.name.localeCompare(b.name); break;
        case 'status': c = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99); break;
        case 'score': c = b.leadScore - a.leadScore; break;
        case 'category': c = a.category.localeCompare(b.category); break;
        case 'wealth': c = (b.estimatedNw ?? 0) - (a.estimatedNw ?? 0); break;
        case 'created': c = a.createdAt.localeCompare(b.createdAt); break;
      }
      return sortAsc ? -c : c;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }
  const si = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Action Backlog</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {items.length} leads sent from the Lead Generator. Click a row to expand: edit status, assignee, and notes; see why the lead was proposed.
          </p>
        </div>
        <ExportCsvButton href="/api/crm/export/leads.csv?scope=actions" filename="action-backlog.csv" />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setStatusFilter('all')} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${statusFilter === 'all' ? 'bg-gold/10 text-gold border-gold/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          All ({items.length})
        </button>
        {STATUSES.map(s => statusCounts[s] ? (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${statusFilter === s ? STATUS_COLORS[s] : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
            {s.replace(/_/g, ' ')} ({statusCounts[s]})
          </button>
        ) : null)}
      </div>

      {sorted.length > 0 ? (
        <div className="border border-border-subtle rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-deep-charcoal border-b border-border-subtle">
                <th className={TH} onClick={() => handleSort('status')}>Status{si('status')}</th>
                <th className={TH} onClick={() => handleSort('name')}>Name{si('name')}</th>
                <th className={TH} onClick={() => handleSort('category')}>Category{si('category')}</th>
                <th className={TH} onClick={() => handleSort('score')}>Score{si('score')}</th>
                <th className={TH} onClick={() => handleSort('wealth')}>Wealth{si('wealth')}</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Route</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Assignee</th>
                <th className={TH} onClick={() => handleSort('created')}>Created{si('created')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {sorted.map(item => {
                const isOpen = expandedId === item.id;
                return (
                  <tr key={item.id} className={`transition-colors cursor-pointer align-top ${isOpen ? 'bg-deep-charcoal' : 'hover:bg-deep-charcoal/60'}`} onClick={() => setExpandedId(isOpen ? null : item.id)}>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLORS[item.status] ?? ''}`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" colSpan={isOpen ? 7 : 1}>
                      <div className="flex items-center gap-2">
                        <Link href={`/crm/entity/${item.id}`} className="text-[13px] font-medium text-text-primary hover:text-gold transition-colors" onClick={e => e.stopPropagation()}>
                          {item.name}
                        </Link>
                        {!item.isHumanValidated && <span className="text-[9px] text-orange-400">unvalidated</span>}
                      </div>

                      {isOpen && (
                        <div className="mt-3 space-y-4" onClick={e => e.stopPropagation()}>
                          {item.bio && <p className="text-xs text-text-muted max-w-3xl">{item.bio}</p>}

                          {/* Why this lead — frozen reasoning from Decide */}
                          <div className="grid grid-cols-2 gap-3 max-w-4xl">
                            <div className="rounded border border-gold/20 bg-gold/[0.04] px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gold mb-1">Affinity rationale</p>
                              <p className="text-[11px] text-text-secondary leading-relaxed">
                                {item.affinityRationale ?? 'No affinity rationale recorded (sent before explainability was captured).'}
                              </p>
                              {item.viaOrgs && item.viaOrgs.length > 0 && (
                                <p className="text-[10px] text-text-muted mt-1">Shared organisations: {item.viaOrgs.join(', ')}</p>
                              )}
                            </div>
                            <div className="rounded border border-border-subtle bg-mid-charcoal/30 px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Proposed route</p>
                              {item.bestPath ? (
                                <>
                                  <p className="text-[11px] text-text-secondary">{item.bestPath}</p>
                                  {item.rootSupporter && <p className="text-[10px] text-gold mt-0.5">Ask {item.rootSupporter} for the introduction</p>}
                                  {item.bestPathReason && <p className="text-[10px] text-text-muted mt-0.5">{item.bestPathReason}</p>}
                                </>
                              ) : (
                                <p className="text-[11px] text-text-muted">No introduction path recorded.</p>
                              )}
                              {item.breakdown && (
                                <p className="text-[9px] text-text-muted mt-1.5">
                                  Score {item.leadScore}/100 · {Object.entries(item.breakdown).map(([k, v]) => `${k} ${v}`).join(' · ')}
                                  {item.rankingMethod && item.rankingMethod !== 'priority' && item.rankingMethod !== 'composite' ? ` · ranked by ${item.rankingMethod}` : ''}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Workflow editor */}
                          <div className="max-w-4xl rounded border border-border-subtle bg-mid-charcoal/20 px-3 py-2.5">
                            <ActionEditor key={item.updatedAt} item={item} onSaved={() => router.refresh()} />
                          </div>

                          {/* Persistent entity notes */}
                          <div className="max-w-4xl">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Persistent entity notes</p>
                            <EntityNotes entityId={item.id} compact />
                          </div>
                        </div>
                      )}
                    </td>
                    {!isOpen && (
                      <>
                        <td className="px-3 py-2.5 text-[10px] text-text-muted">{item.category?.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-text-secondary">{item.leadScore}</td>
                        <td className="px-3 py-2.5">
                          {item.estimatedNw ? <span className="text-xs text-gold font-mono">{formatNw(item.estimatedNw)}</span> : <span className="text-[10px] text-text-muted">{item.wealthBand ?? '—'}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {item.bestPath ? (
                            <p className="text-[11px] text-text-secondary truncate max-w-[180px]">{item.bestPath}</p>
                          ) : <span className="text-[10px] text-text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-text-muted">{item.assignee ?? '—'}</td>
                        <td className="px-3 py-2.5 text-[10px] text-text-muted">{item.createdAt.slice(0, 10)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted text-sm border border-border-subtle rounded-lg">
          {items.length === 0 ? 'No leads sent to the backlog yet. Use the Lead Generator to send leads here.' : 'No items match this filter.'}
        </div>
      )}
    </div>
  );
}
