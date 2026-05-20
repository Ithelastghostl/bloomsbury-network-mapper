/**
 * GET /api/candidates/:candidate_id/enrichment — return all enrichment signals (F8.5-T2, §20.6).
 *
 * Returns enrichment signals for the candidate entity with match confidence per signal.
 */

import { createClient } from '@/lib/supabase/server';
import { notFound, serverError } from '@/lib/api-error';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidate_id: string }> },
) {
  try {
    const { candidate_id } = await params;
    const supabase = await createClient();

    // Fetch the candidate recommendation to get entity ID
    const { data: candidate, error: fetchError } = await supabase
      .from('candidate_recommendations')
      .select('candidate_entity_id')
      .eq('candidate_recommendation_id', candidate_id)
      .single();

    if (fetchError || !candidate) {
      return notFound('Candidate recommendation not found');
    }

    // Fetch all enrichment signals for this candidate entity
    const { data: signals, error: signalError } = await supabase
      .from('enrichment_signals')
      .select()
      .eq('candidate_entity_id', candidate.candidate_entity_id)
      .order('retrieved_at', { ascending: false });

    if (signalError) {
      return serverError('Failed to fetch enrichment signals', signalError.message);
    }

    return Response.json(signals ?? []);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
