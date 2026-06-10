'use client';

import { useState } from 'react';

/**
 * CSV export control. Fetches the (admin-gated) export endpoint and triggers a
 * client-side download on success. A plain <a href> would download the 403
 * error body as a "CSV" for a non-admin session; this surfaces the failure as
 * an inline message instead.
 */
export function ExportCsvButton({ href, filename }: { href: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        setError(res.status === 403 ? 'Not permitted' : `Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {error && <span className="text-[10px] text-red-400">{error}</span>}
      <button
        onClick={download}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded bg-mid-charcoal text-text-secondary border border-border-subtle hover:text-gold hover:border-gold/30 disabled:opacity-40 transition-colors"
      >
        {busy ? 'Exporting…' : 'Export CSV'}
      </button>
    </div>
  );
}
