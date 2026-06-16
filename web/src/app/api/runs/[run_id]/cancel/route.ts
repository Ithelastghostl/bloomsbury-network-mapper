import { createClient } from '@/lib/supabase/server';
import { apiError, notFound, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { augmentationDisabled, augmentationGone } from '@/lib/augmentation-guard';

// POST /api/runs/:run_id/cancel -- cancel a run
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

    if (run.status === 'cancelled') {
      return Response.json({ ok: true });
    }

    if (run.status === 'completed' || run.status === 'rolled_back') {
      return apiError(
        'conflict',
        `Cannot cancel a run with status '${run.status}'`,
        undefined,
        409,
      );
    }

    // Cancel pending/queued/running jobs
    const { error: jobsError } = await supabase
      .from('pipeline_jobs')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('run_id', run_id)
      .in('status', ['queued', 'running']);

    if (jobsError) {
      return serverError('Failed to cancel pipeline jobs', jobsError.message);
    }

    // Set run status to cancelled
    const { error: updateError } = await supabase
      .from('runs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('run_id', run_id);

    if (updateError) {
      return serverError('Failed to cancel run', updateError.message);
    }

    return Response.json({ ok: true });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
