import { cache } from 'react';
import { scoreLead, type ScoredLead } from './lead-score';
import { matchSupporter } from './supporter-dedup';
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
 * Our own supporters are not silently dropped: they are scored and flagged via
 * `existingSupporter` (exact/variant name match against the supporters list, or
 * an analyst exclusion in known_contacts). The UI hides flagged rows by default
 * behind a "show our supporters" toggle — they belong in Introductions as a
 * source of warm paths, not in the lead list (we already have access to them).
 */
export async function computeScoredLeads(supabase: SupabaseClient): Promise<ScoredLead[]> {
  const [persons, allConns, suppressions, exclusions, evidence, donations] = await Promise.all([
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
    // Evidence aggregates feed §18.2 confidence (corroboration + freshness) and
    // the Decide signal toggles (category + source breakdown).
    pageAll<{ entity_id: string; created_at: string; source: string; evidence_text: string }>(
      supabase, 'enrichment_evidence', 'entity_id, created_at, source, evidence_text',
    ),
    // Recorded giving (donation_events) is the strongest §18.1 affinity signal.
    pageAll<{ donor_entity_id: string }>(
      supabase, 'donation_events', 'donor_entity_id',
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
  // Signal categories + distinct sources per entity, for the Decide toggles.
  const sigCats = new Map<string, Record<string, number>>();
  const sigSources = new Map<string, Set<string>>();
  const evCat = (source: string, text: string): string => {
    const s = source.toLowerCase(), t = (text ?? '').toLowerCase();
    if (s.includes('companies_house')) return /trustee|charit|foundation/.test(t) ? 'charity' : 'directorship';
    if (s.includes('charity') || s.includes('360giving')) return 'charity';
    if (s.includes('electoral')) return 'political';
    if (s.includes('land')) return 'property';
    if (s.includes('forbes') || s.includes('rich')) return 'rich_list';
    if (s.includes('news') || s.includes('guardian') || s.includes('gdelt')) return 'news';
    if (s.includes('web_search') || s.includes('wiki')) return 'web';
    return 'other';
  };
  for (const e of evidence) {
    evidenceCount.set(e.entity_id, (evidenceCount.get(e.entity_id) ?? 0) + 1);
    const cur = newestEvidence.get(e.entity_id);
    if (!cur || e.created_at > cur) newestEvidence.set(e.entity_id, e.created_at);
    const cat = evCat(e.source, e.evidence_text);
    const m = sigCats.get(e.entity_id) ?? {};
    m[cat] = (m[cat] ?? 0) + 1;
    sigCats.set(e.entity_id, m);
    (sigSources.get(e.entity_id) ?? sigSources.set(e.entity_id, new Set()).get(e.entity_id)!).add(e.source);
  }
  // Recorded-giving counts per donor (affinity signal).
  const donationCount = new Map<string, number>();
  for (const d of donations) {
    if (d.donor_entity_id) donationCount.set(d.donor_entity_id, (donationCount.get(d.donor_entity_id) ?? 0) + 1);
  }

  // Fold the directorship signal (from connections) into the categories.
  for (const [id, n] of directorshipCount) {
    const m = sigCats.get(id) ?? {};
    m.directorship = Math.max(m.directorship ?? 0, n);
    sigCats.set(id, m);
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
          donationCount: donationCount.get(p.canonical_entity_id) ?? 0,
          signalCategories: sigCats.get(p.canonical_entity_id) ?? {},
          signalSources: (sigSources.get(p.canonical_entity_id)?.size ?? 0),
        },
      );
      if (excludedIds.has(p.canonical_entity_id)) {
        lead.existingSupporter = { matchName: p.display_name, kind: 'excluded', subType: null };
      } else {
        const sup = matchSupporter(p.display_name);
        if (sup) lead.existingSupporter = { matchName: sup.matchName, kind: sup.kind, subType: sup.subType };
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
