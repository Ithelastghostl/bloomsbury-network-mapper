import type { SupabaseClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { trigramSimilarity } from '@/lib/entity-resolution/match-confidence';

type AnySupabaseClient = SupabaseClient<any, any, any>;

const AUTO_MERGE_THRESHOLD = 0.90;
const PROVISIONAL_LINK_THRESHOLD = 0.75;

export interface CrossRefResult {
  processed: number;
  merged: number;
  provisional: number;
  no_match: number;
  routes_created: number;
}

export async function runCorpusCrossRef(
  supabase: AnySupabaseClient,
  runId: string,
): Promise<CrossRefResult> {
  // Check prerequisite: at least one completed corpus run
  const { data: corpusRuns } = await supabase
    .from('runs')
    .select('run_id')
    .eq('run_type', 'corpus')
    .eq('status', 'completed')
    .limit(1);

  if (!corpusRuns || corpusRuns.length === 0) {
    console.warn('corpus_crossref: No completed corpus run found. Skipping cross-reference.');
    return { processed: 0, merged: 0, provisional: 0, no_match: 0, routes_created: 0 };
  }

  // Fetch all non-corpus entities (seed_import + augmentation)
  const { data: entities, error } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name, attributes, source')
    .in('source', ['seed_import', 'augmentation'])
    .order('display_name');

  if (error || !entities) throw new Error(`Failed to fetch non-corpus entities: ${error?.message}`);

  // Fetch all corpus entities for matching
  const { data: corpusEntities } = await supabase
    .from('canonical_entities')
    .select('canonical_entity_id, display_name, attributes')
    .eq('source', 'corpus')
    .eq('entity_type', 'person');

  if (!corpusEntities) return { processed: 0, merged: 0, provisional: 0, no_match: 0, routes_created: 0 };

  const result: CrossRefResult = { processed: 0, merged: 0, provisional: 0, no_match: 0, routes_created: 0 };

  for (const entity of entities) {
    const match = findBestCorpusMatch(entity, corpusEntities);
    result.processed++;

    if (match && match.confidence >= AUTO_MERGE_THRESHOLD) {
      // Auto-merge via entity_aliases
      await supabase.from('entity_aliases').upsert({
        alias_id: ulid(),
        alias_entity_id: entity.canonical_entity_id,
        canonical_entity_id: match.canonical_entity_id,
        alias_source: 'corpus_crossref',
      }, { onConflict: 'alias_entity_id,canonical_entity_id' });

      // Check for graph paths via the corpus entity's relationships
      const routesCreated = await createCorpusRoutes(
        supabase, entity.canonical_entity_id, match.canonical_entity_id,
      );
      result.routes_created += routesCreated;
      result.merged++;
    } else if (match && match.confidence >= PROVISIONAL_LINK_THRESHOLD) {
      // Provisional link — quarantine
      await supabase.from('quarantine').insert({
        quarantine_id: ulid(),
        run_id: runId,
        source_phase: 'corpus_crossref',
        source_record: {
          entity_id: entity.canonical_entity_id,
          entity_name: entity.display_name,
          match_entity_id: match.canonical_entity_id,
          match_name: match.display_name,
          confidence: match.confidence,
        },
        reason_code: 'provisional_corpus_match',
        details: `${entity.display_name} → ${match.display_name} at ${match.confidence.toFixed(3)}`,
      });
      result.provisional++;
    } else {
      result.no_match++;
    }
  }

  return result;
}

interface CorpusMatch {
  canonical_entity_id: string;
  display_name: string;
  confidence: number;
}

function findBestCorpusMatch(
  entity: { canonical_entity_id: string; display_name: string; attributes: Record<string, unknown> },
  corpusEntities: Array<{ canonical_entity_id: string; display_name: string; attributes: Record<string, unknown> }>,
): CorpusMatch | null {
  let bestMatch: CorpusMatch | null = null;
  let bestScore = 0;

  for (const corpus of corpusEntities) {
    let score = trigramSimilarity(entity.display_name, corpus.display_name);

    // Boost for shared organisation
    const entityOrgs = extractOrgNames(entity.attributes);
    const corpusOrgs = extractOrgNames(corpus.attributes);
    if (entityOrgs.length > 0 && corpusOrgs.length > 0) {
      for (const eOrg of entityOrgs) {
        for (const cOrg of corpusOrgs) {
          if (trigramSimilarity(eOrg, cOrg) > 0.8) {
            score += 0.15;
            break;
          }
        }
        if (score > bestScore) break;
      }
    }

    // Boost for shared address/postcode
    const entityPostcode = String(entity.attributes?.postcode ?? '').toLowerCase().replace(/\s/g, '');
    const corpusPostcode = String(corpus.attributes?.postcode ?? '').toLowerCase().replace(/\s/g, '');
    if (entityPostcode && corpusPostcode && entityPostcode === corpusPostcode) {
      score += 0.10;
    }

    score = Math.min(score, 1.0);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        canonical_entity_id: corpus.canonical_entity_id,
        display_name: corpus.display_name,
        confidence: score,
      };
    }
  }

  return bestMatch;
}

function extractOrgNames(attributes: Record<string, unknown>): string[] {
  const orgs: string[] = [];
  if (typeof attributes?.primary_affiliation === 'string') {
    orgs.push(attributes.primary_affiliation.toLowerCase());
  }
  if (typeof attributes?.organisation === 'string') {
    orgs.push(attributes.organisation.toLowerCase());
  }
  if (Array.isArray(attributes?.organisations)) {
    for (const o of attributes.organisations) {
      if (typeof o === 'string') orgs.push(o.toLowerCase());
    }
  }
  return orgs;
}

async function createCorpusRoutes(
  supabase: AnySupabaseClient,
  seedEntityId: string,
  corpusEntityId: string,
): Promise<number> {
  // Find relationships from the corpus entity to other entities
  const { data: relationships } = await supabase
    .from('relationships')
    .select('target_entity_id, source_entity_id, relationship_type, confidence')
    .or(`source_entity_id.eq.${corpusEntityId},target_entity_id.eq.${corpusEntityId}`)
    .gte('confidence', 0.5)
    .limit(50);

  if (!relationships || relationships.length === 0) return 0;

  let created = 0;

  for (const rel of relationships) {
    const connectedEntityId = rel.source_entity_id === corpusEntityId
      ? rel.target_entity_id
      : rel.source_entity_id;

    const { error } = await supabase.from('introduction_routes').upsert({
      route_id: ulid(),
      target_entity_id: seedEntityId,
      introducer_entity_id: connectedEntityId,
      route_type: 'corpus_discovered',
      warmth_tier: 3,
      evidence: {
        source: 'corpus_crossref',
        corpus_entity_id: corpusEntityId,
        relationship_type: rel.relationship_type,
        relationship_confidence: rel.confidence,
      },
      source: 'corpus_crossref',
    }, { onConflict: 'route_id', ignoreDuplicates: true });

    if (!error) created++;
  }

  return created;
}
