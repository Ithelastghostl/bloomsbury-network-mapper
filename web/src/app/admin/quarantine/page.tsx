/**
 * Quarantine view — F11.1-T2.
 * PRD ref: §20.3 — quarantine list with filter and resolve action.
 * Server Component with Tailwind styling.
 */

import type { Quarantine } from '@/types/database';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchQuarantine(runId?: string, reason?: string): Promise<Quarantine[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const params = new URLSearchParams();
  if (runId) params.set('run_id', runId);
  if (reason) params.set('reason', reason);
  const qs = params.toString();
  const res = await fetch(
    `${baseUrl}/api/quarantine${qs ? `?${qs}` : ''}`,
    { cache: 'no-store' },
  );
  if (!res.ok) return [];
  return res.json();
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function QuarantinePage({
  searchParams,
}: {
  searchParams: Promise<{ run_id?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const records = await fetchQuarantine(params.run_id, params.reason);

  const unresolvedCount = records.filter(r => !r.resolved).length;
  const resolvedCount = records.filter(r => r.resolved).length;

  // Collect unique reason codes for filter
  const reasonCodes = [...new Set(records.map(r => r.reason_code))].sort();

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Quarantine
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Records quarantined during pipeline processing. Resolve after review.
      </p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard label="Total" value={records.length} />
        <StatCard label="Unresolved" value={unresolvedCount} variant="warning" />
        <StatCard label="Resolved" value={resolvedCount} variant="success" />
      </div>

      {/* Filters */}
      <div className="mt-6 flex gap-4">
        <form className="flex gap-2">
          <input
            name="run_id"
            placeholder="Filter by run ID..."
            defaultValue={params.run_id ?? ''}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <select
            name="reason"
            defaultValue={params.reason ?? ''}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">All reasons</option>
            {reasonCodes.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Table */}
      {records.length === 0 ? (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No quarantine records found.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">ID</th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Run</th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Phase</th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Reason</th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Details</th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Created</th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Status</th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.quarantine_id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {record.quarantine_id.slice(0, 12)}...
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {record.run_id.slice(0, 12)}...
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {record.source_phase}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      {record.reason_code}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400" title={record.details ?? ''}>
                    {record.details ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(record.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {record.resolved ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                        resolved
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
                        unresolved
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!record.resolved && (
                      <form method="POST" action={`/api/quarantine/${record.quarantine_id}/resolve`}>
                        <button
                          type="submit"
                          className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                        >
                          Resolve
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Stat card
// -------------------------------------------------------------------

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: 'warning' | 'success';
}) {
  const valueColor = variant === 'warning'
    ? 'text-amber-600 dark:text-amber-400'
    : variant === 'success'
      ? 'text-green-600 dark:text-green-400'
      : 'text-zinc-900 dark:text-zinc-100';

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}
