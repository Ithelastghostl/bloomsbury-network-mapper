import { createClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/ulid';
import type { PipelinePhase } from './phases';

const DEFAULT_MAX_ATTEMPTS = 3;

export async function enqueuePhase(
  runId: string,
  phase: PipelinePhase,
  payload?: Record<string, unknown>,
) {
  const supabase = await createClient();
  const jobId = generateId();

  // Check if a job already exists for this (run_id, phase) -- idempotency
  const { data: existing } = await supabase
    .from('pipeline_jobs')
    .select()
    .eq('run_id', runId)
    .eq('phase', phase)
    .single();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('pipeline_jobs')
    .insert({
      job_id: jobId,
      run_id: runId,
      phase,
      status: 'queued',
      priority: 0,
      attempts: 0,
      max_attempts: DEFAULT_MAX_ATTEMPTS,
      payload: payload ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function dequeueJob(phase?: PipelinePhase) {
  const supabase = await createClient();

  let query = supabase
    .from('pipeline_jobs')
    .select()
    .eq('status', 'queued')
    .order('priority', { ascending: false })
    .order('enqueued_at', { ascending: true })
    .limit(1);

  if (phase) {
    query = query.eq('phase', phase);
  }

  const { data: jobs, error: selectError } = await query;
  if (selectError) throw selectError;
  if (!jobs || jobs.length === 0) return null;

  const job = jobs[0];
  const { data, error } = await supabase
    .from('pipeline_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      attempts: job.attempts + 1,
    })
    .eq('job_id', job.job_id)
    .eq('status', 'queued') // optimistic lock
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function completeJob(
  jobId: string,
  result?: Record<string, unknown>,
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('pipeline_jobs')
    .update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      payload: result ?? undefined,
    })
    .eq('job_id', jobId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function failJob(
  jobId: string,
  errorDetail: Record<string, unknown>,
  retryable = true,
) {
  const supabase = await createClient();

  // Fetch current job to check attempts vs max_attempts
  const { data: job, error: fetchError } = await supabase
    .from('pipeline_jobs')
    .select()
    .eq('job_id', jobId)
    .single();

  if (fetchError) throw fetchError;

  const exhausted = job.attempts >= job.max_attempts;
  const status = !retryable || exhausted ? 'failed_final' : 'failed_retryable';

  const { data, error } = await supabase
    .from('pipeline_jobs')
    .update({
      status,
      error: errorDetail,
      finished_at: new Date().toISOString(),
    })
    .eq('job_id', jobId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPhaseStatus(runId: string, phase?: PipelinePhase) {
  const supabase = await createClient();

  let query = supabase
    .from('pipeline_jobs')
    .select('phase, status')
    .eq('run_id', runId);

  if (phase) {
    query = query.eq('phase', phase);
  }

  const { data: jobs, error } = await query;
  if (error) throw error;

  const counts: Record<string, Record<string, number>> = {};
  for (const job of jobs ?? []) {
    if (!counts[job.phase]) counts[job.phase] = {};
    counts[job.phase][job.status] = (counts[job.phase][job.status] ?? 0) + 1;
  }

  return counts;
}
