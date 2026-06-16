import { createClient } from '@/lib/supabase/server';
import { notFound, serverError, apiError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { augmentationDisabled, augmentationGone } from '@/lib/augmentation-guard';

// POST /api/runs/:run_id/retry -- retry failed phases
export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ run_id: string }> },
) => {
  try {
    if (augmentationDisabled()) return augmentationGone();

    const { run_id } = await params;
    const supabase = await createClient();

    // Verify run exists
    const { data: run, error: fetchError } = await supabase
      .from('runs')
      .select('run_id, status')
      .eq('run_id', run_id)
      .single();

    if (fetchError || !run) {
      return notFound('Run not found');
    }

    // Find failed_retryable jobs
    const { data: failedJobs, error: jobsError } = await supabase
      .from('pipeline_jobs')
      .select()
      .eq('run_id', run_id)
      .eq('status', 'failed_retryable');

    if (jobsError) {
      return serverError('Failed to fetch pipeline jobs', jobsError.message);
    }

    if (!failedJobs || failedJobs.length === 0) {
      return apiError(
        'conflict',
        'No retryable failed phases found',
        undefined,
        409,
      );
    }

    const retriedPhases: string[] = [];

    for (const job of failedJobs) {
      if (job.attempts >= job.max_attempts) {
        // Already exhausted retries -- skip
        continue;
      }

      const { error: updateError } = await supabase
        .from('pipeline_jobs')
        .update({
          status: 'queued',
          error: null,
          finished_at: null,
          started_at: null,
        })
        .eq('job_id', job.job_id);

      if (updateError) {
        return serverError('Failed to retry job', updateError.message);
      }

      retriedPhases.push(job.phase);
    }

    // Update run status back to 'queued' if we retried anything
    if (retriedPhases.length > 0) {
      const { error: runError } = await supabase
        .from('runs')
        .update({ status: 'queued', completed_at: null, error: null })
        .eq('run_id', run_id);

      if (runError) {
        return serverError('Failed to update run status', runError.message);
      }
    }

    return Response.json({ run_id, retried_phases: retriedPhases });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
