/**
 * GET /api/candidates/:candidate_recommendation_id — single candidate detail (F7.4-T2, §20.5)
 */

import { createClient } from '@/lib/supabase/server';
import { notFound, serverError } from '@/lib/api-error';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidate_id: string }> },
) {
  try {
    const { candidate_id: candidate_recommendation_id } = await params;
    const supabase = await createClient();

    // Fetch the candidate recommendation
    const { data: candidate, error: candidateError } = await supabase
      .from('candidate_recommendations')
      .select()
      .eq('candidate_recommendation_id', candidate_recommendation_id)
      .single();

    if (candidateError || !candidate) {
      return notFound('Candidate recommendation not found');
    }

    // Fetch the candidate entity details
    const { data: entity, error: entityError } = await supabase
      .from('canonical_entities')
      .select()
      .eq('canonical_entity_id', candidate.candidate_entity_id)
      .single();

    // Fetch enrichment signals for this candidate entity
    const { data: enrichmentSignals, error: enrichError } = await supabase
      .from('enrichment_signals')
      .select()
      .eq('candidate_entity_id', candidate.candidate_entity_id)
      .order('retrieved_at', { ascending: false });

    // Fetch human decisions for this recommendation
    const { data: decisions, error: decisionError } = await supabase
      .from('human_decisions')
      .select()
      .eq('candidate_recommendation_id', candidate_recommendation_id)
      .order('decided_at', { ascending: false });

    if (entityError) {
      return serverError('Failed to fetch entity details', entityError.message);
    }

    if (enrichError) {
      return serverError('Failed to fetch enrichment signals', enrichError.message);
    }

    if (decisionError) {
      return serverError('Failed to fetch decisions', decisionError.message);
    }

    return Response.json({
      ...candidate,
      entity: entity ?? null,
      enrichment_signals: enrichmentSignals ?? [],
      decisions: decisions ?? [],
    });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
