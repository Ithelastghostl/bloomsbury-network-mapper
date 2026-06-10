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
  const [persons, allConns, suppressions, exclusions, evidence] = await Promise.all([
    pageAll<{ canonical_entity_id: string; display_name: string; attributes: Record<string, unknown> }>(
      supabase, 'canonical_entities', 'canonical_entity_id, display_name, entity_type, attributes',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => q.eq('entity_type', 'person'),
    ),
    pageAll<{ connection_id: string; source_entity_id: string; connected_entity_id: string | null; via_organisation: string | null; connection_type: string }>(
      supabase, 'network_connections', 'connection_id, source_entity_id, connected_entity_id, via_organisation, connection_type',
    ),
    loadSuppressions(supabase),
    pageAll<{ canonical_entity_id: string }>(
      supabase, 'known_contacts', 'canonical_entity_id, exclude_as_candidate',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => q.eq('exclude_as_candidate', true),
    ),
    // Evidence aggregates feed §18.2 confidence (corroboration + freshness).
    pageAll<{ entity_id: string; created_at: string }>(
      supabase, 'enrichment_evidence', 'entity_id, created_at',
    ),
  ]);

  const conns = allConns.filter(c => !suppressions.isSuppressedConnection(c));
  const excludedIds = new Set(exclusions.map(e => e.canonical_entity_id));

  const connCount = new Map<string, number>();
  const directorshipCount = new Map<string, number>();
  for (const c of conns) {
    if (c.source_entity_id) connCount.set(c.source_entity_id, (connCount.get(c.source_entity_id) ?? 0) + 1);
    if (c.connected_entity_id) connCount.set(c.connected_entity_id, (connCount.get(c.connected_entity_id) ?? 0) + 1);
    // §18.3 capacity: directorship / trustee ties are observable-capacity signals.
    if (c.source_entity_id && /DIRECTOR|TRUSTEE/i.test(c.connection_type ?? '')) {
      directorshipCount.set(c.source_entity_id, (directorshipCount.get(c.source_entity_id) ?? 0) + 1);
    }
  }

  const charityOverlap = new Map<string, number>();
  for (const c of conns) {
    const via = c.via_organisation ?? '';
    if (/foundation|trust|charit/i.test(via) && c.source_entity_id) {
      charityOverlap.set(c.source_entity_id, (charityOverlap.get(c.source_entity_id) ?? 0) + 1);
    }
  }

  const evidenceCount = new Map<string, number>();
  const newestEvidence = new Map<string, string>();
  for (const e of evidence) {
    evidenceCount.set(e.entity_id, (evidenceCount.get(e.entity_id) ?? 0) + 1);
    const cur = newestEvidence.get(e.entity_id);
    if (!cur || e.created_at > cur) newestEvidence.set(e.entity_id, e.created_at);
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
        {
          evidenceCount: evidenceCount.get(p.canonical_entity_id) ?? 0,
          newestEvidenceAt: newestEvidence.get(p.canonical_entity_id) ?? null,
          directorshipCount: directorshipCount.get(p.canonical_entity_id) ?? 0,
        },
      );
      if (excludedIds.has(p.canonical_entity_id)) {
        lead.existingDonor = { matchName: p.display_name, kind: 'excluded' };
      } else {
        const donor = matchExistingDonor(p.display_name);
        if (donor) lead.existingDonor = { matchName: donor.matchName, kind: donor.kind };
      }
      return lead;
    })
    // Keep only leads with a real signal. Note priority is never exactly 0 (the
    // §18 strategic-fit baseline floors it at ~3 for everyone), so we filter on
    // actual signals — a reachability path, a connection, wealth, or affinity —
    // rather than priority > 0, to avoid surfacing zero-signal people.
    .filter(l => l.pathCount > 0 || l.connectionCount > 0 || l.dimensions.capacity > 0 || l.dimensions.affinity > 0)
    .sort((a, b) => b.priority - a.priority);
}

/** React-cached wrapper for server components (one load per render). */
export const loadScoredLeads = cache(computeScoredLeads);
