import { createClient } from '@/lib/supabase/server';
import { notFound, serverError } from '@/lib/api-error';

// GET /api/runs/:run_id -- run details with phase progress summary
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ run_id: string }> },
) {
  try {
    const { run_id } = await params;
    const supabase = await createClient();

    const { data: run, error: runError } = await supabase
      .from('runs')
      .select()
      .eq('run_id', run_id)
      .single();

    if (runError || !run) {
      return notFound('Run not found');
    }

    // Phase progress summary: count jobs grouped by phase and status
    const { data: jobs, error: jobsError } = await supabase
      .from('pipeline_jobs')
      .select('phase, status')
      .eq('run_id', run_id);

    if (jobsError) {
      return serverError('Failed to fetch pipeline jobs', jobsError.message);
    }

    const phases: Record<string, Record<string, number>> = {};
    for (const job of jobs ?? []) {
      if (!phases[job.phase]) phases[job.phase] = {};
      phases[job.phase][job.status] = (phases[job.phase][job.status] ?? 0) + 1;
    }

    return Response.json({ ...run, phases });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
