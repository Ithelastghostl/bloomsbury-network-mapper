'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type AugmentState = 'augmented' | 'requested' | 'idle';

export function AugmentButton({
  entityId,
  initialState,
}: {
  entityId: string;
  initialState: AugmentState;
}) {
  const router = useRouter();
  const [state, setState] = useState<AugmentState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read-only analysis deployment: never render the trigger or fire requests.
  // NEXT_PUBLIC_* is inlined at build time, so this is safe at render scope.
  const augmentationDisabled = process.env.NEXT_PUBLIC_DISABLE_AUGMENTATION === 'true';

  if (state === 'augmented') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gold">
        <span className="w-1.5 h-1.5 rounded-full bg-gold" />
        Augmented
      </span>
    );
  }

  if (augmentationDisabled) {
    return (
      <span className="text-[10px] uppercase tracking-wide text-text-muted">
        Augmentation disabled
      </span>
    );
  }

  async function requestAugment() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/entities/${entityId}/request-augmentation`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      }
      setState('requested');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'requested') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-status-warning">
          <span className="w-1.5 h-1.5 rounded-full bg-status-warning animate-pulse" />
          Queued for research
        </span>
        <span className="text-[10px] text-text-muted">In the augment queue — awaiting local enrichment</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={requestAugment}
        disabled={busy}
        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-md bg-gold text-warm-white hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? 'Queueing…' : 'Augment & Persist'}
      </button>
      {error && <span className="text-[10px] text-status-danger max-w-[12rem] text-right">{error}</span>}
    </div>
  );
}
