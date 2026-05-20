import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, serverError } from '@/lib/api-error';

// GET /api/identity/decisions?entity_id= — decisions for specified entity (§20.4)
export async function GET(request: NextRequest) {
  try {
    const entityId = request.nextUrl.searchParams.get('entity_id');

    if (!entityId) {
      return apiError('bad_request', 'entity_id query parameter is required');
    }

    const supabase = await createClient();

    // Find mention IDs belonging to this canonical entity via identity_clusters
    const { data: clusters, error: clusterError } = await supabase
      .from('identity_clusters')
      .select('member_mention_ids')
      .eq('canonical_entity_id', entityId);

    if (clusterError) {
      return serverError('Failed to fetch clusters', clusterError.message);
    }

    const mentionIds = (clusters ?? []).flatMap((c) => c.member_mention_ids ?? []);
    const uniqueMentionIds = [...new Set(mentionIds)];

    if (uniqueMentionIds.length === 0) {
      return Response.json([]);
    }

    // Find decisions where either entity_a or entity_b is one of our mention IDs
    const { data: decisions, error: decisionError } = await supabase
      .from('human_identity_decisions')
      .select()
      .or(
        `entity_a_mention_id.in.(${uniqueMentionIds.join(',')}),` +
        `entity_b_mention_id.in.(${uniqueMentionIds.join(',')})`,
      )
      .order('decided_at', { ascending: false });

    if (decisionError) {
      return serverError('Failed to fetch decisions', decisionError.message);
    }

    return Response.json(decisions ?? []);
  } catch (err) {
    return serverError(
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
