import { cache } from 'react';
import type { EnrichedEntity, WealthData, EvidenceEntry, ConnectionEntry, DonationEntry, CrmStats, WealthBand } from './types';
import { loadSuppressions } from './suppressions';
import { buildEntitySignalsFromRows } from './signals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Run a `.in(column, ids)` query in parallel chunks and concat the rows.
 *
 * PostgREST degrades pathologically on a single large `IN (...)` list — an
 * 800-id lookup measured at ~7.5s, the same lookup in 200-id chunks at ~90ms
 * (a ~80x cliff, not a gradual curve). Chunking is therefore mandatory, not an
 * optimisation, anywhere an `.in()` list can grow with the connected-entity set.
 */
async function chunkedIn(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  ids: string[],
  chunkSize = 200,
): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
  const results = await Promise.all(
    chunks.map(c => supabase.from(table).select(columns).in(column, c)),
  );
  const out: Record<string, unknown>[] = [];
  for (const r of results) {
    // Surface a failed chunk instead of silently returning a partial result —
    // a dropped chunk would make an entity's wealth/evidence/connections vanish.
    if (r.error) throw new Error(`chunkedIn ${table}.${column}: ${r.error.message}`);
    if (r.data) out.push(...r.data);
  }
  return out;
}

function mergeWealth(
  sweepRow: Record<string, unknown> | null,
  attrs: Record<string, unknown>,
): WealthData | null {
  if (sweepRow) {
    const rawEvidence = sweepRow.evidence;
    return {
      band: (sweepRow.band as WealthBand) ?? 'unknown',
      score: (sweepRow.score as number) ?? 0,
      confidence: (sweepRow.confidence as number) ?? 0,
      evidence: Array.isArray(rawEvidence) ? (rawEvidence as WealthData['evidence']) : [],
    };
  }
  if (attrs?.wealth_band) {
    return {
      band: (attrs.wealth_band as WealthBand) ?? 'unknown',
      score: (attrs.wealth_score as number) ?? 0,
      confidence: 0.5,
      estimated_net_worth_gbp: attrs.estimated_net_worth_gbp as number | undefined,
      wealth_source: attrs.wealth_source as string | undefined,
      wealth_origin: attrs.wealth_origin as string | undefined,
      evidence_summary: attrs.evidence_summary as string | undefined,
    };
  }
  return null;
}

function inferState(
  hasWealth: boolean,
  hasEvidence: boolean,
): string {
  if (!hasEvidence && !hasWealth) return 'Discovered';
  if (hasEvidence || hasWealth) return 'Enriched';
  return 'Discovered';
}

