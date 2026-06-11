'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SuggestedTie } from '@/lib/crm/link-prediction';

function TieRow({ tie, onDecided }: { tie: SuggestedTie; onDecided: (key: string) => void }) {
  const [busy, setBusy] = useState<'confirm' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${tie.a}|${tie.b}`;

  async function decide(action: 'confirm' | 'dismiss') {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch('/api/crm/suggested-ties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, a: tie.a, b: tie.b }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
      }
      onDecided(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setBusy(null);
    }
  }

  return (
    <tr className="hover:bg-deep-charcoal/60 transition-colors align-top">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2 text-[13px]">
          <Link href={`/crm/entity/${tie.a}`} className="text-text-primary hover:text-gold transition-colors font-medium">{tie.aName}</Link>
          <span className="text-text-muted">—</span>
          <Link href={`/crm/entity/${tie.b}`} className="text-text-primary hover:text-gold transition-colors font-medium">{tie.bName}</Link>
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className="text-sm font-mono text-gold">{tie.score.toFixed(2)}</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="text-[11px] space-y-1 max-w-[420px]">
          {tie.commonNeighbours.length > 0 && (
            <p>
              <span className="text-text-muted">{tie.commonNeighbours.length} mutual {tie.commonNeighbours.length === 1 ? 'contact' : 'contacts'}:</span>{' '}
              <span className="text-text-secondary">{tie.commonNeighbours.slice(0, 6).join(', ')}{tie.commonNeighbours.length > 6 ? ` +${tie.commonNeighbours.length - 6}` : ''}</span>
            </p>
          )}
          {tie.sharedInstitutions.length > 0 && (
            <p>
              <span className="text-teal-400">Shared institution:</span>{' '}
              <span className="text-text-secondary">{tie.sharedInstitutions.slice(0, 3).join(', ')}{tie.sharedInstitutions.length > 3 ? ` +${tie.sharedInstitutions.length - 3}` : ''}</span>
            </p>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => decide('confirm')}
            disabled={busy !== null}
            className="text-xs px-2.5 py-1 rounded bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 disabled:opacity-30 transition-colors"
          >
            {busy === 'confirm' ? 'Saving…' : 'Confirm tie'}
          </button>
          <button
            onClick={() => decide('dismiss')}
            disabled={busy !== null}
            className="text-xs px-2.5 py-1 rounded bg-mid-charcoal text-text-muted border border-border-subtle hover:text-text-secondary disabled:opacity-30 transition-colors"
          >
            {busy === 'dismiss' ? 'Saving…' : 'Dismiss'}
          </button>
        </div>
        {error && <span className="text-[10px] text-red-400 block mt-1">{error}</span>}
      </td>
    </tr>
  );
}

export function SuggestedTiesTable({ ties }: { ties: SuggestedTie[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [decided, setDecided] = useState<Set<string>>(new Set());

  // Optimistically remove decided rows; a refresh re-derives the queue server-side.
  function onDecided(key: string) {
    setDecided(prev => new Set(prev).add(key));
    router.refresh();
  }

  const filtered = useMemo(() => {
    let list = ties.filter(t => !decided.has(`${t.a}|${t.b}`));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.aName.toLowerCase().includes(q) ||
        t.bName.toLowerCase().includes(q) ||
        t.sharedInstitutions.some(i => i.toLowerCase().includes(q)) ||
        t.commonNeighbours.some(n => n.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [ties, search, decided]);

  const TH = 'px-3 py-2.5 text-[10px] font-semibold tracking-widest uppercase text-text-muted';

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary uppercase tracking-wide">Suggested Ties</h2>
        <p className="text-sm text-text-muted mt-0.5 max-w-4xl">
          People who probably know each other but have no recorded connection. Ranked by Adamic-Adar —
          a pair scores higher when they share many low-profile contacts (a specific tie) than a few
          well-known hubs. A pair qualifies on ≥2 mutual contacts or a shared institution. Confirm to
          record a connection; dismiss to remove it from the queue for good.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input type="text" placeholder="Search person, institution, mutual contact..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-mid-charcoal border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50 w-80" />
        <span className="text-xs text-text-muted ml-auto">{filtered.length} suggestions</span>
      </div>

      <div className="border border-border-subtle rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-deep-charcoal border-b border-border-subtle">
              <th className={`text-left ${TH}`}>Candidate pair</th>
              <th className={`text-center ${TH}`}>Score</th>
              <th className={`text-left ${TH}`}>Why they probably know each other</th>
              <th className={`text-right ${TH}`}>Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filtered.map(t => <TieRow key={`${t.a}|${t.b}`} tie={t} onDecided={onDecided} />)}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-text-muted">No suggested ties left to review.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
