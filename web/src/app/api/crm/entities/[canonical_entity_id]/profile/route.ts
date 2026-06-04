import { getAdminClient } from '@/lib/supabase/admin';
import { notFound, serverError } from '@/lib/api-error';
import { requireAdminOrLocal } from '@/lib/crm/auth';
import { fetchEntityById } from '@/lib/crm/queries';

// GET /api/crm/entities/:canonical_entity_id/profile
// Returns the EnrichedEntity (wealth, connections, evidence) for the graph
// slide-in panel. Same shape the full /crm/entity/:id detail page renders,
// exposed as JSON so the client-side graph can fetch it on node click.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ canonical_entity_id: string }> },
) {
  try {
    const { canonical_entity_id } = await params;

    const denied = await requireAdminOrLocal();
    if (denied) return denied;

    const supabase = getAdminClient();
    const entity = await fetchEntityById(supabase, canonical_entity_id);

    if (!entity) return notFound('Entity not found');

    return Response.json(entity);
  } catch (err) {
    return serverError('Failed to load entity profile', err instanceof Error ? err.message : undefined);
  }
}
