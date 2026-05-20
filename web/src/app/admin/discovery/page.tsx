/**
 * Discovery dashboard — F11.4-T3.
 * PRD ref: §22.2 — candidates per seed, path diversity, weak seed count.
 */

import type { Run } from '@/types/database';
import type { DiscoveryMetrics } from '@/lib/monitoring/metrics';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchRuns(): Promise<Run[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/runs`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function fetchDiscoveryMetrics(runId: string): Promise<DiscoveryMetrics> {
  return {
    run_id: runId,
    candidates_per_seed: {},
    total_candidates: 0,
    path_diversity: 0,
    weak_seed_count: 0,
  };
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function DiscoveryDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ run_id?: string }>;
}) {
  const params = await searchParams;
  const runs = await fetchRuns();
  const selectedRunId = params.run_id ?? runs[0]?.run_id;
  const metrics = selectedRunId ? await fetchDiscoveryMetrics(selectedRunId) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Discovery
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Candidates per seed, path diversity, and weak seed count.
      </p>

      {/* Run selector */}
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

      {metrics ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Total Candidates" value={metrics.total_candidates.toString()} />
            <MetricCard label="Path Diversity" value={metrics.path_diversity.toString()} />
            <MetricCard
              label="Weak Seeds"
              value={metrics.weak_seed_count.toString()}
              variant={metrics.weak_seed_count > 0 ? 'warning' : undefined}
            />
            <MetricCard
              label="Seeds"
              value={Object.keys(metrics.candidates_per_seed).length.toString()}
            />
          </div>

          {/* Candidates per seed */}
          {Object.keys(metrics.candidates_per_seed).length > 0 && (
            <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Candidates per Seed
              </h2>
              <div className="mt-3 space-y-2">
                {Object.entries(metrics.candidates_per_seed)
                  .sort(([, a], [, b]) => b - a)
                  .map(([seedId, count]) => {
                    const maxCount = Math.max(...Object.values(metrics.candidates_per_seed), 1);
                    return (
                      <div key={seedId}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                            {seedId.slice(0, 16)}...
                          </span>
                          <span className={`font-medium ${count < 5 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                            {count}
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-700">
                          <div
                            className={`h-2 rounded ${count < 5 ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
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
// Components
// -------------------------------------------------------------------

function MetricCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: 'warning';
}) {
  const valueColor = variant === 'warning'
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-zinc-900 dark:text-zinc-100';

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}
