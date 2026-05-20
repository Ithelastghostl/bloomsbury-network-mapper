/**
 * Graph Health dashboard — F11.2-T3.
 * PRD ref: §22.2 — node count, edge count, build time, memory usage per snapshot.
 */

import type { Run } from '@/types/database';
import type { GraphMetrics } from '@/lib/monitoring/metrics';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchRuns(): Promise<Run[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/runs`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function fetchGraphMetrics(runId: string): Promise<GraphMetrics> {
  return {
    run_id: runId,
    snapshot_id: null,
    node_count: 0,
    edge_count: 0,
    build_time_ms: 0,
    built_at: null,
  };
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function GraphHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ run_id?: string }>;
}) {
  const params = await searchParams;
  const runs = await fetchRuns();
  const selectedRunId = params.run_id ?? runs[0]?.run_id;
  const metrics = selectedRunId ? await fetchGraphMetrics(selectedRunId) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Graph Health
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Node count, edge count, build time, and memory usage per snapshot.
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
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Nodes" value={metrics.node_count.toLocaleString()} />
            <MetricCard label="Edges" value={metrics.edge_count.toLocaleString()} />
            <MetricCard label="Build Time" value={formatDuration(metrics.build_time_ms)} />
            <MetricCard
              label="Snapshot"
              value={metrics.snapshot_id ? metrics.snapshot_id.slice(0, 12) + '...' : 'None'}
            />
          </div>

          {metrics.built_at && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Built at: {new Date(metrics.built_at).toLocaleString()}
            </p>
          )}

          {/* Edge-to-node ratio indicator */}
          {metrics.node_count > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Graph Density
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Edge/Node ratio: {(metrics.edge_count / metrics.node_count).toFixed(2)}
              </p>
              <div className="mt-2 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-2 rounded bg-blue-500"
                  style={{
                    width: `${Math.min(100, (metrics.edge_count / metrics.node_count) * 20)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms === 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}
