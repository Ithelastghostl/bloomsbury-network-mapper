/**
 * POST /api/enrichment/refresh — refresh stale enrichment caches (F8.5-T3, §20.6).
 *
 * Accepts optional entity_id or source filter.
 * Finds stale cache entries and enqueues refresh jobs.
 */

import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, serverError } from '@/lib/api-error';
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

export const POST = withIdempotency(async (request: Request) => {
  try {
    if (augmentationDisabled()) return augmentationGone();

    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return forbidden('Authentication required');
    }

    // Parse optional filters
    let entityId: string | null = null;
    let sourceFilter: EnrichmentSource | null = null;
    try {
      const body = await request.json();
      if (body.entity_id) {
        entityId = body.entity_id;
      }
      if (body.source) {
        if (!VALID_SOURCES.includes(body.source)) {
          return apiError('bad_request', `Invalid source: ${body.source}`);
        }
        sourceFilter = body.source;
      }
    } catch {
      // Empty body is fine — refresh all stale entries
    }

    // Find stale enrichment signals (cache_expires_at < now)
    let query = supabase
      .from('enrichment_signals')
      .select('enrichment_signal_id, candidate_entity_id, source')
      .lt('cache_expires_at', new Date().toISOString());

    if (entityId) {
      query = query.eq('candidate_entity_id', entityId);
    }
    if (sourceFilter) {
      query = query.eq('source', sourceFilter);
    }

    const { data: staleSignals, error: queryError } = await query;

    if (queryError) {
      return serverError('Failed to query stale signals', queryError.message);
    }

    if (!staleSignals || staleSignals.length === 0) {
      return Response.json({ job_id: null, stale_count: 0 }, { status: 200 });
    }

    // Group stale signals by entity+source to avoid duplicate jobs
    const refreshTargets = new Map<string, { entity_id: string; source: string }>();
    for (const sig of staleSignals) {
      const key = `${sig.candidate_entity_id}:${sig.source}`;
      if (!refreshTargets.has(key)) {
        refreshTargets.set(key, {
          entity_id: sig.candidate_entity_id,
          source: sig.source,
        });
      }
    }

    // Enqueue a single refresh job with all targets
    const jobId = generateId();
    const { error: jobError } = await supabase.from('pipeline_jobs').insert({
      job_id: jobId,
      run_id: 'refresh_' + jobId, // Refresh jobs are standalone
      phase: 'enrich',
      status: 'queued',
      priority: 0, // Lower priority than on-demand enrichment
      attempts: 0,
      max_attempts: 3,
      payload: {
        refresh: true,
        targets: [...refreshTargets.values()],
      },
      enqueued_at: new Date().toISOString(),
    });

    if (jobError) {
      return serverError('Failed to enqueue refresh job', jobError.message);
    }

    return Response.json(
      { job_id: jobId, stale_count: refreshTargets.size },
      { status: 202 },
    );
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
