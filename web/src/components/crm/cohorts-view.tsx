'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';

interface Cohort {
  cohort_id: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string;
  created_at: string;
  member_count: number;
}

interface CohortMember {
  entity_id: string;
  display_name: string;
  entity_type: string | null;
  added_by: string;
  added_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  paused: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  archived: 'bg-mid-charcoal text-text-muted border-border-subtle',
};
const STATUSES = ['active', 'paused', 'archived'];

/** Members list for the selected cohort. */
function CohortMembers({ cohortId }: { cohortId: string }) {
  const [members, setMembers] = useState<CohortMember[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(`/api/crm/cohorts/${cohortId}`);
        const json = await res.json();
        if (!cancelled) setMembers(json.members ?? []);
      } catch {
        if (!cancelled) setMembers([]);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [cohortId]);

  if (members === null) return <p className="text-[10px] text-text-muted px-3 py-3">Loading members…</p>;
  if (members.length === 0) return <p className="text-[10px] text-text-muted px-3 py-3">No members yet.</p>;

  return (
    <div className="divide-y divide-border-subtle">
      {members.map(m => (
        <div key={m.entity_id} className="flex items-center justify-between px-3 py-2">
          <Link href={`/crm/entity/${m.entity_id}`} className="text-[13px] text-text-primary hover:text-gold transition-colors">
            {m.display_name}
          </Link>
          <span className="text-[10px] text-text-muted">{m.entity_type ?? '—'} · added {m.added_at.slice(0, 10)}</span>
        </div>
      ))}
    </div>
  );
}

export function CohortsView({ initialCohorts }: { initialCohorts: Cohort[] }) {
  const [cohorts, setCohorts] = useState<Cohort[]>(initialCohorts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  async function createCohort() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/crm/cohorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, description: description.trim() || undefined }),
      });
      const json = await res.json();
      if (json.cohort) {
        setCohorts(prev => [json.cohort, ...prev]);
        setName('');
        setDescription('');
      }
    } catch { /* keep drafts so nothing is lost */ }
    setCreating(false);
  }

  async function setStatus(cohort: Cohort, status: string) {
    setCohorts(prev => prev.map(c => c.cohort_id === cohort.cohort_id ? { ...c, status } : c));
    try {
      await fetch(`/api/crm/cohorts/${cohort.cohort_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch { /* server is source of truth on next load */ }
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Cohorts</h2>
        <p className="text-sm text-text-muted mt-0.5">
          Named groupings of entities you curate for outreach. Click a cohort to see its members.
        </p>
      </div>

      {/* Create */}
      <div className="mb-5 border border-border-subtle rounded-lg bg-deep-charcoal p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">New cohort</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Cohort name (e.g. Q3 major-gift targets)"
            className="flex-1 bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50"
          />
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="flex-1 bg-mid-charcoal border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50"
          />
          <button
            onClick={createCohort}
            disabled={!name.trim() || creating}
            className="text-xs px-3 py-1.5 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-30 transition-colors whitespace-nowrap"
          >
            {creating ? 'Creating…' : 'Create cohort'}
          </button>
        </div>
      </div>

      {/* List */}
      {cohorts.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm border border-border-subtle rounded-lg">
          No cohorts yet. Create one above.
        </div>
      ) : (
        <div className="border border-border-subtle rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-deep-charcoal border-b border-border-subtle">
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Name</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Status</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Members</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {cohorts.map(c => {
                const isOpen = selectedId === c.cohort_id;
                return (
                  <Fragment key={c.cohort_id}>
                    <tr
                      className={`cursor-pointer transition-colors align-top ${isOpen ? 'bg-deep-charcoal' : 'hover:bg-deep-charcoal/60'}`}
                      onClick={() => setSelectedId(isOpen ? null : c.cohort_id)}
                    >
                      <td className="px-3 py-2.5">
                        <p className="text-[13px] font-medium text-text-primary">{c.name}</p>
                        {c.description && <p className="text-[11px] text-text-muted mt-0.5">{c.description}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={c.status}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setStatus(c, e.target.value)}
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border bg-transparent focus:outline-none ${STATUS_COLORS[c.status] ?? 'text-text-muted border-border-subtle'}`}
                        >
                          {STATUSES.map(s => <option key={s} value={s} className="bg-deep-charcoal text-text-primary">{s}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-text-secondary">{c.member_count}</td>
                      <td className="px-3 py-2.5 text-[10px] text-text-muted">{c.created_at.slice(0, 10)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-deep-charcoal/40">
                        <td colSpan={4} className="px-0 py-0">
                          <CohortMembers cohortId={c.cohort_id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
