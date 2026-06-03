import { getAdminClient } from '@/lib/supabase/admin';
import { apiError, notFound, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { requireAdminOrLocal } from '@/lib/crm/auth';

// POST /api/crm/entities/:canonical_entity_id/request-augmentation
// Marks a lead for wealth augmentation by setting attributes.augmentation_requested.
// The local tethered Claude Code agent reads GET /api/crm/augment-queue, researches,
// then POSTs results to /api/entities/:id/augment to persist.
export const POST = withIdempotency(async (
  _request: Request,
  { params }: { params: Promise<{ canonical_entity_id: string }> },
) => {
  try {
    const { canonical_entity_id } = await params;

    const denied = await requireAdminOrLocal();
    if (denied) return denied;

    const supabase = getAdminClient();

    const { data: entity, error: fetchErr } = await supabase
      .from('canonical_entities')
      .select('attributes')
      .eq('canonical_entity_id', canonical_entity_id)
      .single();

    if (fetchErr || !entity) return notFound('Entity not found');

    const attrs = (entity.attributes ?? {}) as Record<string, unknown>;
    if (attrs.wealth_augmented_at) {
      return apiError('already_augmented', 'Entity is already augmented');
    }

    const { error: updateErr } = await supabase
      .from('canonical_entities')
      .update({ attributes: { ...attrs, augmentation_requested: new Date().toISOString() } })
      .eq('canonical_entity_id', canonical_entity_id);

    if (updateErr) return serverError('Failed to queue augmentation', updateErr.message);

    return Response.json({ entity_id: canonical_entity_id, queued: true });
  } catch (err) {
    return serverError('Failed to queue augmentation', err instanceof Error ? err.message : undefined);
  }
});
