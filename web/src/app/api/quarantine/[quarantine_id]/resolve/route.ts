/**
 * POST /api/quarantine/:id/resolve — resolve a quarantined record.
 * PRD ref: §20.3
 */

import { createClient } from '@/lib/supabase/server';
import { apiError, notFound, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';

export const POST = withIdempotency(
  async (
    _request: Request,
    { params }: { params: Promise<{ quarantine_id: string }> },
  ) => {
    try {
      const { quarantine_id } = await params;
      const supabase = await createClient();

      // Check record exists
      const { data: existing, error: fetchError } = await supabase
        .from('quarantine')
        .select('quarantine_id, resolved')
        .eq('quarantine_id', quarantine_id)
        .maybeSingle();

      if (fetchError) {
        return serverError('Failed to fetch quarantine record', fetchError.message);
      }
      if (!existing) {
        return notFound(`Quarantine record ${quarantine_id} not found`);
      }
      if (existing.resolved) {
        return apiError('conflict', 'Quarantine record is already resolved', undefined, 409);
      }

      const { error: updateError } = await supabase
        .from('quarantine')
        .update({ resolved: true })
        .eq('quarantine_id', quarantine_id);

      if (updateError) {
        return serverError('Failed to resolve quarantine record', updateError.message);
      }

      return Response.json({ ok: true });
    } catch (err) {
      return serverError(
        'Internal server error',
        err instanceof Error ? err.message : undefined,
      );
    }
  },
);
