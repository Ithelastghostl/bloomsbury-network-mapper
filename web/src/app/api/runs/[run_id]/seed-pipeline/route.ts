import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { runSeedAugmentation, type OrchestratorConfig } from '@/lib/augmentation/orchestrator';

export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ run_id: string }> },
) => {
  try {
    const { run_id: runId } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return forbidden('Authentication required');
    const role = user.app_metadata?.role as string | undefined;
    if (role !== 'admin' && role !== 'engineering_admin') {
      return forbidden('Admin role required');
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return serverError('ANTHROPIC_API_KEY not configured');
    }

    const { data: run } = await supabase
      .from('runs')
      .select('run_id, run_type, status')
      .eq('run_id', runId)
      .single();

    if (!run) return apiError('not_found', 'Run not found', undefined, 404);
    if (run.run_type !== 'seed' && run.run_type !== 'hybrid') {
      return apiError('bad_request', 'Run must be seed or hybrid type');
    }

    const body = await request.json().catch(() => ({})) as Partial<OrchestratorConfig>;

    const config: OrchestratorConfig = {
      anthropicApiKey,
      maxConcurrent: body.maxConcurrent ?? 5,
      costCapUsd: body.costCapUsd ?? 50,
      phases: body.phases ?? ['research', 'network_mapping'],
    };

    await supabase.from('runs').update({ status: 'running' }).eq('run_id', runId);

    const result = await runSeedAugmentation(supabase, runId, config);

    return Response.json(result);
  } catch (err) {
    return serverError('Internal server error', err instanceof Error ? err.message : undefined);
  }
});
