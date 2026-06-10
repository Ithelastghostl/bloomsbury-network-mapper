import { cache } from 'react';
import { scoreLead, type ScoredLead } from './lead-score';
import { matchExistingDonor } from './donor-dedup';
import { loadSuppressions } from './suppressions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

async function pageAll<T>(supabase: SupabaseClient, table: string, columns: string, filter?: (q: unknown) => unknown): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    let q = supabase.from(table).select(columns).range(offset, offset + 999);
    if (filter) q = filter(q);
    const { data } = await q;
    if (!data?.length) break;
    all.push(...(data as T[]));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

/**
 * Load and score every person as a lead — the single source for the Decide
 * views, the CSV export, and the score-persistence script.
 *
 * Current donors are not silently dropped: they are scored and flagged via
 * `existingDonor` (exact/variant name match against the supporters list, or
 * an analyst exclusion in known_contacts). The UI hides flagged rows by
 * default behind a "show existing donors" toggle.
 */
export async function computeScoredLeads(supabase: SupabaseClient): Promise<ScoredLead[]> {
  const [persons, allConns, suppressions, exclusions] = await Promise.all([
    pageAll<{ canonical_entity_id: string; display_name: string; attributes: Record<string, unknown> }>(
      supabase, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => q.eq('entity_type', 'person'),
    ),
    pageAll<{ connection_id: string; source_entity_id: string; connected_entity_id: string | null; via_organisation: string | null }>(
      supabase, 'network_connections', 'connection_id, source_entity_id, connected_entity_id, via_organisation',
    ),
    loadSuppressions(supabase),
    pageAll<{ canonical_entity_id: string }>(
      supabase, 'known_contacts', 'canonical_entity_id, exclude_as_candidate',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => q.eq('exclude_as_candidate', true),
    ),
  ]);

  const conns = allConns.filter(c => !suppressions.isSuppressedConnection(c));
  const excludedIds = new Set(exclusions.map(e => e.canonical_entity_id));

  const connCount = new Map<string, number>();
  for (const c of conns) {
    if (c.source_entity_id) connCount.set(c.source_entity_id, (connCount.get(c.source_entity_id) ?? 0) + 1);
    if (c.connected_entity_id) connCount.set(c.connected_entity_id, (connCount.get(c.connected_entity_id) ?? 0) + 1);
  }

  const charityOverlap = new Map<string, number>();
  for (const c of conns) {
    const via = c.via_organisation ?? '';
    if (/foundation|trust|charit/i.test(via) && c.source_entity_id) {
      charityOverlap.set(c.source_entity_id, (charityOverlap.get(c.source_entity_id) ?? 0) + 1);
    }
  }

  return persons
    .map(p => {
      const lead = scoreLead(
        p.canonical_entity_id,
        p.display_name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.attributes ?? {}) as any,
        connCount.get(p.canonical_entity_id) ?? 0,
        charityOverlap.get(p.canonical_entity_id) ?? 0,
      );
      if (excludedIds.has(p.canonical_entity_id)) {
        lead.existingDonor = { matchName: p.display_name, kind: 'excluded' };
      } else {
        const donor = matchExistingDonor(p.display_name);
        if (donor) lead.existingDonor = { matchName: donor.matchName, kind: donor.kind };
      }
      return lead;
    })
    .filter(l => l.compositeScore > 0 || l.pathCount > 0 || l.connectivity > 0)
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

/** React-cached wrapper for server components (one load per render). */
export const loadScoredLeads = cache(computeScoredLeads);
