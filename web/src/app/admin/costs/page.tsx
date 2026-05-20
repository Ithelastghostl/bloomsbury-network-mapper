/**
 * Cost dashboard — F11.1-T3.
 * PRD ref: §22.2, §25 — LLM cost, API cost, cost per qualified candidate.
 * Uses budget module at web/src/lib/pipeline/budget.ts.
 */

import type { Run } from '@/types/database';
import { estimateCost, calculateUnitEconomics, type FunnelCounts } from '@/lib/pipeline/budget';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchRuns(): Promise<Run[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/runs`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function CostDashboardPage() {
  const runs = await fetchRuns();
  const completedRuns = runs.filter(r =>
    r.status === 'completed' || r.status === 'completed_with_warnings',
  );

  // Estimate costs for the typical corpus size
  const estimate = estimateCost(20444, 10);

  // Example funnel counts for unit economics display
  const exampleFunnel: FunnelCounts = {
    surfaced_candidates: 500,
    reviewed_candidates: 300,
    qualified_candidates: 100,
    intro_requests: 50,
    successful_intros: 20,
    qualified_opportunities: 5,
  };
  const unitEconomics = calculateUnitEconomics(estimate.total, exampleFunnel);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Cost Dashboard
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        LLM cost, API cost, and cost per qualified candidate per run.
      </p>

      {/* Cost estimate for full corpus */}
      <div className="mt-6">
        <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
          Full Corpus Cost Estimate (20,444 docs)
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
          <CostCard label="LLM Extraction" value={estimate.drivers.llm_extraction} />
          <CostCard label="LLM Intro Angles" value={estimate.drivers.llm_intro_angle} />
          <CostCard label="Embeddings" value={estimate.drivers.embedding_generation} />
          <CostCard label="Enrichment APIs" value={estimate.drivers.enrichment_apis} />
          <CostCard label="Infra (monthly)" value={estimate.drivers.supabase_vercel_recurring} />
          <CostCard label="Total Estimate" value={estimate.total} variant="highlight" />
        </div>
      </div>

      {/* Unit economics */}
      <div className="mt-8">
        <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
          Unit Economics
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Based on estimated full-corpus cost and example funnel counts.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
          <CostCard label="Per Surfaced Candidate" value={unitEconomics.cost_per_surfaced_candidate} />
          <CostCard label="Per Reviewed Candidate" value={unitEconomics.cost_per_reviewed_candidate} />
          <CostCard label="Per Qualified Candidate" value={unitEconomics.cost_per_qualified_candidate} />
          <CostCard label="Per Intro Request" value={unitEconomics.cost_per_intro_request} />
          <CostCard label="Per Successful Intro" value={unitEconomics.cost_per_successful_intro} />
          <CostCard label="Per Qualified Opportunity" value={unitEconomics.cost_per_qualified_opportunity} />
        </div>
      </div>

      {/* Per-run cost history */}
      <div className="mt-8">
        <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
          Run Cost History
        </h2>
        {completedRuns.length === 0 ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No completed runs to display cost data.
            </p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Run ID</th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Status</th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Started</th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Corpus</th>
                </tr>
              </thead>
              <tbody>
                {completedRuns.map((run) => (
                  <tr key={run.run_id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {run.run_id.slice(0, 16)}...
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                        {run.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {run.corpus_version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Cost card
// -------------------------------------------------------------------

function CostCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: 'highlight';
}) {
  const bgClass = variant === 'highlight'
    ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
    : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900';
  const valueClass = variant === 'highlight'
    ? 'text-blue-700 dark:text-blue-300'
    : 'text-zinc-900 dark:text-zinc-100';

  return (
    <div className={`rounded-lg border p-4 ${bgClass}`}>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClass}`}>
        ${value.toFixed(2)}
      </p>
    </div>
  );
}
