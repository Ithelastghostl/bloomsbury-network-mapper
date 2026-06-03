import { getAdminClient } from '@/lib/supabase/admin';
import { serverError } from '@/lib/api-error';

interface TargetEntity {
  canonical_entity_id: string;
  display_name: string;
  entity_type: string;
  attributes: Record<string, unknown>;
  connection_count: number;
  current_band: string | null;
  requested_at: string | null;
}

// GET /api/crm/augment-queue
// Returns persons marked for augmentation (attributes.augmentation_requested set)
// and not yet augmented, in the TargetEntity shape the wealth-augment CLI and the
// local tethered agent understand. The agent researches each, then POSTs results
// to /api/entities/:id/augment.
export async function GET() {
  try {
    const supabase = getAdminClient();

    const { data: entities, error } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name, entity_type, attributes')
      .eq('entity_type', 'person')
      .not('attributes->>augmentation_requested', 'is', null)
      .is('attributes->>wealth_augmented_at', null);

    if (error) return serverError('Failed to load queue', error.message);

    const rows = (entities ?? []) as Array<{
      canonical_entity_id: string;
      display_name: string;
      entity_type: string;
      attributes: Record<string, unknown>;
    }>;

    // Connection counts for context (so the agent knows who's well-connected).
    const ids = rows.map(r => r.canonical_entity_id);
    const countMap = new Map<string, number>();
    if (ids.length > 0) {
      const { data: conns } = await supabase
        .from('network_connections')
        .select('source_entity_id')
        .in('source_entity_id', ids);
      for (const c of conns ?? []) {
        countMap.set(c.source_entity_id, (countMap.get(c.source_entity_id) ?? 0) + 1);
      }
    }

    const targets: TargetEntity[] = rows.map(r => ({
      canonical_entity_id: r.canonical_entity_id,
      display_name: r.display_name,
      entity_type: r.entity_type,
      attributes: r.attributes ?? {},
      connection_count: countMap.get(r.canonical_entity_id) ?? 0,
      current_band: (r.attributes?.wealth_band as string) ?? null,
      requested_at: (r.attributes?.augmentation_requested as string) ?? null,
    }));

    targets.sort((a, b) => (b.requested_at ?? '').localeCompare(a.requested_at ?? ''));

    return Response.json({ count: targets.length, targets });
  } catch (err) {
    return serverError('Failed to load queue', err instanceof Error ? err.message : undefined);
  }
}
