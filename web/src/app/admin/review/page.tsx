/**
 * Review Workflow dashboard — F11.4-T1.
 * PRD ref: §22.2 — time to decision, decision distribution, rejection reasons.
 * Filterable by reviewer, seed, time.
 */

import type { ReviewMetrics } from '@/lib/monitoring/metrics';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchReviewMetrics(_filters: {
  reviewer?: string;
  seed_id?: string;
  since?: string;
  until?: string;
}): Promise<ReviewMetrics> {
  // In production, calls getReviewMetrics(filters) from metrics module
  return {
    run_id: null,
    avg_time_to_decision_ms: 0,
    decision_distribution: {},
    rejection_reasons: {},
    total_decisions: 0,
  };
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function ReviewDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    reviewer?: string;
    seed_id?: string;
    since?: string;
    until?: string;
  }>;
}) {
  const params = await searchParams;
  const metrics = await fetchReviewMetrics(params);

  const totalDecisions = metrics.total_decisions;
  const decisions = metrics.decision_distribution;
  const rejections = metrics.rejection_reasons;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Review Workflow
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Time to decision, decision distribution, and rejection reasons.
      </p>

      {/* Filters */}
      <form className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-zinc-500 dark:text-zinc-400">Reviewer</label>
          <input
            name="reviewer"
            defaultValue={params.reviewer ?? ''}
            placeholder="User ID..."
            className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 dark:text-zinc-400">Seed</label>
          <input
            name="seed_id"
            defaultValue={params.seed_id ?? ''}
            placeholder="Seed ID..."
            className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 dark:text-zinc-400">From</label>
          <input
            name="since"
            type="date"
            defaultValue={params.since ?? ''}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 dark:text-zinc-400">To</label>
          <input
            name="until"
            type="date"
            defaultValue={params.until ?? ''}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Filter
        </button>
      </form>

      {/* Summary stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <MetricCard label="Total Decisions" value={totalDecisions.toString()} />
        <MetricCard
          label="Avg Time to Decision"
          value={metrics.avg_time_to_decision_ms > 0
            ? formatDuration(metrics.avg_time_to_decision_ms)
            : 'N/A'}
        />
        <MetricCard
          label="Rejection Rate"
          value={totalDecisions > 0
            ? `${(((decisions['rejected'] ?? 0) / totalDecisions) * 100).toFixed(1)}%`
            : 'N/A'}
          variant={(decisions['rejected'] ?? 0) / Math.max(totalDecisions, 1) > 0.5 ? 'warning' : undefined}
        />
      </div>

      {/* Decision distribution */}
      {Object.keys(decisions).length > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Decision Distribution
          </h2>
          <div className="mt-3 space-y-3">
            {Object.entries(decisions)
              .sort(([, a], [, b]) => b - a)
              .map(([decision, count]) => (
                <div key={decision}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize text-zinc-600 dark:text-zinc-400">
                      {decision.replace(/_/g, ' ')}
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {count} ({totalDecisions > 0 ? ((count / totalDecisions) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className={`h-2 rounded ${getDecisionColor(decision)}`}
                      style={{ width: `${totalDecisions > 0 ? (count / totalDecisions) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Rejection reasons */}
      {Object.keys(rejections).length > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Rejection Reasons
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="pb-2 pr-4 font-medium text-zinc-600 dark:text-zinc-400">Reason</th>
                  <th className="pb-2 font-medium text-zinc-600 dark:text-zinc-400">Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(rejections)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, count]) => (
                    <tr key={reason} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                        {reason.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2 font-mono text-zinc-900 dark:text-zinc-100">{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
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

function getDecisionColor(decision: string): string {
  switch (decision) {
    case 'qualified': return 'bg-green-500';
    case 'rejected': return 'bg-red-500';
    case 'needs_more_research': return 'bg-amber-500';
    default: return 'bg-blue-500';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}