export async function enrichEntities(
  supabase: SupabaseClient,
  entities: Array<{ canonical_entity_id: string; entity_type: string; display_name: string; source: string; attributes: Record<string, unknown> }>,
): Promise<EnrichedEntity[]> {
  if (!entities.length) return [];

  const ids = entities.map(e => e.canonical_entity_id);

  // Chunk every .in() — a single large IN list is an ~80x latency cliff on
  // PostgREST. Per-chunk .order() is dropped; ordering is reconstructed in JS
  // below where it matters (latest wealth estimate per entity).
  const [wealthRows, evidenceRows, outboundRows, inboundRowsRaw, coDirOut, coDirIn, donationRows, overrideRows, suppressions] = await Promise.all([
    chunkedIn(supabase, 'wealth_estimates', '*', 'entity_id', ids),
    chunkedIn(supabase, 'enrichment_evidence', '*', 'entity_id', ids),
    chunkedIn(supabase, 'network_connections', '*', 'source_entity_id', ids),
    chunkedIn(supabase, 'network_connections', '*', 'connected_entity_id', ids),
    // Co-director edges carry appointment/resignation dates — the freshness
    // signal for tie strength. Fetched both directions like network_connections.
    chunkedIn(supabase, 'co_director_edges', '*', 'seed_entity_id', ids),
    chunkedIn(supabase, 'co_director_edges', '*', 'co_director_entity_id', ids),
    // Recorded giving (donation_events) — the Giving-history dossier card.
    chunkedIn(supabase, 'donation_events', '*', 'donor_entity_id', ids),
    // Human wealth-band corrections (wealth_overrides) — human decisions win.
    // Tolerate the table being absent (migration 00016 not yet applied) so the
    // whole CRM doesn't 500 before the override feature is migrated in.
    chunkedIn(supabase, 'wealth_overrides', '*', 'entity_id', ids).catch(() => [] as Record<string, unknown>[]),
    loadSuppressions(supabase),
  ]);

  const overrideMap = new Map<string, Record<string, unknown>>();
  for (const o of overrideRows) overrideMap.set(o.entity_id as string, o);

  // Human suppressions win: overridden connections never reach the UI.
  const isSup = (c: Record<string, unknown>) => suppressions.isSuppressedConnection(c as { connection_id: string; source_entity_id: string; connected_entity_id: string | null });
  const outboundData = outboundRows.filter(c => !isSup(c));
  const inboundData = inboundRowsRaw.filter(c => !isSup(c));

  // Keep the latest estimate per entity (sort newest-first, then first-wins).
  const wealthSorted = [...wealthRows].sort((a, b) => String(b.assessed_at ?? '').localeCompare(String(a.assessed_at ?? '')));
  const wealthMap = new Map<string, Record<string, unknown>>();
  for (const w of wealthSorted) {
    if (!wealthMap.has(w.entity_id as string)) wealthMap.set(w.entity_id as string, w);
  }

  // Chunking dropped the per-query newest-first .order(); restore it so the
  // capped evidence drawers (.slice(0, N)) show the latest items, not an
  // arbitrary subset.
  const evidenceSorted = (evidenceRows as Array<Record<string, string>>)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  const evidenceMap = new Map<string, EvidenceEntry[]>();
  for (const e of evidenceSorted) {
    const list = evidenceMap.get(e.entity_id) ?? [];
    list.push({
      evidence_id: e.evidence_id,
      source: e.source,
      source_layer: e.source_layer,
      evidence_url: e.evidence_url,
      evidence_text: e.evidence_text,
      confidence: e.confidence as unknown as number,
      created_at: e.created_at,
    });
    evidenceMap.set(e.entity_id, list);
  }

  const connectionMap = new Map<string, ConnectionEntry[]>();
  // Outbound: person is source
  for (const c of outboundData) {
    const list = connectionMap.get(c.source_entity_id as string) ?? [];
    list.push({
      connection_id: c.connection_id as string,
      connected_entity_id: c.connected_entity_id as string,
      connection_type: c.connection_type as string,
      via_organisation: c.via_organisation as string | undefined,
      priority: c.priority as number,
      evidence: (c.evidence ?? {}) as Record<string, unknown>,
    });
    connectionMap.set(c.source_entity_id as string, list);
  }

  // Inbound: person is target — flip the direction so it shows as a connection
  for (const c of inboundData) {
    if (!c.source_entity_id) continue;
    const list = connectionMap.get(c.connected_entity_id as string) ?? [];
    // Avoid duplicating if the same pair exists in both directions
    if (list.some(x => x.connected_entity_id === c.source_entity_id && x.connection_type === c.connection_type)) continue;
    list.push({
      connection_id: (c.connection_id as string) + '_rev',
      connected_entity_id: c.source_entity_id as string,
      connection_type: c.connection_type as string,
      via_organisation: c.via_organisation as string | undefined,
      priority: (c.priority as number) ?? 0,
      evidence: (c.evidence ?? {}) as Record<string, unknown>,
    });
    connectionMap.set(c.connected_entity_id as string, list);
  }

  // Co-director edges: normalise both directions to (owner = one of our ids,
  // other = the co-director) so we can attach dates and fill any gaps.
  const coDirNorm = [
    ...coDirOut.map(d => ({ owner: d.seed_entity_id as string, other: d.co_director_entity_id as string, row: d })),
    ...coDirIn.map(d => ({ owner: d.co_director_entity_id as string, other: d.seed_entity_id as string, row: d })),
  ];
  for (const { owner, other, row } of coDirNorm) {
    if (!owner || !other || owner === other) continue;
    if (suppressions.isSuppressedPair(owner, other)) continue;
    const meta = {
      appointed_on: (row.appointed_on as string | null) ?? null,
      resigned_on: (row.resigned_on as string | null) ?? null,
      company_name: (row.company_name as string | null) ?? null,
    };
    const list = connectionMap.get(owner) ?? [];
    // Attach dates to an existing edge to the same person, else add a co-director edge.
    const existing = list.find(x => x.connected_entity_id === other);
    if (existing) {
      if (!existing.co_director) existing.co_director = meta;
      if (!existing.via_organisation && meta.company_name) existing.via_organisation = meta.company_name;
    } else {
      list.push({
        connection_id: (row.co_director_edge_id as string) ?? `codir_${owner}_${other}`,
        connected_entity_id: other,
        connection_type: 'CO_DIRECTOR_OF',
        via_organisation: meta.company_name ?? undefined,
        priority: 0,
        evidence: { company_name: meta.company_name, appointed_on: meta.appointed_on, resigned_on: meta.resigned_on },
        co_director: meta,
      });
    }
    connectionMap.set(owner, list);
  }

  // Restore the priority ordering the per-query .order() used to provide.
  for (const list of connectionMap.values()) {
    list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  // Flag downweighted ties (analyst said "real but weak"). The map key is the
  // owning entity, so the pair is (owner, connected). Kept, not removed — the UI
  // shows the reduced tie strength.
  for (const [ownerId, list] of connectionMap) {
    for (const c of list) {
      if (suppressions.isDownweightedPair(ownerId, c.connected_entity_id)) c.downweighted = true;
    }
  }

  // Recorded giving per donor (newest year first). Recipient ids are folded into
  // the name-resolution set below so the card can show the charity's name.
  const donationMap = new Map<string, Array<Record<string, unknown>>>();
  for (const d of donationRows) {
    const donor = d.donor_entity_id as string;
    (donationMap.get(donor) ?? donationMap.set(donor, []).get(donor)!).push(d);
  }

  // Resolve connected entity names (chunked — this set scales with the graph).
  const connectedIds = new Set<string>();
  for (const list of connectionMap.values()) {
    for (const c of list) connectedIds.add(c.connected_entity_id);
  }
  for (const d of donationRows) {
    if (d.recipient_entity_id) connectedIds.add(d.recipient_entity_id as string);
  }
  const nameMap = new Map<string, string>();
  if (connectedIds.size > 0) {
    const names = await chunkedIn(supabase, 'canonical_entities', 'canonical_entity_id, display_name', 'canonical_entity_id', [...connectedIds]);
    for (const n of names) {
      nameMap.set(n.canonical_entity_id as string, n.display_name as string);
    }
  }

  // Apply connected names
  for (const list of connectionMap.values()) {
    for (const c of list) {
      c.connected_name = nameMap.get(c.connected_entity_id);
    }
  }

  return entities.map(e => {
    const id = e.canonical_entity_id;
    const wealthRow = wealthMap.get(id) ?? null;
    let wealth = mergeWealth(wealthRow, e.attributes ?? {});
    // Human wealth-band correction wins over the automated band, but we keep the
    // original on `automated_band` so the UI can show what was overridden. When
    // there is no automated estimate at all, the override synthesises a minimal
    // WealthData so the corrected band still surfaces.
    const overrideRow = overrideMap.get(id);
    if (overrideRow) {
      const overrideBand = overrideRow.band as WealthBand;
      wealth = wealth ?? { band: 'unknown' as WealthBand, score: 0, confidence: 0, evidence: [] };
      wealth.override = {
        band: overrideBand,
        automated_band: wealth.band,
        reason: (overrideRow.reason as string | null) ?? null,
        author: (overrideRow.author as string) ?? 'analyst',
        created_at: (overrideRow.created_at as string) ?? '',
      };
      wealth.band = overrideBand;
    }
    const evidence = evidenceMap.get(id) ?? [];
    const connections = connectionMap.get(id) ?? [];

    const donations: DonationEntry[] = (donationMap.get(id) ?? [])
      .map(d => ({
        donation_event_id: d.donation_event_id as string,
        recipient_name: d.recipient_entity_id ? (nameMap.get(d.recipient_entity_id as string) ?? null) : null,
        amount: (d.amount as number | null) ?? null,
        currency: (d.currency as string | null) ?? null,
        year: (d.year as number | null) ?? null,
        source: (d.source as string | null) ?? null,
        evidence_url: (d.evidence_url as string | null) ?? null,
        detail: (d.detail as string | null) ?? null,
      }))
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

    // Build the enrichment-signal summary from rows already in hand (no extra query).
    const wealthEvidence = wealthRow && Array.isArray(wealthRow.evidence)
      ? wealthRow.evidence as Array<{ signal?: string; detail?: string; contribution?: number; source_layer?: string }>
      : null;
    const signals = buildEntitySignalsFromRows(
      id,
      wealthEvidence,
      (wealthRow?.assessed_at as string) ?? null,
      evidence.map(ev => ({ source: ev.source, source_layer: ev.source_layer, evidence_text: ev.evidence_text, evidence_url: ev.evidence_url, confidence: ev.confidence, created_at: ev.created_at })),
    );

    return {
      canonical_entity_id: id,
      entity_type: e.entity_type as 'person' | 'company',
      display_name: e.display_name,
      source: e.source,
      attributes: e.attributes ?? {},
      wealth,
      evidence,
      connections,
      donations,
      pipeline_state: inferState(!!wealth, evidence.length > 0),
      lead_source: 'unknown' as const,
      signals,
    };
  });
}

export async function fetchAllPersons(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, entity_type, display_name, source, attributes')
    .eq('entity_type', 'person')

    .order('display_name')
    .limit(1100);
  return data ?? [];
}

export async function fetchCompanies(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, entity_type, display_name, source, attributes')
    .eq('entity_type', 'company')

    .order('display_name')
    .limit(600);
  return data ?? [];
}

export const fetchStats = cache(async (supabase: SupabaseClient): Promise<CrmStats> => {
  const [personsRes, companiesRes, wealthRes, evidenceRes, connectionsRes] = await Promise.all([
    supabase.from('canonical_entities').select('*', { count: 'exact', head: true }).eq('entity_type', 'person'),
    supabase.from('canonical_entities').select('*', { count: 'exact', head: true }).eq('entity_type', 'company'),
    supabase.from('wealth_estimates').select('band').limit(1000),
    supabase.from('enrichment_evidence').select('*', { count: 'exact', head: true }),
    supabase.from('network_connections').select('*', { count: 'exact', head: true }),
  ]);

  const bands: Record<WealthBand, number> = { unknown: 0, '1m_5m': 0, '5m_25m': 0, '25m_100m': 0, '100m_plus': 0 };
  for (const w of wealthRes.data ?? []) {
    const b = w.band as WealthBand;
    if (b in bands) bands[b]++;
  }

  return {
    total_entities: (personsRes.count ?? 0) + (companiesRes.count ?? 0),
    total_persons: personsRes.count ?? 0,
    total_companies: companiesRes.count ?? 0,
    wealth_estimated: (wealthRes.data ?? []).length,
    evidence_entries: evidenceRes.count ?? 0,
    connections: connectionsRes.count ?? 0,
    wealth_bands: bands,
  };
});

export async function fetchEntityById(supabase: SupabaseClient, id: string): Promise<EnrichedEntity | null> {
  const { data } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, entity_type, display_name, source, attributes')
    .eq('canonical_entity_id', id)
    .single();

  if (!data) return null;
  const [enriched] = await enrichEntities(supabase, [data]);
  return enriched ?? null;
}
