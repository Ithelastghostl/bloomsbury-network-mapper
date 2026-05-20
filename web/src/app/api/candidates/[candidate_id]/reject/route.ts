import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, notFound, serverError } from '@/lib/api-error';
import { generateId } from '@/lib/ulid';
import { withIdempotency } from '@/lib/with-idempotency';

// POST /api/candidates/:candidate_id/reject — write rejection to rejection_log (F7.3-T5)
// PRD ref: §16.3, §16.5 R3.6 — same-seed rejections suppressed in future runs.
export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ candidate_id: string }> },
) => {
  try {
    const { candidate_id } = await params;
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return forbidden('Authentication required');
    }

    const body = await request.json();
    const { reason_code } = body;

    if (!reason_code) {
      return apiError('bad_request', 'reason_code is required');
    }

    // Fetch the candidate recommendation to get seed_id and candidate_entity_id
    const { data: candidate, error: fetchError } = await supabase
      .from('candidate_recommendations')
      .select('candidate_recommendation_id, seed_id, candidate_entity_id')
      .eq('candidate_recommendation_id', candidate_id)
      .single();

    if (fetchError || !candidate) {
      return notFound('Candidate recommendation not found');
    }

    const rejectionId = generateId();

    // Upsert into rejection_log — unique(seed_id, candidate_entity_id)
    const { data, error } = await supabase
      .from('rejection_log')
      .upsert(
        {
          rejection_log_id: rejectionId,
          seed_id: candidate.seed_id,
          candidate_entity_id: candidate.candidate_entity_id,
          reason_code,
        },
        { onConflict: 'seed_id,candidate_entity_id' },
      )
      .select()
      .single();

    if (error) {
      return serverError('Failed to write rejection log', error.message);
    }

    return Response.json(data, { status: 201 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
