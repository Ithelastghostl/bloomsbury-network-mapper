/**
 * POST /api/candidates/:candidate_id/intro-status — store intro outcomes (§20.7, §6.4)
 *
 * Body: { intro_type, intro_date, outcome, notes? }
 * Stores in app.intro_outcomes.
 */

import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, notFound, serverError } from '@/lib/api-error';
import { generateId } from '@/lib/ulid';
import { withIdempotency } from '@/lib/with-idempotency';
import { isValidState, isValidTransition, type WorkflowState } from '@/lib/review/workflow';

const VALID_OUTCOMES = [
  'intro_requested',
  'intro_declined',
  'intro_made',
  'meeting_booked',
  'converted',
] as const;

type IntroOutcomeStatus = (typeof VALID_OUTCOMES)[number];

/** Map intro outcome to the workflow state it implies */
const OUTCOME_TO_STATE: Record<IntroOutcomeStatus, WorkflowState> = {
  'intro_requested': 'Intro Requested',
  'intro_declined': 'Rejected',
  'intro_made': 'Intro Made',
  'meeting_booked': 'Meeting',
  'converted': 'Converted',
};

export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ candidate_id: string }> },
) => {
  try {
    const { candidate_id } = await params;
    const body = await request.json();
    const { intro_type, intro_date, outcome, notes } = body;

    if (!outcome || !VALID_OUTCOMES.includes(outcome as IntroOutcomeStatus)) {
      return apiError(
        'bad_request',
        `outcome must be one of: ${VALID_OUTCOMES.join(', ')}`,
      );
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
      .select('candidate_recommendation_id, seed_id, status')
      .eq('candidate_recommendation_id', candidate_id)
      .single();

    if (fetchError || !candidate) {
      return notFound('Candidate recommendation not found');
    }

    // Determine new workflow state
    const newState = OUTCOME_TO_STATE[outcome as IntroOutcomeStatus];

    // Validate state transition if current status is a valid workflow state
    if (isValidState(candidate.status)) {
      if (!isValidTransition(candidate.status as WorkflowState, newState)) {
        return apiError(
          'bad_request',
          `Cannot transition from "${candidate.status}" to "${newState}" for outcome "${outcome}"`,
        );
      }
    }

    const outcomeId = generateId();

    const { data: stored, error: insertError } = await supabase
      .from('intro_outcomes')
      .insert({
        intro_outcome_id: outcomeId,
        candidate_recommendation_id: candidate_id,
        seed_id: candidate.seed_id,
        intro_status: outcome,
        decline_reason: outcome === 'intro_declined' ? (notes ?? null) : null,
        meeting_at: outcome === 'meeting_booked' ? (intro_date ?? null) : null,
        converted: outcome === 'converted' ? true : null,
        notes: notes ?? null,
        recorded_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      return serverError('Failed to store intro outcome', insertError.message);
    }

    // Update candidate workflow status
    await supabase
      .from('candidate_recommendations')
      .update({ status: newState })
      .eq('candidate_recommendation_id', candidate_id);

    return Response.json({ intro_outcome_id: stored.intro_outcome_id }, { status: 201 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
