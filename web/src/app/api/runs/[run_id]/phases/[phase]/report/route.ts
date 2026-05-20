import { createClient } from '@/lib/supabase/server';
import { notFound, serverError, apiError } from '@/lib/api-error';
import { isValidPhase } from '@/lib/pipeline/phases';

// GET /api/runs/:run_id/phases/:phase/report → PhaseReport
// PRD ref §20.2
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ run_id: string; phase: string }> },
) {
  try {
    const { run_id, phase } = await params;

    if (!isValidPhase(phase)) {
      return apiError('bad_request', `Invalid phase: ${phase}`, undefined, 400);
    }

    const supabase = await createClient();

    // Fetch the pipeline job for this (run_id, phase)
    const { data: job, error: jobError } = await supabase
      .from('pipeline_jobs')
      .select()
      .eq('run_id', run_id)
      .eq('phase', phase)
      .single();

    if (jobError || !job) {
      return notFound(`No job found for run ${run_id}, phase ${phase}`);
    }

    // Count quarantine items for this run filtered to this phase
    const { count: quarantineCount, error: qError } = await supabase
      .from('quarantine')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', run_id)
      .eq('source_phase', phase);

    if (qError) {
      return serverError('Failed to fetch quarantine count', qError.message);
    }

    const report = {
      run_id,
      phase,
      status: job.status,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
      records_processed: job.payload?.records_processed ?? null,
      errors: job.error,
      quarantine_count: quarantineCount ?? 0,
      enqueued_at: job.enqueued_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
    };

    return Response.json(report);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
