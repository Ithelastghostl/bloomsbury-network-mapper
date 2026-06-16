/**
 * POST /api/candidates/:candidate_id/enrich — trigger enrichment for a candidate (F8.5-T1, §20.6).
 *
 * Accept optional sources[] to specify which enrichment sources to run.
 * Enqueues enrichment job; signals stored on completion.
 */

import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, notFound, serverError } from '@/lib/api-error';
import { generateId } from '@/lib/ulid';
import { withIdempotency } from '@/lib/with-idempotency';
import type { EnrichmentSource } from '@/lib/enrichment/types';
import { augmentationDisabled, augmentationGone } from '@/lib/augmentation-guard';

const VALID_SOURCES: EnrichmentSource[] = [
  'companies_house',
  'charity_commission',
  'wikidata',
  'news',
];

export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ candidate_id: string }> },
) => {
  try {
    if (augmentationDisabled()) return augmentationGone();

    const { candidate_id } = await params;
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return forbidden('Authentication required');
    }

    // Fetch the candidate recommendation
    const { data: candidate, error: fetchError } = await supabase
      .from('candidate_recommendations')
      .select('candidate_recommendation_id, candidate_entity_id, run_id')
      .eq('candidate_recommendation_id', candidate_id)
      .single();

    if (fetchError || !candidate) {
      return notFound('Candidate recommendation not found');
    }

    // Parse optional sources from body
    let sources: EnrichmentSource[] = VALID_SOURCES;
    try {
      const body = await request.json();
      if (body.sources && Array.isArray(body.sources)) {
        const requested = body.sources as string[];
        const invalid = requested.filter(
          (s) => !VALID_SOURCES.includes(s as EnrichmentSource),
        );
        if (invalid.length > 0) {
          return apiError(
            'bad_request',
            `Invalid enrichment sources: ${invalid.join(', ')}`,
          );
        }
        sources = requested as EnrichmentSource[];
      }
    } catch {
      // Empty body is fine — use all sources
    }

    // Enqueue enrichment job
    const jobId = generateId();
    const { error: jobError } = await supabase.from('pipeline_jobs').insert({
      job_id: jobId,
      run_id: candidate.run_id,
      phase: 'enrich',
      status: 'queued',
      priority: 1,
      attempts: 0,
      max_attempts: 3,
      payload: {
        candidate_recommendation_id: candidate.candidate_recommendation_id,
        candidate_entity_id: candidate.candidate_entity_id,
        sources,
      },
      enqueued_at: new Date().toISOString(),
    });

    if (jobError) {
      return serverError('Failed to enqueue enrichment job', jobError.message);
    }

    return Response.json({ job_id: jobId }, { status: 202 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
