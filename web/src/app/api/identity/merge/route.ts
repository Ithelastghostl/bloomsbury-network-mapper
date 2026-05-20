import { createClient } from '@/lib/supabase/server';
import { apiError, serverError } from '@/lib/api-error';
import { generateId } from '@/lib/ulid';
import { withIdempotency } from '@/lib/with-idempotency';

// POST /api/identity/merge — store same-person decision (§15.5, §20.4, §24)
export const POST = withIdempotency(async (request: Request) => {
  try {
    const body = await request.json();
    const { entity_a_mention_id, entity_b_mention_id, reason_code, notes } = body;

    if (!entity_a_mention_id || !entity_b_mention_id || !reason_code) {
      return apiError(
        'bad_request',
        'entity_a_mention_id, entity_b_mention_id, and reason_code are required',
      );
    }

    if (entity_a_mention_id === entity_b_mention_id) {
      return apiError('bad_request', 'Cannot merge an entity with itself');
    }

    const supabase = await createClient();

    // Verify both mentions exist
    const { data: mentionA } = await supabase
      .from('entity_mentions')
      .select('entity_mention_id')
      .eq('entity_mention_id', entity_a_mention_id)
      .single();

    const { data: mentionB } = await supabase
      .from('entity_mentions')
      .select('entity_mention_id')
      .eq('entity_mention_id', entity_b_mention_id)
      .single();

    if (!mentionA || !mentionB) {
      return apiError('not_found', 'One or both entity mentions not found', undefined, 404);
    }

    // Check for existing active decision between these mentions (supersede it)
    const { data: existing } = await supabase
      .from('human_identity_decisions')
      .select('identity_decision_id')
      .or(
        `and(entity_a_mention_id.eq.${entity_a_mention_id},entity_b_mention_id.eq.${entity_b_mention_id}),` +
        `and(entity_a_mention_id.eq.${entity_b_mention_id},entity_b_mention_id.eq.${entity_a_mention_id})`,
      )
      .is('superseded_by', null);

    const decisionId = generateId();

    // Supersede any existing decisions between these mentions
    if (existing && existing.length > 0) {
      for (const prev of existing) {
        await supabase
          .from('human_identity_decisions')
          .update({ superseded_by: decisionId })
          .eq('identity_decision_id', prev.identity_decision_id);
      }
    }

    // Get user from auth (decided_by)
    const { data: { user } } = await supabase.auth.getUser();
    const decidedBy = user?.id ?? 'system';

    const { data, error } = await supabase
      .from('human_identity_decisions')
      .insert({
        identity_decision_id: decisionId,
        entity_a_mention_id,
        entity_b_mention_id,
        decision: 'same_person',
        reason_code,
        notes: notes ?? null,
        decided_by: decidedBy,
        replay_on_future_runs: true,
      })
      .select()
      .single();

    if (error) {
      return serverError('Failed to create merge decision', error.message);
    }

    return Response.json({ identity_decision_id: data.identity_decision_id }, { status: 201 });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
});
