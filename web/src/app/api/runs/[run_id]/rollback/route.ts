import { createClient } from '@/lib/supabase/server';
import { notFound, serverError, apiError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { augmentationDisabled, augmentationGone } from '@/lib/augmentation-guard';

// POST /api/runs/:run_id/rollback -- rollback a run
// Soft-deletes artefacts tagged with the run_id; preserves human decisions
export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ run_id: string }> },
) => {
  try {
    if (augmentationDisabled()) return augmentationGone();

    const { run_id } = await params;
    const supabase = await createClient();
    const now = new Date().toISOString();

    // Verify run exists
    const { data: run, error: fetchError } = await supabase
      .from('runs')
      .select('run_id, status')
      .eq('run_id', run_id)
      .single();

    if (fetchError || !run) {
      return notFound('Run not found');
    }

    if (run.status === 'rolled_back') {
      return Response.json({
        ok: true,
        run_id,
        already_rolled_back: true,
        summary: {},
      });
    }

    if (run.status === 'running' || run.status === 'queued') {
      return apiError(
        'conflict',
        'Cannot rollback a run that is still active. Cancel it first.',
        undefined,
        409,
      );
    }

    const summary: Record<string, number> = {};

    // Soft-delete artefact tables for this run_id
    // Order matters: respect FK constraints (children first)
    const artefactTables = [
      'entity_mentions',
      'evidence_spans',
      'extraction_runs',
      'relationships',
      'donation_events',
      'candidate_recommendations',
      'enrichment_signals',
      'graph_snapshots',
    ] as const;

    for (const table of artefactTables) {
      // enrichment_signals doesn't have run_id -- skip direct soft-delete
      // candidate_recommendations has run_id
      if (table === 'enrichment_signals') {
        // Soft-delete enrichment signals linked to candidate recommendations from this run
        const { data: candidates } = await supabase
          .from('candidate_recommendations')
          .select('candidate_entity_id')
          .eq('run_id', run_id)
          .is('deleted_at', null);

        if (candidates && candidates.length > 0) {
          const entityIds = candidates.map((c) => c.candidate_entity_id);
          const { count, error } = await supabase
            .from('enrichment_signals')
            .update({ deleted_at: now }, { count: 'exact' })
            .in('candidate_entity_id', entityIds)
            .is('deleted_at', null);

          if (error) {
            return serverError(
              `Failed to soft-delete ${table}`,
              error.message,
            );
          }
          summary[table] = count ?? 0;
        } else {
          summary[table] = 0;
        }
        continue;
      }

      const { count, error } = await supabase
        .from(table)
        .update({ deleted_at: now }, { count: 'exact' })
        .eq('run_id', run_id)
        .is('deleted_at', null);

      if (error) {
        return serverError(`Failed to soft-delete ${table}`, error.message);
      }
      summary[table] = count ?? 0;
    }

    // Mark pipeline jobs as cancelled
    const { error: jobsError } = await supabase
      .from('pipeline_jobs')
      .update({ status: 'cancelled', finished_at: now })
      .eq('run_id', run_id)
      .in('status', ['queued', 'running']);

    if (jobsError) {
      return serverError('Failed to cancel pipeline jobs', jobsError.message);
    }

    // Set run status to rolled_back
    const { error: updateError } = await supabase
      .from('runs')
      .update({ status: 'rolled_back', completed_at: now })
      .eq('run_id', run_id);

    if (updateError) {
      return serverError('Failed to rollback run', updateError.message);
    }

    return Response.json({ ok: true, run_id, summary });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
