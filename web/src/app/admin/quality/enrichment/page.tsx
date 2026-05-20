/**
 * Enrichment Dashboard — F11.3-T1.
 * PRD ref: §22.2 — success rate by source, ambiguous match rate,
 * API failure rate, cache hit rate per run.
 */

import type { Run } from '@/types/database';
import type { EnrichmentMetrics } from '@/lib/monitoring/metrics';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchRuns(): Promise<Run[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/runs`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function fetchEnrichmentMetrics(runId: string): Promise<EnrichmentMetrics> {
  return {
    run_id: runId,
    success_rate_by_source: {},
    ambiguous_match_count: 0,
    ambiguous_match_rate: 0,
    api_failure_count: 0,
    api_failure_rate: 0,
    cache_hit_count: 0,
    cache_hit_rate: 0,
    total_signals: 0,
  };
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function EnrichmentDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ run_id?: string }>;
}) {
  const params = await searchParams;
  const runs = await fetchRuns();
  const selectedRunId = params.run_id ?? runs[0]?.run_id;
  const metrics = selectedRunId ? await fetchEnrichmentMetrics(selectedRunId) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Enrichment Dashboard
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Success rate by source, ambiguous matches, API failures, and cache performance.
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
            <MetricCard label="Total Signals" value={metrics.total_signals.toString()} />
            <MetricCard
              label="Ambiguous Matches"
              value={`${metrics.ambiguous_match_count} (${formatPct(metrics.ambiguous_match_rate)})`}
              variant={metrics.ambiguous_match_rate > 0.20 ? 'warning' : undefined}
            />
            <MetricCard
              label="API Failures"
              value={`${metrics.api_failure_count} (${formatPct(metrics.api_failure_rate)})`}
              variant={metrics.api_failure_rate > 0.10 ? 'danger' : metrics.api_failure_rate > 0.05 ? 'warning' : undefined}
            />
            <MetricCard
              label="Cache Hit Rate"
              value={formatPct(metrics.cache_hit_rate)}
            />
          </div>

          {/* Success rate by source */}
          {Object.keys(metrics.success_rate_by_source).length > 0 && (
            <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Success Rate by Source
              </h2>
              <div className="mt-3 space-y-3">
                {Object.entries(metrics.success_rate_by_source)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, rate]) => (
                    <div key={source}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-600 dark:text-zinc-400">{source}</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {formatPct(rate)}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className={`h-2 rounded ${rate >= 0.8 ? 'bg-green-500' : rate >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${rate * 100}%` }}
                        />
                      </div>
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
// Components
// -------------------------------------------------------------------

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
      <p className={`mt-1 text-xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
