import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/ulid';
import type {
  GraphEnrichmentSignal,
  DiscoveredRelationship,
  DiscoveredArticle,
  UnifiedSweepResult,
  WealthBand,
} from '@/lib/enrichment/types';
import type { WealthAssessment } from '@/lib/enrichment/unified-sweep';

type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface PersistSweepOptions {
  runId?: string;
  sweepRunId?: string;
  batchSize?: number;
}

export interface PersistSweepResult {
  sweepRunId: string;
  entitiesCreated: number;
  relationshipsCreated: number;
  articlesStored: number;
  enrichmentSignalsStored: number;
  evidenceRecordsCreated: number;
}

const DEFAULT_BATCH = 50;

const SOURCE_TTL_DAYS: Record<string, number> = {
  companies_house: 30,
  companies_house_psc: 30,
  charity_commission: 30,
  charity_commission_bulk: 30,
  electoral_commission: 14,
  '360giving': 30,
  fca_register: 30,
  land_registry: 90,
  wikidata: 90,
  wikipedia: 90,
  news: 7,
  gdelt: 7,
  guardian: 7,
  forbes: 90,
  web_search: 14,
  manual_research: 365,
  hnw_research: 90,
  network_mapping: 90,
};

function cacheExpiresAt(source: string): string {
  const days = SOURCE_TTL_DAYS[source] ?? 30;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function persistSweepToGraph(
  supabase: AnySupabaseClient,
  sweep: UnifiedSweepResult,
  wealth: WealthAssessment | null,
  options: PersistSweepOptions = {},
): Promise<PersistSweepResult> {
  const sweepRunId = options.sweepRunId ?? generateId();
  const batchSize = options.batchSize ?? DEFAULT_BATCH;

  const result: PersistSweepResult = {
    sweepRunId,
    entitiesCreated: 0,
    relationshipsCreated: 0,
    articlesStored: 0,
    enrichmentSignalsStored: 0,
    evidenceRecordsCreated: 0,
  };

  // 1. Record sweep run
  await supabase.from('sweep_runs').insert({
    sweep_run_id: sweepRunId,
    entity_id: sweep.entity_id,
    run_id: options.runId ?? null,
    layers_completed: sweep.layers_completed,
    wealth_band: sweep.wealth_band,
    wealth_score: wealth?.score ?? null,
    signals_count: sweep.signals.length,
    relationships_found: sweep.total_relationships_discovered,
    articles_found: sweep.total_articles_discovered,
    status: 'running',
    started_at: new Date().toISOString(),
  });

  // 2. Collect all discovered target entities (orgs, charities, companies)
  //    and resolve or create canonical entities for them
  const entityMap = new Map<string, string>(); // name -> canonical_entity_id
  const allRelationships = sweep.signals.flatMap(s => s.discovered_relationships);
  const uniqueTargets = deduplicateTargets(allRelationships);

  for (const batch of chunk(uniqueTargets, batchSize)) {
    for (const target of batch) {
      const entityId = await resolveOrCreateEntity(
        supabase,
        target,
        sweep.entity_id,
        options.runId,
      );
      entityMap.set(normaliseKey(target.target_name, target.target_entity_type), entityId);
      if (entityId !== sweep.entity_id) {
        result.entitiesCreated++;
      }
    }
  }

  // 3. Store enrichment evidence + relationships for each signal
  for (const signal of sweep.signals) {
    // 3a. Store the enrichment signal itself
    await supabase.from('enrichment_signals').upsert({
      enrichment_signal_id: generateId(),
      candidate_entity_id: sweep.entity_id,
      source: signal.source,
      external_record_id: signal.external_record_id,
      signal_type: signal.signal_type,
      signal_payload: signal.signal_payload,
      match_confidence: signal.match_confidence,
      retrieved_at: new Date().toISOString(),
      cache_expires_at: cacheExpiresAt(signal.source),
      accepted_for_scoring: signal.match_confidence >= 0.75,
      status: 'matched',
    }, { onConflict: 'candidate_entity_id,source,external_record_id' });
    result.enrichmentSignalsStored++;

    // 3b. Create evidence + relationship edges for each discovered relationship
    for (const rel of signal.discovered_relationships) {
      const targetKey = normaliseKey(rel.target_name, rel.target_entity_type);
      const targetEntityId = entityMap.get(targetKey);
      if (!targetEntityId) continue;

      const evidenceId = generateId();
      await supabase.from('enrichment_evidence').insert({
        evidence_id: evidenceId,
        entity_id: sweep.entity_id,
        source: signal.source,
        source_layer: rel.source_layer,
        evidence_url: rel.evidence_url ?? null,
        evidence_text: rel.evidence_text ?? `${rel.relationship_type}: ${rel.target_name}`,
        confidence: rel.confidence,
        sweep_run_id: sweepRunId,
      });
      result.evidenceRecordsCreated++;

      // Store as network_connection (richer than relationships — supports staged entities)
      await supabase.from('network_connections').upsert({
        connection_id: generateId(),
        source_entity_id: sweep.entity_id,
        connected_entity_id: targetEntityId,
        staged_entity_id: null,
        connection_type: rel.relationship_type,
        via_organisation: rel.via_organisation ?? null,
        via_organisation_id: null,
        priority: rel.confidence >= 0.90 ? 1 : rel.confidence >= 0.75 ? 2 : 3,
        augmentation_run_id: null,
        background_check: {},
        evidence: {
          evidence_id: evidenceId,
          source: signal.source,
          source_layer: rel.source_layer,
          url: rel.evidence_url,
          text: rel.evidence_text,
          confidence: rel.confidence,
        },
      }, {
        onConflict: 'source_entity_id,coalesce(connected_entity_id,staged_entity_id),connection_type,coalesce(via_organisation,\'__none__\')',
        ignoreDuplicates: true,
      });
      result.relationshipsCreated++;
    }

    // 3c. Store discovered articles
    for (const article of signal.discovered_articles) {
      await supabase.from('entity_articles').upsert({
        article_id: generateId(),
        entity_id: sweep.entity_id,
        url: article.url,
        title: article.title,
        source_name: article.source_name,
        published_date: article.published_date ?? null,
        excerpt: article.excerpt ?? null,
        article_type: article.article_type,
        enrichment_source: signal.source,
        source_layer: inferLayer(signal.source),
        sweep_run_id: sweepRunId,
      }, { onConflict: 'entity_id,url', ignoreDuplicates: true });
      result.articlesStored++;
    }
  }

  // 4. Update wealth band on the canonical entity's attributes
  if (wealth) {
    const { data: existing } = await supabase
      .from('canonical_entities')
      .select('attributes')
      .eq('canonical_entity_id', sweep.entity_id)
      .single();

    const attrs = (existing?.attributes ?? {}) as Record<string, unknown>;
    await supabase
      .from('canonical_entities')
      .update({
        attributes: {
          ...attrs,
          wealth_band: wealth.band,
          wealth_score: wealth.score,
          wealth_evidence: wealth.evidence,
          wealth_confidence: wealth.confidence,
          wealth_assessed_at: new Date().toISOString(),
        },
      })
      .eq('canonical_entity_id', sweep.entity_id);
  }

  // 5. Mark sweep run complete
  await supabase
    .from('sweep_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      relationships_found: result.relationshipsCreated,
      articles_found: result.articlesStored,
    })
    .eq('sweep_run_id', sweepRunId);

  return result;
}

