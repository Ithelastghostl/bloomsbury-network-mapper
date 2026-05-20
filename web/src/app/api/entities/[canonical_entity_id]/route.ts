import { createClient } from '@/lib/supabase/server';
import { notFound, serverError } from '@/lib/api-error';

// GET /api/entities/:canonical_entity_id — entity with mentions, clusters, attributes
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ canonical_entity_id: string }> },
) {
  try {
    const { canonical_entity_id } = await params;
    const supabase = await createClient();

    // Fetch canonical entity
    const { data: entity, error: entityError } = await supabase
      .from('canonical_entities')
      .select()
      .eq('canonical_entity_id', canonical_entity_id)
      .single();

    if (entityError || !entity) {
      return notFound('Entity not found');
    }

    // Fetch identity clusters for this entity
    const { data: clusters, error: clustersError } = await supabase
      .from('identity_clusters')
      .select()
      .eq('canonical_entity_id', canonical_entity_id)
      .order('created_at', { ascending: false });

    if (clustersError) {
      return serverError('Failed to fetch clusters', clustersError.message);
    }

    // Collect all mention IDs from clusters
    const mentionIds = (clusters ?? []).flatMap((c) => c.member_mention_ids ?? []);
    const uniqueMentionIds = [...new Set(mentionIds)];

    // Fetch entity mentions
    let mentions: unknown[] = [];
    if (uniqueMentionIds.length > 0) {
      const { data: mentionData, error: mentionsError } = await supabase
        .from('entity_mentions')
        .select()
        .in('entity_mention_id', uniqueMentionIds);

      if (mentionsError) {
        return serverError('Failed to fetch mentions', mentionsError.message);
      }
      mentions = mentionData ?? [];
    }

    return Response.json({
      ...entity,
      clusters: clusters ?? [],
      mentions,
    });
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
