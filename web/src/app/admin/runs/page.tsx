/**
 * Pipeline Runs dashboard — F11.1-T1.
 * PRD ref: §22.1 — pipeline runs status, phase progress, errors.
 * Server Component with Tailwind styling.
 */

import type { Run, PipelineJob } from '@/types/database';

// -------------------------------------------------------------------
// Data fetching
// -------------------------------------------------------------------

async function fetchRuns(): Promise<Run[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/runs`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function fetchPhaseJobs(runId: string): Promise<PipelineJob[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  // Fetch jobs for each known phase via the report endpoint pattern
  // Fallback: return empty if not available
  try {
    const res = await fetch(`${baseUrl}/api/runs/${runId}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const run = await res.json();
    return run.jobs ?? [];
  } catch {
    return [];
  }
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default async function PipelineRunsPage() {
  const runs = await fetchRuns();

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Pipeline Runs
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Monitor run status, phase progress, and errors.
      </p>

      {runs.length === 0 ? (
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No runs found.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {runs.map((run) => (
            <RunCard key={run.run_id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Run card with expandable error details
// -------------------------------------------------------------------

function RunCard({ run }: { run: Run }) {
  const duration = run.completed_at && run.started_at
    ? formatDuration(new Date(run.completed_at).getTime() - new Date(run.started_at).getTime())
    : null;

  return (
    <details className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RunStatusBadge status={run.status} />
            <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
              {run.run_id}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
            {duration && <span>{duration}</span>}
            <span>{new Date(run.started_at).toLocaleString()}</span>
          </div>
        </div>
      </summary>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <InfoField label="Corpus Version" value={run.corpus_version} />
          <InfoField label="Schema Version" value={run.schema_version} />
          <InfoField label="Scoring Config" value={run.scoring_config_version} />
          <InfoField label="Started" value={new Date(run.started_at).toLocaleString()} />
          {run.completed_at && (
            <InfoField label="Completed" value={new Date(run.completed_at).toLocaleString()} />
          )}
        </div>

        {run.error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
            <h4 className="text-sm font-medium text-red-800 dark:text-red-200">Error Details</h4>
            <pre className="mt-1 overflow-x-auto text-xs text-red-700 dark:text-red-300">
              {JSON.stringify(run.error, null, 2)}
            </pre>
          </div>
        )}

        <PhaseProgressSection runId={run.run_id} />
      </div>
    </details>
  );
}

// -------------------------------------------------------------------
// Phase progress (loaded inline since this is a server component)
// -------------------------------------------------------------------

async function PhaseProgressSection({ runId }: { runId: string }) {
  const jobs = await fetchPhaseJobs(runId);
  if (jobs.length === 0) return null;

  const phases = [
    'classification', 'extraction', 'validation', 'entity_resolution',
    'graph_build', 'discovery', 'enrichment', 'ranking', 'dossier_generation',
  ];

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Phase Progress</h4>
      <div className="mt-2 flex gap-1">
        {phases.map((phase) => {
          const job = jobs.find((j) => j.phase === phase);
          return (
            <div
              key={phase}
              className="flex-1"
              title={`${phase}: ${job?.status ?? 'pending'}`}
            >
              <div
                className={`h-2 rounded ${getPhaseColor(job?.status ?? 'pending')}`}
              />
              <p className="mt-1 truncate text-center text-[10px] text-zinc-500 dark:text-zinc-400">
                {phase.replace(/_/g, ' ')}
              </p>
            </div>
          );
        })}
      </div>

      {/* Expandable error details per phase */}
      {jobs.filter(j => j.error).map((job) => (
        <details key={job.job_id} className="mt-2">
          <summary className="cursor-pointer text-xs text-red-600 dark:text-red-400">
            {job.phase} error (attempt {job.attempts}/{job.max_attempts})
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {JSON.stringify(job.error, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  );
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    created: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
    queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    completed_with_warnings: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    failed_retryable: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    failed_final: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    cancelled: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    rolled_back: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? colors.created}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function InfoField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs text-zinc-800 dark:text-zinc-200">{value}</dd>
    </div>
  );
}

function getPhaseColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-500';
    case 'running': return 'bg-blue-500 animate-pulse';
    case 'queued': return 'bg-blue-200 dark:bg-blue-800';
    case 'failed_retryable': return 'bg-orange-500';
    case 'failed_final': return 'bg-red-500';
    case 'cancelled': return 'bg-zinc-400';
    default: return 'bg-zinc-200 dark:bg-zinc-700';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}
