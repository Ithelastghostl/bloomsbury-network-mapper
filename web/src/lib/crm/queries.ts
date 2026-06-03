import { cache } from 'react';
import type { EnrichedEntity, WealthData, EvidenceEntry, ConnectionEntry, CrmStats, WealthBand } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

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

  const [wealthRes, evidenceRes, connectionRes] = await Promise.all([
    supabase.from('wealth_estimates').select('*').in('entity_id', ids).order('assessed_at', { ascending: false }),
    supabase.from('enrichment_evidence').select('*').in('entity_id', ids).order('created_at', { ascending: false }),
    supabase.from('network_connections').select('*').in('source_entity_id', ids).order('priority'),
  ]);

  // Rows are ordered newest-first; keep the latest estimate per entity.
  const wealthMap = new Map<string, Record<string, unknown>>();
  for (const w of wealthRes.data ?? []) {
    if (!wealthMap.has(w.entity_id)) wealthMap.set(w.entity_id, w);
  }

  const evidenceMap = new Map<string, EvidenceEntry[]>();
  for (const e of evidenceRes.data ?? []) {
    const list = evidenceMap.get(e.entity_id) ?? [];
    list.push({
      evidence_id: e.evidence_id,
      source: e.source,
      source_layer: e.source_layer,
      evidence_url: e.evidence_url,
      evidence_text: e.evidence_text,
      confidence: e.confidence,
      created_at: e.created_at,
    });
    evidenceMap.set(e.entity_id, list);
  }

  const connectionMap = new Map<string, ConnectionEntry[]>();
  for (const c of connectionRes.data ?? []) {
    const list = connectionMap.get(c.source_entity_id) ?? [];
    list.push({
      connection_id: c.connection_id,
      connected_entity_id: c.connected_entity_id,
      connection_type: c.connection_type,
      via_organisation: c.via_organisation,
      priority: c.priority,
      evidence: c.evidence ?? {},
    });
    connectionMap.set(c.source_entity_id, list);
  }

  // Resolve connected entity names
  const connectedIds = new Set<string>();
  for (const list of connectionMap.values()) {
    for (const c of list) connectedIds.add(c.connected_entity_id);
  }
  const nameMap = new Map<string, string>();
  if (connectedIds.size > 0) {
    const { data: names } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id, display_name')
      .in('canonical_entity_id', [...connectedIds]);
    for (const n of names ?? []) {
      nameMap.set(n.canonical_entity_id, n.display_name);
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
    const wealth = mergeWealth(wealthMap.get(id) ?? null, e.attributes ?? {});
    const evidence = evidenceMap.get(id) ?? [];
    const connections = connectionMap.get(id) ?? [];

    return {
      canonical_entity_id: id,
      entity_type: e.entity_type as 'person' | 'company',
      display_name: e.display_name,
      source: e.source,
      attributes: e.attributes ?? {},
      wealth,
      evidence,
      connections,
      pipeline_state: inferState(!!wealth, evidence.length > 0),
      lead_source: 'unknown' as const,
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
