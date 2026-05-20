import { createClient } from '@/lib/supabase/server';
import { notFound, serverError, apiError } from '@/lib/api-error';
import { estimateCost, checkBudgetGate } from '@/lib/pipeline/budget';
import { withIdempotency } from '@/lib/with-idempotency';

// GET /api/runs/:run_id/budget → cost estimate for the run
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ run_id: string }> },
) {
  try {
    const { run_id } = await params;
    const supabase = await createClient();

    // Verify run exists
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('run_id, corpus_version, status')
      .eq('run_id', run_id)
      .single();

    if (runError || !run) {
      return notFound('Run not found');
    }

    // Count documents in this corpus version
    const { count: documentCount, error: docError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('corpus_version', run.corpus_version);

    if (docError) {
      return serverError('Failed to count documents', docError.message);
    }

    // Count active seeds
    const { count: seedCount, error: seedError } = await supabase
      .from('seeds')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    if (seedError) {
      return serverError('Failed to count seeds', seedError.message);
    }

    const estimate = estimateCost(documentCount ?? 0, seedCount ?? 0);

    return Response.json({
      run_id,
      document_count: documentCount ?? 0,
      seed_count: seedCount ?? 0,
      estimate,
    });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}

// POST /api/runs/:run_id/budget → approve budget for the run
export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ run_id: string }> },
) => {
  try {
    const { run_id } = await params;
    const body = await request.json();
    const { approved_by, threshold } = body;

    if (!approved_by || threshold == null) {
      return apiError(
        'bad_request',
        'approved_by and threshold are required',
        undefined,
        400,
      );
    }

    const supabase = await createClient();

    // Verify run exists
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('run_id, corpus_version, status')
      .eq('run_id', run_id)
      .single();

    if (runError || !run) {
      return notFound('Run not found');
    }

    // Count documents
    const { count: documentCount, error: docError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('corpus_version', run.corpus_version);

    if (docError) {
      return serverError('Failed to count documents', docError.message);
    }

    // Count seeds
    const { count: seedCount, error: seedError } = await supabase
      .from('seeds')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    if (seedError) {
      return serverError('Failed to count seeds', seedError.message);
    }

    const estimate = estimateCost(documentCount ?? 0, seedCount ?? 0);
    const withinThreshold = checkBudgetGate(estimate.total, threshold);

    const approval = {
      run_id,
      estimated_cost: estimate.total,
      approved: true,
      approved_by,
      approved_at: new Date().toISOString(),
      threshold,
      auto_approved: withinThreshold,
    };

    // Store approval in run payload
    const { error: updateError } = await supabase
      .from('runs')
      .update({
        extraction_prompt_versions: {
          ...((run as Record<string, unknown>).extraction_prompt_versions as Record<string, unknown> ?? {}),
          budget_approval: approval,
        },
      })
      .eq('run_id', run_id);

    if (updateError) {
      return serverError('Failed to store budget approval', updateError.message);
    }

    return Response.json(approval, { status: 201 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
