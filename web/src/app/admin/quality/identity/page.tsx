/**
 * Identity Resolution Quality dashboard — F11.2-T2.
 * PRD ref: §22.2 — cluster count, merge/split count, false match reasons per run.
 */

import type { Run } from '@/types/database';
import type { IdentityMetrics } from '@/lib/monitoring/metrics';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchRuns(): Promise<Run[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/runs`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function fetchIdentityMetrics(runId: string): Promise<IdentityMetrics> {
  return {
    run_id: runId,
    cluster_count: 0,
    merge_count: 0,
    split_count: 0,
    false_match_reasons: {},
  };
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function IdentityQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ run_id?: string }>;
}) {
  const params = await searchParams;
  const runs = await fetchRuns();
  const selectedRunId = params.run_id ?? runs[0]?.run_id;
  const metrics = selectedRunId ? await fetchIdentityMetrics(selectedRunId) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Identity Resolution Quality
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Cluster count, merge/split count, and false match reasons per run.
      </p>

      {/* Run selector */}
      <RunSelector runs={runs} selectedRunId={selectedRunId} />

      {metrics ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Clusters" value={metrics.cluster_count.toString()} />
            <MetricCard label="Merges" value={metrics.merge_count.toString()} />
            <MetricCard label="Splits" value={metrics.split_count.toString()} />
            <MetricCard
              label="False Match Rate"
              value={metrics.cluster_count > 0
                ? `${((metrics.split_count / metrics.cluster_count) * 100).toFixed(1)}%`
                : 'N/A'}
              variant={metrics.cluster_count > 0 && metrics.split_count / metrics.cluster_count > 0.1 ? 'warning' : undefined}
            />
          </div>

          {/* False match reasons */}
          {Object.keys(metrics.false_match_reasons).length > 0 && (
            <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">False Match Reasons</h2>
              <div className="mt-3 space-y-2">
                {Object.entries(metrics.false_match_reasons)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, count]) => (
                    <div key={reason} className="flex items-center justify-between">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">{reason.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Select a run to view metrics.</p>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Shared components
// -------------------------------------------------------------------

function RunSelector({ runs, selectedRunId }: { runs: Run[]; selectedRunId?: string }) {
  return (
    <form className="mt-6 flex items-center gap-2">
      <label className="text-sm text-zinc-600 dark:text-zinc-400">Run:</label>
      <select
        name="run_id"
        defaultValue={selectedRunId ?? ''}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      >
        {runs.map((r) => (
          <option key={r.run_id} value={r.run_id}>
            {r.run_id.slice(0, 16)} - {r.status}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Load
      </button>
    </form>
  );
}

function MetricCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: 'warning' | 'danger';
}) {
  const valueColor = variant === 'danger'
    ? 'text-red-600 dark:text-red-400'
    : variant === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-zinc-900 dark:text-zinc-100';

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}