async function resolveOrCreateEntity(
  supabase: AnySupabaseClient,
  target: DiscoveredRelationship,
  sourceEntityId: string,
  runId?: string,
): Promise<string> {
  const name = target.target_name.trim();
  if (!name) return sourceEntityId;

  // Check if entity already exists (pg_trgm similarity)
  const { data: matches } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name, entity_type')
    .ilike('display_name', `%${name.substring(0, 30)}%`)
    .limit(5);

  if (matches && matches.length > 0) {
    // Exact or near-exact match by name + type
    const exactMatch = matches.find(
      (m: { display_name: string; entity_type: string }) =>
        m.display_name.toLowerCase() === name.toLowerCase() &&
        m.entity_type === target.target_entity_type,
    );
    if (exactMatch) return exactMatch.canonical_entity_id;

    // Close match by name only
    const closeMatch = matches.find(
      (m: { display_name: string }) =>
        m.display_name.toLowerCase() === name.toLowerCase(),
    );
    if (closeMatch) return closeMatch.canonical_entity_id;
  }

  // Create new entity
  const entityId = generateId();
  const { error } = await supabase.from('canonical_entities').insert({
    canonical_entity_id: entityId,
    entity_type: target.target_entity_type,
    display_name: name,
    first_seen_run_id: runId ?? 'sweep_discovery',
    last_seen_run_id: runId ?? 'sweep_discovery',
    attributes: {
      discovered_via: 'enrichment_sweep',
      via_organisation: target.via_organisation,
    },
    source: 'augmentation',
  });

  if (error) {
    // Race condition — entity may have been created concurrently
    const { data: retry } = await supabase
      .from('canonical_entities')
      .select('canonical_entity_id')
      .eq('display_name', name)
      .eq('entity_type', target.target_entity_type)
      .limit(1)
      .single();
    return retry?.canonical_entity_id ?? entityId;
  }

  return entityId;
}

function deduplicateTargets(rels: DiscoveredRelationship[]): DiscoveredRelationship[] {
  const seen = new Set<string>();
  const unique: DiscoveredRelationship[] = [];
  for (const r of rels) {
    const key = normaliseKey(r.target_name, r.target_entity_type);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }
  return unique;
}

function normaliseKey(name: string, type: string): string {
  return `${name.toLowerCase().trim()}::${type}`;
}

function inferLayer(source: string): 'A' | 'B' | 'C' {
  const layerA = [
    'companies_house', 'companies_house_psc', 'charity_commission',
    'charity_commission_bulk', 'electoral_commission', '360giving',
    'fca_register', 'land_registry',
  ];
  const layerC = ['manual_research', 'hnw_research', 'network_mapping'];
  if (layerA.includes(source)) return 'A';
  if (layerC.includes(source)) return 'C';
  return 'B';
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
