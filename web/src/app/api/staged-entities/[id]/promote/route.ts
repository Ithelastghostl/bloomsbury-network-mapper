import { createClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/ulid';
import { apiError, forbidden, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';

export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return forbidden('Authentication required');
    const role = user.app_metadata?.role as string | undefined;
    if (!role || !['admin', 'engineering_admin', 'senior_reviewer', 'lead_owner'].includes(role)) {
      return forbidden('Senior reviewer or higher required');
    }

    const body = await request.json();
    const { action } = body as { action: 'promote' | 'reject' | 'merge'; merge_target_id?: string };

    const { data: staged, error } = await supabase
      .from('staged_entities')
      .select('*')
      .eq('staged_entity_id', id)
      .single();

    if (error || !staged) {
      return apiError('not_found', 'Staged entity not found', undefined, 404);
    }

    if (staged.promotion_status !== 'pending') {
      return apiError('bad_request', `Entity already ${staged.promotion_status}`);
    }

    if (action === 'reject') {
      await supabase.from('staged_entities').update({
        promotion_status: 'rejected',
      }).eq('staged_entity_id', id);

      return Response.json({ staged_entity_id: id, promotion_status: 'rejected' });
    }

    if (action === 'merge') {
      const mergeTargetId = body.merge_target_id;
      if (!mergeTargetId) return apiError('bad_request', 'merge_target_id required for merge action');

      await supabase.from('entity_aliases').insert({
        alias_id: generateId(),
        alias_entity_id: id,
        canonical_entity_id: mergeTargetId,
        alias_source: 'manual_review',
      });

      await supabase.from('staged_entities').update({
        promotion_status: 'merged',
        promoted_entity_id: mergeTargetId,
      }).eq('staged_entity_id', id);

      return Response.json({ staged_entity_id: id, promotion_status: 'merged', promoted_entity_id: mergeTargetId });
    }

    // action === 'promote': create new canonical entity
    const entityId = generateId();
    await supabase.from('canonical_entities').insert({
      canonical_entity_id: entityId,
      entity_type: staged.entity_type,
      display_name: staged.display_name,
      first_seen_run_id: staged.source_run_id ?? entityId,
      last_seen_run_id: staged.source_run_id ?? entityId,
      attributes: staged.attributes,
      source: 'augmentation',
    });

    await supabase.from('staged_entities').update({
      promotion_status: 'promoted',
      promoted_entity_id: entityId,
    }).eq('staged_entity_id', id);

    return Response.json({ staged_entity_id: id, promotion_status: 'promoted', canonical_entity_id: entityId }, { status: 201 });
  } catch (err) {
    return serverError('Internal server error', err instanceof Error ? err.message : undefined);
  }
});
