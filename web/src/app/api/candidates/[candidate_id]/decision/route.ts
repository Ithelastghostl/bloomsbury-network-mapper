/**
 * POST /api/candidates/:candidate_id/decision — capture reviewer decision (§20.7, §18.10)
 *
 * Body: { decision, reason_code?, notes? }
 * - Structured labels from §18.10
 * - Rejection requires a structured reason code per §6.1
 * - Wrong-person creates BOTH a candidate decision AND identity decision per R5.10, §6.2
 * - Cold-start flag per §18.5
 * - Decisions stored in app.human_decisions; persist across re-runs
 */

import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, notFound, serverError } from '@/lib/api-error';
import { generateId } from '@/lib/ulid';
import { withIdempotency } from '@/lib/with-idempotency';
import {
  DECISION_LABELS,
  type DecisionLabel,
  isRejection,
  rejectionReasonCode,
  decisionToState,
  isColdStart,
} from '@/lib/review/workflow';

export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ candidate_id: string }> },
) => {
  try {
    const { candidate_id } = await params;
    const body = await request.json();
    const { decision, reason_code, notes } = body;

    // Validate decision label
    if (!decision || !DECISION_LABELS.includes(decision as DecisionLabel)) {
      return apiError(
        'bad_request',
        `decision must be one of: ${DECISION_LABELS.join(', ')}`,
      );
    }

    const decisionLabel = decision as DecisionLabel;

    // Rejections require structured reason code per §6.1
    if (isRejection(decisionLabel)) {
      const expectedCode = rejectionReasonCode(decisionLabel);
      if (!reason_code) {
        return apiError('bad_request', 'reason_code is required for rejections');
      }
      if (expectedCode && reason_code !== expectedCode) {
        return apiError(
          'bad_request',
          `reason_code must be "${expectedCode}" for decision "${decisionLabel}"`,
        );
      }
    }

    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return forbidden('Authentication required');
    }

    // Fetch candidate recommendation
    const { data: candidate, error: fetchError } = await supabase
      .from('candidate_recommendations')
      .select('candidate_recommendation_id, run_id, seed_id, candidate_entity_id')
      .eq('candidate_recommendation_id', candidate_id)
      .single();

    if (fetchError || !candidate) {
      return notFound('Candidate recommendation not found');
    }

    // Cold-start check per §18.5
    const { count: totalDecisions } = await supabase
      .from('human_decisions')
      .select('*', { count: 'exact', head: true });

    await supabase
      .from('human_decisions')
      .select('candidate_recommendation_id')
      .limit(1000);

    // Count distinct seeds by joining through candidate_recommendations
    // Simplified: count distinct seeds from existing decisions
    const { data: distinctSeedData } = await supabase
      .rpc('count_distinct_decision_seeds')
      .single();

    const distinctSeeds = (distinctSeedData as { count: number } | null)?.count ?? 0;

    const coldStartFlag = isColdStart({
      totalDecisions: totalDecisions ?? 0,
      distinctSeeds,
    });

    // Store decision in human_decisions
    const decisionId = generateId();

    const { data: stored, error: insertError } = await supabase
      .from('human_decisions')
      .insert({
        human_decision_id: decisionId,
        candidate_recommendation_id: candidate_id,
        decision: decisionLabel,
        reason_code: reason_code ?? null,
        notes: notes ?? null,
        decided_by: user.id,
        cold_start_decision: coldStartFlag,
      })
      .select()
      .single();

    if (insertError) {
      return serverError('Failed to store decision', insertError.message);
    }

    // Update candidate workflow status
    const newStatus = decisionToState(decisionLabel);
    await supabase
      .from('candidate_recommendations')
      .update({ status: newStatus })
      .eq('candidate_recommendation_id', candidate_id);

    // Wrong-person rejection: also create identity decision per R5.10, §6.2, §6.3
    let identityDecisionId: string | null = null;
    if (decisionLabel === 'Rejected — wrong person') {
      // Fetch mention IDs for the candidate entity from identity clusters
      const { data: clusters } = await supabase
        .from('identity_clusters')
        .select('member_mention_ids')
        .eq('canonical_entity_id', candidate.candidate_entity_id);

      const mentionIds = (clusters ?? []).flatMap(c => c.member_mention_ids ?? []);

      // If there are at least 2 mentions, create a not-same-person decision
      // between first two mentions (the wrong merge)
      if (mentionIds.length >= 2) {
        identityDecisionId = generateId();
        await supabase
          .from('human_identity_decisions')
          .insert({
            identity_decision_id: identityDecisionId,
            entity_a_mention_id: mentionIds[0],
            entity_b_mention_id: mentionIds[1],
            decision: 'not_same_person',
            reason_code: 'wrong_person_rejection',
            notes: notes ?? 'Wrong-person rejection from review queue',
            decided_by: user.id,
            replay_on_future_runs: true,
          });
      }
    }

    return Response.json(
      {
        human_decision_id: stored.human_decision_id,
        cold_start_decision: coldStartFlag,
        ...(identityDecisionId ? { identity_decision_id: identityDecisionId } : {}),
      },
      { status: 201 },
    );
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
