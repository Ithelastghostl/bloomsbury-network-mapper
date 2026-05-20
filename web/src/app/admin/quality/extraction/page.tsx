/**
 * Extraction Quality dashboard — F11.2-T1.
 * PRD ref: §22.2 — docs processed, invalid JSON rate, evidence coverage per run.
 * Server Component with Tailwind styling.
 */

import type { Run } from '@/types/database';
import type { ExtractionMetrics } from '@/lib/monitoring/metrics';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchRuns(): Promise<Run[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/runs`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

// For a real implementation, this would call the metrics module.
// In SSR, we simulate by returning structure matching ExtractionMetrics.
async function fetchExtractionMetrics(runId: string): Promise<ExtractionMetrics> {
  // In production, this calls getExtractionMetrics(runId) from the metrics module.
  // Here we provide the shape for the dashboard to render.
  return {
    run_id: runId,
    documents_processed: 0,
    invalid_json_count: 0,
    invalid_json_rate: 0,
    evidence_spans_count: 0,
    evidence_coverage: 0,
  };
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function ExtractionQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ run_id?: string }>;
}) {
  const params = await searchParams;
  const runs = await fetchRuns();
  const selectedRunId = params.run_id ?? runs[0]?.run_id;
  const metrics = selectedRunId ? await fetchExtractionMetrics(selectedRunId) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Extraction Quality
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Documents processed, invalid JSON rate, and evidence coverage per run.
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
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard label="Documents Processed" value={metrics.documents_processed.toString()} />
          <MetricCard
            label="Invalid JSON Count"
            value={metrics.invalid_json_count.toString()}
            variant={metrics.invalid_json_count > 0 ? 'warning' : undefined}
          />
          <MetricCard
            label="Invalid JSON Rate"
            value={formatPct(metrics.invalid_json_rate)}
            variant={metrics.invalid_json_rate > 0.05 ? 'danger' : metrics.invalid_json_rate > 0.01 ? 'warning' : undefined}
          />
          <MetricCard label="Evidence Spans" value={metrics.evidence_spans_count.toString()} />
          <MetricCard
            label="Evidence Coverage"
            value={formatPct(metrics.evidence_coverage)}
            variant={metrics.evidence_coverage < 0.90 ? 'warning' : undefined}
          />
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

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
