'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface DupEntity {
  id: string;
  name: string;
  source: string;
  connections: number;
  evidence: number;
  wealthBand: string | null;
  hasAction: boolean;
}

export interface DupGroup {
  key: string;
  kind: 'exact' | 'variant';
  entities: DupEntity[];
}

export interface AliasRow {
  alias_id: string;
  alias_entity_id: string;
  canonical_entity_id: string;
  canonical_name: string | null;
  alias_source: string;
  created_at: string;
}

function MergeGroup({ group, onMerged }: { group: DupGroup; onMerged: () => void }) {
  // Default keep = richest entity (most evidence, then connections) — same
  // heuristic as merge-duplicate-entities.ts.
  const richest = [...group.entities].sort((a, b) => b.evidence - a.evidence || b.connections - a.connections)[0];
  const [keepId, setKeepId] = useState(richest.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function merge() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const e of group.entities) {
        if (e.id === keepId) continue;
        const res = await fetch('/api/crm/identity/merge-entities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keep_id: keepId, drop_id: e.id, reason: `Identity QA: ${group.kind} name match "${group.key}"` }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error?.message ?? `Merge failed (${res.status})`);
        }
      }
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed');
    }
    setBusy(false);
  }

  return (
    <div className={`rounded-lg border px-4 py-3 ${group.kind === 'exact' ? 'border-red-400/30' : 'border-amber-400/20'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${group.kind === 'exact' ? 'bg-red-400/10 text-red-400' : 'bg-amber-400/10 text-amber-300'}`}>
          {group.kind === 'exact' ? 'Same name' : 'Name variant'}
        </span>
        <span className="text-sm text-text-primary font-medium">{group.key}</span>
        <span className="text-[10px] text-text-muted">{group.entities.length} entities</span>
      </div>
      <div className="space-y-1">
        {group.entities.map(e => (
          <label key={e.id} className="flex items-center gap-3 text-xs py-1 cursor-pointer">
            <input type="radio" name={`keep-${group.key}`} checked={keepId === e.id} onChange={() => setKeepId(e.id)} className="accent-gold" />
            <Link href={`/crm/entity/${e.id}`} className="text-text-primary hover:text-gold transition-colors min-w-[180px]" onClick={ev => ev.stopPropagation()}>{e.name}</Link>
            <span className="text-text-muted font-mono">{e.connections} conns</span>
            <span className="text-text-muted font-mono">{e.evidence} evidence</span>
            {e.wealthBand && e.wealthBand !== 'unknown' && <span className="text-gold">{e.wealthBand.replace(/_/g, '–')}</span>}
            {e.hasAction && <span className="text-teal-400">in backlog</span>}
            <span className="text-text-muted/60 text-[10px]">{e.source}</span>
            {keepId === e.id && <span className="text-[10px] text-gold ml-auto">← keep this one</span>}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={merge}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-30 transition-colors"
        >
          {busy ? 'Merging…' : `Merge ${group.entities.length - 1} into kept entity`}
        </button>
        <span className="text-[10px] text-text-muted">Repoints all edges, evidence, scores and notes; records an alias; deletes the duplicates.</span>
        {error && <span className="text-[10px] text-red-400">{error}</span>}
      </div>
    </div>
  );
}

export function IdentityQa({ groups, aliases }: { groups: DupGroup[]; aliases: AliasRow[] }) {
  const router = useRouter();
  const [kindFilter, setKindFilter] = useState<'all' | 'exact' | 'variant'>('all');

  const visible = groups.filter(g => kindFilter === 'all' || g.kind === kindFilter);
  const exactCount = groups.filter(g => g.kind === 'exact').length;
  const variantCount = groups.filter(g => g.kind === 'variant').length;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Identity QA</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          Duplicate-risk entities. Bad identity data silently corrupts every score, dedup check, and
          introduction path — merge confirmed duplicates here. Merges are recorded in entity_aliases
          and the audit log, and replay over future ingests.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setKindFilter('all')} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${kindFilter === 'all' ? 'bg-gold/10 text-gold border-gold/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          All ({groups.length})
        </button>
        <button onClick={() => setKindFilter('exact')} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${kindFilter === 'exact' ? 'bg-red-400/10 text-red-400 border-red-400/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          Same name ({exactCount})
        </button>
        <button onClick={() => setKindFilter('variant')} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${kindFilter === 'variant' ? 'bg-amber-400/10 text-amber-300 border-amber-400/20' : 'bg-mid-charcoal text-text-muted border-border-subtle hover:text-text-secondary'}`}>
          Name variants ({variantCount})
        </button>
      </div>

      {visible.length > 0 ? (
        <div className="space-y-3">
          {visible.map(g => <MergeGroup key={g.key + g.kind} group={g} onMerged={() => router.refresh()} />)}
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted text-sm border border-border-subtle rounded-lg">
          No duplicate-risk entities found. Identity data is clean.
        </div>
      )}

      <div className="mt-6 bg-deep-charcoal border border-border-subtle rounded-lg p-4">
        <h3 className="text-[10px] font-semibold tracking-widest uppercase text-text-muted mb-3">Merge history (entity aliases · {aliases.length})</h3>
        {aliases.length > 0 ? (
          <div className="divide-y divide-border-subtle">
            {aliases.map(a => (
              <div key={a.alias_id} className="flex items-center gap-3 py-1.5 text-xs">
                <span className="text-text-muted font-mono">{a.alias_entity_id.slice(0, 10)}…</span>
                <span className="text-text-muted">→</span>
                <Link href={`/crm/entity/${a.canonical_entity_id}`} className="text-text-primary hover:text-gold transition-colors">{a.canonical_name ?? a.canonical_entity_id}</Link>
                <span className="text-[10px] text-text-muted ml-auto">{a.alias_source} · {a.created_at.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No merges recorded yet.</p>
        )}
      </div>
    </div>
  );
}
